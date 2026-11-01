const {randomUUID, createHash} = require('node:crypto');
const rawKeys = ['revenue', 'orders', 'visits', 'adSpend', 'attributedRevenue', 'totalCosts', 'claims', 'cancellations', 'lateShipments',
  'skuCount', 'outOfStockSkus', 'activeListings', 'completeListings'];
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined)
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function month(offset) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit'}).formatToParts(new Date());
  const year = Number(parts.find(part => part.type === 'year').value), current = Number(parts.find(part => part.type === 'month').value);
  const value = new Date(Date.UTC(year, current - 1 + offset, 1)); return value.toISOString().slice(0, 7);
}
exports.seed = async function (k) {
  if (process.env.NODE_ENV === 'production') throw new Error('Indicadores demonstrativos são proibidos em produção.');
  if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12) throw new Error('Defina DEMO_PASSWORD de desenvolvimento.');
  const admin = await k('users').where({email: 'admin@demo.local', role: 'admin'}).first();
  if (!admin) throw new Error('Execute primeiro o seed development.js.');
  const examples = [
    {client: 'Casa Aurora', offset: -3, published: true, values: {revenue: '42000.00', orders: 210, visits: 7000,
      adSpend: '3500.00', attributedRevenue: '14000.00', totalCosts: '31500.00', claims: 3, cancellations: 2,
      lateShipments: 4, skuCount: 80, outOfStockSkus: 7, activeListings: 90, completeListings: 70}},
    {client: 'Casa Aurora', offset: -2, published: true, values: {revenue: '48000.00', orders: 240, visits: 7500,
      adSpend: '3800.00', attributedRevenue: '17100.00', totalCosts: '35000.00', claims: 2, cancellations: 1,
      lateShipments: 2, skuCount: 82, outOfStockSkus: 4, activeListings: 94, completeListings: 82}},
    {client: 'Casa Aurora', offset: 0, published: true, values: {revenue: '23000.00', orders: 115, visits: 3800,
      adSpend: '1800.00', attributedRevenue: '8000.00', claims: 1, cancellations: 0}},
    {client: 'Nativa Cosméticos', offset: 0, published: false, values: {revenue: '12500.00', orders: 90}},
  ];
  for (const example of examples) {
    const e = await k('enrollments as e').join('clients as c', 'c.id', 'e.client_id')
      .where({'e.organization_id': admin.organization_id, 'e.status': 'active', 'c.name': example.client}).select('e.*').first();
    const period = month(example.offset);
    if (!e || await k('indicators').where({enrollment_id: e.id, period}).first()) continue;
    const data = {periodStatus: example.offset < 0 ? 'closed' : 'partial', sourceLabel: 'Consolidação mensal da loja · demonstração',
      notes: example.offset < 0 ? 'Dados demonstrativos para acompanhar a evolução da loja.' : 'Apuração parcial; o mês ainda está em andamento.',
      basisConfirmed: true, adsAttributionConfirmed: true, costsComplete: example.offset < 0,
      values: {...Object.fromEntries(rawKeys.map(key => [key, null])), ...example.values}};
    await k.transaction(async trx => {
      const id = randomUUID(); await trx('indicators').insert({id, organization_id: admin.organization_id, enrollment_id: e.id,
        created_by: admin.id, period, source_type: 'manual', draft: JSON.stringify(data),
        published_version: example.published ? 1 : 0, status: example.published ? 'published' : 'draft'});
      if (example.published) await trx('indicator_revisions').insert({id: randomUUID(), organization_id: admin.organization_id,
        indicator_id: id, enrollment_id: e.id, period, version: 1, source_draft_version: 1, snapshot: JSON.stringify(data),
        snapshot_hash: createHash('sha256').update(canonical(data)).digest('hex'), published_by: admin.id});
      await trx('audit_events').insert({id: randomUUID(), organization_id: admin.organization_id, actor_id: admin.id,
        entity_type: 'indicator', entity_id: id, action: 'Indicadores demonstrativos cadastrados',
        details: JSON.stringify({demonstration: true, period, published: example.published})});
    });
  }
  const e = await k('enrollments as e').join('clients as c', 'c.id', 'e.client_id')
    .where({'e.organization_id': admin.organization_id, 'e.status': 'active', 'c.name': 'Casa Aurora'}).select('e.*').first();
  if (e) {
    const plan = await k('action_plans').where({organization_id: admin.organization_id, enrollment_id: e.id, status: 'active'}).orderBy('created_at').first();
    for (const goal of [{period: month(-2), metric_key: 'revenue', target: '46000.00', direction: 'at_least'},
      {period: month(0), metric_key: 'revenue', target: '52000.00', direction: 'at_least'},
      {period: month(0), metric_key: 'cancellations', target: '0', direction: 'at_most'}]) {
      if (await k('indicator_goals').where({enrollment_id: e.id, period: goal.period, metric_key: goal.metric_key}).first()) continue;
      await k('indicator_goals').insert({id: randomUUID(), organization_id: admin.organization_id, enrollment_id: e.id,
        created_by: admin.id, ...goal, plan_id: plan?.id || null, notes: 'Meta demonstrativa para orientar a revisão mensal.'});
    }
  }
  console.log('Indicadores e metas demonstrativos verificados; dados existentes preservados.');
};
