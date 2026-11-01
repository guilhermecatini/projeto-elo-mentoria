import {BadRequestException,Body,CanActivate,ConflictException,Controller,ExecutionContext,ForbiddenException,Get,HttpException,Inject,Injectable,Module,NotFoundException,OnModuleDestroy,OnModuleInit,Param,Patch,Post,Query,Req,Res,ServiceUnavailableException,UploadedFile,UseGuards,UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {memoryStorage} from 'multer';
import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import * as fs from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {Knex} from 'knex';
import {z} from 'zod';
import {db} from './db';
import {redis,User} from './auth';
import {audit,enrollment,scopedEnrollments} from './access';
import {validateAttachment,ATTACHMENT_LIMITS} from './attachments';
import {materialContentSchema,materialHash,materialChunks,materialExcerpt,MaterialContent} from './material-content';

type Connection=Knex|Knex.Transaction;
const uuid=z.string().uuid(),version=z.coerce.number().int().positive();
const visibility=z.enum(['admin_private','team','shared']);
const createInput=materialContentSchema.omit({fileId:true}).extend({enrollmentId:uuid.nullable().optional(),visibility});
const updateInput=materialContentSchema.extend({expectedVersion:z.number().int().positive()});
const staff=(user:User)=>{if(user.role==='mentee')throw new ForbiddenException('A equipe prepara os materiais.');};
const checkVersion=(row:any,expected:number)=>{if(row.version!==expected)throw new ConflictException('O material foi atualizado. Recarregue antes de salvar.');};
const fileDto=(row:any)=>({id:row.id,originalName:row.original_name,mimeType:row.mime_type,sizeBytes:Number(row.size_bytes),sha256:row.sha256,downloadUrl:`/api/materials/files/${row.id}/download`});

@Injectable()
export class MaterialsService implements OnModuleInit,OnModuleDestroy {
  private root=resolve(process.env.UPLOAD_DIR||resolve(__dirname,'../../../.local/uploads'),'materials');
  private timer?:NodeJS.Timeout;
  async onModuleInit(){await this.directories();await this.cleanup();this.timer=setInterval(()=>this.cleanup().catch(()=>console.error('Não foi possível recuperar arquivos pendentes de materiais.')),15*60*1000);this.timer.unref();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  private async directories(){
    for(const path of [this.root,join(this.root,'pending'),join(this.root,'objects')]){
      await fs.mkdir(path,{recursive:true,mode:0o700});const stat=await fs.lstat(path);
      if(!stat.isDirectory()||stat.isSymbolicLink()||resolve(await fs.realpath(path))!==path)throw new Error('Diretório privado de materiais inválido.');
      if(process.platform!=='win32')await fs.chmod(path,0o700);
    }
  }
  private path(key:string,pending=false){if(!/^[0-9a-f-]{36}$/.test(key))throw new ServiceUnavailableException('Arquivo indisponível.');return join(this.root,pending?'pending':'objects',key+(pending?'.tmp':'.bin'));}
  async cleanup(){
    await db.transaction(async trx=>{
      await trx.raw("SELECT pg_advisory_xact_lock(hashtext('elo-material-cleanup'))");
      const rows=await trx('material_files').whereIn('status',['pending','failed']).where('created_at','<',new Date(Date.now()-3600e3)).forUpdate();
      for(const row of rows){await this.remove(row.storage_key);await trx('material_files').where({id:row.id,status:'pending'}).update({status:'failed'});}
    });
  }
  private async remove(key:string){for(const pending of [true,false]){try{const path=this.path(key,pending),stat=await fs.lstat(path);if(stat.isFile()&&!stat.isSymbolicLink())await fs.unlink(path);}catch(e:any){if(e.code!=='ENOENT')throw e;}}}
  private scoped(user:User,connection:Connection=db){
    const query=connection('documents as d').where('d.organization_id',user.organizationId).whereNotNull('d.draft');
    if(user.role==='mentor')query.whereNot('d.visibility','admin_private').where(function(){this.whereNull('d.enrollment_id').orWhereIn('d.enrollment_id',scopedEnrollments(user,connection).select('e.id'));});
    if(user.role==='mentee')query.where({'d.visibility':'shared','d.status':'published'}).where('d.published_version','>',0)
      .whereIn('d.enrollment_id',scopedEnrollments(user,connection).select('e.id'));
    return query;
  }
  private async row(user:User,id:string,connection:Connection=db){const row=await this.scoped(user,connection).where('d.id',id).select('d.*').first();if(!row)throw new NotFoundException('Material não encontrado.');return row;}
  private async writeRow(user:User,id:string,trx:Knex.Transaction,expected?:number,allowArchived=false){
    staff(user);const current=await this.row(user,id,trx);
    if(current.enrollment_id){await trx('enrollments').where({id:current.enrollment_id,organization_id:user.organizationId}).forUpdate().first();const e=await enrollment(user,current.enrollment_id,trx);if(e.status!=='active')throw new BadRequestException('A contratação está somente para leitura.');}
    const row=await trx('documents').where({id,organization_id:user.organizationId}).forUpdate().first();
    await this.row(user,id,trx);
    if(!allowArchived&&row.status==='archived')throw new BadRequestException('Reative o material antes de alterar.');
    if(expected!==undefined)checkVersion(row,expected);return row;
  }
  private async contentFile(content:MaterialContent,row:any,connection:Connection=db){
    if(!content.fileId)return null;
    const file=await connection('material_files').where({id:content.fileId,document_id:row.id,organization_id:row.organization_id,status:'ready'}).first();
    if(!file)throw new BadRequestException('Arquivo não disponível neste material.');return fileDto(file);
  }
  async list(user:User,filters:{enrollmentId?:string;status?:string}={}){
    const query=this.scoped(user).orderBy('d.updated_at','desc');if(filters.enrollmentId)query.where('d.enrollment_id',filters.enrollmentId);if(filters.status)query.where('d.status',filters.status);
    const rows=await query.select('d.*');const output=[];
    for(const row of rows){const revision=row.published_version?await db('material_revisions').where({document_id:row.id,organization_id:user.organizationId,version:row.published_version}).first():null;
      const content=user.role==='mentee'?revision.snapshot:row.draft;
      output.push({id:row.id,enrollmentId:row.enrollment_id,visibility:row.visibility,status:row.status,title:content.title,indication:content.indication,tags:content.tags,publishedVersion:row.published_version||null,
        ...(user.role!=='mentee'?{draftVersion:row.version,hasUnpublishedChanges:!revision||revision.source_hash!==materialHash(row.draft)}:{})});}
    return output;
  }
  async detail(user:User,id:string,selectedVersion?:number){
    const row=await this.row(user,id);const revisions=await db('material_revisions').where({document_id:id,organization_id:user.organizationId}).orderBy('version','desc');
    const selected=selectedVersion?revisions.find(item=>item.version===selectedVersion):revisions[0];if(selectedVersion&&!selected)throw new NotFoundException('Versão não encontrada.');
    const published=selected?{...selected.snapshot,version:selected.version,publishedAt:selected.published_at,file:await this.contentFile(selected.snapshot,row)}:null;
    const result:any={id,enrollmentId:row.enrollment_id,visibility:row.visibility,status:row.status,publishedVersion:row.published_version||null,published,revisions:revisions.map(item=>({version:item.version,publishedAt:item.published_at}))};
    if(user.role!=='mentee'){
      result.draftVersion=row.version;result.draft={...row.draft,file:await this.contentFile(row.draft,row)};
      result.enrollmentStatus=row.enrollment_id?(await enrollment(user,row.enrollment_id)).status:null;
      result.hasUnpublishedChanges=!revisions[0]||revisions[0].source_hash!==materialHash(row.draft);
      result.history=await db('audit_events as a').leftJoin('users as u','u.id','a.actor_id').where({'a.organization_id':user.organizationId,'a.entity_type':'material','a.entity_id':id}).select('a.id','a.action','a.details','a.created_at as createdAt','u.name as actorName').orderBy('a.created_at','desc').limit(100);
    }return result;
  }
  async create(user:User,input:z.infer<typeof createInput>){
    staff(user);if(input.visibility==='admin_private'&&user.role!=='admin')throw new ForbiddenException('Material reservado à administração.');
    if(input.visibility==='shared'&&!input.enrollmentId)throw new BadRequestException('Selecione a contratação que receberá o material.');
    const {enrollmentId,visibility:access,...raw}=input;const content=materialContentSchema.parse(raw);
    return db.transaction(async trx=>{
      if(enrollmentId){await enrollment(user,enrollmentId,trx);await trx('enrollments').where({id:enrollmentId,organization_id:user.organizationId}).forUpdate().first();if((await enrollment(user,enrollmentId,trx)).status!=='active')throw new BadRequestException('A contratação está somente para leitura.');}
      const id=randomUUID();await trx('documents').insert({id,organization_id:user.organizationId,enrollment_id:enrollmentId||null,created_by:user.id,visibility:access,title:content.title,source_hash:materialHash(content),version:1,draft:JSON.stringify(content)});
      await audit(trx,user,'material',id,'Material iniciado',{visibility:access,enrollmentId});return{id,draftVersion:1};
    });
  }
  async save(user:User,id:string,input:z.infer<typeof updateInput>){return db.transaction(async trx=>{
    const row=await this.writeRow(user,id,trx,input.expectedVersion);const {expectedVersion,...content}=input;await this.contentFile(content,row,trx);
    await trx('documents').where({id}).update({draft:JSON.stringify(content),title:content.title,source_hash:materialHash(content),version:row.version+1,updated_at:new Date()});
    await audit(trx,user,'material',id,'Rascunho atualizado',{before:row.draft,after:content});return{ok:true,draftVersion:row.version+1};
  });}
  async publish(user:User,id:string,expected:number){return db.transaction(async trx=>{
    const row=await this.writeRow(user,id,trx,expected),content=materialContentSchema.parse(row.draft);await this.contentFile(content,row,trx);
    if(!content.body&&!content.link&&!content.fileId)throw new BadRequestException('Inclua texto, link ou arquivo antes de publicar.');
    const hash=materialHash(content);const previous=await trx('material_revisions').where({document_id:id,version:row.published_version}).first();if(previous?.source_hash===hash)return{ok:true,version:row.published_version,alreadyPublished:true};
    const publishedVersion=row.published_version+1;await trx('material_revisions').insert({id:randomUUID(),organization_id:user.organizationId,document_id:id,version:publishedVersion,snapshot:JSON.stringify(content),source_hash:hash,published_by:user.id});
    const chunks=materialChunks(content);await trx('document_chunks').insert(chunks.map((content,position)=>({id:randomUUID(),document_id:id,organization_id:user.organizationId,enrollment_id:row.enrollment_id,visibility:row.visibility,source_version:publishedVersion,source_hash:hash,position,content,embedding:null,embedding_model:null,embedding_dimension:null})));
    await trx('documents').where({id}).update({published_version:publishedVersion,status:'published',updated_at:new Date()});await audit(trx,user,'material',id,'Material publicado',{version:publishedVersion,hash});return{ok:true,version:publishedVersion};
  });}
  async status(user:User,id:string,input:{expectedVersion:number;status:'active'|'archived';reason:string}){return db.transaction(async trx=>{
    const row=await this.writeRow(user,id,trx,input.expectedVersion,true);const status=input.status==='archived'?'archived':row.published_version?'published':'draft';
    if(status===row.status)throw new BadRequestException('Material já está nesta situação.');await trx('documents').where({id}).update({status,version:row.version+1,updated_at:new Date()});await audit(trx,user,'material',id,'Disponibilidade alterada',{status,reason:input.reason});return{ok:true,draftVersion:row.version+1};
  });}
  async search(user:User,q:string,enrollmentId?:string){
    const allowed=this.scoped(user).where('d.status','published').where('d.published_version','>',0);if(enrollmentId)allowed.where('d.enrollment_id',enrollmentId);
    // Permission predicates are part of SQL before selecting any content or excerpt.
    const query=db('document_chunks as c').join('documents as d',function(){this.on('d.id','=','c.document_id').andOn('d.published_version','=','c.source_version');})
      .where('c.organization_id',user.organizationId).whereIn('c.document_id',allowed.select('d.id')).whereRaw('strpos(lower(c.content), lower(?)) > 0',[q])
      .join('material_revisions as r',function(){this.on('r.document_id','=','c.document_id').andOn('r.version','=','c.source_version').andOn('r.organization_id','=','c.organization_id');})
      .select('c.document_id','c.source_version','c.source_hash','c.content','c.position','r.snapshot').orderBy('c.document_id').orderBy('c.position').limit(50);
    return(await query).map(row=>({materialId:row.document_id,version:row.source_version,title:row.snapshot.title,sourceHash:row.source_hash,position:row.position,excerpt:materialExcerpt(row.content,q),actionUrl:`/materials/${row.document_id}?version=${row.source_version}`}));
  }
  async authorizeUpload(user:User,id:string,expected:number){staff(user);const row=await this.row(user,id);checkVersion(row,expected);if(row.status==='archived')throw new BadRequestException('Reative o material antes de anexar.');if(row.enrollment_id&&(await enrollment(user,row.enrollment_id)).status!=='active')throw new BadRequestException('A contratação está somente para leitura.');}
  async upload(user:User,id:string,expected:number,file:any){
    const valid=validateAttachment(file),fileId=randomUUID(),key=randomUUID();
    await db.transaction(async trx=>{
      await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',[`elo-material-quota:${user.organizationId}`]);await this.writeRow(user,id,trx,expected);
      const active=trx('material_files').where({organization_id:user.organizationId}).whereIn('status',['ready','pending']);
      const organization=await active.clone().sum('size_bytes as bytes').first(),context=await active.clone().where({document_id:id}).count('* as count').sum('size_bytes as bytes').first();
      if(Number(context?.count||0)>=20||Number(context?.bytes||0)+valid.sizeBytes>200*1024*1024||Number(organization?.bytes||0)+valid.sizeBytes>2*1024*1024*1024)throw new BadRequestException('Limite de armazenamento de materiais atingido.');
      await trx('material_files').insert({id:fileId,document_id:id,organization_id:user.organizationId,created_by:user.id,storage_key:key,original_name:valid.originalName,mime_type:valid.mimeType,size_bytes:valid.sizeBytes,sha256:valid.sha256});
    });
    try{
      await this.directories();const handle=await fs.open(this.path(key,true),'wx',0o600);try{await handle.writeFile(file.buffer);await handle.sync();}finally{await handle.close();}
      await fs.rename(this.path(key,true),this.path(key));
      if(process.platform!=='win32'){const directory=await fs.open(join(this.root,'objects'),'r');try{await directory.sync();}finally{await directory.close();}}
      return await db.transaction(async trx=>{
        const row=await this.writeRow(user,id,trx,expected);await trx('material_files').where({id:fileId,status:'pending'}).update({status:'ready',ready_at:new Date()});
        const content={...row.draft,fileId};await trx('documents').where({id}).update({draft:JSON.stringify(content),source_hash:materialHash(content),version:row.version+1,updated_at:new Date()});
        await audit(trx,user,'material',id,'Arquivo privado anexado',{fileId,name:valid.originalName});return{id:fileId,...valid,draftVersion:row.version+1};
      });
    }catch(error){await this.remove(key).catch(()=>undefined);await db('material_files').where({id:fileId,status:'pending'}).update({status:'failed'});throw error;}
  }
  async download(user:User,id:string){
    const file=await db('material_files').where({id,organization_id:user.organizationId,status:'ready'}).first();if(!file)throw new NotFoundException('Arquivo não encontrado.');
    const row=await this.row(user,file.document_id);
    if(user.role==='mentee'){
      const referenced=await db('material_revisions').where({document_id:row.id,organization_id:user.organizationId}).whereRaw("snapshot->>'fileId' = ?",[id]).first();
      if(!referenced)throw new NotFoundException('Arquivo não encontrado.');
    }
    try{const handle=await fs.open(this.path(file.storage_key),constants.O_RDONLY|constants.O_NOFOLLOW);let buffer:Buffer;try{const stat=await handle.stat();if(!stat.isFile()||stat.size!==Number(file.size_bytes))throw new Error('Integrity');buffer=await handle.readFile();}finally{await handle.close();}
      if(createHash('sha256').update(buffer).digest('hex')!==file.sha256)throw new Error('Integrity');return{file:fileDto(file),buffer};
    }catch{throw new ServiceUnavailableException('Não foi possível verificar este arquivo. Avise a equipe.');}
  }
}

@Injectable()
class MaterialUploadGuard implements CanActivate {
  constructor(@Inject(MaterialsService) private service:MaterialsService){}
  async canActivate(context:ExecutionContext){
    const req=context.switchToHttp().getRequest(),res=context.switchToHttp().getResponse();
    const id=uuid.parse(req.params.id),expected=version.parse(req.headers['x-material-version']);await this.service.authorizeUpload(req.user,id,expected);
    const userKey=`material-upload:user:${req.user.id}`,orgKey=`material-upload:org:${req.user.organizationId}`,rate=`material-upload:rate:${req.user.id}:${Math.floor(Date.now()/3600e3)}`,token=randomUUID(),now=Date.now();
    const acquired=await redis.eval(`redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',ARGV[2]);
      if redis.call('EXISTS',KEYS[1])==1 or redis.call('ZCARD',KEYS[2])>=4 then return 0 end;
      redis.call('SET',KEYS[1],ARGV[1],'PX',180000);redis.call('ZADD',KEYS[2],ARGV[3],ARGV[1]);redis.call('PEXPIRE',KEYS[2],180000);return 1`,2,userKey,orgKey,token,String(now),String(now+180000));
    if(!acquired)throw new HttpException('Aguarde os envios em andamento terminarem.',429);
    const count=await redis.incr(rate);await redis.expire(rate,3700);let released=false;
    const release=()=>{if(!released){released=true;void redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('DEL',KEYS[1]) end;redis.call('ZREM',KEYS[2],ARGV[1]);return 1",2,userKey,orgKey,token).catch(()=>undefined);}};res.once('finish',release);res.once('close',release);
    if(count>60){release();throw new HttpException('Limite de envios por hora atingido.',429);}req.materialExpected=expected;return true;
  }
}
@Controller('api/materials')
class MaterialsController {
  constructor(@Inject(MaterialsService) private service:MaterialsService){}
  @Get() list(@Req()req:any,@Query()query:unknown){return this.service.list(req.user,z.object({enrollmentId:uuid.optional(),status:z.enum(['draft','published','archived']).optional()}).strict().parse(query));}
  @Get('search') search(@Req()req:any,@Query()query:unknown){const q=z.object({q:z.string().trim().min(2).max(100),enrollmentId:uuid.optional()}).strict().parse(query);return this.service.search(req.user,q.q,q.enrollmentId);}
  @Post() create(@Req()req:any,@Body()body:unknown){return this.service.create(req.user,createInput.parse(body));}
  @Get('files/:id/download') async download(@Req()req:any,@Param('id')id:string,@Res()res:any){const result=await this.service.download(req.user,uuid.parse(id));res.header('Content-Type',result.file.mimeType).header('Content-Disposition',`attachment; filename="arquivo"; filename*=UTF-8''${encodeURIComponent(result.file.originalName)}`).header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').send(result.buffer);}
  @Get(':id') detail(@Req()req:any,@Param('id')id:string,@Query()query:unknown){const q=z.object({version:version.optional()}).strict().parse(query);return this.service.detail(req.user,uuid.parse(id),q.version);}
  @Patch(':id') save(@Req()req:any,@Param('id')id:string,@Body()body:unknown){return this.service.save(req.user,uuid.parse(id),updateInput.parse(body));}
  @Post(':id/publish') publish(@Req()req:any,@Param('id')id:string,@Body()body:unknown){return this.service.publish(req.user,uuid.parse(id),z.object({expectedVersion:z.number().int().positive()}).strict().parse(body).expectedVersion);}
  @Post(':id/status') status(@Req()req:any,@Param('id')id:string,@Body()body:unknown){return this.service.status(req.user,uuid.parse(id),z.object({expectedVersion:z.number().int().positive(),status:z.enum(['active','archived']),reason:z.string().trim().min(1).max(2000)}).strict().parse(body));}
  @Post(':id/file') @UseGuards(MaterialUploadGuard) @UseInterceptors(FileInterceptor('file',{storage:memoryStorage(),limits:{fileSize:ATTACHMENT_LIMITS.maxFileBytes,files:1,fields:0,parts:1}}))
  upload(@Req()req:any,@Param('id')id:string,@UploadedFile()file:any){return this.service.upload(req.user,uuid.parse(id),req.materialExpected,file);}
}
@Module({controllers:[MaterialsController],providers:[MaterialsService,MaterialUploadGuard],exports:[MaterialsService]})
export class MaterialsModule {}
