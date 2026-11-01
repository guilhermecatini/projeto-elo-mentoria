import {BadRequestException,CanActivate,ExecutionContext,ForbiddenException,Injectable,UnauthorizedException} from '@nestjs/common';
import {randomBytes,createHash,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import * as argon from 'argon2';
import {authenticator} from 'otplib';
import Redis from 'ioredis';
import {db} from './db';
export type User={id:string;organizationId:string;name:string;email:string;role:'admin'|'mentor'|'mentee'};
export const redis=new Redis(process.env.REDIS_URL||'redis://localhost:6379',{maxRetriesPerRequest:null,lazyConnect:true});
redis.on('error',()=>{});
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
const key=()=>createHash('sha256').update(process.env.SESSION_SECRET||'local-only-development-secret').digest();
export function encrypt(value:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);return [iv.toString('hex'),c.update(value,'utf8','hex')+c.final('hex'),c.getAuthTag().toString('hex')].join('.');}
export function decrypt(value:string){const [iv,body,tag]=value.split('.');const c=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'hex'));c.setAuthTag(Buffer.from(tag,'hex'));return c.update(body,'hex','utf8')+c.final('utf8');}
export const publicUser=(r:any):User=>({id:r.id,organizationId:r.organization_id,name:r.name,email:r.email,role:r.role});
export const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/api',maxAge:8*3600*1000};
@Injectable()
export class AuthGuard implements CanActivate{
 async canActivate(ctx:ExecutionContext){
  const req=ctx.switchToHttp().getRequest();const path=req.path;
  if(['/api/auth/login','/api/auth/activate','/api/auth/mfa/confirm','/api/health/live','/api/health/ready'].includes(path))return true;
  const raw=req.cookies?.elo_session;if(!raw)throw new UnauthorizedException('Entre para continuar.');
  const session=await db('sessions as s').join('users as u','u.id','s.user_id').where('s.id',hash(raw)).where('s.expires_at','>',new Date()).where('u.active',true).select('u.*','s.csrf','s.id as session_id').first();
  if(!session)throw new UnauthorizedException('Sua sessão expirou.');req.user=publicUser(session);req.csrfToken=session.csrf;req.sessionId=session.session_id;
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   const csrf=req.get('X-CSRF-Token')||'';const expected=session.csrf;
   if(csrf.length!==expected.length||!timingSafeEqual(Buffer.from(csrf),Buffer.from(expected)))throw new ForbiddenException('Atualize a página antes de salvar.');
   const origin=req.get('Origin');if(origin&&origin!==process.env.APP_ORIGIN)throw new ForbiddenException('Origem inválida.');
  }return true;
 }
}
export async function login(email:string,password:string,otp:string|undefined,ip:string){
 const rateKey='elo:login:account:'+hash(email.toLowerCase()),ipKey='elo:login:ip:'+hash(ip);for(const [key,limit] of [[rateKey,10],[ipKey,50]] as const){const attempts=await redis.incr(key);if(attempts===1)await redis.expire(key,900);if(attempts>limit)throw new ForbiddenException('Muitas tentativas. Aguarde 15 minutos.');}
 const row=await db('users').where({email:email.toLowerCase(),active:true}).first();
 if(!row?.password_hash||!await argon.verify(row.password_hash,password))throw new UnauthorizedException('E-mail ou senha inválidos.');
 if(row.role==='admin'&&process.env.NODE_ENV==='production'&&!row.mfa_enabled)throw new ForbiddenException('Ative a autenticação em duas etapas pelo convite.');
 if(row.mfa_enabled&&(!otp||!authenticator.check(otp,decrypt(row.mfa_secret))))throw new UnauthorizedException('Informe o código de autenticação válido.');
 const raw=token(),csrf=token();await db('sessions').insert({id:hash(raw),user_id:row.id,csrf,expires_at:new Date(Date.now()+8*3600e3)});await redis.del(rateKey);
 return {raw,user:publicUser(row),csrfToken:csrf};
}
export async function activate(raw:string,password:string){
 if(password.length<12)throw new BadRequestException('Use pelo menos 12 caracteres na senha.');
 return db.transaction(async trx=>{
  const item=await trx('access_tokens').where({hash:hash(raw)}).whereNull('used_at').where('expires_at','>',new Date()).forUpdate().first();if(!item||item.purpose==='mfa_setup')throw new BadRequestException('Link inválido ou expirado.');
  const u=await trx('users').where({id:item.user_id}).forUpdate().first();await trx('access_tokens').where({user_id:u.id}).whereNull('used_at').update({used_at:new Date()});
  await trx('users').where({id:u.id}).update({password_hash:await argon.hash(password,{type:argon.argon2id})});await trx('sessions').where({user_id:u.id}).delete();
  if(u.role!=='admin')return {ok:true};
  const secret=authenticator.generateSecret();const setupToken=token();await trx('users').where({id:u.id}).update({mfa_secret:encrypt(secret),mfa_enabled:false});
  await trx('access_tokens').insert({hash:hash(setupToken),user_id:u.id,purpose:'mfa_setup',expires_at:new Date(Date.now()+15*60e3)});
  return {mfaSetupRequired:true,setupToken,secret,otpAuthUrl:authenticator.keyuri(u.email,'Elo Mentoria',secret)};
 });
}
export async function confirmMfa(setupToken:string,otp:string){return db.transaction(async trx=>{
 const t=await trx('access_tokens').where({hash:hash(setupToken),purpose:'mfa_setup'}).whereNull('used_at').where('expires_at','>',new Date()).forUpdate().first();if(!t)throw new BadRequestException('Configuração expirada.');
 const u=await trx('users').where({id:t.user_id}).first();if(!authenticator.check(otp,decrypt(u.mfa_secret)))throw new BadRequestException('Código inválido.');
 await trx('users').where({id:u.id}).update({mfa_enabled:true});await trx('access_tokens').where({hash:t.hash}).update({used_at:new Date()});return {ok:true};
});}
