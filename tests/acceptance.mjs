import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {config} from 'dotenv';
import knex from 'knex';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
config({quiet:true});
const base=process.env.TEST_API_URL||'http://localhost:3334/api';
const database=process.env.TEST_DATABASE_NAME||'elo_acceptance';
if(!database.startsWith('elo_acceptance'))throw new Error('Execute somente em banco isolado elo_acceptance*.');
const connection=`postgresql://elo_owner:${process.env.DB_OWNER_PASSWORD}@127.0.0.1:55432/${database}`;
process.env.DATABASE_URL=connection;
const db=knex({client:'pg',connection});
const require=createRequire(import.meta.url);
const {reconcile}=require('../apps/api/dist/reconcile.js');
const domainDb=require('../apps/api/dist/db.js').db;
async function request(session,path,body,method=body?'POST':'GET'){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=response.headers.get('content-type')?.includes('json')?await response.json():await response.text();
 return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function login(email){const r=await request(null,'/auth/login',{email,password:process.env.DEMO_PASSWORD});assert.equal(r.status,201,JSON.stringify(r.data));return {...r.data,cookie:r.cookie};}
async function ok(s,path,body,method){const r=await request(s,path,body,method);assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}

test('Etapa 1: isolamento, atendimento e reconciliação reais',async t=>{
 const admin=await login('admin@demo.local'),mentor=await login('mentor@demo.local'),mentee=await login('mentorado@demo.local');
 const all=await ok(admin,'/clients'),mine=await ok(mentee,'/clients');assert.ok(all.length>mine.length);assert.ok(mine.length>0);
 const own=mine[0],other=all.find(c=>!mine.some(m=>m.id===c.id));
 const ticket=await ok(mentee,'/tickets',{enrollmentId:own.enrollmentId,subject:'Aceite: dúvidas independentes',description:'Como revisar a ficha técnica?',priority:'standard'});
 let detail=await ok(mentor,`/tickets/${ticket.id}`);const originalDue=detail.firstResponseDueAt,first=detail.messages[0];

 await t.test('IDOR, CSV e CSRF são bloqueados',async()=>{
  assert.equal((await request(mentee,`/clients/${other.id}`)).status,404);
  const mentorClients=await ok(mentor,'/clients'),outside=all.find(c=>!mentorClients.some(m=>m.id===c.id));assert.ok(outside);
  assert.equal((await request(mentor,`/clients/${outside.id}`)).status,404);
  assert.equal((await request(mentee,'/tickets',{enrollmentId:other.enrollmentId,subject:'Inválido',description:'Fora da carteira',priority:'standard'})).status,404);
  const csv=await ok(mentor,'/clients/export');assert.ok(!csv.includes(outside.name));
  assert.equal((await request({...mentee,csrfToken:'invalid'},`/tickets/${ticket.id}/messages`,{body:'CSRF',kind:'public'})).status,403);
  assert.equal((await request(mentee,'/clients',{name:'Inválido'})).status,400);
 });

 let second;
 await t.test('mensagens adicionais, leitura, notas e automação não reiniciam prazo',async()=>{
  second=await ok(mentee,`/tickets/${ticket.id}/messages`,{body:'E como corrigir as fotos?',kind:'public'});
  await ok(mentor,`/tickets/${ticket.id}/messages`,{body:'Nota exclusiva da equipe',kind:'internal'});
  assert.equal((await request(mentor,`/tickets/${ticket.id}/messages`,{body:'Automática',kind:'automatic'})).status,403);
  const now=new Date();await db('messages').insert({id:randomUUID(),organization_id:admin.user.organizationId,ticket_id:ticket.id,kind:'automatic',body:'Recebemos sua mensagem',created_at:now});
  detail=await ok(mentor,`/tickets/${ticket.id}`);assert.equal(detail.firstResponseDueAt,originalDue);assert.equal(detail.unansweredCount,2);
  const publicView=await ok(mentee,`/tickets/${ticket.id}`);assert.ok(!publicView.messages.some(m=>m.kind==='internal'));assert.ok(!JSON.stringify(publicView).includes('Nota exclusiva'));
 });

 await t.test('resposta explícita trata uma dúvida; promessa permanece',async()=>{
  const promisedAt=new Date(Date.now()+3600000).toISOString();
  await ok(mentor,`/tickets/${ticket.id}/messages`,{body:'A ficha técnica precisa destes ajustes. Vou revisar o restante.',kind:'public',replyToId:first.id,promisedAt});
  detail=await ok(mentor,`/tickets/${ticket.id}`);assert.equal(detail.firstResponseDueAt,null);assert.equal(detail.unansweredCount,1);assert.ok(detail.promisedAt);
  assert.equal((await request(mentor,`/tickets/${ticket.id}`,{status:'resolved',summary:'Finalizado'},'PATCH')).status,400);
  await db('sla_events').where({ticket_id:ticket.id,kind:'promised'}).update({due_at:new Date(Date.now()-3600000)});
  const dashboard=await ok(admin,'/dashboard');assert.ok(dashboard.attention.some(x=>x.ticketId===ticket.id&&x.reason.includes('Retorno')));
 });

 await t.test('reconciliação marca violações e deduplica alertas após repetição',async()=>{
  await reconcile();const n1=Number((await db('notifications').where({ticket_id:ticket.id}).count('* as n').first()).n);assert.ok(n1>0);
  await reconcile();const n2=Number((await db('notifications').where({ticket_id:ticket.id}).count('* as n').first()).n);assert.equal(n1,n2);
  assert.ok((await ok(admin,'/notifications')).some(n=>n.ticketId===ticket.id));
  assert.ok(await db('sla_events').where({ticket_id:ticket.id,kind:'promised'}).whereNotNull('violated_at').first());
 });

 await t.test('espera exige solicitação pública; resposta do mentorado reativa',async()=>{
  assert.equal((await request(mentor,`/tickets/${ticket.id}`,{status:'waiting_mentee'},'PATCH')).status,400);
  const question=await ok(mentor,`/tickets/${ticket.id}/messages`,{body:'Para as fotos, use fundo claro. Pode enviar a confirmação?',kind:'public',replyToId:second.id,completePromise:true});
  await ok(mentor,`/tickets/${ticket.id}`,{status:'waiting_mentee',questionMessageId:question.id},'PATCH');
  const response=await ok(mentee,`/tickets/${ticket.id}/messages`,{body:'Confirmado, ajustei as fotos.',kind:'public'});
  detail=await ok(mentor,`/tickets/${ticket.id}`);assert.equal(detail.status,'waiting_mentor');assert.ok(detail.resolutionDueAt);
  await ok(mentor,`/tickets/${ticket.id}/messages`,{body:'Revisei a confirmação. As orientações estão concluídas.',kind:'public',replyToId:response.id});
  assert.equal((await request(mentor,`/tickets/${ticket.id}`,{status:'resolved'},'PATCH')).status,400);
  await ok(mentor,`/tickets/${ticket.id}`,{status:'resolved',summary:'Ficha técnica e fotos revisadas e confirmadas.'},'PATCH');
  await ok(mentee,`/tickets/${ticket.id}`,{status:'reopened',summary:'A revisão gerou outra dúvida.'},'PATCH');
  detail=await ok(mentor,`/tickets/${ticket.id}`);assert.equal(detail.status,'reopened');assert.ok(detail.nextResponseDueAt);assert.ok(detail.hasViolation);
 });

 await t.test('cliente sem chamado também aparece sem acompanhamento',async()=>{
  const programs=await ok(admin,'/programs');const c=await ok(admin,'/clients',{name:'Aceite sem atendimento '+Date.now(),contactName:'Contato de teste',email:'isolado@example.test',programId:programs[0].id});
  await db('enrollments').where({id:c.enrollmentId}).update({starts_at:new Date(Date.now()-10*86400000)});
  const d=await ok(admin,'/dashboard');assert.ok(d.attention.some(a=>a.clientId===c.id&&a.reason==='Sem acompanhamento recente'));assert.ok(d.attention.some(a=>a.clientId===c.id&&a.reason==='Sem mentor principal'));
 });

 await t.test('troca e expiração de cobertura retiram acesso sem apagar histórico',async()=>{
  const mentors=await ok(admin,'/mentors'),replacement=mentors.find(m=>m.id!==mentor.user.id);assert.ok(replacement);
  const before=await ok(admin,`/tickets/${ticket.id}`);
  await ok(admin,`/enrollments/${own.enrollmentId}/assignments`,{mentorId:replacement.id,kind:'primary'});
  assert.equal((await request(mentor,`/tickets/${ticket.id}`)).status,404);
  const after=await ok(admin,`/tickets/${ticket.id}`);assert.equal(after.messages.length,before.messages.length);assert.equal(after.nextResponseDueAt,before.nextResponseDueAt);
  await ok(admin,`/enrollments/${own.enrollmentId}/assignments`,{mentorId:mentor.user.id,kind:'coverage',endsAt:new Date(Date.now()+3600000).toISOString()});
  assert.equal((await request(mentor,`/tickets/${ticket.id}`)).status,200);
  await db('assignments').where({enrollment_id:own.enrollmentId,mentor_id:mentor.user.id,kind:'coverage'}).update({starts_at:new Date(Date.now()-10000),ends_at:new Date(Date.now()-1000)});
  assert.equal((await request(mentor,`/tickets/${ticket.id}`)).status,404);
  await ok(admin,`/enrollments/${own.enrollmentId}/assignments`,{mentorId:mentor.user.id,kind:'primary'});
 });

 await t.test('convite de uso único e logout revogam acesso',async()=>{
  const email=`invite-${Date.now()}@example.test`;const invite=await ok(admin,'/users/invite',{name:'Teste convite',email,role:'mentee',clientId:own.id});
  const token=new URL(invite.activationUrl).searchParams.get('token');
  await ok(null,'/auth/activate',{token,password:process.env.DEMO_PASSWORD});
  assert.equal((await request(null,'/auth/activate',{token,password:process.env.DEMO_PASSWORD})).status,400);
  const session=await login(email);await ok(session,'/auth/logout',{});assert.equal((await request(session,'/auth/me')).status,401);
 });
});
after(async()=>{await db.destroy();await domainDb.destroy();});
