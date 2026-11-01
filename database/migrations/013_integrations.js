const {randomUUID}=require('node:crypto');
exports.up=async k=>{
 await k.schema.createTable('integration_connections',t=>{
  t.uuid('id').primary();t.uuid('organization_id').notNullable().references('organizations.id');t.text('provider').notNullable();t.boolean('enabled').notNullable().defaultTo(false);t.integer('version').notNullable().defaultTo(1);
  t.uuid('updated_by');t.timestamp('verified_at',{useTz:true});t.timestamp('revoked_at',{useTz:true});t.timestamp('last_sync_at',{useTz:true});t.timestamp('last_error_at',{useTz:true});t.text('last_error_code');
  t.text('credentials_encrypted');t.text('token_subject');t.timestamp('token_expires_at',{useTz:true});t.integer('refresh_generation').notNullable().defaultTo(0);
  t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now());t.timestamp('updated_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
  t.foreign(['organization_id','updated_by']).references(['organization_id','id']).inTable('users');t.unique(['organization_id','id']);t.unique(['organization_id','provider']);
  t.check("provider in ('mercadolivre','whatsapp','resend')");t.check('version > 0 AND refresh_generation >= 0');
 });
 await k.schema.createTable('integration_oauth_states',t=>{
  t.text('state_hash').primary();t.uuid('organization_id').notNullable();t.uuid('connection_id').notNullable();t.uuid('actor_id').notNullable();t.text('redirect_uri').notNullable();t.text('verifier_encrypted').notNullable();
  t.timestamp('expires_at',{useTz:true}).notNullable();t.timestamp('used_at',{useTz:true});t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
  t.foreign(['organization_id','connection_id']).references(['organization_id','id']).inTable('integration_connections');t.foreign(['organization_id','actor_id']).references(['organization_id','id']).inTable('users');t.index('expires_at');
 });
 await k.schema.createTable('integration_inbox',t=>{
  t.uuid('id').primary();t.uuid('organization_id').notNullable();t.uuid('connection_id').notNullable();t.text('external_event_id').notNullable();t.text('aggregate_key').notNullable();
  t.text('payload_hash').notNullable();t.text('payload_encrypted').notNullable();t.text('status').notNullable().defaultTo('pending');t.timestamp('occurred_at',{useTz:true}).notNullable();
  t.timestamp('received_at',{useTz:true}).notNullable().defaultTo(k.fn.now());t.timestamp('processed_at',{useTz:true});t.text('last_error_code');
  t.foreign(['organization_id','connection_id']).references(['organization_id','id']).inTable('integration_connections');t.unique(['connection_id','external_event_id']);
  t.check("status in ('pending','processed','ignored_out_of_order','failed')");t.index(['organization_id','connection_id','status']);
 });
 await k.schema.createTable('integration_event_cursors',t=>{
  t.uuid('organization_id').notNullable();t.uuid('connection_id').notNullable();t.text('aggregate_key').notNullable();t.timestamp('last_event_at',{useTz:true}).notNullable();t.text('last_event_id').notNullable();
  t.primary(['connection_id','aggregate_key']);t.foreign(['organization_id','connection_id']).references(['organization_id','id']).inTable('integration_connections');
 });
 await k.schema.createTable('integration_outbox',t=>{
  t.uuid('id').primary();t.uuid('organization_id').notNullable();t.uuid('connection_id').notNullable();t.uuid('request_key').notNullable();t.text('payload_hash').notNullable();t.text('payload_encrypted').notNullable();
  t.text('status').notNullable().defaultTo('prepared');t.text('external_message_id');t.integer('attempt_count').notNullable().defaultTo(0);t.text('last_error_code');
  t.timestamp('next_attempt_at',{useTz:true});t.timestamp('sent_at',{useTz:true});t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
  t.foreign(['organization_id','connection_id']).references(['organization_id','id']).inTable('integration_connections');t.unique(['connection_id','request_key']);
  t.check("status in ('prepared','sent','failed','cancelled','unknown')");t.check('attempt_count >= 0');t.index(['organization_id','connection_id','status']);
 });
 for(const org of await k('organizations').select('id'))await k('integration_connections').insert(['mercadolivre','whatsapp','resend'].map(provider=>({id:randomUUID(),organization_id:org.id,provider})));
 await k.raw("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elo_app') THEN GRANT SELECT,INSERT,UPDATE ON integration_connections,integration_oauth_states,integration_inbox,integration_event_cursors,integration_outbox TO elo_app; REVOKE DELETE ON integration_connections,integration_oauth_states,integration_inbox,integration_event_cursors,integration_outbox FROM elo_app; END IF; END $$");
};
exports.down=async()=>{throw new Error('Preserve os registros de integração. Restaure o backup em ambiente isolado.');};
