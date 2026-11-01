exports.up=async k=>{
 await k.schema.alterTable('marketplace_accounts',t=>{t.unique(['organization_id','id'],'marketplace_accounts_org_id_unique');});
 await k.schema.alterTable('integration_connections',t=>{
  t.uuid('marketplace_account_id');
  t.foreign(['organization_id','marketplace_account_id'],'integration_connection_marketplace_fk').references(['organization_id','id']).inTable('marketplace_accounts');
  t.dropUnique(['organization_id','provider']);
  t.check("marketplace_account_id IS NULL OR provider = 'mercadolivre'",[],'integration_marketplace_provider_check');
 });
 await k.raw('CREATE UNIQUE INDEX integration_provider_preferences_unique ON integration_connections(organization_id,provider) WHERE marketplace_account_id IS NULL');
 await k.raw('CREATE UNIQUE INDEX integration_marketplace_account_unique ON integration_connections(organization_id,provider,marketplace_account_id) WHERE marketplace_account_id IS NOT NULL');
};
exports.down=async()=>{throw new Error('Preserve a segregação das autorizações por conta de marketplace.');};
