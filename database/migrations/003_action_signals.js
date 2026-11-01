exports.up = async function (k) {
  await k.schema.createTable('action_signal_states', t => {
    t.uuid('organization_id').notNullable().references('organizations.id');
    t.text('signal_key').notNullable();
    t.uuid('enrollment_id').notNullable();
    t.integer('episode').notNullable().defaultTo(1);
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('first_seen_at', {useTz: true}).notNullable();
    t.timestamp('cleared_at', {useTz: true});
    t.primary(['organization_id', 'signal_key']);
    t.foreign(['organization_id', 'enrollment_id']).references(['organization_id', 'id']).inTable('enrollments');
    t.index(['organization_id', 'active']);
  });
  await k.raw("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elo_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON action_signal_states TO elo_app; END IF; END $$");
};
exports.down = async function () {
  throw new Error('O histórico de alertas deve ser preservado; restaure em destino isolado.');
};
