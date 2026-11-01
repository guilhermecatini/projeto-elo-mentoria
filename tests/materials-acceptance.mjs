import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import * as fs from 'node:fs/promises';
import {integrationEnvironment} from './helpers/integration-environment.mjs';
const app=integrationEnvironment({database:'elo_materialscheck',port:3344,redisDb:11});
const {ok,request}=app;
let admin,mentor,mentor2,mentee,mentee2,own,other,foreign,external,shared,team,privateDoc,otherDoc,foreignDoc,uploaded;
const marker=`fonte-${app.runId}`;
const content=(extra={})=>({title:'Orientação de margem',body:`${marker} Confira custos e frete antes de ajustar os preços.`,indication:'Usar na revisão de margem.',tags:['margem'],link:'',fileId:null,...extra});
const create=(actor,enrollmentId,visibility,extra={})=>{const{fileId,...data}=content(extra);return ok(actor,'/materials',{...data,enrollmentId,visibility});};
const get=(actor,item,version)=>ok(actor,`/materials/${item.id}${version?`?version=${version}`:''}`);
const draftBody=(item,extra={})=>{const{file,...data}=item.draft;return{...data,expectedVersion:item.draftVersion,...extra};};
const publish=async(actor,item)=>ok(actor,`/materials/${item.id}/publish`,{expectedVersion:(await get(actor,item)).draftVersion});
async function upload(actor,item,bytes=Buffer.from('Orientação de teste em UTF-8.'),name='orientação.txt',type='text/plain',expected){
  const form=new FormData();form.append('file',new Blob([bytes],{type}),name);
  const response=await fetch(app.origin+`/api/materials/${item.id}/file`,{method:'POST',headers:{Origin:app.origin,Cookie:actor.cookie,'X-CSRF-Token':actor.csrfToken,'X-Material-Version':String(expected??(await get(mentor,item)).draftVersion)},body:form});
  return{status:response.status,data:await response.json()};
}
async function download(actor,id){const response=await fetch(app.origin+`/api/materials/files/${id}/download`,{headers:{Cookie:actor.cookie}});return{status:response.status,headers:response.headers,bytes:Buffer.from(await response.arrayBuffer())};}
const search=(actor,q=marker,enrollmentId)=>ok(actor,`/materials/search?${new URLSearchParams({q,...enrollmentId?{enrollmentId}:{}})}`);
const changeEnrollment=async(status)=>ok(admin,`/enrollments/${own.enrollmentId}`,{status,reason:'Ensaio de leitura e retomada.',expectedVersion:(await ok(admin,`/journey/enrollments/${own.enrollmentId}`)).journeyVersion},'PATCH');
before(async()=>{
  await app.start();({admin,mentor,mentor2,mentee,mentee2}=await app.accounts());const program=(await ok(admin,'/programs'))[0];
  own=await app.client(admin,program.id,mentor.user.id,mentee.user.id,'Materiais próprios');other=await app.client(admin,program.id,mentor2.user.id,mentee2.user.id,'Materiais outra carteira');
  external=await app.externalOrganization();foreign=await app.client(external.admin,external.programId,external.mentorId,null,'Materiais externos');
  shared=await create(mentor,own.enrollmentId,'shared');team=await create(mentor,null,'team',{title:'Modelo global da equipe'});
  privateDoc=await create(admin,null,'admin_private',{title:'Reservado à administração'});otherDoc=await create(mentor2,other.enrollmentId,'shared',{title:'Outra carteira'});foreignDoc=await create(external.admin,foreign.enrollmentId,'shared',{title:'Outra organização'});
});
test('Materiais privados: versões, arquivos e busca textual com autorização',async t=>{
  await t.test('escopo e público limitam lista e detalhe antes de qualquer conteúdo',async()=>{
    assert.equal((await request(mentee,`/materials/${shared.id}`)).status,404);
    for(const item of [privateDoc,otherDoc,foreignDoc])assert.equal((await request(mentor,`/materials/${item.id}`)).status,404);
    assert.equal((await get(mentor2,team)).draft.title,'Modelo global da equipe');
    assert.ok(!(await ok(mentor,'/materials')).some(item=>item.id===privateDoc.id));
    assert.equal((await request(mentee,'/materials',{title:'Não pode',enrollmentId:own.enrollmentId,visibility:'shared'})).status,403);
    assert.equal((await request(mentor,'/materials',{title:'Não pode',visibility:'admin_private'})).status,403);
    assert.equal((await request(admin,'/materials',{title:'Sem contratação',visibility:'shared'})).status,400);
    assert.equal((await request(mentor,'/materials',{title:'Outro cliente',enrollmentId:other.enrollmentId,visibility:'team'})).status,404);
    assert.equal((await request(admin,`/materials/${foreignDoc.id}`)).status,404);
  });
  await t.test('edições simultâneas não sobrescrevem trabalho e links exigem HTTPS sem credenciais',async()=>{
    const original=await get(mentor,shared),base=draftBody(original);
    for(const link of ['javascript:alert(1)','http://example.org','https://user:pass@example.org'])assert.equal((await request(mentor,`/materials/${shared.id}`,{...base,link},'PATCH')).status,400);
    assert.equal((await request({...mentor,csrfToken:'errado'},`/materials/${shared.id}`,base,'PATCH')).status,403);
    const results=await Promise.all([request(mentor,`/materials/${shared.id}`,{...base,indication:'Revisão A'},'PATCH'),request(mentor,`/materials/${shared.id}`,{...base,indication:'Revisão B'},'PATCH')]);
    assert.equal(results.filter(value=>value.status===200).length,1);assert.equal(results.filter(value=>value.status===409).length,1);
    assert.equal((await get(mentor,shared)).draftVersion,original.draftVersion+1);
  });
  await t.test('upload privado valida conteúdo, conserva nome Unicode e nega o mentorado antes do arquivo',async()=>{
    const current=await get(mentor,shared);
    assert.equal((await upload(mentee,shared,Buffer.from('Texto'),'x.txt','text/plain',current.draftVersion)).status,403);
    assert.equal((await upload(mentor2,shared,Buffer.from('Texto'),'x.txt','text/plain',current.draftVersion)).status,404);
    assert.equal((await upload(mentor,shared,Buffer.from('<svg></svg>'),'imagem.svg','image/svg+xml')).status,400);
    assert.equal((await upload(mentor,shared,Buffer.alloc(0))).status,400);
    assert.equal((await upload(mentor,shared,Buffer.alloc(10*1024*1024+1,65))).status,413);
    const result=await upload(mentor,shared);assert.equal(result.status,201,JSON.stringify(result.data));uploaded=result.data;
    assert.equal(uploaded.originalName,'orientação.txt');assert.equal((await download(mentee,uploaded.id)).status,404);
    const file=await download(mentor,uploaded.id);assert.equal(file.status,200);assert.equal(createHash('sha256').update(file.bytes).digest('hex'),uploaded.sha256);
    assert.match(file.headers.get('content-disposition'),/attachment/);assert.match(file.headers.get('cache-control'),/no-store/);
  });
  let first;
  await t.test('publicação gera fonte imutável sem vetores inventados e a busca filtra permissões no SQL',async()=>{
    const contact=(await app.db('enrollments').where({id:own.enrollmentId}).first()).last_contact_at;
    for(const[actor,item]of[[mentor,shared],[mentor,team],[admin,privateDoc],[mentor2,otherDoc],[external.admin,foreignDoc]])await publish(actor,item);
    first=await get(mentee,shared);assert.equal(first.published.version,1);assert.equal(first.published.file.id,uploaded.id);
    for(const key of ['draft','draftVersion','history','hasUnpublishedChanges'])assert.ok(!(key in first));
    assert.equal((await download(mentee,uploaded.id)).status,200);
    assert.deepEqual(new Set((await search(mentee)).map(item=>item.materialId)),new Set([shared.id]));
    const mentorHits=await search(mentor);assert.ok(mentorHits.some(hit=>hit.materialId===team.id));assert.ok(!mentorHits.some(hit=>[privateDoc.id,otherDoc.id,foreignDoc.id].includes(hit.materialId)));
    assert.ok((await search(admin)).some(hit=>hit.materialId===privateDoc.id));assert.deepEqual(await search(mentee,marker,other.enrollmentId),[]);
    const chunks=await app.db('document_chunks').where({document_id:shared.id});assert.ok(chunks.length);
    for(const chunk of chunks){assert.equal(chunk.organization_id,admin.user.organizationId);assert.equal(chunk.enrollment_id,own.enrollmentId);assert.equal(chunk.source_version,1);assert.equal(chunk.embedding,null);assert.equal(chunk.embedding_model,null);assert.equal(chunk.embedding_dimension,null);assert.match(chunk.source_hash,/^[a-f0-9]{64}$/);}
    assert.equal((await app.db('enrollments').where({id:own.enrollmentId}).first()).last_contact_at,contact);
  });
  await t.test('novo texto e arquivo ficam no rascunho até publicar; versões e arquivos anteriores continuam íntegros',async()=>{
    const secret=`minuta-${app.runId}`,current=await get(mentor,shared);
    await ok(mentor,`/materials/${shared.id}`,draftBody(current,{title:secret,body:secret}),'PATCH');
    const file=await upload(mentor,shared,Buffer.from('Nova revisão documental.'),'revisão.txt');assert.equal(file.status,201);
    assert.deepEqual(await get(mentee,shared),first);assert.equal((await download(mentee,file.data.id)).status,404);assert.deepEqual(await search(mentee,secret),[]);
    assert.ok(!(JSON.stringify(await ok(mentee,'/materials'))).includes(secret));
    await publish(mentor,shared);const second=await get(mentee,shared);assert.equal(second.published.version,2);assert.equal(second.published.file.id,file.data.id);
    assert.deepEqual((await get(mentee,shared,1)).published,first.published);assert.equal((await download(mentee,uploaded.id)).status,200);
    assert.equal((await search(mentee,secret))[0].version,2);assert.ok(!(await search(mentee,marker)).some(hit=>hit.materialId===shared.id));
    const before=await app.db('material_revisions').where({document_id:shared.id}).count('* as count').first();await publish(mentor,shared);assert.deepEqual(await app.db('material_revisions').where({document_id:shared.id}).count('* as count').first(),before);
  });
  await t.test('falha de disco não publica arquivo nem destrói o arquivo anterior',async()=>{
    const root=resolve('.local/test-uploads/elo_materialscheck/materials'),objects=join(root,'objects'),held=join(root,'objects-qa-held');
    assert.ok(objects.startsWith(root));assert.ok(held.startsWith(root));const before=await get(mentor,shared);
    await fs.rename(objects,held);try{await fs.writeFile(objects,'falha de armazenamento simulada');assert.equal((await upload(mentor,shared,Buffer.from('Falha induzida.'),'falha.txt')).status,500);}
    finally{await fs.unlink(objects);await fs.rename(held,objects);}
    assert.deepEqual(await get(mentor,shared),before);assert.deepEqual(await fs.readdir(join(root,'pending')),[]);assert.equal((await download(mentor,uploaded.id)).status,200);
    const row=await app.db('material_files').where({id:uploaded.id}).first(),path=join(objects,row.storage_key+'.bin'),original=await fs.readFile(path);
    try{const altered=Buffer.from(original);altered[0]^=1;await fs.writeFile(path,altered);assert.equal((await download(mentor,uploaded.id)).status,503);}finally{await fs.writeFile(path,original);}
  });
  await t.test('arquivar retira pesquisa e acesso do cliente; pausa impede edição e envio',async()=>{
    await ok(mentor,`/materials/${shared.id}/status`,{expectedVersion:(await get(mentor,shared)).draftVersion,status:'archived',reason:'Revisar orientação.'});
    assert.equal((await request(mentee,`/materials/${shared.id}`)).status,404);assert.equal((await download(mentee,uploaded.id)).status,404);assert.deepEqual(await search(mentee,`minuta-${app.runId}`),[]);
    await ok(mentor,`/materials/${shared.id}/status`,{expectedVersion:(await get(mentor,shared)).draftVersion,status:'active',reason:'Revisão concluída.'});
    await changeEnrollment('paused');
    try{const current=await get(mentor,shared);assert.equal((await request(mentor,`/materials/${shared.id}`,draftBody(current),'PATCH')).status,400);assert.equal((await upload(mentor,shared,undefined,undefined,undefined,current.draftVersion)).status,400);assert.equal((await get(mentee,shared)).published.version,2);}
    finally{await changeEnrollment('active');}
  });
  await t.test('troca de mentor, cobertura e remoção do cliente revogam texto, pesquisa e bytes imediatamente',async()=>{
    await ok(admin,`/enrollments/${own.enrollmentId}/assignments`,{mentorId:mentor2.user.id,kind:'primary'});
    assert.equal((await request(mentor,`/materials/${shared.id}`)).status,404);assert.equal((await download(mentor,uploaded.id)).status,404);assert.deepEqual(await search(mentor,`minuta-${app.runId}`),[]);
    await ok(admin,`/enrollments/${own.enrollmentId}/assignments`,{mentorId:mentor.user.id,kind:'coverage',endsAt:new Date(Date.now()+3600e3).toISOString()});assert.equal((await download(mentor,uploaded.id)).status,200);
    await app.db('assignments').where({enrollment_id:own.enrollmentId,mentor_id:mentor.user.id,kind:'coverage'}).update({starts_at:new Date(Date.now()-3600e3),ends_at:new Date(Date.now()-1000)});
    assert.equal((await download(mentor,uploaded.id)).status,404);await ok(admin,`/enrollments/${own.enrollmentId}/assignments`,{mentorId:mentor.user.id,kind:'primary'});
    await app.db('client_members').where({client_id:own.id,user_id:mentee.user.id}).delete();try{assert.equal((await download(mentee,uploaded.id)).status,404);assert.deepEqual(await search(mentee,`minuta-${app.runId}`),[]);}finally{await app.db('client_members').insert({organization_id:admin.user.organizationId,client_id:own.id,user_id:mentee.user.id});}
  });
  await t.test('banco e API recusam arquivo de outro material e vínculos entre organizações',async()=>{
    const current=await get(mentor,team);assert.equal((await request(mentor,`/materials/${team.id}`,draftBody(current,{fileId:uploaded.id}),'PATCH')).status,400);
    const row=await app.db('documents').where({id:shared.id}).first();await assert.rejects(()=>app.db('documents').insert({...row,id:randomUUID(),enrollment_id:foreign.enrollmentId}),error=>error.code==='23503');
    const revision=await app.db('material_revisions').where({document_id:shared.id,version:1}).first();assert.equal(revision.snapshot.fileId,uploaded.id);
    const privileges=await app.db.raw('SELECT has_table_privilege(?, ?, ?) AS allowed',['elo_app','material_revisions','UPDATE']);assert.equal(privileges.rows[0].allowed,false);
  });
  await t.test('quota de vinte arquivos resiste a envios concorrentes sem remover versões anteriores',async()=>{
    const item=await create(mentor,own.enrollmentId,'team',{title:'Ensaio da quota de arquivos'});let expected=item.draftVersion;
    for(let index=0;index<19;index++){const result=await upload(mentor,item,Buffer.from(`Arquivo ${index} preservado.`),`arquivo-${index}.txt`,'text/plain',expected);assert.equal(result.status,201);expected=result.data.draftVersion;}
    const results=await Promise.all([upload(mentor,item,Buffer.from('Último arquivo A.'),'ultimo-a.txt','text/plain',expected),upload(admin,item,Buffer.from('Último arquivo B.'),'ultimo-b.txt','text/plain',expected)]);
    assert.equal(results.filter(value=>value.status===201).length,1);assert.ok(results.some(value=>[400,409].includes(value.status)));
    assert.equal(Number((await app.db('material_files').where({document_id:item.id,status:'ready'}).count('* as count').first()).count),20);
  });
  await t.test('reinício preserva arquivos prontos e reconcilia apenas tentativas pendentes antigas',async()=>{
    const root=resolve('.local/test-uploads/elo_materialscheck/materials'),id=randomUUID(),key=randomUUID();
    await app.db('material_files').insert({id,organization_id:admin.user.organizationId,document_id:shared.id,created_by:mentor.user.id,storage_key:key,original_name:'interrompido.txt',mime_type:'text/plain',size_bytes:3,sha256:createHash('sha256').update('abc').digest('hex'),status:'pending',created_at:new Date(Date.now()-7200e3)});
    await fs.writeFile(join(root,'pending',key+'.tmp'),'abc');
    await app.stop();await app.start();
    assert.equal((await app.db('material_files').where({id}).first()).status,'failed');
    await assert.rejects(()=>fs.stat(join(root,'pending',key+'.tmp')),error=>error.code==='ENOENT');
    assert.equal((await download(mentor,uploaded.id)).status,200);assert.equal((await get(mentee,shared)).published.version,2);
  });
});
after(()=>app.stop());
