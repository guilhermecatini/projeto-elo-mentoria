const {randomUUID, createHash} = require('node:crypto');
const areas = [
  {area: 'catalog', prompt: 'Como estão os anúncios, fotos, títulos e fichas técnicas dos produtos prioritários?'},
  {area: 'pricing', prompt: 'Os preços consideram custos de compra, tarifas, frete, devoluções e margem?'},
  {area: 'stock', prompt: 'O saldo de estoque é confiável e os itens prioritários estão disponíveis?'},
  {area: 'logistics', prompt: 'Como estão os prazos, Mercado Envios e Full, quando aplicável?'},
  {area: 'reputation', prompt: 'Quais reclamações, cancelamentos ou atrasos afetam a reputação?'},
  {area: 'advertising', prompt: 'Quais dados existem sobre campanhas, vendas e retorno publicitário?'},
  {area: 'operations', prompt: 'As rotinas e responsabilidades da equipe estão definidas?'},
  {area: 'priorities', prompt: 'Quais bloqueios devem ser tratados primeiro e quais dados ainda faltam?'},
];
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined)
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

exports.seed = async function (k) {
  if (process.env.NODE_ENV === 'production') throw new Error('Diagnósticos demonstrativos são proibidos em produção.');
  if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12) throw new Error('Defina DEMO_PASSWORD de desenvolvimento.');
  const admin = await k('users').where({email: 'admin@demo.local', role: 'admin'}).first();
  if (!admin) throw new Error('Execute primeiro o seed development.js.');
  let template = await k('diagnosis_templates').where({organization_id: admin.organization_id, name: 'Diagnóstico técnico · oito áreas'}).first();
  if (!template) {
    const id = randomUUID();
    await k('diagnosis_templates').insert({id, organization_id: admin.organization_id, created_by: admin.id,
      name: 'Diagnóstico técnico · oito áreas', description: 'Modelo adaptável. Avalie somente as áreas relevantes para o momento do cliente.',
      areas: JSON.stringify(areas), active: true, version: 1});
    template = await k('diagnosis_templates').where({id}).first();
  }
  for (const example of [
    {client: 'Casa Aurora', title: 'Diagnóstico técnico do ciclo atual', published: true},
    {client: 'Nativa Cosméticos', title: 'Preparação do diagnóstico técnico', published: false},
  ]) {
    const e = await k('enrollments as e').join('clients as c', 'c.id', 'e.client_id')
      .where({'e.organization_id': admin.organization_id, 'e.status': 'active', 'c.name': example.client}).select('e.*').first();
    if (!e || await k('diagnoses').where({organization_id: admin.organization_id, enrollment_id: e.id}).whereRaw("draft->>'title' = ?", [example.title]).first()) continue;
    const findings = areas.map(item => ({id: randomUUID(), area: item.area, prompt: item.prompt,
      assessment: 'not_assessed', observation: '', recommendation: '', priority: 'normal'}));
    if (example.published) {
      Object.assign(findings.find(item => item.area === 'catalog'), {assessment: 'attention',
        observation: 'As fotos dos kits prioritários usam padrões diferentes e algumas fichas técnicas estão incompletas.',
        recommendation: 'Padronizar as fotos e completar as fichas dos cinco produtos prioritários.'});
      Object.assign(findings.find(item => item.area === 'pricing'), {assessment: 'critical', priority: 'high',
        observation: 'Frete, embalagem e devoluções ainda não estão reunidos na ficha de custos dos kits.',
        recommendation: 'Consolidar os componentes de custo antes de revisar os preços dos kits.'});
      Object.assign(findings.find(item => item.area === 'stock'), {assessment: 'adequate',
        observation: 'A equipe registrou os saldos dos produtos selecionados para este ciclo.'});
      Object.assign(findings.find(item => item.area === 'operations'), {assessment: 'attention',
        observation: 'A conferência dos anúncios ainda depende de orientação verbal.',
        recommendation: 'Definir responsáveis e uma lista curta de conferência semanal.'});
    }
    const draft = {title: example.title,
      context: example.published ? 'Avaliação inicial focada nos kits prioritários. Áreas ainda sem evidência permanecem não avaliadas.'
        : 'Rascunho da equipe: reunir as informações do cliente antes de publicar qualquer avaliação.',
      maturity: example.published ? 'organizing' : 'not_informed', findings};
    const snapshot = {id: template.id, name: template.name, description: template.description, areas: template.areas,
      version: template.version, active: template.active, createdAt: template.created_at, updatedAt: template.updated_at};
    await k.transaction(async trx => {
      const id = randomUUID();
      await trx('diagnoses').insert({id, organization_id: admin.organization_id, enrollment_id: e.id, created_by: admin.id,
        template_id: template.id, template_snapshot: JSON.stringify(snapshot), draft: JSON.stringify(draft),
        draft_version: 1, published_version: example.published ? 1 : 0, status: example.published ? 'published' : 'draft'});
      if (example.published) await trx('diagnosis_revisions').insert({id: randomUUID(), organization_id: admin.organization_id,
        diagnosis_id: id, enrollment_id: e.id, version: 1, source_draft_version: 1, snapshot: JSON.stringify(draft),
        snapshot_hash: createHash('sha256').update(canonical(draft)).digest('hex'), published_by: admin.id});
      await trx('audit_events').insert({id: randomUUID(), organization_id: admin.organization_id, actor_id: admin.id,
        entity_type: 'diagnosis', entity_id: id, action: 'Diagnóstico demonstrativo cadastrado',
        details: JSON.stringify({demonstration: true, published: example.published})});
    });
  }
  console.log('Diagnósticos demonstrativos verificados; versões existentes preservadas.');
};
