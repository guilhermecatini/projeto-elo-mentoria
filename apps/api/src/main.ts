import 'reflect-metadata';
import 'dotenv/config';
import {NestFactory,APP_GUARD} from '@nestjs/core';
import type {NestExpressApplication} from '@nestjs/platform-express';
import {Body,Controller,Get,Post,Patch,Param,Req,Res,Module,Inject,Catch,ExceptionFilter,ArgumentsHost,HttpException,BadRequestException,ForbiddenException,UnauthorizedException,ConflictException} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {z,ZodError} from 'zod';
import {randomUUID} from 'node:crypto';
import {AuthGuard,activate,confirmMfa,cookieOptions,login,redis,token,hash} from './auth';
import {db} from './db';
import {Operations} from './operations';
import {admin,enrollment,audit} from './access';
import {defaultCalendar} from './calendar';
import {PlansModule} from './plans';
import {AttachmentsModule} from './attachments';
import {MeetingsModule} from './meetings';
import {DiagnosticsModule} from './diagnostics';
import {IndicatorsModule} from './indicators';
import {ReportsModule} from './reports';
import {CommercialModule} from './commercial';
import {JourneyModule,JourneyService,journeyEnrollmentInput} from './journey';
import {MaterialsModule} from './materials';
import {IntegrationsModule} from './integrations';
import {ProfileModule} from './profile';
const text=z.string().trim().min(1).max(10000),uuid=z.string().uuid(),instant=z.iso.datetime({offset:true});
const parse=(schema:z.ZodType,data:unknown)=>schema.parse(data);
@Catch()
class Errors implements ExceptionFilter{catch(e:unknown,host:ArgumentsHost){const res=host.switchToHttp().getResponse();if(e&&typeof e==='object'&&'type' in e&&e.type==='entity.too.large')return res.status(413).json({message:'O conteúdo enviado excede o limite permitido. Reduza o texto e tente novamente.'});if(e instanceof ZodError)return res.status(400).json({message:'Confira os campos informados.',errors:e.issues.map(i=>({field:i.path.join('.'),message:i.message}))});if(e instanceof HttpException)return res.status(e.getStatus()).json(e.getResponse());console.error('Falha interna na operação:',e instanceof Error?e.name:'Erro');res.status(500).json({message:'Não foi possível concluir. Tente novamente.'});}}
@Controller('api')
class Api {
 constructor(@Inject(Operations) private readonly ops:Operations,@Inject(JourneyService)private readonly journey:JourneyService){}
 @Get('health/live')live(){return {status:'ok'};}
 @Get('health/ready')async ready(@Res()res:any){try{await db.raw('SELECT 1');await redis.ping();const h=await db('worker_heartbeats').where({id:'reconciler'}).first();const worker=!!h&&Date.now()-new Date(h.last_seen_at).getTime()<120000;res.status(worker?200:503).json({status:worker?'ok':'degraded',database:'ok',queue:'ok',worker:worker?'ok':'stale'});}catch{res.status(503).json({status:'unavailable'});}}
 @Post('auth/login')async login(@Body()body:unknown,@Req()req:any,@Res({passthrough:true})res:any){this.origin(req);const b=parse(z.object({email:z.email(),password:z.string().min(1).max(128),otp:z.string().optional()}),body) as any;const auth=await login(b.email,b.password,b.otp,req.ip);res.cookie('elo_session',auth.raw,cookieOptions);return {user:auth.user,csrfToken:auth.csrfToken};}
 @Get('auth/me')me(@Req()req:any){return {user:req.user,csrfToken:req.csrfToken};}
 @Post('auth/logout')async logout(@Req()req:any,@Res({passthrough:true})res:any){await db('sessions').where({id:req.sessionId}).delete();res.clearCookie('elo_session',cookieOptions);return {ok:true};}
 @Post('auth/refresh')async refresh(@Req()req:any,@Res({passthrough:true})res:any){const raw=token(),csrf=token();await db.transaction(async trx=>{const removed=await trx('sessions').where({id:req.sessionId}).where('expires_at','>',new Date()).delete();if(removed!==1)throw new UnauthorizedException('Sessão já renovada ou revogada.');await trx('sessions').insert({id:hash(raw),user_id:req.user.id,csrf,expires_at:new Date(Date.now()+8*3600e3)});});res.cookie('elo_session',raw,cookieOptions);return {user:req.user,csrfToken:csrf};}
 @Post('auth/activate')async activate(@Body()body:unknown,@Req()req:any){this.origin(req);await this.rate(req.ip,'activate');const b=parse(z.object({token:text,password:z.string().min(12).max(128)}),body) as any;return activate(b.token,b.password);}
 @Post('auth/mfa/confirm')async mfa(@Body()body:unknown,@Req()req:any){this.origin(req);await this.rate(req.ip,'mfa');const b=parse(z.object({setupToken:text,otp:z.string().regex(/^\d{6}$/)}),body) as any;return confirmMfa(b.setupToken,b.otp);}
 @Get('dashboard')dashboard(@Req()req:any){return this.ops.dashboard(req.user);}
 @Get('clients')clients(@Req()req:any){return this.ops.clients(req.user);}
 @Get('clients/export')async export(@Req()req:any,@Res()res:any){const rows=await this.ops.clients(req.user);const esc=(s:unknown)=>{let v=String(s??'não informado');if(/^[=+@\-\t\r]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';};const csv=[['Cliente','Responsável','Programa','Situação'],...rows.map(r=>[r.name,r.mentorName,r.programName,r.status])].map(r=>r.map(esc).join(';')).join('\r\n');res.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="carteira.csv"').send('\uFEFF'+csv);}
 @Get('clients/:id')client(@Req()req:any,@Param('id')id:string){return this.ops.client(req.user,uuid.parse(id));}
 @Post('clients')createClient(@Req()req:any,@Body()body:unknown){const b=parse(z.object({name:text,contactName:text,email:z.email(),programId:uuid,mentorId:uuid.optional(),startsAt:instant.optional(),endsAt:instant.optional()}),body);return this.ops.createClient(req.user,b);}
 @Get('mentors')mentors(@Req()req:any){return this.ops.mentors(req.user);}
 @Get('programs')programs(@Req()req:any){return this.ops.programs(req.user);}
 @Post('programs')async createProgram(@Req()req:any,@Body()body:unknown){admin(req.user);const b:any=parse(z.object({name:text,durationDays:z.number().int().min(1).max(3650).default(90)}),body);const id=randomUUID();await db.transaction(async trx=>{await trx('programs').insert({id,organization_id:req.user.organizationId,name:b.name,duration_days:b.durationDays,calendar:JSON.stringify(defaultCalendar)});await audit(trx,req.user,'program',id,'Programa criado');});return {id};}
 @Patch('programs/:id')async program(@Req()req:any,@Param('id')id:string,@Body()body:unknown){admin(req.user);const b:any=parse(z.object({name:text,calendar:z.object({timezone:z.string().refine(s=>{try{new Intl.DateTimeFormat('pt-BR',{timeZone:s});return true;}catch{return false;}}),days:z.array(z.number().int().min(1).max(7)).min(1),startHour:z.number().int().min(0).max(23),endHour:z.number().int().min(1).max(24),holidays:z.array(z.iso.date())}).refine(c=>c.endHour>c.startHour),firstStandardMinutes:z.number().int().min(1).max(10080),firstUrgentMinutes:z.number().int().min(1).max(10080),followupDays:z.number().int().min(1).max(365)}),body);const n=await db('programs').where({id:uuid.parse(id),organization_id:req.user.organizationId}).update({name:b.name,calendar:JSON.stringify(b.calendar),first_standard_minutes:b.firstStandardMinutes,first_urgent_minutes:b.firstUrgentMinutes,followup_days:b.followupDays});if(!n)throw new BadRequestException('Programa inválido.');await audit(db,req.user,'program',id,'Política de atendimento atualizada',b);return {ok:true};}
 @Post('enrollments/:id/assignments')assign(@Req()req:any,@Param('id')id:string,@Body()body:unknown){return this.ops.assign(req.user,uuid.parse(id),parse(z.object({mentorId:uuid,kind:z.enum(['primary','coverage']),endsAt:instant.optional()}),body));}
 @Patch('enrollments/:id')updateEnrollment(@Req()req:any,@Param('id')id:string,@Body()body:unknown){return this.journey.updateEnrollment(req.user,uuid.parse(id),journeyEnrollmentInput.parse(body));}
 @Post('enrollments/:id/followups')followup(@Req()req:any,@Param('id')id:string,@Body()body:unknown){return this.ops.followup(req.user,uuid.parse(id),parse(z.object({summary:text,nextStep:text,nextStepAt:instant}),body));}
 @Post('enrollments/:id/interventions')async intervention(@Req()req:any,@Param('id')id:string,@Body()body:unknown){admin(req.user);const b:any=parse(z.object({body:text,ownerId:uuid,reviewAt:instant}),body);await enrollment(req.user,uuid.parse(id));const owner=await db('users').where({id:b.ownerId,organization_id:req.user.organizationId,active:true}).whereIn('role',['admin','mentor']).first();if(!owner)throw new BadRequestException('Responsável inválido.');const iid=randomUUID();await db('interventions').insert({id:iid,organization_id:req.user.organizationId,enrollment_id:id,owner_id:b.ownerId,created_by:req.user.id,body:b.body,review_at:b.reviewAt});await audit(db,req.user,'enrollment',id,'Intervenção administrativa registrada',{interventionId:iid,body:b.body,reviewAt:b.reviewAt});return {id:iid};}
 @Get('tickets')tickets(@Req()req:any){return this.ops.tickets(req.user);}
 @Post('tickets')createTicket(@Req()req:any,@Body()body:unknown){return this.ops.createTicket(req.user,parse(z.object({enrollmentId:uuid,subject:z.string().trim().min(3).max(200),description:text,priority:z.enum(['standard','urgent']).default('standard')}),body));}
 @Get('tickets/:id')ticket(@Req()req:any,@Param('id')id:string){return this.ops.ticketDetail(req.user,uuid.parse(id));}
 @Post('tickets/:id/messages')message(@Req()req:any,@Param('id')id:string,@Body()body:unknown){return this.ops.message(req.user,uuid.parse(id),parse(z.object({body:text,kind:z.enum(['public','internal','automatic','event']).default('public'),replyToId:uuid.optional(),promisedAt:instant.optional(),completePromise:z.boolean().optional()}),body));}
 @Patch('tickets/:id')transition(@Req()req:any,@Param('id')id:string,@Body()body:unknown){return this.ops.transition(req.user,uuid.parse(id),parse(z.object({status:z.enum(['waiting_mentor','in_progress','waiting_mentee','resolved','reopened']),summary:text.optional(),questionMessageId:uuid.optional()}),body));}
 @Patch('tickets/:id/priority')priority(@Req()req:any,@Param('id')id:string,@Body()body:unknown){return this.ops.priority(req.user,uuid.parse(id),parse(z.object({priority:z.enum(['standard','urgent']),reason:text}),body));}
 @Get('notifications')notifications(@Req()req:any){return this.ops.notifications(req.user);}
 @Post('notifications/:id/ack')ack(@Req()req:any,@Param('id')id:string){return this.ops.acknowledge(req.user,uuid.parse(id));}
 @Get('users')users(@Req()req:any){admin(req.user);return db('users').where({organization_id:req.user.organizationId}).select('id','name','email','role','active','capacity','capacity_version as capacityVersion');}
 @Patch('users/:id')async updateUser(@Req()req:any,@Param('id')id:string,@Body()body:unknown){
  admin(req.user);const b=z.object({name:text.optional(),capacity:z.number().int().min(0).max(500).optional(),expectedCapacityVersion:z.number().int().positive().optional(),active:z.boolean().optional()}).strict().parse(body);
  if(b.capacity!==undefined&&b.expectedCapacityVersion===undefined)throw new BadRequestException('Recarregue o usuário antes de atualizar a capacidade.');
  if(id===req.user.id&&b.active===false)throw new BadRequestException('Não é possível desativar seu próprio acesso.');
  await db.transaction(async trx=>{const row=await trx('users').where({id:uuid.parse(id),organization_id:req.user.organizationId}).forUpdate().first();if(!row)throw new BadRequestException('Usuário inválido.');
   if(b.capacity!==undefined&&row.capacity_version!==b.expectedCapacityVersion)throw new ConflictException('A capacidade mudou. Recarregue antes de salvar.');
   await trx('users').where({id}).update({...(b.name?{name:b.name,profile_version:row.profile_version+1,profile_updated_at:new Date()}:{}),...(b.active!==undefined?{active:b.active}:{}),...(b.capacity!==undefined?{capacity:b.capacity,capacity_version:row.capacity_version+1}:{})});
   if(b.active===false)await trx('sessions').where({user_id:id}).delete();await audit(trx,req.user,'user',id,'Usuário atualizado',b);});return {ok:true};}
 @Post('users/invite')async invite(@Req()req:any,@Body()body:unknown){admin(req.user);const b:any=parse(z.object({name:text,email:z.email(),role:z.enum(['admin','mentor','mentee']),clientId:uuid.optional()}),body);const raw=token(),uid=randomUUID();await db.transaction(async trx=>{if(await trx('users').where({email:b.email.toLowerCase()}).first())throw new BadRequestException('E-mail já cadastrado.');if(b.role==='mentee'&&!b.clientId)throw new BadRequestException('Selecione a empresa autorizada.');if(b.clientId&&!await trx('clients').where({id:b.clientId,organization_id:req.user.organizationId}).first())throw new BadRequestException('Cliente inválido.');await trx('users').insert({id:uid,organization_id:req.user.organizationId,name:b.name,email:b.email.toLowerCase(),role:b.role});if(b.clientId)await trx('client_members').insert({organization_id:req.user.organizationId,client_id:b.clientId,user_id:uid});await trx('access_tokens').insert({hash:hash(raw),user_id:uid,purpose:'invite',expires_at:new Date(Date.now()+24*3600e3)});await audit(trx,req.user,'user',uid,'Convite criado');});return {activationUrl:`${process.env.APP_ORIGIN}/ativar?token=${raw}`,expiresInHours:24};}
 @Post('users/:id/recovery')async recovery(@Req()req:any,@Param('id')id:string){admin(req.user);const user=await db('users').where({id:uuid.parse(id),organization_id:req.user.organizationId}).first();if(!user)throw new BadRequestException('Usuário inválido.');const raw=token();await db('access_tokens').insert({hash:hash(raw),user_id:user.id,purpose:'recovery',expires_at:new Date(Date.now()+3600e3)});await audit(db,req.user,'user',id,'Recuperação de acesso emitida');return {activationUrl:`${process.env.APP_ORIGIN}/ativar?token=${raw}`,expiresInHours:1};}
 private origin(req:any){const origin=req.get('Origin');if(origin&&origin!==process.env.APP_ORIGIN)throw new ForbiddenException('Origem inválida.');}
 private async rate(ip:string,kind:string){const k='elo:'+kind+':'+hash(ip),n=await redis.incr(k);if(n===1)await redis.expire(k,900);if(n>15)throw new ForbiddenException('Muitas tentativas. Aguarde 15 minutos.');}
}
@Module({imports:[PlansModule,AttachmentsModule,MeetingsModule,DiagnosticsModule,IndicatorsModule,ReportsModule,CommercialModule,JourneyModule,MaterialsModule,IntegrationsModule,ProfileModule],controllers:[Api],providers:[Operations,{provide:APP_GUARD,useClass:AuthGuard}]})class AppModule{}
async function main(){if(process.env.NODE_ENV==='production'&&(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32))throw new Error('SESSION_SECRET obrigatório.');const app=await NestFactory.create<NestExpressApplication>(AppModule,{logger:['error','warn','log']});app.use(helmet());
// A bounded 64 KiB CSV can double in size when JSON escapes quotes or backslashes.
// Keep the original JSON limit for other endpoints; CSV bytes are checked separately.
app.useBodyParser('json',{limit:'160kb',type:req=>/^\/api\/indicators\/csv-(preview|import)\/?$/i.test((req.url||'').split('?')[0])});
app.useBodyParser('json',{limit:'100kb'});
app.use(cookieParser());app.useGlobalFilters(new Errors());app.enableShutdownHooks();await app.listen(Number(process.env.PORT||3333),'0.0.0.0');}
main().catch(()=>{console.error('Não foi possível iniciar a API.');process.exit(1);});
