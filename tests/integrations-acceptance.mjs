import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {integrationEnvironment} from './helpers/integration-environment.mjs';
const require=createRequire(import.meta.url),app=integrationEnvironment({database:'elo_integrationscheck',port:3346,redisDb:13});
const {ok,request}=app;let admin,mentor,mentee,external,helpers,adapters,connectionId,secondConnectionId,preferenceId,accountId,secondAccountId;
before(async()=>{
 await app.start();({admin,mentor,mentee}=await app.accounts());external=await app.externalOrganization();helpers=require('../apps/api/dist/integrations.js');adapters=require('../apps/api/dist/provider-adapters.js');
 const program=(await ok(admin,'/programs'))[0],client=await app.client(admin,program.id,mentor.user.id,mentee.user.id,'Contas segregadas');
 accountId=randomUUID();secondAccountId=randomUUID();connectionId=randomUUID();secondConnectionId=randomUUID();
 await app.db('marketplace_accounts').insert([{id:accountId,organization_id:admin.user.organizationId,client_id:client.id,marketplace:'mercadolivre',external_id:'123',label:'Loja A'},
  {id:secondAccountId,organization_id:admin.user.organizationId,client_id:client.id,marketplace:'mercadolivre',external_id:'456',label:'Loja B'}]);
 await app.db('integration_connections').insert([{id:connectionId,organization_id:admin.user.organizationId,provider:'mercadolivre',marketplace_account_id:accountId,enabled:true},
  {id:secondConnectionId,organization_id:admin.user.organizationId,provider:'mercadolivre',marketplace_account_id:secondAccountId,enabled:true}]);
});
after(()=>app.stop());
test('Preparação de integrações oficiais, sem ativação externa',async t=>{
 await t.test('consulta é privada, sem efeitos e sem inventar contas conectadas',async()=>{
  const before=await app.db('integration_connections').where({organization_id:admin.user.organizationId});const result=await ok(admin,'/integrations');assert.equal(result.length,3);assert.ok(result.every(x=>x.status!=='connected'&&x.capabilities.automaticSending===false&&x.capabilities.publicWebhooks===false));assert.deepEqual(await app.db('integration_connections').where({organization_id:admin.user.organizationId}),before);for(const actor of [mentor,mentee])assert.equal((await request(actor,'/integrations')).status,403);assert.ok(!JSON.stringify(result).includes('credentials_encrypted'));
 });
 await t.test('preferências exigem versão e não validam nem conectam uma conta',async()=>{
  const row=(await ok(admin,'/integrations')).find(x=>x.provider==='mercadolivre');const result=await Promise.all([request(admin,'/integrations/mercadolivre/preferences',{expectedVersion:row.version,enabled:!row.enabled},'PATCH'),request(admin,'/integrations/mercadolivre/preferences',{expectedVersion:row.version,enabled:!row.enabled},'PATCH')]);assert.equal(result.filter(x=>x.status===200).length,1);assert.equal(result.filter(x=>x.status===409).length,1);
  const current=(await ok(admin,'/integrations')).find(x=>x.provider==='mercadolivre');assert.equal(current.verifiedAt,row.verifiedAt);assert.equal(current.lastSyncAt,row.lastSyncAt);assert.notEqual(current.status,'connected');preferenceId=(await app.db('integration_connections').where({organization_id:admin.user.organizationId,provider:'mercadolivre'}).whereNull('marketplace_account_id').first()).id;
  assert.equal((await request(admin,'/integrations/resend/preferences',{expectedVersion:0,enabled:true,apiKey:'do-not-accept'},'PATCH')).status,400);assert.equal((await request({...admin,csrfToken:'invalid'},'/integrations/resend/preferences',{expectedVersion:0,enabled:true},'PATCH')).status,403);
  for(const actor of [mentor,mentee])assert.equal((await request(actor,'/integrations/resend/preferences',{expectedVersion:0,enabled:true},'PATCH')).status,403);
 });
 await t.test('organizações não herdam preferências e FKs impedem inbox de outra organização',async()=>{
  const foreign=(await ok(external.admin,'/integrations')).find(x=>x.provider==='resend');await ok(external.admin,'/integrations/resend/preferences',{expectedVersion:foreign.version,enabled:true},'PATCH');const own=(await ok(admin,'/integrations')).find(x=>x.provider==='resend');assert.equal(own.enabled,false);
  await assert.rejects(app.db('integration_inbox').insert({id:randomUUID(),organization_id:external.organizationId,connection_id:connectionId,external_event_id:randomUUID(),aggregate_key:'mail-1',payload_hash:'a'.repeat(64),payload_encrypted:'test',occurred_at:new Date()}),(error)=>error.code==='23503');
 });
 await t.test('cada conta possui sua conexão e o registro de preferências não aceita OAuth',async()=>{
  const config={clientId:'app-test',redirectUri:'https://example.test/oauth/callback'};
  await assert.rejects(helpers.beginMercadoLivreAuthorization(app.db,admin.user,preferenceId,config));
  await assert.rejects(app.db('integration_connections').insert({id:randomUUID(),organization_id:admin.user.organizationId,provider:'mercadolivre',marketplace_account_id:accountId}),(error)=>error.code==='23505');
  await assert.rejects(app.db('integration_connections').insert({id:randomUUID(),organization_id:external.organizationId,provider:'mercadolivre',marketplace_account_id:accountId}),(error)=>error.code==='23503');
  const subjectB={access_token:'account-B-access',refresh_token:'account-B-refresh',token_type:'bearer',expires_in:21600,user_id:456};
  const bindingB=`elo:integration:${admin.user.organizationId}:${secondConnectionId}:credentials`;
  await app.db('integration_connections').where({id:secondConnectionId}).update({verified_at:new Date(),credentials_encrypted:adapters.sealProviderSecret(subjectB,bindingB)});
  assert.equal((await ok(admin,'/integrations')).length,3);
 });
 await t.test('state OAuth é persistido como hash, vinculado ao ator e usado uma vez',async()=>{
  const config={clientId:'app-test',redirectUri:'https://example.test/oauth/callback'};const initiated=await helpers.beginMercadoLivreAuthorization(app.db,admin.user,connectionId,config),url=new URL(initiated.authorizationUrl),state=url.searchParams.get('state');assert.equal(url.hostname,'auth.mercadolivre.com.br');const rows=await app.db('integration_oauth_states').where({connection_id:connectionId});assert.ok(rows.every(x=>!x.verifier_encrypted.includes(state)&&x.state_hash!==state));
  await assert.rejects(helpers.consumeMercadoLivreAuthorization(app.db,external.admin.user,connectionId,state,config.redirectUri));await assert.rejects(helpers.consumeMercadoLivreAuthorization(app.db,admin.user,secondConnectionId,state,config.redirectUri));const consumed=await Promise.allSettled([helpers.consumeMercadoLivreAuthorization(app.db,admin.user,connectionId,state,config.redirectUri),helpers.consumeMercadoLivreAuthorization(app.db,admin.user,connectionId,state,config.redirectUri)]);assert.equal(consumed.filter(x=>x.status==='fulfilled').length,1);assert.equal(consumed.filter(x=>x.status==='rejected').length,1);assert.match(consumed.find(x=>x.status==='fulfilled').value.verifier,/^[A-Za-z0-9_-]{43}$/);
  const expired=await helpers.beginMercadoLivreAuthorization(app.db,admin.user,connectionId,config);await app.db('integration_oauth_states').where({connection_id:connectionId}).whereNull('used_at').update({expires_at:new Date(Date.now()-1000)});await assert.rejects(helpers.consumeMercadoLivreAuthorization(app.db,admin.user,connectionId,new URL(expired.authorizationUrl).searchParams.get('state'),config.redirectUri));
 });
 await t.test('refresh concorrente usa uma geração e grava somente tokens cifrados',async()=>{
  const old={access_token:'old-access-test',refresh_token:'old-refresh-test',token_type:'bearer',expires_in:21600,user_id:123};const bind=`elo:integration:${admin.user.organizationId}:${connectionId}:credentials`;await app.db('integration_connections').where({id:connectionId}).update({enabled:true,verified_at:new Date(),revoked_at:null,refresh_generation:0,credentials_encrypted:adapters.sealProviderSecret(old,bind)});let calls=0;
  const refresh=async token=>{assert.equal(token,'old-refresh-test');calls++;await new Promise(resolve=>setTimeout(resolve,50));return {...old,access_token:'new-access-test',refresh_token:'new-refresh-test'};};const results=await Promise.allSettled([helpers.rotateMercadoLivreCredentials(app.db,admin.user.organizationId,connectionId,0,refresh),helpers.rotateMercadoLivreCredentials(app.db,admin.user.organizationId,connectionId,0,refresh)]);assert.equal(calls,1);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);const row=await app.db('integration_connections').where({id:connectionId}).first();assert.equal(row.refresh_generation,1);assert.ok(!row.credentials_encrypted.includes('new-refresh'));assert.equal(adapters.openProviderSecret(row.credentials_encrypted,bind).refresh_token,'new-refresh-test');
 });
 await t.test('falha de autorização limpa segredo, preserva erro seguro e não tenta enviar novamente',async()=>{
  const previousStatus=(await ok(admin,'/integrations')).find(x=>x.provider==='mercadolivre');await assert.rejects(helpers.rotateMercadoLivreCredentials(app.db,admin.user.organizationId,connectionId,1,async()=>{throw new adapters.ProviderFailure('authentication_required',401);}));const row=await app.db('integration_connections').where({id:connectionId}).first();assert.equal(row.credentials_encrypted,null);assert.ok(row.revoked_at);const status=(await ok(admin,'/integrations')).find(x=>x.provider==='mercadolivre');assert.deepEqual(status,previousStatus);assert.equal(row.last_error_code,'authentication_required');assert.ok(!JSON.stringify(status).includes('old-access'));
 });
 await t.test('renovar uma conta não altera a outra e a cifra não pode ser transferida',async()=>{
  const second=await app.db('integration_connections').where({id:secondConnectionId}).first();const own=admin.user.organizationId;
  assert.equal(second.refresh_generation,0);assert.equal(adapters.openProviderSecret(second.credentials_encrypted,`elo:integration:${own}:${secondConnectionId}:credentials`).refresh_token,'account-B-refresh');
  assert.throws(()=>adapters.openProviderSecret(second.credentials_encrypted,`elo:integration:${own}:${connectionId}:credentials`));
  await assert.rejects(helpers.rotateMercadoLivreCredentials(app.db,external.organizationId,secondConnectionId,0,async()=>{throw new Error('Nunca deve chamar o transporte');}));
 });
 await t.test('inbox conserva duplicados e eventos fora de ordem sem alterar acompanhamento',async()=>{
  await app.db('integration_connections').where({id:connectionId}).update({enabled:true,verified_at:new Date(),revoked_at:null,last_error_code:null,last_error_at:null});const original={externalId:randomUUID(),aggregateKey:`subject-${app.runId}`,occurredAt:new Date(Date.now()-10000).toISOString(),payload:{text:'confidential-event-test'}};const received=await Promise.all([helpers.persistVerifiedProviderEvent(app.db,admin.user.organizationId,connectionId,original),helpers.persistVerifiedProviderEvent(app.db,admin.user.organizationId,connectionId,original)]);assert.equal(received[0].id,received[1].id);assert.equal(received.filter(x=>x.duplicate).length,1);assert.equal(received[0].status,'pending');
  const simultaneous=await helpers.persistVerifiedProviderEvent(app.db,admin.user.organizationId,connectionId,{...original,externalId:randomUUID()});assert.equal(simultaneous.status,'pending');assert.notEqual(simultaneous.id,received[0].id);const late=await helpers.persistVerifiedProviderEvent(app.db,admin.user.organizationId,connectionId,{...original,externalId:randomUUID(),occurredAt:new Date(Date.now()-20000).toISOString()});assert.equal(late.status,'ignored_out_of_order');await assert.rejects(helpers.persistVerifiedProviderEvent(app.db,admin.user.organizationId,connectionId,{...original,payload:{text:'different'}}));const row=await app.db('integration_inbox').where({id:received[0].id}).first();assert.ok(!row.payload_encrypted.includes('confidential'));assert.equal(row.processed_at,null);assert.ok(!JSON.stringify(await ok(admin,'/integrations')).includes('confidential-event-test'));
 });
 await t.test('outbox preparada é idempotente e não simula envio ou entrega',async()=>{
  const key=randomUUID(),payload={to:'recipient@example.test',text:'Mensagem ainda não autorizada para envio'};const rows=await Promise.all([helpers.prepareProviderOutbox(app.db,admin.user.organizationId,connectionId,key,payload),helpers.prepareProviderOutbox(app.db,admin.user.organizationId,connectionId,key,payload)]);assert.equal(rows[0].id,rows[1].id);assert.equal(rows[0].status,'prepared');await assert.rejects(helpers.prepareProviderOutbox(app.db,admin.user.organizationId,connectionId,key,{text:'changed'}));const stored=await app.db('integration_outbox').where({id:rows[0].id}).first();assert.equal(stored.sent_at,null);assert.equal(stored.external_message_id,null);assert.equal(stored.attempt_count,0);assert.ok(!stored.payload_encrypted.includes('recipient@example.test'));
 });
 await t.test('rotas públicas de webhook, ativação e envio não estão disponíveis',async()=>{
  for(const path of ['/integrations/resend/send','/integrations/whatsapp/webhook','/integrations/mercadolivre/authorize'])assert.equal((await request(admin,path,{})).status,404);const unauthorized=await request(null,'/integrations/whatsapp/webhook',{});assert.equal(unauthorized.status,404);
 });
});
