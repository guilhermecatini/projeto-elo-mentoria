import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {integrationEnvironment} from './helpers/integration-environment.mjs';
const app=integrationEnvironment({database:'elo_commercialcheck',port:3342,redisDb:9});
const {ok,request}=app;let admin,mentor,mentee,options,external,opp,won,contract,payment,linkedCycle;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const short=(extra={})=>({name:`Oportunidade ${app.runId}`,companyName:`Empresa ${app.runId}`,contactName:'Pessoa de contato',email:`${randomUUID()}@commercial.test`,source:'=1+1',ownerId:admin.user.id,...extra});
const get=()=>ok(admin,`/commercial/opportunities/${opp.id}`);
const editable=r=>Object.fromEntries(['name','companyName','contactName','email','phone','source','ownerId','programId','proposedValue','diagnosis','nextAction','nextActionAt'].map(key=>[key,r[key]]));
before(async()=>{await app.start();({admin,mentor,mentee}=await app.accounts());await ok(admin,'/commercial/stages/defaults',{});options=await ok(admin,'/commercial/options');if(options.stages.filter(s=>s.kind==='open').length<3){await ok(admin,'/commercial/stages',{name:'Qualificação de ensaio',position:2});await ok(admin,'/commercial/stages',{name:'Proposta de ensaio',position:3});options=await ok(admin,'/commercial/options');}external=await app.externalOrganization();await ok(external.admin,'/commercial/stages/defaults',{});});
after(()=>app.stop());
test('CRM, diagnóstico comercial e finanças da mentoria',async t=>{
 await t.test('três perfis têm fronteiras explícitas em consultas, escritas e exportação',async()=>{
  for(const actor of [mentor,mentee])for(const path of ['/commercial/options','/commercial/stages','/commercial/opportunities','/commercial/contracts',`/commercial/reports?from=${today}&to=${today}`])assert.equal((await request(actor,path)).status,403,path);
  for(const actor of [mentor,mentee])assert.equal((await request(actor,'/commercial/opportunities',short())).status,403);
  const csv=await fetch(`${app.origin}/api/commercial/reports/export.csv?from=${today}&to=${today}`,{headers:{Cookie:mentee.cookie}});assert.equal(csv.status,403);
 });
 await t.test('cadastro curto valida responsável, contato e diagnóstico comercial separado',async()=>{
  assert.equal((await request(admin,'/commercial/opportunities',short({ownerId:mentor.user.id}))).status,400);
  assert.equal((await request(admin,'/commercial/opportunities',short({ownerId:external.admin.user.id}))).status,400);
  assert.equal((await request(admin,'/commercial/opportunities',short({email:null,phone:null}))).status,400);
  opp=await ok(admin,'/commercial/opportunities',short());const d=await get();assert.equal(d.status,'open');assert.equal(d.diagnosis.maturity,'not_informed');assert.equal(d.stageHistory.length,1);
  assert.equal((await request(external.admin,`/commercial/opportunities/${opp.id}`)).status,404);
 });
 await t.test('edições e movimentações concorrentes não apagam a atualização anterior',async()=>{
  let d=await get();const data={...editable(d),expectedVersion:d.version,diagnosis:{sellerSituation:'Loja ativa',maturity:'organizing',reportedRevenueBand:'Entre R$ 20 mil e R$ 50 mil',difficulties:'Equipe sem rotina',objective:'Organizar o processo comercial'}};
  const edits=await Promise.all([request(admin,`/commercial/opportunities/${opp.id}`,data,'PATCH'),request(admin,`/commercial/opportunities/${opp.id}`,{...data,source:'Outra origem'},'PATCH')]);assert.equal(edits.filter(x=>x.status===200).length,1);assert.equal(edits.filter(x=>x.status===409).length,1);
  d=await get();const targets=options.stages.filter(s=>s.kind==='open'&&s.id!==d.stageId);const moves=await Promise.all(targets.slice(0,2).map(s=>request(admin,`/commercial/opportunities/${opp.id}/stage`,{expectedVersion:d.version,stageId:s.id})));assert.equal(moves.filter(x=>x.status===201).length,1);assert.equal(moves.filter(x=>x.status===409).length,1);assert.equal((await get()).stageHistory.length,2);
 });
 await t.test('perdas e reaberturas exigem motivo e mantêm histórico',async()=>{
  let d=await get();const lost=options.stages.find(s=>s.kind==='lost'),open=options.stages.find(s=>s.kind==='open');
  assert.equal((await request(admin,`/commercial/opportunities/${opp.id}/stage`,{expectedVersion:d.version,stageId:lost.id})).status,400);
  await ok(admin,`/commercial/opportunities/${opp.id}/stage`,{expectedVersion:d.version,stageId:lost.id,reason:'Cliente adiou o investimento'});d=await get();assert.equal(d.status,'lost');assert.equal(d.lostReason,'Cliente adiou o investimento');
  assert.equal((await request(admin,`/commercial/opportunities/${opp.id}/stage`,{expectedVersion:d.version,stageId:open.id})).status,400);
  await ok(admin,`/commercial/opportunities/${opp.id}/stage`,{expectedVersion:d.version,stageId:open.id,reason:'Cliente retomou o contato'});d=await get();assert.equal(d.status,'open');assert.ok(d.history.some(h=>h.action==='Oportunidade perdida'));
  assert.equal((await request(admin,`/commercial/opportunities/${opp.id}/stage`,{expectedVersion:d.version,stageId:options.stages.find(s=>s.kind==='won').id})).status,400);
 });
 await t.test('ganho concorrente cria um cliente e uma matrícula, sem conta ou financeiro automático',async()=>{
  let d=await get();await ok(admin,'/commercial/opportunities/'+opp.id,{...editable(d),source:'=1+1',expectedVersion:d.version},'PATCH');d=await get();const beforeUsers=Number((await app.db('users').count('* as n').first()).n);const payload={expectedVersion:d.version,newClient:{name:`Ganho ${app.runId}`,contactName:'Contato ganho',email:`${randomUUID()}@win.test`},programId:options.programs[0].id,mentorId:mentor.user.id,startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+90*86400000).toISOString()};
  const results=await Promise.all([request(admin,`/commercial/opportunities/${opp.id}/win`,payload),request(admin,`/commercial/opportunities/${opp.id}/win`,payload)]);assert.ok(results.every(x=>x.status===201),JSON.stringify(results));assert.deepEqual(results[0].data,results[1].data);won=results[0].data;
  assert.equal(Number((await app.db('users').count('* as n').first()).n),beforeUsers);assert.equal((await app.db('mentorship_contracts').where({enrollment_id:won.enrollmentId})).length,0);const e=await app.db('enrollments').where({id:won.enrollmentId}).first();assert.equal(e.stage,'onboarding');assert.equal(e.last_contact_at,null);assert.ok(e.next_step);
  assert.equal((await request(admin,`/commercial/opportunities/${opp.id}/win`,{...payload,mentorId:null})).status,409);
  assert.equal((await request(admin,`/commercial/opportunities/${opp.id}`,{...editable(d),expectedVersion:(await get()).version},'PATCH')).status,400);
  const memberCount=await app.db('client_members').where({client_id:won.clientId});assert.equal(memberCount.length,0);
 });
 await t.test('cadastro existente evita duplicação e conversão inválida é atômica',async()=>{
  const fresh=await ok(admin,'/commercial/opportunities',short({name:'Vínculo existente'}));const b={expectedVersion:1,clientId:won.clientId,programId:external.programId,startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+30*86400000).toISOString()};
  assert.equal((await request(admin,`/commercial/opportunities/${fresh.id}/win`,b)).status,400);assert.equal((await ok(admin,`/commercial/opportunities/${fresh.id}`)).status,'open');
  const result=await ok(admin,`/commercial/opportunities/${fresh.id}/win`,{...b,programId:options.programs[0].id});linkedCycle=result.enrollmentId;assert.equal(result.clientId,won.clientId);assert.notEqual(result.enrollmentId,won.enrollmentId);assert.equal(result.mentorAssigned,false);
  const c=await app.db('clients').where({id:won.clientId}).first();const duplicate=await ok(admin,'/commercial/opportunities',short({name:'Não duplicar cadastro'}));assert.equal((await request(admin,`/commercial/opportunities/${duplicate.id}/win`,{...b,clientId:undefined,newClient:{name:c.name,contactName:c.contact_name,email:c.email},programId:options.programs[0].id})).status,409);
 });
 await t.test('CRM não vaza para a linha do tempo do mentor',async()=>{
  const c=await ok(mentor,`/clients/${won.clientId}`);const json=JSON.stringify(c.timeline);assert.ok(!json.includes('Valor contratado'));assert.ok(!json.includes('Diagnóstico comercial'));assert.ok(!json.includes('conversion'));
  assert.equal((await request(mentor,`/commercial/opportunities/${opp.id}`)).status,403);
 });
 await t.test('valor contratado só existe com registro explícito e matrícula da mesma organização',async()=>{
  const b={enrollmentId:won.enrollmentId,amount:'2500.00',signedAt:today,notes:'Condição explicitamente registrada'};
  const responses=await Promise.all([request(admin,'/commercial/contracts',b),request(admin,'/commercial/contracts',b)]);assert.equal(responses.filter(x=>x.status===201).length,1);assert.equal(responses.filter(x=>x.status===409).length,1);contract=responses.find(x=>x.status===201).data;
  const d=await ok(admin,`/commercial/contracts/${contract.id}`);assert.equal(d.amount,'2500.00');assert.equal(d.signedAt,today);assert.equal((await ok(admin,'/commercial/contracts')).find(x=>x.id===contract.id).signedAt,today);assert.equal(d.received,null);assert.equal(d.remaining,null);
  assert.equal((await request(external.admin,`/commercial/contracts/${contract.id}`)).status,404);
  assert.equal((await request(external.admin,'/commercial/contracts',b)).status,404);
 });
 await t.test('recebimentos são idempotentes, não futuros e independentes do valor proposto',async()=>{
  const b={requestKey:randomUUID(),amount:'500.00',receivedAt:today,dueAt:today,method:'Pix',notes:'Pagamento recebido'};
  const results=await Promise.all([request(admin,`/commercial/contracts/${contract.id}/payments`,b),request(admin,`/commercial/contracts/${contract.id}/payments`,b)]);assert.ok(results.every(r=>r.status===201));assert.equal(results[0].data.id,results[1].data.id);for(const r of results){assert.equal(r.data.receivedAt,today);assert.equal(r.data.dueAt,today);}payment=results[0].data;
  assert.equal((await request(admin,`/commercial/contracts/${contract.id}/payments`,{...b,amount:'700.00'})).status,409);
  assert.equal((await request(admin,`/commercial/contracts/${contract.id}/payments`,{...b,requestKey:randomUUID(),receivedAt:'2099-01-01'})).status,400);
  assert.equal((await request(admin,`/commercial/contracts/${contract.id}/payments`,{...b,requestKey:randomUUID(),amount:'0'})).status,400);
  const d=await ok(admin,`/commercial/contracts/${contract.id}`);assert.equal(d.received,'500.00');assert.equal(d.signedAt,today);assert.equal(d.payments[0].receivedAt,today);assert.equal(d.payments[0].dueAt,today);assert.equal(d.remaining,'2000.00');
 });
 await t.test('correção e estorno preservam auditoria e zero confirmado difere de ausência',async()=>{
  let d=await ok(admin,`/commercial/contracts/${contract.id}`);const patch={expectedVersion:d.version,amount:'2400.00',signedAt:today,notes:'Ajuste formal',reason:'Desconto confirmado'};await ok(admin,`/commercial/contracts/${contract.id}`,patch,'PATCH');assert.equal((await request(admin,`/commercial/contracts/${contract.id}`,patch,'PATCH')).status,409);
  const reverse={expectedVersion:payment.version,reason:'Recebimento devolvido ao cliente'};await ok(admin,`/commercial/payments/${payment.id}/reverse`,reverse);await ok(admin,`/commercial/payments/${payment.id}/reverse`,reverse);d=await ok(admin,`/commercial/contracts/${contract.id}`);assert.equal(d.received,'0.00');assert.equal(d.remaining,'2400.00');assert.equal(d.payments[0].status,'reversed');assert.ok(d.history.some(h=>h.action==='Recebimento estornado'));
 });
 await t.test('relatórios apresentam coortes, denominadores e ausência sem inventar receita',async()=>{
  const report=await ok(admin,`/commercial/reports?from=${today}&to=${today}`);assert.equal(report.from,today);assert.equal(report.to,today);assert.ok(report.cohort.total>=3);assert.ok(report.cohort.won>=2);assert.equal(report.cohort.conversionRate,report.cohort.won/report.cohort.total*100);assert.ok(report.stages.every(s=>s.reached?typeof s.conversionRate==='number':s.conversionRate===null));assert.ok(report.finance.contractSample>=1);assert.ok(report.definitions.sales.includes('não é receita'));
  const empty=await ok(external.admin,`/commercial/reports?from=${today}&to=${today}`);assert.equal(empty.cohort.conversionRate,null);assert.equal(empty.finance.received,null);assert.equal(empty.finance.contracted,null);
  assert.equal((await request(admin,'/commercial/reports?from=2020-01-01&to=2026-01-01')).status,400);
 });
 await t.test('exportação autenticada protege fórmulas e não expõe condições ao mentor',async()=>{
  const response=await fetch(`${app.origin}/api/commercial/reports/export.csv?from=${today}&to=${today}`,{headers:{Cookie:admin.cookie}});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const csv=await response.text();assert.ok(csv.includes(`"De";"${today}";"Até";"${today}"`));assert.ok(csv.includes('Receita contratada registrada'));assert.ok(csv.includes('"\'=1+1"'));
 });
 await t.test('configuração do funil preserva fases terminais e nomes históricos',async()=>{
  const stage=await ok(admin,'/commercial/stages',{name:'Etapa temporária',position:20});const open=await ok(admin,'/commercial/opportunities',short({stageId:stage.id}));assert.equal((await request(admin,`/commercial/stages/${stage.id}`,{name:'Etapa temporária',position:20,active:false,expectedVersion:1,reason:'Arquivar'},'PATCH')).status,400);
  await ok(admin,`/commercial/stages/${stage.id}`,{name:'Etapa renomeada',position:19,active:true,expectedVersion:1,reason:'Ajustar nome'},'PATCH');assert.equal((await ok(admin,`/commercial/opportunities/${open.id}`)).stageHistory[0].toStageName,'Etapa temporária');const terminal=options.stages.find(s=>s.kind==='won');assert.equal((await request(admin,`/commercial/stages/${terminal.id}`,{name:terminal.name,position:terminal.position,active:false,expectedVersion:terminal.version,reason:'Arquivar'},'PATCH')).status,400);
 });
 await t.test('FK composta impede vincular financeiro à matrícula de outra organização',async()=>{
  await assert.rejects(app.db('mentorship_contracts').insert({id:randomUUID(),organization_id:external.organizationId,enrollment_id:linkedCycle,created_by:external.admin.user.id,amount:'1.00',signed_at:today}),(error)=>error.code==='23503');
 });
});
