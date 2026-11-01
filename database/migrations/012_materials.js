exports.up = async function(k) {
  await k.schema.alterTable('documents', t => {
    t.uuid('created_by'); t.jsonb('draft'); t.integer('published_version').notNullable().defaultTo(0);
    t.text('status').notNullable().defaultTo('draft'); t.timestamp('created_at', {useTz:true}).notNullable().defaultTo(k.fn.now());
    t.unique(['organization_id','id']);
    t.foreign(['organization_id','created_by']).references(['organization_id','id']).inTable('users');
  });
  await k.raw("ALTER TABLE documents ADD CONSTRAINT documents_material_status_check CHECK (status in ('draft','published','archived'))");
  await k.raw('ALTER TABLE documents ADD CONSTRAINT documents_material_published_version_check CHECK (published_version >= 0)');
  await k.schema.createTable('material_revisions', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('document_id').notNullable();
    t.integer('version').notNullable(); t.jsonb('snapshot').notNullable(); t.text('source_hash').notNullable();
    t.uuid('published_by').notNullable(); t.timestamp('published_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
    t.unique(['organization_id','document_id','version']);
    t.foreign(['organization_id','document_id']).references(['organization_id','id']).inTable('documents');
    t.foreign(['organization_id','published_by']).references(['organization_id','id']).inTable('users');
  });
  await k.schema.createTable('material_files', t => {
    t.uuid('id').primary(); t.uuid('organization_id').notNullable(); t.uuid('document_id').notNullable();
    t.uuid('created_by').notNullable(); t.uuid('storage_key').notNullable().unique();
    t.text('original_name').notNullable(); t.text('mime_type').notNullable(); t.bigInteger('size_bytes').notNullable();
    t.text('sha256').notNullable(); t.text('status').notNullable().defaultTo('pending');
    t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now()); t.timestamp('ready_at',{useTz:true});
    t.unique(['organization_id','id']); t.foreign(['organization_id','document_id']).references(['organization_id','id']).inTable('documents');
    t.foreign(['organization_id','created_by']).references(['organization_id','id']).inTable('users');
    t.check("status in ('pending','ready','failed')"); t.check('size_bytes > 0 AND size_bytes <= 10485760');
    t.check("sha256 ~ '^[a-f0-9]{64}$'"); t.index(['organization_id','document_id','status']);
  });
  await k.schema.alterTable('document_chunks', t => {
    t.uuid('organization_id'); t.uuid('enrollment_id'); t.text('visibility'); t.integer('source_version');
    t.integer('position'); t.text('source_hash'); t.timestamp('created_at',{useTz:true}).defaultTo(k.fn.now());
    t.unique(['document_id','source_version','position']);
    t.foreign(['organization_id','document_id','source_version']).references(['organization_id','document_id','version']).inTable('material_revisions');
    t.foreign(['organization_id','enrollment_id']).references(['organization_id','id']).inTable('enrollments');
    t.index(['organization_id','document_id','source_version']);
  });
  await k.raw("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elo_app') THEN GRANT SELECT,INSERT,UPDATE ON documents,material_files TO elo_app; GRANT SELECT,INSERT ON material_revisions,document_chunks TO elo_app; REVOKE UPDATE,DELETE ON material_revisions,document_chunks FROM elo_app; END IF; END $$");
};
exports.down = async function() {throw new Error('Preserve materiais e revisões; restaure um backup em ambiente isolado.');};
