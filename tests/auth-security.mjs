import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {config} from 'dotenv';
import knex from 'knex';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
config({quiet:true});
const require=createRequire(import.meta.url);
const {authenticator}=require('otplib');
const database='elo_authcheck';
const origin='http://localhost:3335';
const password='SecurityOnly!'+randomUUID();
const email=`admin-${randomUUID()}@security.test`;
const ownerUrl=`postgresql://elo_owner:${process.env.DB_OWNER_PASSWORD}@127.0.0.1:55432/`;
let db,server,activationUrl,adminSession;
const env={...process.env,NODE_ENV:'production',DATABASE_URL:`postgresql://elo_app:${process.env.DB_APP_PASSWORD}@127.0.0.1:55432/${database}`,MIGRATION_DATABASE_URL:ownerUrl+database,REDIS_URL:`redis://:${process.env.REDIS_PASSWORD}@127.0.0.1:56379/2`,APP_ORIGIN:origin,PORT:'3335',ADMIN_EMAIL:email,UPLOAD_DIR:resolve('.local/test-uploads/elo_authcheck')};
function cli(args){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',()=>{});p.on('exit',code=>code===0?resolve(output):reject(new Error('CLI de teste falhou')));p.on('error',reject);});}
async function request(session,path,body,method=body?'POST':'GET',customHeaders={}){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{}),...customHeaders},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0],setCookie:r.headers.get('set-cookie')};}
async function ok(session,path,body,method){const r=await request(session,path,body,method);assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
async function signin(address,otp){const r=await request(null,'/auth/login',{email:address,password,otp});assert.equal(r.status,201,JSON.stringify(r.data));return {...r.data,cookie:r.cookie};}
before(async()=>{
 const serverDb=knex({client:'pg',connection:ownerUrl+'postgres'});if(!(await serverDb('pg_database').where({datname:database}).first()))await serverDb.raw('CREATE DATABASE elo_authcheck OWNER elo_owner');await serverDb.destroy();
 db=knex({client:'pg',connection:ownerUrl+database});await db.migrate.latest({directory:resolve('database/migrations')});
 const output=await cli(['apps/api/dist/cli.js','bootstrap']);activationUrl=output.match(/http:\/\/localhost:3335\/ativar\?token=[a-f0-9]+/)?.[0];assert.ok(activationUrl,'Bootstrap retornou acesso temporário');
 server=spawn(process.execPath,['apps/api/dist/main.js'],{env,stdio:['ignore','ignore','ignore']});
 for(let i=0;i<60;i++){try{if((await fetch(origin+'/api/health/live')).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw new Error('API isolada não iniciou');
});
test('Segurança: produção, MFA, isolamento e sessões',async t=>{
 const raw=new URL(activationUrl).searchParams.get('token');let setup;
 await t.test('bootstrap usa hash e senha definida antes de MFA obrigatório',async()=>{
  const row=await db('users').where({email}).first();assert.equal(row.password_hash,null);const stored=await db('access_tokens').where({user_id:row.id}).first();assert.notEqual(stored.hash,raw);
  setup=await ok(null,'/auth/activate',{token:raw,password});assert.ok(setup.mfaSetupRequired);assert.equal((await request(null,'/auth/activate',{token:raw,password})).status,400);
  assert.equal((await request(null,'/auth/login',{email,password})).status,403);
  assert.notEqual((await db('users').where({email}).first()).mfa_secret,setup.secret);
 });
 await t.test('MFA valida código, consome configuração e cookies de produção são seguros',async()=>{
  assert.equal((await request(null,'/auth/mfa/confirm',{setupToken:setup.setupToken,otp:'000000'})).status,400);
  await ok(null,'/auth/mfa/confirm',{setupToken:setup.setupToken,otp:authenticator.generate(setup.secret)});
  assert.equal((await request(null,'/auth/mfa/confirm',{setupToken:setup.setupToken,otp:authenticator.generate(setup.secret)})).status,400);
  assert.equal((await request(null,'/auth/login',{email,password})).status,401);
  const r=await request(null,'/auth/login',{email,password,otp:authenticator.generate(setup.secret)});assert.equal(r.status,201);assert.match(r.setCookie,/HttpOnly/);assert.match(r.setCookie,/Secure/);assert.match(r.setCookie,/SameSite=Lax/);adminSession={...r.data,cookie:r.cookie};
 });
 await t.test('origem incorreta e CSRF não podem alterar a sessão',async()=>{
  assert.equal((await request(null,'/auth/login',{email,password,otp:authenticator.generate(setup.secret)},'POST',{Origin:'https://untrusted.test'})).status,403);
  assert.equal((await request({...adminSession,csrfToken:'incorrect'},'/auth/refresh',{})).status,403);
 });
 await t.test('renovações concorrentes emitem somente uma nova sessão',async()=>{
  const results=await Promise.all([request(adminSession,'/auth/refresh',{}),request(adminSession,'/auth/refresh',{})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,401]);assert.equal((await request(adminSession,'/auth/me')).status,401);const fresh=results.find(r=>r.status===201);adminSession={...fresh.data,cookie:fresh.cookie};
 });
 let mentorSession,mentorId,client;
 await t.test('notas administrativas ficam fora do histórico entregue ao mentor',async()=>{
  const mentorEmail=`mentor-${randomUUID()}@security.test`;const invite=await ok(adminSession,'/users/invite',{name:'Mentor de teste',email:mentorEmail,role:'mentor'});await ok(null,'/auth/activate',{token:new URL(invite.activationUrl).searchParams.get('token'),password});mentorSession=await signin(mentorEmail);mentorId=mentorSession.user.id;
  const programs=await ok(adminSession,'/programs');client=await ok(adminSession,'/clients',{name:'Cliente isolado',contactName:'Contato',email:'contato@security.test',programId:programs[0].id,mentorId});
  const secret='Observação privada de gestão '+randomUUID();await ok(adminSession,`/enrollments/${client.enrollmentId}/interventions`,{body:secret,ownerId:adminSession.user.id,reviewAt:new Date(Date.now()+86400e3).toISOString()});
  assert.ok(JSON.stringify(await ok(adminSession,`/clients/${client.id}`)).includes(secret));assert.ok(!JSON.stringify(await ok(mentorSession,`/clients/${client.id}`)).includes(secret));
 });
 await t.test('chaves estrangeiras impedem vínculos cruzados entre organizações',async()=>{
  const foreignOrg=randomUUID(),foreignClient=randomUUID();await db('organizations').insert({id:foreignOrg,name:'Outra organização'});await db('clients').insert({id:foreignClient,organization_id:foreignOrg,name:'Outro cliente',contact_name:'Outro contato',email:'other@security.test'});
  const programs=await ok(adminSession,'/programs');await assert.rejects(()=>db('enrollments').insert({id:randomUUID(),organization_id:adminSession.user.organizationId,client_id:foreignClient,program_id:programs[0].id,starts_at:new Date(),ends_at:new Date(Date.now()+86400e3)}),e=>e.code==='23503');
  assert.equal((await request(adminSession,`/clients/${foreignClient}`)).status,404);assert.equal((await request(mentorSession,`/clients/${foreignClient}`)).status,404);
 });
 await t.test('recuperação invalida links antigos e sessões anteriores',async()=>{
  const older=await ok(adminSession,`/users/${mentorId}/recovery`,{}),newer=await ok(adminSession,`/users/${mentorId}/recovery`,{});await ok(null,'/auth/activate',{token:new URL(newer.activationUrl).searchParams.get('token'),password});assert.equal((await request(null,'/auth/activate',{token:new URL(older.activationUrl).searchParams.get('token'),password})).status,400);assert.equal((await request(mentorSession,'/auth/me')).status,401);
  const email=(await db('users').where({id:mentorId}).first()).email;mentorSession=await signin(email);
 });
 await t.test('desativação revoga acesso e capacidade do mentor é editável',async()=>{
  await ok(adminSession,`/users/${mentorId}`,{capacity:8,expectedCapacityVersion:(await db('users').where({id:mentorId}).first()).capacity_version,active:false},'PATCH');assert.equal((await request(mentorSession,'/auth/me')).status,401);assert.equal((await db('users').where({id:mentorId}).first()).capacity,8);
 });
});
after(async()=>{if(server){server.kill();await new Promise(r=>server.once('exit',r));}if(db)await db.destroy();});
