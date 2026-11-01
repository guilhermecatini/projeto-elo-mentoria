const {randomUUID} = require('node:crypto');

exports.seed = async function (k) {
  if (process.env.NODE_ENV === 'production') throw new Error('Planos demonstrativos são proibidos em produção.');
  if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12) {
    throw new Error('Defina DEMO_PASSWORD de desenvolvimento antes de carregar a demonstração.');
  }
  const admin = await k('users').where({email: 'admin@demo.local', role: 'admin'}).first();
  if (!admin) throw new Error('Execute primeiro o seed development.js.');
  const days = n => new Date(Date.now() + n * 86400e3);
  const examples = [
    {
      client: 'Casa Aurora', title: 'Fortalecer a margem dos kits',
      objective: 'Revisar o custo dos produtos mais vendidos e transformar os ajustes em uma rotina semanal.',
      baseline: 'Custos de frete e embalagem ainda não estão reunidos na ficha de margem.',
      target: 'Dez kits revisados e critério de margem documentado para a próxima reunião.',
      age: -12,
    },
    {
      client: 'Nativa Cosméticos', title: 'Preparar o próximo ciclo de anúncios',
      objective: 'Organizar prioridades de catálogo e validar as primeiras melhorias com evidências.',
      baseline: 'A equipe selecionou cinco anúncios prioritários para revisão.',
      target: 'Cinco fichas revisadas e um roteiro de acompanhamento compartilhado.',
      age: -2,
    },
  ];
  for (const example of examples) {
    const e = await k('enrollments as e').join('clients as c', 'c.id', 'e.client_id')
      .where({'e.organization_id': admin.organization_id, 'c.name': example.client})
      .select('e.*').first();
    if (!e || await k('action_plans').where({enrollment_id: e.id, title: example.title}).first()) continue;
    const mentor = await k('assignments').where({enrollment_id: e.id, kind: 'primary'}).whereNull('ends_at').first();
    const member = await k('client_members as m').join('users as u', 'u.id', 'm.user_id')
      .where({'m.client_id': e.client_id, 'u.role': 'mentee', 'u.active': true}).select('u.id').first();
    if (!mentor || !member) continue;
    await k.transaction(async trx => {
      const planId = randomUUID();
      const created = days(example.age);
      await trx('action_plans').insert({
        id: planId, organization_id: admin.organization_id, enrollment_id: e.id, created_by: admin.id,
        title: example.title, objective: example.objective, baseline: example.baseline, target: example.target,
        priority: 'high', status: 'active', stale_days: 7, last_progress_at: created,
        created_at: created, updated_at: created,
      });
      const rows = [
        {
          title: 'Revisar a planilha de custos com a equipe', assignee_id: mentor.mentor_id,
          description: 'Conferir os componentes de custo antes de recomendar novos preços.',
          completion_criteria: 'Registrar a revisão dos custos e os ajustes recomendados para cada kit.',
          status: 'in_progress', due_at: days(-1), priority: 'high',
        },
        {
          title: 'Entregar a ficha dos produtos prioritários', assignee_id: member.id,
          description: 'Reunir os dados de catálogo e os custos conhecidos dos produtos selecionados.',
          completion_criteria: 'Informar pelo menos cinco produtos, custos e dúvidas para revisão do mentor.',
          status: 'submitted', due_at: days(-2), priority: 'normal',
          evidence_text: 'Reuni os cinco produtos prioritários. Embalagem, custo de compra e frete estão descritos na ficha; falta validar o custo de devolução.',
        },
        {
          title: 'Confirmar disponibilidade com o estoque', assignee_id: member.id,
          description: 'Verificar a disponibilidade dos itens antes de atualizar os anúncios.',
          completion_criteria: 'Registrar o saldo conferido e as divergências encontradas.',
          status: 'blocked', due_at: days(2), priority: 'normal',
          block_reason: 'Aguardando a conferência física do estoque para confirmar o saldo.',
        },
        {
          title: 'Selecionar os produtos prioritários', assignee_id: member.id,
          description: 'Escolher os itens que serão acompanhados neste primeiro ciclo.',
          completion_criteria: 'Lista de cinco produtos validada com o mentor.',
          status: 'done', due_at: days(-3), priority: 'normal',
          evidence_text: 'Cinco produtos selecionados com base no volume de pedidos e nas dúvidas de margem.',
          review_note: 'A seleção cobre as prioridades discutidas no acompanhamento.', completed_at: created,
        },
      ];
      for (const row of rows) {
        const id = randomUUID();
        await trx('tasks').insert({
          id, organization_id: admin.organization_id, enrollment_id: e.id, plan_id: planId,
          created_by: admin.id, created_at: created, updated_at: created, ...row,
        });
        await trx('audit_events').insert({
          id: randomUUID(), organization_id: admin.organization_id, actor_id: admin.id,
          entity_type: 'task', entity_id: id, action: 'Tarefa demonstrativa cadastrada',
          details: JSON.stringify({status: row.status, demonstration: true}), created_at: created,
        });
      }
      await trx('audit_events').insert({
        id: randomUUID(), organization_id: admin.organization_id, actor_id: admin.id,
        entity_type: 'action_plan', entity_id: planId, action: 'Plano demonstrativo cadastrado',
        details: JSON.stringify({demonstration: true}), created_at: created,
      });
    });
  }
  console.log('Planos demonstrativos verificados; registros existentes preservados.');
};
