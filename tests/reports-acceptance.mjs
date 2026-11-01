import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DateTime} from 'luxon';
import {integrationEnvironment} from './helpers/integration-environment.mjs';
const app=integrationEnvironment({database:'elo_reportscheck',port:3345,redisDb:12});
const {ok,request}=app;let admin,mentor,mentor2,mentee,mentee2,own,other,foreign,ticket,otherTicket,from,to,noTicket,secondProgramClient,programId,secondProgramId;
before(async()=>{
 await app.start();({admin,mentor,mentor2,mentee,mentee2}=await app.accounts());const p=(await ok(admin,'/programs'))[0];programId=p.id;
 own=await app.client(admin,p.id,mentor.user.id,mentee.user.id,'Carteira de relatórios');other=await app.client(admin,p.id,mentor2.user.id,null,'Outra carteira');
 const ext=await app.externalOrganization();foreign=await app.client(ext.admin,ext.programId,ext.mentorId,null,'Outra organização');
 ticket=await ok(mentee,'/tickets',{enrollmentId:own.enrollmentId,subject:'=1+1 · fila antiga',description:'Pergunta pública de validação.',priority:'standard'});
 otherTicket=await ok(mentor2,'/tickets',{enrollmentId:other.enrollmentId,subject:'Assunto de outra carteira',description:'Dados que não podem atravessar carteira.',priority:'urgent'});
 const now=DateTime.now().setZone('America/Sao_Paulo');from=now.minus({days:29}).toISODate();to=now.toISODate();
 noTicket=await app.client(admin,p.id,mentor.user.id,null,'Sem chamado e sem acompanhamento');
 await app.db('enrollments').where({id:noTicket.enrollmentId}).update({starts_at:now.minus({days:60}).toJSDate(),last_contact_at:null});
 const originalProgram=await app.db('programs').where({id:p.id}).first();secondProgramId=randomUUID();
 await app.db('programs').insert({...originalProgram,id:secondProgramId,name:'Segundo programa '+app.runId,calendar:JSON.stringify(originalProgram.calendar)});
 secondProgramClient=await app.client(admin,secondProgramId,mentor.user.id,null,'Empresa de outro programa');
 await app.db('journey_checklists').insert({enrollment_id:own.enrollmentId,organization_id:admin.user.organizationId,commercial_notes:'SEGREDO-FINANCEIRO-RELATORIOS'}).onConflict('enrollment_id').merge({commercial_notes:'SEGREDO-FINANCEIRO-RELATORIOS'});
 const question=await app.db('messages').where({ticket_id:ticket.id,kind:'public'}).first();
 const answered=now.startOf('week').plus({hours:11}).minus({weeks:1}).toUTC().toJSDate(),started=new Date(+answered-60*60000);
 await app.db('tickets').where({id:ticket.id}).update({created_at:now.minus({days:60}).toJSDate(),status:'in_progress'});
 await app.db('sla_events').where({ticket_id:ticket.id,kind:'first'}).update({started_at:started,due_at:new Date(+answered+60*60000),fulfilled_at:answered});
 await app.db('messages').insert({id:randomUUID(),organization_id:admin.user.organizationId,ticket_id:ticket.id,author_id:mentor.user.id,kind:'public',body:'Resposta humana de demonstração.',reply_to_id:question.id,created_at:answered});
 await app.db('sla_events').where({ticket_id:ticket.id,kind:'next'}).update({due_at:now.minus({days:2}).toJSDate(),started_at:now.minus({days:3}).toJSDate()});
 await app.db('messages').insert({id:randomUUID(),organization_id:admin.user.organizationId,ticket_id:ticket.id,author_id:mentor.user.id,kind:'internal',body:'SEGREDO-INTERNO-RELATORIOS',created_at:now.toJSDate()});
});
after(()=>app.stop());
const report=(actor,extra='')=>ok(actor,`/reports/operations?from=${from}&to=${to}&enrollmentId=${own.enrollmentId}${extra}`);
test('Relatórios operacionais: períodos, pendências e autorização',async t=>{
 await t.test('fila antiga permanece no retrato atual e percentis usam resposta pública humana com amostra',async()=>{
  const r=await report(mentor);assert.equal(r.current.ticketsCreated,0);assert.equal(r.snapshot.openTickets,1);assert.equal(r.snapshot.overdueTickets,1);
  assert.equal(r.current.firstResponse.n,1);assert.equal(r.current.firstResponse.medianMinutes,60);assert.equal(r.current.firstResponse.p90Minutes,60);
  assert.ok(r.queue.some(q=>q.id===ticket.id&&q.overdue));assert.ok(r.current.compliance.eligible>r.current.compliance.onTime);
  assert.ok(!JSON.stringify(r).includes('SEGREDO-INTERNO-RELATORIOS'));
  assert.ok(!JSON.stringify(r).includes('SEGREDO-FINANCEIRO-RELATORIOS'));
 });
 await t.test('cards correspondem às listas autorizadas e os filtros não perdem opções nem excluem clientes sem chamados',async()=>{
  const selected=await report(mentor);assert.equal(selected.portfolio.length,selected.snapshot.activeEnrollments);
  assert.deepEqual(selected.portfolio.map(row=>row.enrollmentId),[own.enrollmentId]);
  assert.ok(selected.programs.some(p=>p.id===secondProgramId));assert.ok(selected.clients.some(c=>c.enrollmentId===noTicket.enrollmentId));
  const r=await ok(mentor,`/reports/operations?from=${from}&to=${to}&programId=${programId}`);
  assert.deepEqual(new Set(r.portfolio.map(row=>row.enrollmentId)),new Set([own.enrollmentId,noTicket.enrollmentId]));
  assert.equal(r.followupQueue.length,r.snapshot.withoutRecentContact);const unattended=r.followupQueue.find(row=>row.enrollmentId===noTicket.enrollmentId);
  assert.ok(unattended);assert.match(unattended.reason,/Sem contato/);assert.ok(Date.parse(unattended.dueAt)<Date.now());assert.equal(unattended.mentorName,mentor.user.name);
  assert.equal(unattended.actionUrl,`/journey/enrollments/${noTicket.enrollmentId}`);assert.ok(!r.queue.some(row=>row.enrollmentId===noTicket.enrollmentId));
  assert.ok(!r.portfolio.some(row=>row.enrollmentId===secondProgramClient.enrollmentId));assert.ok(!r.clients.some(row=>row.enrollmentId===secondProgramClient.enrollmentId));
  const mismatch=await report(mentor,`&programId=${secondProgramId}`);assert.equal(mismatch.portfolio.length,0);assert.equal(mismatch.followupQueue.length,0);assert.equal(mismatch.queue.length,0);
 });
 await t.test('mentor não atravessa carteira, organização ou filtro de outro mentor; mentorado não recebe relatórios de equipe',async()=>{
  for(const e of [other,foreign]){const r=await ok(mentor,`/reports/operations?from=${from}&to=${to}&enrollmentId=${e.enrollmentId}`);assert.equal(r.snapshot.openTickets,0);assert.equal(r.current.firstResponse.n,0);assert.equal(r.current.firstResponse.medianMinutes,null);}
  assert.equal((await request(mentor,`/reports/operations?from=${from}&to=${to}&mentorId=${mentor2.user.id}`)).status,403);
  assert.equal((await request(mentee,`/reports/operations?from=${from}&to=${to}`)).status,403);
 });
 await t.test('períodos vazios mantêm percentis e taxas indisponíveis; datas e intervalos inválidos são recusados',async()=>{
  const empty=await ok(mentor,`/reports/operations?from=2000-01-01&to=2000-01-02&enrollmentId=${own.enrollmentId}`);assert.equal(empty.current.firstResponse.n,0);assert.equal(empty.current.compliance.rate,null);assert.equal(empty.current.reopeningRate,null);
  for(const range of ['from=2026-02-30&to=2026-03-01','from=2000-01-01&to=2005-01-01','from=2099-01-01&to=2099-01-02'])assert.equal((await request(admin,'/reports/operations?'+range)).status,400);
 });
 await t.test('satisfação privada não altera amostra do mentor; administrador consulta agregação com base explícita',async()=>{
  await app.db('satisfaction_responses').insert({id:randomUUID(),organization_id:admin.user.organizationId,enrollment_id:own.enrollmentId,respondent_id:mentee.user.id,context_type:'cycle',context_id:own.enrollmentId,score:1,comment:'COMENTARIO-PRIVADO',shared_with_mentor:false});
  assert.equal((await report(mentor)).current.satisfaction.n,0);assert.equal((await report(admin)).current.satisfaction.average,1);assert.ok(!JSON.stringify(await report(mentor)).includes('COMENTARIO-PRIVADO'));
  await app.db('client_members').insert({organization_id:admin.user.organizationId,client_id:own.id,user_id:mentee2.user.id});
  await app.db('satisfaction_responses').insert({id:randomUUID(),organization_id:admin.user.organizationId,enrollment_id:own.enrollmentId,respondent_id:mentee2.user.id,context_type:'cycle',context_id:own.enrollmentId,score:5,comment:'COMENTARIO-COMPARTILHADO',shared_with_mentor:true});
  assert.deepEqual((await report(mentor)).current.satisfaction,{n:1,average:5,sharedOnly:true});
  assert.deepEqual((await report(admin)).current.satisfaction,{n:2,average:3,sharedOnly:false});
  assert.ok(!JSON.stringify(await report(mentor)).includes('COMENTARIO-COMPARTILHADO'));
 });
 await t.test('CSV respeita escopo, inclui critérios e neutraliza assunto semelhante a fórmula',async()=>{
  const path=`/api/reports/operations/export.csv?from=${from}&to=${to}&enrollmentId=${own.enrollmentId}`;
  const response=await fetch(app.origin+path,{headers:{Cookie:mentor.cookie}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,3).toString('hex'),'efbbbf');const csv=bytes.toString('utf8');
  assert.ok(csv.includes('"\'=1+1'));assert.ok(csv.includes('Critérios'));assert.ok(!csv.includes('Assunto de outra carteira'));
  assert.equal((await fetch(app.origin+path,{headers:{Cookie:mentee.cookie}})).status,403);
 });
 await t.test('contratação futura não aumenta carga atual nem cria atenção antes da vigência',async()=>{
  const program=(await ok(admin,'/programs'))[0],future=await ok(admin,'/clients',{name:'Ciclo futuro '+app.runId,contactName:'Validação',email:randomUUID()+'@test.local',programId:program.id,mentorId:mentor.user.id,startsAt:new Date(Date.now()+86400e3*10).toISOString(),endsAt:new Date(Date.now()+86400e3*100).toISOString()});
  const r=await ok(mentor,`/reports/operations?from=${from}&to=${to}&enrollmentId=${future.enrollmentId}`);assert.equal(r.snapshot.activeEnrollments,0);assert.ok(r.byMentor.every(m=>m.activeEnrollments===0));
  const c=(await ok(admin,'/clients')).find(c=>c.enrollmentId===future.enrollmentId);assert.deepEqual(c.attentionReasons,[]);
 });
 await t.test('renovação publica o denominador de encerrados e contagens de acompanhamento, urgência e ausência têm base atual',async()=>{
  const clients=[];for(const label of ['Renovado','Encerrado sem renovação','Cancelado'])clients.push(await app.client(admin,programId,mentor.user.id,null,label));
  const ended=new Date(Date.now()-2*86400e3),started=new Date(Date.now()-90*86400e3);
  for(let index=0;index<clients.length;index++)await app.db('enrollments').where({id:clients[index].enrollmentId}).update({status:index===2?'cancelled':'closed',starts_at:started,ends_at:ended});
  const source=await app.db('enrollments').where({id:clients[0].enrollmentId}).first(),nextId=randomUUID();
  await app.db('enrollments').insert({...source,id:nextId,status:'active',starts_at:new Date(Date.now()+86400e3),ends_at:new Date(Date.now()+91*86400e3),previous_enrollment_id:source.id});
  await app.db('journey_renewals').insert({id:randomUUID(),organization_id:admin.user.organizationId,source_enrollment_id:source.id,new_enrollment_id:nextId,created_by:admin.user.id,request_key:randomUUID(),payload_hash:'0'.repeat(64),reason:'Ciclo renovado em ensaio.'});
  const all=await ok(mentor,`/reports/operations?from=${from}&to=${to}&programId=${programId}`);assert.deepEqual(all.current.renewal,{eligible:2,renewed:1,rate:50});
  const cancelled=await ok(mentor,`/reports/operations?from=${from}&to=${to}&enrollmentId=${clients[2].enrollmentId}`);assert.deepEqual(cancelled.current.renewal,{eligible:0,renewed:0,rate:null});
  await app.db('audit_events').insert({id:randomUUID(),organization_id:admin.user.organizationId,actor_id:mentor.user.id,entity_type:'enrollment',entity_id:own.enrollmentId,action:'Acompanhamento registrado',details:JSON.stringify({summary:'Registro de acompanhamento no período.'})});
  await app.db('tickets').where({id:ticket.id}).update({priority:'urgent'});
  await app.db('mentor_absences').insert({id:randomUUID(),organization_id:admin.user.organizationId,mentor_id:mentor.user.id,requested_by:mentor.user.id,decided_by:admin.user.id,starts_at:new Date(Date.now()-3600e3),ends_at:new Date(Date.now()+3600e3),reason:'Motivo privado de ausência',status:'approved'});
  const current=await report(mentor);assert.equal(current.current.followupsRecorded,1);assert.equal(current.byMentor[0].approvedAbsence,true);assert.equal(current.byMentor[0].urgentOpenTickets,1);assert.ok(!JSON.stringify(current).includes('Motivo privado de ausência'));
 });
 await t.test('tarefas reabertas mantêm conclusão histórica e entregas submetidas não contam como atraso de execução',async()=>{
  const plan=await ok(mentor,'/plans',{enrollmentId:own.enrollmentId,title:'Plano do relatório',objective:'Verificar execução por período.'});
  const task=await ok(mentor,`/plans/${plan.id}/tasks`,{title:'Conclusão registrada',assigneeId:mentor.user.id,dueAt:new Date(Date.now()-86400e3).toISOString(),completionCriteria:'Registrar a verificação.'});
  await ok(mentor,`/tasks/${task.id}/transition`,{status:'done',evidenceText:'Verificação concluída e documentada.'});
  await ok(mentor,`/tasks/${task.id}/transition`,{status:'in_progress',reason:'Necessário ampliar a verificação.'});
  const submitted=await ok(mentor,`/plans/${plan.id}/tasks`,{title:'Entrega sob revisão',assigneeId:mentee.user.id,dueAt:new Date(Date.now()-86400e3).toISOString(),completionCriteria:'Entregar evidência.'});
  await ok(mentee,`/tasks/${submitted.id}/transition`,{status:'submitted',evidenceText:'Evidência disponível para revisão da equipe.'});
  const current=await report(mentor);assert.equal(current.current.tasksCompleted,1);assert.equal(current.snapshot.overdueTasks,1);
 });
 await t.test('obrigações residuais de assunto resolvido e prazos pausados não inflam filas atuais',async()=>{
  const closed=await ok(mentor,'/tickets',{enrollmentId:own.enrollmentId,subject:'Legado já resolvido',description:'Verificação de dados antigos.',priority:'standard'});
  const paused=await ok(mentor,'/tickets',{enrollmentId:own.enrollmentId,subject:'Aguardando informação do cliente',description:'Verificação de pausa.',priority:'standard'});
  await app.db('tickets').where({id:closed.id}).update({status:'resolved',resolved_at:new Date()});await app.db('tickets').where({id:paused.id}).update({status:'waiting_mentee'});
  await app.db('sla_events').whereIn('ticket_id',[closed.id,paused.id]).update({started_at:new Date(Date.now()-3*86400e3),due_at:new Date(Date.now()-86400e3),fulfilled_at:null});
  await app.db('sla_events').where({ticket_id:paused.id}).update({paused_at:new Date()});
  const current=await report(mentor);assert.equal(current.snapshot.overdueTickets,current.queue.filter(q=>q.overdue).length);assert.equal(current.snapshot.overdueTickets,1);
  assert.equal(current.snapshot.waitingTickets,1);assert.ok(!current.queue.some(q=>q.id===closed.id));assert.ok(current.queue.some(q=>q.id===paused.id&&!q.overdue));
 });
 await t.test('troca de mentor revoga consulta detalhada e exportação na requisição seguinte',async()=>{
  await ok(admin,`/enrollments/${own.enrollmentId}/assignments`,{mentorId:mentor2.user.id,kind:'primary'});const r=await report(mentor);assert.equal(r.snapshot.openTickets,0);assert.equal(r.queue.length,0);
 });
});
