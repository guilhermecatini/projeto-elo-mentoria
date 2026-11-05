import {
  BadRequestException, CanActivate, ConflictException, Controller, ExecutionContext, ForbiddenException,
  Get, HttpException, Inject, Injectable, Module, NotFoundException, OnModuleDestroy, OnModuleInit,
  Param, Post, Req, Res, ServiceUnavailableException, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {memoryStorage} from 'multer';
import {createHash, randomUUID} from 'node:crypto';
import {constants as fsConstants} from 'node:fs';
import * as fs from 'node:fs/promises';
import {join, resolve, extname} from 'node:path';
import type {Knex} from 'knex';
import {z} from 'zod';
import {db} from './db';
import {redis, User} from './auth';
import {enrollment} from './access';

export const ATTACHMENT_LIMITS = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024, maxContextFiles: 20,
  maxContextBytes: 200 * 1024 * 1024, maxOrganizationBytes: 2 * 1024 * 1024 * 1024,
  maxUploadsPerUserPerHour: 60, concurrentPerUser: 1, concurrentPerOrganization: 4,
  acceptedExtensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv'],
});
type Context = {type: 'ticket'; ticketId: string; messageId?: string} | {type: 'task'; taskId: string};
type Connection = Knex | Knex.Transaction;
type UploadFile = {buffer: Buffer; originalname: string; mimetype: string; size: number};
const uuid = z.string().uuid();
const validStorageKey = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const staleMs = 60 * 60 * 1000;

export function sanitizeAttachmentName(input: string) {
  // Multipart filename headers commonly arrive as Latin-1-decoded UTF-8. Preserve genuine Unicode.
  let decoded = input;
  if ([...input].every(char => char.codePointAt(0)! <= 255) && /[\u0080-\u00ff]/.test(input)) {
    try { decoded = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.from(input, 'latin1')); } catch { /* Already a Unicode name. */ }
  }
  const name = decoded.split(/[\\/]/).pop() || 'arquivo';
  const safe = name.normalize('NFC').replace(/[\p{Cc}\p{Cf}<>:"|?*]/gu, '_').replace(/^[.\s]+|[.\s]+$/g, '');
  const suffix = extname(safe).toLowerCase();
  return (safe.slice(0, Math.max(1, 160 - suffix.length - 1)).replace(/\.[^.]*$/, '') || 'arquivo') + suffix;
}

/** Format checks narrow the accepted files; they are not malware scanning. */
export function validateAttachment(file: UploadFile) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) throw new BadRequestException('Selecione um arquivo não vazio.');
  if (file.buffer.length > ATTACHMENT_LIMITS.maxFileBytes || file.size !== file.buffer.length) {
    throw new BadRequestException('O arquivo deve ter no máximo 10 MiB.');
  }
  const originalName = sanitizeAttachmentName(file.originalname);
  const extension = extname(originalName).slice(1).toLowerCase();
  const buffer = file.buffer;
  const mime = file.mimetype.toLowerCase().split(';')[0];
  let detected = '';
  if (extension === 'pdf' && /^%PDF-(1\.[0-7]|2\.0)/.test(buffer.subarray(0, 9).toString('ascii')) && /%%EOF\s*$/.test(buffer.subarray(-1024).toString('latin1'))) {
    detected = 'application/pdf';
  } else if (extension === 'png' && buffer.length >= 45 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && buffer.toString('ascii', 12, 16) === 'IHDR' && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0 && buffer.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))) {
    detected = 'image/png';
  } else if (['jpg', 'jpeg'].includes(extension) && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) {
    detected = 'image/jpeg';
  } else if (extension === 'webp' && buffer.length >= 20 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16)) && buffer.readUInt32LE(4) + 8 === buffer.length) {
    detected = 'image/webp';
  } else if (['txt', 'csv'].includes(extension)) {
    let text: string;
    try { text = new TextDecoder('utf-8', {fatal: true}).decode(buffer); }
    catch { throw new BadRequestException('Arquivos de texto devem estar em UTF-8.'); }
    if (!text.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || /<(?:!doctype\s+html|html\b|head\b|body\b|script\b|svg\b|iframe\b|object\b)/i.test(text)) {
      throw new BadRequestException('O conteúdo não corresponde a um arquivo de texto permitido.');
    }
    detected = extension === 'csv' ? 'text/csv' : 'text/plain';
  }
  const allowedMime = detected === 'text/csv'
    ? ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream']
    : [detected, 'application/octet-stream'];
  if (!detected || !allowedMime.includes(mime)) {
    throw new BadRequestException('Formato não permitido ou conteúdo incompatível. Use PDF, PNG, JPEG, WEBP, TXT ou CSV.');
  }
  return {originalName, mimeType: detected, sizeBytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex')};
}

function metadata(row: any) {
  return {
    id: row.id, enrollmentId: row.enrollment_id, ticketId: row.ticket_id, messageId: row.message_id, taskId: row.task_id,
    originalName: row.original_name, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes),
    createdAt: row.ready_at || row.created_at, createdById: row.created_by,
    createdByName: row.createdByName, visibility: row.visibility,
    downloadUrl: `/api/attachments/${row.id}/download`,
  };
}

@Injectable()
export class AttachmentsService implements OnModuleInit, OnModuleDestroy {
  private readonly root = resolve(process.env.UPLOAD_DIR || resolve(__dirname, '../../../.local/uploads'));
  private cleanupTimer?: NodeJS.Timeout;

  async onModuleInit() {
    await this.ensureDirectories();
    await this.reconcilePending();
    this.cleanupTimer = setInterval(() => this.reconcilePending().catch(() => {
      console.error('Não foi possível reconciliar anexos pendentes. A próxima execução tentará novamente.');
    }), 15 * 60 * 1000);
    this.cleanupTimer.unref();
  }
  onModuleDestroy() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); }

  private async ensureDirectories() {
    for (const path of [this.root, join(this.root, 'pending'), join(this.root, 'objects')]) {
      await fs.mkdir(path, {recursive: true, mode: 0o700});
      const stat = await fs.lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink() || resolve(await fs.realpath(path)) !== resolve(path)) {
        throw new Error('Diretório privado de anexos inválido.');
      }
      if (process.platform !== 'win32') await fs.chmod(path, 0o700);
    }
  }

  private path(key: string, temporary: boolean) {
    if (!validStorageKey.test(key)) throw new ServiceUnavailableException('Arquivo indisponível.');
    return join(this.root, temporary ? 'pending' : 'objects', key + (temporary ? '.tmp' : '.bin'));
  }

  private async removePendingFiles(row: any) {
    if (!validStorageKey.test(row.storage_key)) return;
    for (const temporary of [true, false]) {
      const path = this.path(row.storage_key, temporary);
      try {
        const stat = await fs.lstat(path);
        if (stat.isFile() && !stat.isSymbolicLink()) await fs.unlink(path);
      } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  async reconcilePending(now = new Date()) {
    await this.ensureDirectories();
    const cutoff = new Date(now.getTime() - staleMs);
    await db.transaction(async trx => {
      await trx.raw("SELECT pg_advisory_xact_lock(hashtext('elo-attachments-cleanup'))");
      const pending = await trx('attachments').where({status: 'pending'}).where('created_at', '<', cutoff).forUpdate();
      for (const row of pending) {
        await this.removePendingFiles(row);
        await trx('attachments').where({id: row.id, status: 'pending'}).update({status: 'failed', failed_at: now});
      }
      // Files from a crash before reservation/commit are identified only by this module's UUID filenames.
      for (const temporary of [true, false]) {
        const directory = join(this.root, temporary ? 'pending' : 'objects');
        const suffix = temporary ? '.tmp' : '.bin';
        for (const name of await fs.readdir(directory)) {
          if (!name.endsWith(suffix)) continue;
          const key = name.slice(0, -suffix.length);
          if (!validStorageKey.test(key)) continue;
          const path = this.path(key, temporary), stat = await fs.lstat(path);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.mtime >= cutoff) continue;
          const row = await trx('attachments').where({storage_key: key}).first();
          // Unknown files can belong to an incomplete restore. Preserve them for an operator to inspect.
          if (row?.status === 'failed') await fs.unlink(path);
        }
      }
    });
  }

  async authorizeUpload(user: User, context: Context, connection: Connection = db, lock = false) {
    let row: any;
    if (context.type === 'ticket') row = await connection('tickets').where({id: context.ticketId, organization_id: user.organizationId}).first();
    else row = await connection('tasks').where({id: context.taskId, organization_id: user.organizationId}).first();
    if (!row) throw new NotFoundException('Destino do anexo não encontrado.');
    let enrollmentRow = await enrollment(user, row.enrollment_id, connection);
    if (lock) {
      await connection('enrollments').where({id: row.enrollment_id, organization_id: user.organizationId}).forUpdate().first();
      enrollmentRow = await enrollment(user, row.enrollment_id, connection);
    }
    if (context.type === 'ticket') {
      if (!context.messageId) throw new BadRequestException('Selecione a mensagem que receberá o anexo.');
      if (lock) row = await connection('tickets').where({id: context.ticketId, organization_id: user.organizationId}).forUpdate().first();
      if (row.status === 'resolved') throw new BadRequestException('Reabra o atendimento antes de adicionar anexos.');
      const query = connection('messages').where({id: context.messageId, ticket_id: context.ticketId, organization_id: user.organizationId});
      const message = await (lock ? query.forUpdate() : query).first();
      if (!message || (user.role === 'mentee' && message.kind === 'internal')) throw new NotFoundException('Mensagem não encontrada.');
      if (message.author_id !== user.id) throw new ForbiddenException('Anexe arquivos somente às suas próprias mensagens.');
      if (!['public', 'internal'].includes(message.kind)) throw new BadRequestException('Esse tipo de mensagem não recebe anexos.');
      return {enrollmentId: row.enrollment_id, visibility: message.kind === 'internal' ? 'internal' : 'public'};
    }
    const planQuery = connection('action_plans').where({id: row.plan_id, organization_id: user.organizationId});
    const plan = await (lock ? planQuery.forUpdate() : planQuery).first();
    if (lock) row = await connection('tasks').where({id: context.taskId, organization_id: user.organizationId}).forUpdate().first();
    if (user.role === 'mentee' && row.assignee_id !== user.id) throw new ForbiddenException('Você pode anexar evidências somente às suas tarefas.');
    if (enrollmentRow.status !== 'active' || !plan || plan.status !== 'active' || !['todo', 'in_progress', 'blocked'].includes(row.status)) {
      throw new BadRequestException('Anexe evidências enquanto a tarefa estiver em execução, antes da entrega para revisão.');
    }
    return {enrollmentId: row.enrollment_id, visibility: 'public'};
  }

  private async authorizeRead(user: User, context: Context, connection: Connection = db) {
    const row = await connection(context.type === 'ticket' ? 'tickets' : 'tasks')
      .where({id: context.type === 'ticket' ? context.ticketId : context.taskId, organization_id: user.organizationId}).first();
    if (!row) throw new NotFoundException('Destino do anexo não encontrado.');
    await enrollment(user, row.enrollment_id, connection);
  }

  async list(user: User, context: Context) {
    await this.authorizeRead(user, context);
    let query = db('attachments as a').join('users as u', 'u.id', 'a.created_by')
      .where({'a.organization_id': user.organizationId, 'a.status': 'ready'})
      .where(context.type === 'ticket' ? 'a.ticket_id' : 'a.task_id', context.type === 'ticket' ? context.ticketId : context.taskId);
    if (user.role === 'mentee') {
      query = query.where('a.visibility', 'public').where(function () {
        this.whereNull('a.message_id').orWhereExists(db('messages as m').select(db.raw('1'))
          .whereRaw('m.id=a.message_id AND m.ticket_id=a.ticket_id AND m.organization_id=a.organization_id')
          .where('m.kind', 'public'));
      });
    }
    return (await query.select('a.*', 'u.name as createdByName').orderBy('a.created_at')).map(metadata);
  }

  private contextMatch(query: Knex.QueryBuilder, context: Context) {
    return context.type === 'ticket'
      ? query.where({ticket_id: context.ticketId, message_id: context.messageId})
      : query.where({task_id: context.taskId});
  }

  private async organizationLock(trx: Knex.Transaction, organizationId: string) {
    await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`elo-upload-quota:${organizationId}`]);
  }

  private async quota(trx: Knex.Transaction, organizationId: string, context: Context, size: number) {
    const active = trx('attachments').where({organization_id: organizationId}).whereIn('status', ['pending', 'ready']);
    const organization = await active.clone().sum('size_bytes as bytes').first();
    const current = await active.clone().where(context.type === 'ticket' ? 'ticket_id' : 'task_id', context.type === 'ticket' ? context.ticketId : context.taskId)
      .count('* as count').sum('size_bytes as bytes').first();
    if (Number(current?.count || 0) >= ATTACHMENT_LIMITS.maxContextFiles) throw new BadRequestException('Este atendimento ou tarefa atingiu o limite de 20 anexos.');
    if (Number(current?.bytes || 0) + size > ATTACHMENT_LIMITS.maxContextBytes) throw new BadRequestException('Este atendimento ou tarefa atingiu o limite de armazenamento.');
    if (Number(organization?.bytes || 0) + size > ATTACHMENT_LIMITS.maxOrganizationBytes) throw new BadRequestException('O armazenamento de anexos da empresa está cheio. Avise a administração.');
  }

  async upload(user: User, context: Context, key: string, file: UploadFile) {
    const info = validateAttachment(file);
    const reservation = await db.transaction(async trx => {
      await this.organizationLock(trx, user.organizationId);
      const permission = await this.authorizeUpload(user, context, trx, true);
      const prior = await trx('attachments').where({organization_id: user.organizationId, created_by: user.id, request_key: key}).first();
      if (prior) {
        const matches = prior.sha256 === info.sha256 && (context.type === 'ticket'
          ? prior.ticket_id === context.ticketId && prior.message_id === context.messageId
          : prior.task_id === context.taskId);
        if (!matches) throw new ConflictException('Esta tentativa já foi usada para outro arquivo. Selecione o arquivo novamente.');
        if (prior.status === 'ready') return {existing: prior};
        if (prior.status === 'pending') throw new ConflictException('Este arquivo ainda está sendo enviado. Aguarde e tente novamente.');
        await this.quota(trx, user.organizationId, context, info.sizeBytes);
        try { await this.removePendingFiles(prior); }
        catch { throw new ServiceUnavailableException('Não foi possível retomar o envio. Tente novamente.'); }
        const pending = {...prior, storage_key: randomUUID(), original_name: info.originalName,
          mime_type: info.mimeType, size_bytes: info.sizeBytes, visibility: permission.visibility,
          status: 'pending', created_at: new Date(), ready_at: null, failed_at: null};
        await trx('attachments').where({id: prior.id, status: 'failed'}).update({
          storage_key: pending.storage_key, original_name: pending.original_name,
          mime_type: pending.mime_type, size_bytes: pending.size_bytes, visibility: pending.visibility,
          status: pending.status, created_at: pending.created_at, ready_at: null, failed_at: null,
        });
        return {pending};
      }
      const duplicate = await this.contextMatch(trx('attachments').where({organization_id: user.organizationId, created_by: user.id, sha256: info.sha256}).whereIn('status', ['pending', 'ready']), context).first();
      if (duplicate?.status === 'ready') return {existing: duplicate};
      if (duplicate) throw new ConflictException('Este arquivo ainda está sendo enviado. Aguarde e tente novamente.');
      await this.quota(trx, user.organizationId, context, info.sizeBytes);
      const pending = {
        id: randomUUID(), organization_id: user.organizationId, enrollment_id: permission.enrollmentId,
        ticket_id: context.type === 'ticket' ? context.ticketId : null,
        message_id: context.type === 'ticket' ? context.messageId : null,
        task_id: context.type === 'task' ? context.taskId : null,
        created_by: user.id, request_key: key, storage_key: randomUUID(),
        original_name: info.originalName, mime_type: info.mimeType, size_bytes: info.sizeBytes,
        sha256: info.sha256, visibility: permission.visibility, status: 'pending', created_at: new Date(),
      };
      await trx('attachments').insert(pending);
      return {pending};
    });
    if (reservation.existing) return metadata({...reservation.existing, createdByName: user.name});
    const pending = reservation.pending!;
    let ready = false;
    try {
      await this.ensureDirectories();
      const handle = await fs.open(this.path(pending.storage_key, true), 'wx', 0o600);
      try { await handle.writeFile(file.buffer); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(this.path(pending.storage_key, true), this.path(pending.storage_key, false));
      if (process.platform !== 'win32') {
        const directory = await fs.open(join(this.root, 'objects'), fsConstants.O_RDONLY);
        try { await directory.sync(); } finally { await directory.close(); }
      }
      const result = await db.transaction(async trx => {
        await this.organizationLock(trx, user.organizationId);
        await this.authorizeUpload(user, context, trx, true);
        const current = await trx('attachments').where({id: pending.id, status: 'pending'}).forUpdate().first();
        if (!current) throw new ConflictException('O envio expirou. Selecione o arquivo novamente.');
        const now = new Date();
        await trx('attachments').where({id: pending.id}).update({status: 'ready', ready_at: now});
        await trx('audit_events').insert({
          id: randomUUID(), organization_id: user.organizationId, actor_id: user.id,
          entity_type: context.type === 'task' ? 'task' : 'ticket', entity_id: context.type === 'task' ? context.taskId : context.ticketId,
          action: permissionAction(pending.visibility),
          details: JSON.stringify({attachmentId: pending.id, messageId: pending.message_id, visibility: pending.visibility, mimeType: info.mimeType, sizeBytes: info.sizeBytes}),
        });
        return metadata({...pending, status: 'ready', ready_at: now, createdByName: user.name});
      });
      ready = true;
      return result;
    } catch (error) {
      if (!ready) {
        // Only this reservation is touched. Ready objects are never removed by reconciliation.
        const current = await db('attachments').where({id: pending.id}).first().catch(() => null);
        if (current?.status === 'pending') {
          await this.removePendingFiles(current).catch(() => {});
          await db('attachments').where({id: pending.id, status: 'pending'}).update({status: 'failed', failed_at: new Date()}).catch(() => {});
        }
      }
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Não foi possível armazenar o arquivo. Tente novamente.');
    }
  }

  async download(user: User, id: string) {
    const row = await db('attachments').where({id, organization_id: user.organizationId, status: 'ready'}).first();
    if (!row || user.role === 'mentee' && row.visibility !== 'public') throw new NotFoundException('Anexo não encontrado.');
    const context: Context = row.task_id ? {type: 'task', taskId: row.task_id} : {type: 'ticket', ticketId: row.ticket_id};
    await this.authorizeRead(user, context);
    if (row.message_id) {
      const message = await db('messages').where({id: row.message_id, ticket_id: row.ticket_id, organization_id: user.organizationId}).first();
      if (!message || user.role === 'mentee' && message.kind !== 'public') throw new NotFoundException('Anexo não encontrado.');
    }
    try {
      await this.ensureDirectories();
      const path = this.path(row.storage_key, false), stat = await fs.lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== Number(row.size_bytes)) throw new Error('Object mismatch');
      const handle = await fs.open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
      let bytes: Buffer;
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.size !== Number(row.size_bytes) || opened.ino !== stat.ino) throw new Error('Object mismatch');
        bytes = await handle.readFile();
      } finally { await handle.close(); }
      if (bytes.length !== Number(row.size_bytes) || createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new Error('Object mismatch');
      // Recheck after disk I/O; a reassignment must not retain a capability to the file.
      await this.authorizeRead(user, context);
      return {bytes, name: row.original_name};
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('O arquivo não está disponível. Avise a administração.');
    }
  }
}

function permissionAction(visibility: string) { return visibility === 'internal' ? 'Anexo interno adicionado' : 'Anexo adicionado'; }

@Injectable()
class AttachmentUploadGuard implements CanActivate {
  constructor(@Inject(AttachmentsService) private readonly attachments: AttachmentsService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest(), res = context.switchToHttp().getResponse();
    const target: Context = req.params.ticketId
      ? {type: 'ticket', ticketId: uuid.parse(req.params.ticketId), messageId: uuid.parse(req.params.messageId)}
      : {type: 'task', taskId: uuid.parse(req.params.taskId)};
    await this.attachments.authorizeUpload(req.user, target);
    if (!req.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data;')) throw new BadRequestException('Envie um arquivo pelo formulário de anexos.');
    if (Number(req.get('Content-Length') || 0) > ATTACHMENT_LIMITS.maxFileBytes + 1024 * 1024) throw new BadRequestException('O arquivo deve ter no máximo 10 MiB.');
    req.attachmentContext = target;
    req.attachmentRequestKey = req.get('Idempotency-Key') ? uuid.parse(req.get('Idempotency-Key')) : randomUUID();
    const user = req.user as User;
    const rateKey = `elo:uploads:rate:${user.id}`, count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 3600);
    if (count > ATTACHMENT_LIMITS.maxUploadsPerUserPerHour) throw new HttpException('Limite de envios por hora atingido. Tente mais tarde.', 429);
    const userKey = `elo:uploads:user:${user.id}`, organizationKey = `elo:uploads:org:${user.organizationId}`;
    const lease = randomUUID(), ttl = 120000, now = Date.now();
    const acquired = Number(await redis.eval(`
      redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[2])
      if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4]) then return 0 end
      redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
      redis.call('ZADD', KEYS[2], tonumber(ARGV[2])+tonumber(ARGV[3]), ARGV[1])
      redis.call('PEXPIRE', KEYS[2], ARGV[3])
      return 1
    `, 2, userKey, organizationKey, lease, now, ttl, ATTACHMENT_LIMITS.concurrentPerOrganization));
    if (!acquired) throw new HttpException('Já existe um envio em andamento. Aguarde a conclusão.', 429);
    let released = false;
    const heartbeat = setInterval(() => redis.eval(`
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        redis.call('PEXPIRE', KEYS[1], ARGV[2])
        redis.call('ZADD', KEYS[2], tonumber(ARGV[3])+tonumber(ARGV[2]), ARGV[1])
        redis.call('PEXPIRE', KEYS[2], ARGV[2])
      end
      return 1
    `, 2, userKey, organizationKey, lease, ttl, Date.now()).catch(() => {}), 30000);
    heartbeat.unref();
    const release = () => {
      if (released) return;
      released = true; clearInterval(heartbeat);
      redis.eval(`if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end redis.call('ZREM', KEYS[2], ARGV[1]) return 1`, 2, userKey, organizationKey, lease).catch(() => {});
    };
    res.once('finish', release); res.once('close', release);
    return true;
  }
}

const multipart = FileInterceptor('file', {
  storage: memoryStorage(), limits: {fileSize: ATTACHMENT_LIMITS.maxFileBytes, files: 1, fields: 0, parts: 1, fieldNameSize: 50},
});

@Controller('api')
class AttachmentsController {
  constructor(@Inject(AttachmentsService) private readonly attachments: AttachmentsService) {}
  @Get('attachments/limits') limits() { return ATTACHMENT_LIMITS; }
  @Get('tickets/:ticketId/attachments') ticketAttachments(@Req() req: any, @Param('ticketId') id: string) {
    return this.attachments.list(req.user, {type: 'ticket', ticketId: uuid.parse(id)});
  }
  @Get('tasks/:taskId/attachments') taskAttachments(@Req() req: any, @Param('taskId') id: string) {
    return this.attachments.list(req.user, {type: 'task', taskId: uuid.parse(id)});
  }
  @Post('tickets/:ticketId/messages/:messageId/attachments')
  @UseGuards(AttachmentUploadGuard)
  @UseInterceptors(multipart)
  ticketUpload(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.attachments.upload(req.user, req.attachmentContext, req.attachmentRequestKey, file);
  }
  @Post('tasks/:taskId/attachments')
  @UseGuards(AttachmentUploadGuard)
  @UseInterceptors(multipart)
  taskUpload(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.attachments.upload(req.user, req.attachmentContext, req.attachmentRequestKey, file);
  }
  @Get('attachments/:id/download')
  async download(@Req() req: any, @Param('id') id: string, @Res() res: any) {
    const file = await this.attachments.download(req.user, uuid.parse(id));
    const fallback = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/"/g, '_');
    res.header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())}`)
      .header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, no-store')
      .header('Pragma', 'no-cache').header('Content-Security-Policy', "sandbox; default-src 'none'")
      .send(file.bytes);
  }
}

@Module({controllers: [AttachmentsController], providers: [AttachmentsService, AttachmentUploadGuard], exports: [AttachmentsService]})
export class AttachmentsModule {}
