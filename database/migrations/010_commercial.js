const {randomUUID} = require('node:crypto');
const stages = ['Lead recebido', 'Em qualificação', 'Diagnóstico agendado', 'Diagnóstico realizado', 'Proposta enviada', 'Negociação', 'Ganho', 'Perdido'];
exports.up = async k => {
  await k.schema.createTable('commercial_stages', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable().references('organizations.id'); t.text('name').notNullable();
    t.text('kind').notNullable().defaultTo('open'); t.integer('position').notNullable(); t.boolean('active').notNullable().defaultTo(true);
    t.integer('version').notNullable().defaultTo(1); t.timestamp('created_at', {useTz:true}).defaultTo(k.fn.now());
    t.unique(['organization_id','id']); t.check("kind in ('open','won','lost')"); t.check('version > 0 AND position >= 0');
  });
  await k.raw("CREATE UNIQUE INDEX commercial_one_terminal_stage ON commercial_stages(organization_id,kind) WHERE kind in ('won','lost')");
  for (const org of await k('organizations').select('id')) await k('commercial_stages').insert(stages.map((name,position) => ({id:randomUUID(),organization_id:org.id,name,position,kind:position===6?'won':position===7?'lost':'open'})));
  await k.schema.alterTable('enrollments', t => t.unique(['organization_id','id','client_id'], 'enrollments_commercial_client_unique'));
  await k.schema.createTable('commercial_opportunities', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('created_by').notNullable(); t.uuid('owner_id').notNullable();
    t.uuid('stage_id').notNullable(); t.text('status').notNullable().defaultTo('open'); t.text('name').notNullable(); t.text('company_name').notNullable();
    t.text('contact_name').notNullable(); t.text('email'); t.text('phone'); t.text('source'); t.jsonb('diagnosis').notNullable().defaultTo('{}');
    t.uuid('program_id'); t.decimal('proposed_value',16,2); t.text('next_action'); t.timestamp('next_action_at',{useTz:true});
    t.text('lost_reason'); t.timestamp('closed_at',{useTz:true}); t.timestamp('won_at',{useTz:true});
    t.uuid('client_id'); t.uuid('enrollment_id').unique(); t.text('conversion_hash'); t.jsonb('conversion_result');
    t.integer('version').notNullable().defaultTo(1); t.timestamp('stage_entered_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
    t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now()); t.timestamp('updated_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
    t.unique(['organization_id','id']);
    for (const field of ['created_by','owner_id']) t.foreign(['organization_id',field]).references(['organization_id','id']).inTable('users');
    t.foreign(['organization_id','stage_id']).references(['organization_id','id']).inTable('commercial_stages');
    t.foreign(['organization_id','program_id']).references(['organization_id','id']).inTable('programs');
    t.foreign(['organization_id','client_id']).references(['organization_id','id']).inTable('clients');
    t.foreign(['organization_id','enrollment_id','client_id']).references(['organization_id','id','client_id']).inTable('enrollments');
    t.check("status in ('open','won','lost')"); t.check('version > 0'); t.check('proposed_value IS NULL OR proposed_value >= 0');
    t.check("status <> 'won' OR (client_id IS NOT NULL AND enrollment_id IS NOT NULL AND conversion_hash IS NOT NULL)");
    t.index(['organization_id','status','created_at']);
  });
  await k.schema.createTable('commercial_stage_events', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('opportunity_id').notNullable(); t.uuid('actor_id').notNullable();
    t.uuid('from_stage_id'); t.uuid('to_stage_id').notNullable(); t.text('from_stage_name'); t.text('to_stage_name').notNullable();
    t.text('reason'); t.timestamp('previous_entered_at',{useTz:true}); t.timestamp('occurred_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
    t.foreign(['organization_id','opportunity_id']).references(['organization_id','id']).inTable('commercial_opportunities');
    t.foreign(['organization_id','actor_id']).references(['organization_id','id']).inTable('users');
    for (const field of ['from_stage_id','to_stage_id']) t.foreign(['organization_id',field]).references(['organization_id','id']).inTable('commercial_stages');
    t.index(['organization_id','opportunity_id','occurred_at']);
  });
  await k.schema.createTable('mentorship_contracts', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('enrollment_id').notNullable().unique(); t.uuid('created_by').notNullable();
    t.decimal('amount',16,2).notNullable(); t.date('signed_at').notNullable(); t.text('notes').notNullable().defaultTo(''); t.integer('version').notNullable().defaultTo(1);
    t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now()); t.timestamp('updated_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
    t.unique(['organization_id','id']); t.unique(['organization_id','id','enrollment_id']);
    t.foreign(['organization_id','enrollment_id']).references(['organization_id','id']).inTable('enrollments');
    t.foreign(['organization_id','created_by']).references(['organization_id','id']).inTable('users'); t.check('amount >= 0 AND amount <= 1000000000000 AND version > 0');
  });
  await k.schema.createTable('mentorship_payments', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('enrollment_id').notNullable(); t.uuid('contract_id').notNullable(); t.uuid('created_by').notNullable();
    t.uuid('request_key').notNullable(); t.text('payload_hash').notNullable(); t.decimal('amount',16,2).notNullable(); t.date('received_at').notNullable(); t.date('due_at');
    t.text('method'); t.text('reference'); t.text('notes').notNullable().defaultTo(''); t.text('status').notNullable().defaultTo('received');
    t.integer('version').notNullable().defaultTo(1); t.uuid('reversed_by'); t.timestamp('reversed_at',{useTz:true}); t.text('reversal_reason');
    t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
    t.unique(['organization_id','id']); t.unique(['organization_id','request_key']);
    t.foreign(['organization_id','contract_id','enrollment_id']).references(['organization_id','id','enrollment_id']).inTable('mentorship_contracts');
    for (const field of ['created_by','reversed_by']) t.foreign(['organization_id',field]).references(['organization_id','id']).inTable('users');
    t.check("status in ('received','reversed')"); t.check('amount > 0 AND amount <= 1000000000000 AND version > 0');
    t.check("status <> 'reversed' OR (reversed_by IS NOT NULL AND reversal_reason IS NOT NULL AND reversed_at IS NOT NULL)");
    t.index(['organization_id','received_at','status']);
  });
  await k.raw("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elo_app') THEN GRANT SELECT,INSERT,UPDATE ON commercial_stages,commercial_opportunities,mentorship_contracts,mentorship_payments TO elo_app; GRANT SELECT,INSERT ON commercial_stage_events TO elo_app; REVOKE DELETE ON commercial_stages,commercial_opportunities,mentorship_contracts,mentorship_payments FROM elo_app; REVOKE UPDATE,DELETE ON commercial_stage_events FROM elo_app; END IF; END $$");
};
exports.down = async () => { throw new Error('Preserve o histórico comercial e financeiro. Restaure o backup em ambiente isolado.'); };
