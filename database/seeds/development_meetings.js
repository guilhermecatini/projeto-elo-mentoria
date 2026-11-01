const {randomUUID} = require('node:crypto');

exports.seed = async function (k) {
  if (process.env.NODE_ENV === 'production') throw new Error('Reuniões demonstrativas são proibidas em produção.');
  if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12) throw new Error('Defina DEMO_PASSWORD de desenvolvimento.');
  const admin = await k('users').where({email: 'admin@demo.local', role: 'admin'}).first();
  if (!admin) throw new Error('Execute primeiro o seed development.js.');
  const at = days => { const value = new Date(Date.now() + days * 86400e3); value.setUTCHours(13, 0, 0, 0); return value; };
  const examples = [
    {client: 'Casa Aurora', title: 'Próxima revisão dos kits prioritários', days: 1, status: 'scheduled'},
    {client: 'Casa Aurora', title: 'Revisão de margem e catálogo', days: -3, status: 'held', published: true},
    {client: 'Nativa Cosméticos', title: 'Conferência das primeiras melhorias', days: -2, status: 'scheduled'},
    {client: 'Nativa Cosméticos', title: 'Revisão do ciclo de anúncios', days: -1, status: 'held', published: false},
  ];
  for (const example of examples) {
    const e = await k('enrollments as e').join('clients as c', 'c.id', 'e.client_id')
      .where({'e.organization_id': admin.organization_id, 'e.status': 'active', 'c.name': example.client})
      .select('e.*').first();
    if (!e || await k('meetings').where({enrollment_id: e.id, title: example.title}).first()) continue;
    const mentor = await k('assignments as a').join('users as u', 'u.id', 'a.mentor_id')
      .where({'a.enrollment_id': e.id, 'a.kind': 'primary', 'u.active': true}).whereNull('a.ends_at')
      .select('u.id', 'u.name', 'u.role').first();
    const member = await k('client_members as m').join('users as u', 'u.id', 'm.user_id')
      .where({'m.client_id': e.client_id, 'u.role': 'mentee', 'u.active': true}).select('u.id', 'u.name', 'u.role').first();
    if (!mentor || !member) continue;
    const starts = at(example.days), ends = new Date(starts.getTime() + 3600e3);
    if (starts < new Date(e.starts_at) || ends > new Date(e.ends_at)) continue;
    await k.transaction(async trx => {
      const id = randomUUID();
      await trx('meetings').insert({id, organization_id: admin.organization_id, enrollment_id: e.id, created_by: admin.id,
        host_id: mentor.id, host_name: mentor.name, title: example.title, starts_at: starts, ends_at: ends,
        status: example.status, agenda: 'Revisar prioridades, registrar os resultados e combinar o próximo passo.',
        location: 'Encontro de acompanhamento — confirmar o canal com o mentor',
        ...(example.status === 'held' ? {held_at: starts, outcome_at: ends, outcome_by: mentor.id} : {}),
      });
      await trx('meeting_participants').insert([mentor, member].map(person => ({organization_id: admin.organization_id,
        meeting_id: id, user_id: person.id, name_snapshot: person.name, role_snapshot: person.role,
        attendance: example.status === 'held' ? 'present' : 'pending'})));
      if (example.status === 'held') {
        const decisionId = randomUUID();
        const summary = example.published
          ? 'Revisamos os kits prioritários, os componentes de custo e as dúvidas que precisam de evidências adicionais.'
          : 'Rascunho da equipe: consolidar a revisão dos primeiros anúncios antes de compartilhar a ata.';
        const nextSteps = 'Reunir os custos por produto e validar a ficha de margem no próximo acompanhamento.';
        const decision = 'Documentar os custos de compra, embalagem e frete dos cinco produtos prioritários.';
        await trx('meeting_minutes').insert({meeting_id: id, organization_id: admin.organization_id, summary,
          next_steps: nextSteps, draft_version: 1, updated_by: mentor.id, updated_at: ends});
        await trx('meeting_decisions').insert({id: decisionId, organization_id: admin.organization_id,
          meeting_id: id, enrollment_id: e.id, created_by: mentor.id, draft_body: decision,
          published_body: example.published ? decision : null, sort_order: 0});
        if (example.published) {
          await trx('meeting_minutes_revisions').insert({id: randomUUID(), organization_id: admin.organization_id,
            meeting_id: id, version: 1, summary, next_steps: nextSteps, decisions: JSON.stringify([{id: decisionId, body: decision}]),
            published_by: mentor.id, published_at: ends});
          await trx('enrollments').where({id: e.id}).update({last_contact_at: trx.raw('GREATEST(last_contact_at, ?::timestamptz)', [starts])});
        }
      }
      await trx('audit_events').insert({id: randomUUID(), organization_id: admin.organization_id, actor_id: admin.id,
        entity_type: 'meeting', entity_id: id, action: 'Reunião demonstrativa cadastrada',
        details: JSON.stringify({demonstration: true, status: example.status})});
    });
  }
  console.log('Reuniões demonstrativas verificadas; registros existentes preservados.');
};
