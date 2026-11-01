exports.up = async function(k) {
  await k.schema.alterTable('enrollments', t => { t.integer('journey_version').notNullable().defaultTo(1); t.timestamp('reviewed_at', {useTz:true}); t.timestamp('closed_at', {useTz:true}); t.text('closure_reason'); t.check('journey_version > 0', [], 'enrollments_journey_version_check'); t.foreign(['organization_id','previous_enrollment_id']).references(['organization_id','id']).inTable('enrollments'); });
  await k.schema.alterTable('users', t => { t.integer('capacity_version').notNullable().defaultTo(1); t.check('capacity_version > 0', [], 'users_capacity_version_check'); });
  await k.schema.createTable('journey_checklists', t => {
    t.uuid('enrollment_id').primary(); t.uuid('organization_id').notNullable();
    t.text('deliverables').notNullable().defaultTo(''); t.text('initial_context').notNullable().defaultTo(''); t.text('commercial_notes').notNullable().defaultTo('');
    for (const item of ['contacts','policy','access']) { t.timestamp(`${item}_confirmed_at`, {useTz:true}); t.uuid(`${item}_confirmed_by`); t.foreign(['organization_id',`${item}_confirmed_by`]).references(['organization_id','id']).inTable('users'); }
    t.timestamp('updated_at', {useTz:true}).notNullable().defaultTo(k.fn.now());
    t.foreign(['organization_id','enrollment_id']).references(['organization_id','id']).inTable('enrollments');
  });
  await k.schema.createTable('journey_reviews', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('enrollment_id').notNullable(); t.uuid('created_by').notNullable();
    t.text('summary').notNullable(); t.timestamp('next_review_at', {useTz:true}); t.timestamp('created_at', {useTz:true}).notNullable().defaultTo(k.fn.now());
    t.foreign(['organization_id','enrollment_id']).references(['organization_id','id']).inTable('enrollments'); t.foreign(['organization_id','created_by']).references(['organization_id','id']).inTable('users'); t.index(['organization_id','enrollment_id','created_at']);
  });
  await k.schema.createTable('journey_renewals', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('source_enrollment_id').notNullable(); t.uuid('new_enrollment_id').notNullable(); t.uuid('created_by').notNullable(); t.uuid('request_key').notNullable();
    t.text('payload_hash').notNullable(); t.text('reason').notNullable(); t.timestamp('created_at', {useTz:true}).notNullable().defaultTo(k.fn.now());
    t.unique(['organization_id','source_enrollment_id']); t.unique('new_enrollment_id'); t.unique(['organization_id','request_key']);
    for (const field of ['source_enrollment_id','new_enrollment_id']) t.foreign(['organization_id',field]).references(['organization_id','id']).inTable('enrollments');
    t.foreign(['organization_id','created_by']).references(['organization_id','id']).inTable('users');
  });
  await k.schema.createTable('satisfaction_responses', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('enrollment_id').notNullable(); t.uuid('respondent_id').notNullable(); t.text('context_type').notNullable(); t.uuid('context_id').notNullable(); t.uuid('ticket_id');
    t.integer('score').notNullable(); t.text('comment').notNullable().defaultTo(''); t.boolean('shared_with_mentor').notNullable().defaultTo(false); t.integer('version').notNullable().defaultTo(1);
    t.timestamp('created_at', {useTz:true}).notNullable().defaultTo(k.fn.now()); t.timestamp('updated_at', {useTz:true}).notNullable().defaultTo(k.fn.now());
    t.unique(['organization_id','context_type','context_id','respondent_id']); t.unique(['organization_id','id']);
    t.foreign(['organization_id','enrollment_id']).references(['organization_id','id']).inTable('enrollments'); t.foreign(['organization_id','respondent_id']).references(['organization_id','id']).inTable('users'); t.foreign(['organization_id','ticket_id']).references(['organization_id','id']).inTable('tickets');
    t.check("score BETWEEN 1 AND 5 AND version > 0"); t.check("(context_type='ticket' AND ticket_id IS NOT NULL AND context_id=ticket_id) OR (context_type='cycle' AND context_id=enrollment_id AND ticket_id IS NULL)"); t.index(['organization_id','enrollment_id','created_at']);
  });
  await k.schema.createTable('satisfaction_revisions', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('response_id').notNullable(); t.integer('version').notNullable(); t.integer('score').notNullable(); t.text('comment').notNullable(); t.boolean('shared_with_mentor').notNullable(); t.text('reason').notNullable(); t.uuid('created_by').notNullable(); t.timestamp('created_at', {useTz:true}).notNullable().defaultTo(k.fn.now());
    t.unique(['response_id','version']); t.foreign(['organization_id','response_id']).references(['organization_id','id']).inTable('satisfaction_responses'); t.foreign(['organization_id','created_by']).references(['organization_id','id']).inTable('users'); t.check('score BETWEEN 1 AND 5 AND version > 0');
  });
  await k.schema.createTable('mentor_absences', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('mentor_id').notNullable(); t.uuid('requested_by').notNullable(); t.uuid('decided_by'); t.timestamp('starts_at', {useTz:true}).notNullable(); t.timestamp('ends_at', {useTz:true}).notNullable(); t.text('reason').notNullable(); t.text('decision_reason'); t.text('status').notNullable().defaultTo('requested'); t.integer('version').notNullable().defaultTo(1); t.timestamp('created_at', {useTz:true}).notNullable().defaultTo(k.fn.now()); t.timestamp('updated_at', {useTz:true}).notNullable().defaultTo(k.fn.now());
    t.foreign(['organization_id','mentor_id']).references(['organization_id','id']).inTable('users'); for (const field of ['requested_by','decided_by']) t.foreign(['organization_id',field]).references(['organization_id','id']).inTable('users'); t.check("status in ('requested','approved','rejected','cancelled')"); t.check('ends_at > starts_at AND version > 0'); t.index(['organization_id','mentor_id','starts_at','ends_at']);
  });
  await k.schema.alterTable('interventions', t => { t.integer('version').notNullable().defaultTo(1); t.text('status').notNullable().defaultTo('open'); t.text('resolution'); t.timestamp('closed_at',{useTz:true}); t.check("status in ('open','closed') AND version > 0", [], 'interventions_journey_state_check'); });
  await k.raw("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elo_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON journey_checklists,journey_reviews,journey_renewals,satisfaction_responses,satisfaction_revisions,mentor_absences TO elo_app; END IF; END $$");
};
exports.down = async function() { throw new Error('A jornada contém histórico de contratos e avaliações. Restaure um backup em ambiente isolado.'); };
