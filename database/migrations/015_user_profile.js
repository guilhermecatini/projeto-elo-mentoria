exports.up = async k => {
  await k.schema.alterTable('users', t => {
    t.text('phone');
    t.integer('profile_version').notNullable().defaultTo(1);
    t.integer('avatar_version').notNullable().defaultTo(0);
    t.boolean('has_avatar').notNullable().defaultTo(false);
    t.timestamp('profile_updated_at', {useTz: true});
    t.timestamp('password_changed_at', {useTz: true});
  });
  await k.schema.createTable('user_avatars', t => {
    t.uuid('user_id').primary();
    t.uuid('organization_id').notNullable();
    t.binary('body').notNullable();
    t.text('mime_type').notNullable().defaultTo('image/webp');
    t.timestamp('updated_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    t.foreign(['organization_id', 'user_id']).references(['organization_id', 'id']).inTable('users');
    t.check("mime_type = 'image/webp' AND octet_length(body) BETWEEN 1 AND 262144");
  });
  await k.raw("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elo_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON user_avatars TO elo_app; END IF; END $$");
};
exports.down = async () => { throw new Error('Preserve os dados de perfil e as fotos existentes.'); };
