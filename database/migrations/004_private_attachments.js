exports.up = async function (k) {
  await k.schema.alterTable('messages', t => {
    t.unique(['organization_id', 'id', 'ticket_id']);
  });
  await k.schema.alterTable('tickets', t => {
    t.unique(['organization_id', 'id', 'enrollment_id']);
  });
  await k.schema.alterTable('tasks', t => {
    t.unique(['organization_id', 'id', 'enrollment_id']);
  });
  await k.schema.createTable('attachments', t => {
    t.uuid('id').primary();
    t.uuid('organization_id').notNullable();
    t.uuid('enrollment_id').notNullable();
    t.uuid('ticket_id');
    t.uuid('message_id');
    t.uuid('task_id');
    t.uuid('created_by').notNullable();
    t.uuid('request_key').notNullable();
    t.uuid('storage_key').notNullable().unique();
    t.text('original_name').notNullable();
    t.text('mime_type').notNullable();
    t.bigInteger('size_bytes').notNullable();
    t.text('sha256').notNullable();
    t.text('visibility').notNullable();
    t.text('status').notNullable().defaultTo('pending');
    t.timestamp('created_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    t.timestamp('ready_at', {useTz: true});
    t.timestamp('failed_at', {useTz: true});
    t.foreign(['organization_id', 'enrollment_id']).references(['organization_id', 'id']).inTable('enrollments');
    t.foreign(['organization_id', 'ticket_id', 'enrollment_id']).references(['organization_id', 'id', 'enrollment_id']).inTable('tickets');
    t.foreign(['organization_id', 'message_id', 'ticket_id']).references(['organization_id', 'id', 'ticket_id']).inTable('messages');
    t.foreign(['organization_id', 'task_id', 'enrollment_id']).references(['organization_id', 'id', 'enrollment_id']).inTable('tasks');
    t.foreign(['organization_id', 'created_by']).references(['organization_id', 'id']).inTable('users');
    t.unique(['organization_id', 'created_by', 'request_key']);
    t.check("visibility in ('public','internal')");
    t.check("status in ('pending','ready','failed')");
    t.check('size_bytes > 0 AND size_bytes <= 10485760');
    t.check("sha256 ~ '^[a-f0-9]{64}$'");
    t.check('(task_id IS NOT NULL AND ticket_id IS NULL AND message_id IS NULL) OR (task_id IS NULL AND ticket_id IS NOT NULL AND message_id IS NOT NULL)');
    t.index(['organization_id', 'status']);
    t.index(['ticket_id', 'status', 'created_at']);
    t.index(['task_id', 'status', 'created_at']);
    t.index(['status', 'created_at']);
  });
  await k.raw("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elo_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON attachments TO elo_app; END IF; END $$");
};
exports.down = async function () {
  throw new Error('Metadados e arquivos privados devem ser preservados; restaure backup em destino isolado.');
};
