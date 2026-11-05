import {
  ArgumentsHost, BadRequestException, Body, Catch, ConflictException, Controller, Delete, ExceptionFilter,
  Get, HttpException, Inject, Injectable, Module, NotFoundException, Patch, PayloadTooLargeException,
  Post, Query, Req, Res, UnauthorizedException, UploadedFile, UseFilters, UseInterceptors,
} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {memoryStorage} from 'multer';
import type {Knex} from 'knex';
import * as argon from 'argon2';
import {authenticator} from 'otplib';
import {audit} from './access';
import {cookieOptions, decrypt, hash, publicUser, redis, token, type User} from './auth';
import {db} from './db';
import {avatarMaxBytes, avatarVersionInput, prepareAvatar, profileEmailInput, profileInput, profilePasswordInput, type AvatarUpload} from './profile-rules';

function profile(row: any) {
  return {...publicUser(row), phone: row.phone || '', version: row.profile_version, avatarVersion: row.avatar_version,
    mfaEnabled: row.mfa_enabled, updatedAt: row.profile_updated_at, passwordChangedAt: row.password_changed_at};
}

@Injectable()
export class ProfileService {
  private readonly photoInFlight = new Set<string>();
  private async row(user: User, connection: Knex | Knex.Transaction = db, lock = false) {
    let query = connection('users').where({id: user.id, organization_id: user.organizationId, active: true});
    if (lock) query = query.forUpdate();
    const row = await query.first();
    if (!row) throw new UnauthorizedException('Entre novamente para continuar.');
    return row;
  }
  async get(user: User) { return profile(await this.row(user)); }
  private version(row: any, expected: number) {
    if (row.profile_version !== expected) throw new ConflictException('Seu perfil mudou em outro acesso. Recarregue os dados antes de salvar.');
  }
  private async activeSession(connection: Knex.Transaction, user: User, sessionId: string) {
    if (!await connection('sessions').where({id: sessionId, user_id: user.id}).where('expires_at', '>', new Date()).first()) throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
  }
  private async rate(user: User, kind: string, limit: number, seconds: number) {
    const key = `elo:profile:${kind}:${user.id}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, seconds);
    if (n > limit) throw new HttpException('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.', 429);
  }
  private async reauthenticate(row: any, currentPassword: string, otp?: string) {
    if (!row.password_hash || !await argon.verify(row.password_hash, currentPassword)) throw new BadRequestException('A senha atual não confere.');
    if (row.mfa_enabled && (!otp || !authenticator.check(otp, decrypt(row.mfa_secret)))) throw new BadRequestException('Informe um código válido do seu aplicativo autenticador.');
  }
  private async rotateSession(trx: Knex.Transaction, row: any) {
    await trx('sessions').where({user_id: row.id}).delete();
    await trx('access_tokens').where({user_id: row.id}).whereNull('used_at').update({used_at: new Date()});
    const raw = token(), csrfToken = token();
    await trx('sessions').insert({id: hash(raw), user_id: row.id, csrf: csrfToken, expires_at: new Date(Date.now() + 8 * 3600e3)});
    return {raw, csrfToken, user: publicUser(row), profile: profile(row)};
  }
  async update(user: User, sessionId: string, body: unknown) {
    const input = profileInput.parse(body);
    return db.transaction(async trx => {
      const row = await this.row(user, trx, true);
      await this.activeSession(trx, user, sessionId);
      this.version(row, input.expectedVersion);
      if (row.name === input.name && (row.phone || '') === input.phone) return profile(row);
      const [updated] = await trx('users').where({id: user.id}).update({name: input.name, phone: input.phone || null, profile_version: row.profile_version + 1, profile_updated_at: new Date()}).returning('*');
      await audit(trx, user, 'user', user.id, 'Dados do próprio perfil atualizados', {fields: ['name', 'phone'].filter(field => row[field] !== updated[field])});
      return profile(updated);
    });
  }
  async email(user: User, sessionId: string, body: unknown) {
    const input = profileEmailInput.parse(body);
    await this.rate(user, 'security', 10, 900);
    try {
      const result = await db.transaction(async trx => {
        const row = await this.row(user, trx, true);
        await this.activeSession(trx, user, sessionId);
        this.version(row, input.expectedVersion);
        await this.reauthenticate(row, input.currentPassword, input.otp);
        if (row.email === input.email) throw new BadRequestException('Informe um e-mail diferente do atual.');
        const [updated] = await trx('users').where({id: user.id}).update({email: input.email, profile_version: row.profile_version + 1, profile_updated_at: new Date()}).returning('*');
        await audit(trx, user, 'user', user.id, 'E-mail do próprio acesso alterado');
        return this.rotateSession(trx, updated);
      });
      await redis.del(`elo:profile:security:${user.id}`);
      return result;
    } catch (error: any) {
      if (error.code === '23505') throw new ConflictException('Este e-mail não está disponível.');
      throw error;
    }
  }
  async password(user: User, sessionId: string, body: unknown) {
    const input = profilePasswordInput.parse(body);
    await this.rate(user, 'security', 10, 900);
    const result = await db.transaction(async trx => {
      const row = await this.row(user, trx, true);
      await this.activeSession(trx, user, sessionId);
      await this.reauthenticate(row, input.currentPassword, input.otp);
      const [updated] = await trx('users').where({id: user.id}).update({password_hash: await argon.hash(input.newPassword, {type: argon.argon2id}), password_changed_at: new Date()}).returning('*');
      await audit(trx, user, 'user', user.id, 'Senha do próprio acesso alterada');
      return this.rotateSession(trx, updated);
    });
    await redis.del(`elo:profile:security:${user.id}`);
    return result;
  }
  async upload(user: User, sessionId: string, expected: number, file: AvatarUpload | undefined) {
    await this.rate(user, 'photo', 30, 3600);
    if (this.photoInFlight.has(user.id) || this.photoInFlight.size >= 4) throw new HttpException('Aguarde o envio em andamento e tente novamente.', 429);
    this.photoInFlight.add(user.id);
    try {
      const body = await prepareAvatar(file);
      return await db.transaction(async trx => {
        const row = await this.row(user, trx, true);
        await this.activeSession(trx, user, sessionId);
        if (row.avatar_version !== expected) throw new ConflictException('Sua foto mudou em outro acesso. Recarregue antes de enviar.');
        await trx('user_avatars').insert({user_id: user.id, organization_id: user.organizationId, body, mime_type: 'image/webp', updated_at: new Date()})
          .onConflict('user_id').merge(['body', 'mime_type', 'updated_at']);
        const [updated] = await trx('users').where({id: user.id}).update({avatar_version: row.avatar_version + 1, has_avatar: true}).returning('*');
        await audit(trx, user, 'user', user.id, 'Foto do próprio perfil atualizada', {avatarVersion: updated.avatar_version});
        return profile(updated);
      });
    } finally { this.photoInFlight.delete(user.id); }
  }
  async remove(user: User, sessionId: string, expected: number) {
    return db.transaction(async trx => {
      const row = await this.row(user, trx, true);
      await this.activeSession(trx, user, sessionId);
      if (row.avatar_version !== expected) throw new ConflictException('Sua foto mudou em outro acesso. Recarregue antes de remover.');
      const deleted = await trx('user_avatars').where({user_id: user.id, organization_id: user.organizationId}).delete();
      if (!deleted) return profile(row);
      const [updated] = await trx('users').where({id: user.id}).update({avatar_version: row.avatar_version + 1, has_avatar: false}).returning('*');
      await audit(trx, user, 'user', user.id, 'Foto do próprio perfil removida');
      return profile(updated);
    });
  }
  async photo(user: User) {
    const image = await db('user_avatars').where({user_id: user.id, organization_id: user.organizationId}).first();
    if (!image) throw new NotFoundException('Você ainda não adicionou uma foto.');
    return image;
  }
}

@Catch(PayloadTooLargeException)
class PhotoSizeError implements ExceptionFilter {
  catch(_error: PayloadTooLargeException, host: ArgumentsHost) { host.switchToHttp().getResponse().status(413).json({message: 'A foto deve ter no máximo 2 MiB.'}); }
}

@Controller('api/profile')
class ProfileController {
  constructor(@Inject(ProfileService) private readonly service: ProfileService) {}
  @Get() async get(@Req() req: any, @Res({passthrough: true}) res: any) { res.set('Cache-Control', 'private, no-store'); return this.service.get(req.user); }
  @Patch() update(@Req() req: any, @Body() body: unknown) { return this.service.update(req.user, req.sessionId, body); }
  @Post('email') async email(@Req() req: any, @Body() body: unknown, @Res({passthrough: true}) res: any) {
    const {raw, ...result} = await this.service.email(req.user, req.sessionId, body);
    res.cookie('elo_session', raw, cookieOptions).set('Cache-Control', 'private, no-store'); return result;
  }
  @Post('password') async password(@Req() req: any, @Body() body: unknown, @Res({passthrough: true}) res: any) {
    const {raw, ...result} = await this.service.password(req.user, req.sessionId, body);
    res.cookie('elo_session', raw, cookieOptions).set('Cache-Control', 'private, no-store'); return result;
  }
  @Post('avatar')
  @UseFilters(PhotoSizeError)
  @UseInterceptors(FileInterceptor('file', {storage: memoryStorage(), limits: {fileSize: avatarMaxBytes, files: 1, fields: 0}}))
  upload(@Req() req: any, @Query('expectedVersion') version: unknown, @UploadedFile() file: AvatarUpload) { return this.service.upload(req.user, req.sessionId, avatarVersionInput.parse(version), file); }
  @Delete('avatar') remove(@Req() req: any, @Query('expectedVersion') version: unknown) { return this.service.remove(req.user, req.sessionId, avatarVersionInput.parse(version)); }
  @Get('avatar') async photo(@Req() req: any, @Res() res: any) {
    const image = await this.service.photo(req.user);
    res.set({'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="perfil.webp"', 'X-Content-Type-Options': 'nosniff'}).send(image.body);
  }
}
@Module({controllers: [ProfileController], providers: [ProfileService]})
export class ProfileModule {}
