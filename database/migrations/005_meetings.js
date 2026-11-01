exports.up = async function (k) {
  await k.schema.createTable('meetings', t => {
    t.uuid('id').primary();
    t.uuid('organization_id').notNullable();
    t.uuid('enrollment_id').notNullable();
    t.uuid('created_by').notNullable();
    t.uuid('host_id').notNullable();
    t.text('host_name').notNullable();
    t.text('title').notNullable();
    t.timestamp('starts_at', {useTz: true}).notNullable();
    t.timestamp('ends_at', {useTz: true}).notNullable();
    t.text('status').notNullable().defaultTo('scheduled');
    t.text('location');
    t.text('agenda');
    t.text('outcome_reason');
    t.uuid('outcome_by');
    t.timestamp('outcome_at', {useTz: true});
    t.timestamp('held_at', {useTz: true});
    t.timestamp('created_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    t.timestamp('updated_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    t.foreign(['organization_id', 'enrollment_id']).references(['organization_id', 'id']).inTable('enrollments');
    for (const field of ['created_by', 'host_id', 'outcome_by']) {
      t.foreign(['organization_id', field]).references(['organization_id', 'id']).inTable('users');
    }
    t.unique(['organization_id', 'id']);
    t.unique(['organization_id', 'id', 'enrollment_id']);
    t.check("status in ('scheduled','held','no_show','cancelled')");
    t.check("ends_at > starts_at AND ends_at <= starts_at + interval '8 hours'");
    t.check("status <> 'held' OR held_at IS NOT NULL");
    t.index(['organization_id', 'enrollment_id', 'status', 'starts_at']);
  });
  await k.schema.createTable('meeting_participants', t => {
    t.uuid('organization_id').notNullable();
    t.uuid('meeting_id').notNullable();
    t.uuid('user_id').notNullable();
    t.text('name_snapshot').notNullable();
    t.text('role_snapshot').notNullable();
    t.text('attendance').notNullable().defaultTo('pending');
    t.text('note');
    t.timestamp('added_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    t.timestamp('removed_at', {useTz: true});
    t.timestamp('updated_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    t.primary(['meeting_id', 'user_id']);
    t.foreign(['organization_id', 'meeting_id']).references(['organization_id', 'id']).inTable('meetings');
    t.foreign(['organization_id', 'user_id']).references(['organization_id', 'id']).inTable('users');
    t.check("role_snapshot in ('admin','mentor','mentee')");
    t.check("attendance in ('pending','present','absent','excused')");
  });
  await k.schema.createTable('meeting_minutes', t => {
    t.uuid('meeting_id').primary();
    t.uuid('organization_id').notNullable();
    t.text('summary').notNullable().defaultTo('');
    t.text('next_steps').notNullable().defaultTo('');
    t.integer('draft_version').notNullable().defaultTo(1);
    t.uuid('updated_by').notNullable();
    t.timestamp('updated_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    t.foreign(['organization_id', 'meeting_id']).references(['organization_id', 'id']).inTable('meetings');
    t.foreign(['organization_id', 'updated_by']).references(['organization_id', 'id']).inTable('users');
  });
  await k.schema.createTable('meeting_decisions', t => {
    t.uuid('id').primary();
    t.uuid('organization_id').notNullable();
    t.uuid('meeting_id').notNullable();
    t.uuid('enrollment_id').notNullable();
    t.uuid('created_by').notNullable();
    t.text('draft_body').notNullable();
    t.text('published_body');
    t.integer('sort_order').notNullable().defaultTo(0);
    t.uuid('task_id');
    t.timestamp('removed_at', {useTz: true});
    t.timestamp('created_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    t.timestamp('updated_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    t.unique(['organization_id', 'id']);
    t.unique(['organization_id', 'id', 'enrollment_id']);
    t.unique('task_id');
    t.foreign(['organization_id', 'meeting_id', 'enrollment_id']).references(['organization_id', 'id', 'enrollment_id']).inTable('meetings');
    t.foreign(['organization_id', 'task_id', 'enrollment_id']).references(['organization_id', 'id', 'enrollment_id']).inTable('tasks');
    t.foreign(['organization_id', 'created_by']).references(['organization_id', 'id']).inTable('users');
    t.index(['meeting_id', 'removed_at', 'sort_order']);
  });
  await k.schema.createTable('meeting_minutes_revisions', t => {
    t.uuid('id').primary();
    t.uuid('organization_id').notNullable();
    t.uuid('meeting_id').notNullable();
    t.integer('version').notNullable();
    t.text('summary').notNullable();
    t.text('next_steps').notNullable();
    t.jsonb('decisions').notNullable();
    t.uuid('published_by').notNullable();
    t.timestamp('published_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    t.unique(['meeting_id', 'version']);
    t.foreign(['organization_id', 'meeting_id']).references(['organization_id', 'id']).inTable('meetings');
    t.foreign(['organization_id', 'published_by']).references(['organization_id', 'id']).inTable('users');
  });
  await k.schema.alterTable('tasks', t => {
    t.uuid('created_from_decision_id').unique();
    t.foreign(['organization_id', 'created_from_decision_id', 'enrollment_id']).references(['organization_id', 'id', 'enrollment_id']).inTable('meeting_decisions');
  });
  await k.schema.alterTable('notifications', t => {
    t.uuid('meeting_id');
    t.foreign(['organization_id', 'meeting_id']).references(['organization_id', 'id']).inTable('meetings');
  });
  await k.raw("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elo_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON meetings,meeting_participants,meeting_minutes,meeting_decisions,meeting_minutes_revisions TO elo_app; END IF; END $$");
};
exports.down = async function () {
  throw new Error('Reuniões, atas e decisões devem ser preservadas. Restaure o backup em ambiente isolado.');
};
