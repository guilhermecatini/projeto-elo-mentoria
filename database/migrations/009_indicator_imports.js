exports.up = async function (k) {
  await k.schema.createTable('indicator_imports', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('enrollment_id').notNullable();
    t.uuid('created_by').notNullable(); t.text('created_by_name').notNullable(); t.text('client_name').notNullable();
    t.uuid('request_key').notNullable(); t.text('payload_hash').notNullable(); t.text('csv_hash').notNullable();
    t.text('preview_hash').notNullable(); t.integer('report_version').notNullable().defaultTo(1);
    t.text('file_name'); t.text('duplicate_policy').notNullable().defaultTo('skip_existing'); t.jsonb('report').notNullable();
    t.timestamp('created_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    t.foreign(['organization_id', 'enrollment_id']).references(['organization_id', 'id']).inTable('enrollments');
    t.foreign(['organization_id', 'created_by']).references(['organization_id', 'id']).inTable('users');
    t.unique(['organization_id', 'id']); t.unique(['organization_id', 'request_key']);
    t.check('report_version = 1'); t.check("duplicate_policy = 'skip_existing'");
    t.check("jsonb_typeof(report) = 'object'");
    for (const field of ['payload_hash', 'csv_hash', 'preview_hash']) t.check(`${field} ~ '^[a-f0-9]{64}$'`);
    t.index(['organization_id', 'enrollment_id', 'created_at']);
  });
  await k.raw("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elo_app') THEN GRANT SELECT,INSERT ON indicator_imports TO elo_app; REVOKE UPDATE,DELETE ON indicator_imports FROM elo_app; END IF; END $$");
};
exports.down = async function () { throw new Error('Preserve os relatórios de importação. Restaure o backup em ambiente isolado.'); };
