import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Inject,
  Injectable, Module, NotFoundException, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {Knex} from 'knex';
import {z} from 'zod';
import {User} from './auth';
import {db} from './db';
import {enrollment, scopedEnrollments} from './access';

type Connection = Knex | Knex.Transaction;
const uuid = z.string().uuid();
const title = z.string().trim().min(1).max(200);
const content = z.string().trim().min(1).max(10000);
const optionalContent = z.string().trim().max(10000);
const priority = z.enum(['low', 'normal', 'high']);
const planStatus = z.enum(['draft', 'active', 'completed', 'archived']);
const taskStatus = z.enum(['todo', 'in_progress', 'blocked', 'submitted', 'done', 'cancelled']);
const instant = z.iso.datetime({offset: true});
const evidenceUrl = z.url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Use um endereço HTTPS sem credenciais.');

const planInput = z.object({
  enrollmentId: uuid, title, objective: content,
  baseline: optionalContent.optional(), target: optionalContent.optional(),
  priority: priority.default('normal'), staleDays: z.number().int().min(1).max(365).default(7),
}).strict();
const planPatch = z.object({
  title: title.optional(), objective: content.optional(), baseline: optionalContent.optional(),
  target: optionalContent.optional(), priority: priority.optional(),
  staleDays: z.number().int().min(1).max(365).optional(), status: planStatus.optional(),
  reason: content.optional(),
}).strict().refine(value => Object.keys(value).some(key => key !== 'reason'), 'Informe uma alteração.');
const taskInput = z.object({
  title, description: optionalContent.default(''), assigneeId: uuid, dueAt: instant,
  completionCriteria: content, priority: priority.default('normal'),
}).strict();
const taskPatch = z.object({
  title: title.optional(), description: optionalContent.optional(), assigneeId: uuid.optional(),
  dueAt: instant.optional(), completionCriteria: content.optional(), priority: priority.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Informe uma alteração.');
const transitionInput = z.object({
  status: taskStatus, evidenceText: content.optional(), evidenceUrl: evidenceUrl.optional(),
  blockReason: content.optional(), reviewNote: content.optional(), reason: content.optional(),
}).strict();

function staff(user: User) {
  if (user.role === 'mentee') throw new ForbiddenException('A equipe de mentoria gerencia os planos e as tarefas.');
}

async function record(connection: Connection, user: User, type: string, id: string, action: string, details: unknown) {
  const eventId = randomUUID();
  await connection('audit_events').insert({
    id: eventId, organization_id: user.organizationId, actor_id: user.id,
    entity_type: type, entity_id: id, action, details: JSON.stringify(details),
  });
  return eventId;
}

/** Every writer locks in enrollment -> plan -> task order. Assignment changes use the same enrollment lock. */
async function lockEnrollment(user: User, id: string, trx: Knex.Transaction) {
  await enrollment(user, id, trx);
  await trx('enrollments').where({id, organization_id: user.organizationId}).forUpdate().first();
  return enrollment(user, id, trx);
}

function planDto(row: any, tasks: any[]) {
  const matching = tasks.filter(task => task.plan_id === row.id);
  const doneCount = matching.filter(task => task.status === 'done').length;
  const cancelledCount = matching.filter(task => task.status === 'cancelled').length;
  const validCount = matching.length - cancelledCount;
  return {
    id: row.id, enrollmentId: row.enrollment_id, enrollmentStatus: row.enrollmentStatus, clientId: row.clientId, clientName: row.clientName,
    title: row.title, objective: row.objective, baseline: row.baseline, target: row.target,
    priority: row.priority, status: row.status, staleDays: row.stale_days,
    lastProgressAt: row.last_progress_at, createdAt: row.created_at, updatedAt: row.updated_at,
    taskCount: matching.length, doneCount, cancelledCount,
    progressPercent: validCount ? Math.round(doneCount * 100 / validCount) : null,
  };
}

@Injectable()
export class PlansService {
  private scopedPlans(user: User, connection: Connection = db) {
    return connection('action_plans as p')
      .join('enrollments as e', 'e.id', 'p.enrollment_id')
      .join('clients as c', 'c.id', 'e.client_id')
      .where('p.organization_id', user.organizationId)
      .whereIn('p.enrollment_id', scopedEnrollments(user, connection).select('e.id'));
  }

  private async planRow(user: User, id: string, connection: Connection = db) {
    const row = await this.scopedPlans(user, connection).where('p.id', id)
      .select('p.*', 'c.id as clientId', 'c.name as clientName').first();
    if (!row) throw new NotFoundException('Plano não encontrado.');
    return row;
  }

  private async lockPlan(user: User, id: string, trx: Knex.Transaction) {
    const current = await this.planRow(user, id, trx);
    await lockEnrollment(user, current.enrollment_id, trx);
    const row = await trx('action_plans').where({id, organization_id: user.organizationId}).forUpdate().first();
    if (!row) throw new NotFoundException('Plano não encontrado.');
    return row;
  }

  private async taskRow(user: User, id: string, connection: Connection = db) {
    const row = await connection('tasks').where({id, organization_id: user.organizationId}).first();
    if (!row) throw new NotFoundException('Tarefa não encontrada.');
    await enrollment(user, row.enrollment_id, connection);
    return row;
  }

  private async lockTask(user: User, id: string, trx: Knex.Transaction) {
    const current = await this.taskRow(user, id, trx);
    const plan = await this.lockPlan(user, current.plan_id, trx);
    const task = await trx('tasks').where({id, organization_id: user.organizationId}).forUpdate().first();
    if (!task) throw new NotFoundException('Tarefa não encontrada.');
    return {task, plan};
  }

  private ensureOpenPlan(plan: any) {
    if (['completed', 'archived'].includes(plan.status)) {
      throw new BadRequestException('Reative o plano antes de alterar suas tarefas.');
    }
  }

  async assignees(user: User, enrollmentId: string, connection: Connection = db) {
    const e = await enrollment(user, enrollmentId, connection);
    const now = new Date();
    return connection('users as u')
      .where({'u.organization_id': user.organizationId, 'u.active': true})
      .where(function () {
        this.where(function () {
          this.where('u.role', 'mentor').whereExists(connection('assignments as a').select(connection.raw('1'))
            .whereRaw('a.mentor_id=u.id').where('a.enrollment_id', e.id)
            .where('a.starts_at', '<=', now).where(function () {
              this.whereNull('a.ends_at').orWhere('a.ends_at', '>', now);
            }));
        }).orWhere(function () {
          this.where('u.role', 'mentee').whereExists(connection('client_members as m').select(connection.raw('1'))
            .whereRaw('m.user_id=u.id').where('m.client_id', e.client_id));
        });
      }).select('u.id', 'u.name', 'u.role').orderBy('u.name');
  }

  private async ensureAssignee(user: User, enrollmentId: string, assigneeId: string, connection: Connection) {
    const found = (await this.assignees(user, enrollmentId, connection)).find(person => person.id === assigneeId);
    if (!found) throw new BadRequestException('Escolha um mentor ou mentorado com acesso vigente a esta contratação.');
    return found;
  }

  async plans(user: User, filters: {enrollmentId?: string; status?: string} = {}) {
    let query = this.scopedPlans(user).select('p.*', 'e.status as enrollmentStatus', 'c.id as clientId', 'c.name as clientName').orderBy('p.created_at', 'desc');
    if (filters.enrollmentId) query = query.where('p.enrollment_id', filters.enrollmentId);
    if (filters.status) query = query.where('p.status', filters.status);
    const rows = await query;
    const tasks = rows.length ? await db('tasks').where('organization_id', user.organizationId)
      .whereIn('plan_id', rows.map(row => row.id)).select('plan_id', 'status') : [];
    return rows.map(row => planDto(row, tasks));
  }

  async plan(user: User, id: string) {
    const row = await this.planRow(user, id);
    const found = (await this.plans(user)).find(plan => plan.id === id)!;
    const diagnostics = await db('diagnosis_plan_links as l')
      .join('diagnosis_revisions as r', 'r.id', 'l.revision_id')
      .where({'l.organization_id':user.organizationId,'l.enrollment_id':row.enrollment_id,'l.plan_id':id,
        'r.organization_id':user.organizationId,'r.enrollment_id':row.enrollment_id})
      .select('l.diagnosis_id as diagnosisId','r.version','l.finding_id as findingId',
        'l.finding_area as findingArea','l.linked_at as linkedAt',{title:db.raw("r.snapshot->>'title'")})
      .orderBy('l.linked_at','desc');
    const indicatorGoals = await db('indicator_goals').where({organization_id:user.organizationId,enrollment_id:row.enrollment_id,plan_id:id})
      .select('id','metric_key as metricKey','period','target','direction','status').orderBy('period','desc');
    return {...found, diagnostics, indicatorGoals, tasks: await this.tasks(user, {planId: id}), history: await this.history(user, 'action_plan', id)};
  }

  async tasks(user: User, filters: {enrollmentId?: string; planId?: string; status?: string} = {}) {
    let query = db('tasks as t')
      .join('action_plans as p', 'p.id', 't.plan_id')
      .join('enrollments as e', 'e.id', 't.enrollment_id')
      .join('clients as c', 'c.id', 'e.client_id')
      .join('users as u', 'u.id', 't.assignee_id')
      .where('t.organization_id', user.organizationId)
      .whereIn('t.enrollment_id', scopedEnrollments(user).select('e.id'))
      .select('t.*', 'e.status as enrollmentStatus', 'p.title as planTitle', 'p.status as planStatus', 'c.id as clientId', 'c.name as clientName',
        'u.name as assigneeName', 'u.role as assigneeRole')
      .orderBy('t.due_at').orderBy('t.created_at');
    if (filters.enrollmentId) query = query.where('t.enrollment_id', filters.enrollmentId);
    if (filters.planId) query = query.where('t.plan_id', filters.planId);
    if (filters.status) query = query.where('t.status', filters.status);
    const rows = await query;
    const currentAssignees = new Map<string, Set<string>>();
    for (const id of new Set<string>(rows.map(row => row.enrollment_id))) {
      currentAssignees.set(id, new Set((await this.assignees(user, id)).map(person => person.id)));
    }
    return rows.map(row => ({
      id: row.id, planId: row.plan_id, enrollmentId: row.enrollment_id, enrollmentStatus: row.enrollmentStatus,
      planTitle: row.planTitle, planStatus: row.planStatus, clientId: row.clientId, clientName: row.clientName,
      title: row.title, description: row.description, priority: row.priority,
      assigneeId: row.assignee_id, assigneeName: row.assigneeName, assigneeRole: row.assigneeRole,
      assigneeHasAccess: currentAssignees.get(row.enrollment_id)?.has(row.assignee_id) ?? false,
      dueAt: row.due_at, status: row.status, completionCriteria: row.completion_criteria,
      evidenceText: row.evidence_text, evidenceUrl: row.evidence_url,
      blockReason: row.block_reason, reviewNote: row.review_note,
      completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }

  async task(user: User, id: string) {
    const row = await this.taskRow(user, id);
    const found = (await this.tasks(user, {planId: row.plan_id})).find(task => task.id === id)!;
    const origin = row.created_from_decision_id ? await db('meeting_decisions as d')
      .join('meetings as m', 'm.id', 'd.meeting_id')
      .where({'d.id': row.created_from_decision_id, 'd.organization_id': user.organizationId,
        'd.enrollment_id': row.enrollment_id, 'm.organization_id': user.organizationId, 'm.enrollment_id': row.enrollment_id})
      .select('m.id as originMeetingId', 'm.title as originMeetingTitle', 'd.id as originDecisionId').first() : null;
    return {...found, ...(origin || {}), history: await this.history(user, 'task', id)};
  }

  private async history(user: User, type: string, id: string) {
    return db('audit_events as a').leftJoin('users as u', 'u.id', 'a.actor_id')
      .where({'a.organization_id': user.organizationId, 'a.entity_type': type, 'a.entity_id': id})
      .select('a.id', 'a.action', 'a.created_at as createdAt', 'a.actor_id as actorId', 'u.name as actorName', 'a.details')
      .orderBy('a.created_at', 'desc').limit(200);
  }

  async createPlan(user: User, input: z.infer<typeof planInput>) {
    staff(user);
    return db.transaction(async trx => {
      const e = await lockEnrollment(user, input.enrollmentId, trx);
      if (e.status !== 'active') throw new BadRequestException('A contratação precisa estar ativa para receber um plano.');
      const id = randomUUID(), now = new Date();
      await trx('action_plans').insert({
        id, organization_id: user.organizationId, enrollment_id: e.id, created_by: user.id,
        title: input.title, objective: input.objective, baseline: input.baseline || null,
        target: input.target || null, priority: input.priority, stale_days: input.staleDays,
        status: 'active', last_progress_at: now, created_at: now, updated_at: now,
      });
      await record(trx, user, 'action_plan', id, 'Plano de ação criado', {title: input.title, objective: input.objective});
      return {id};
    });
  }

  async updatePlan(user: User, id: string, input: z.infer<typeof planPatch>) {
    staff(user);
    return db.transaction(async trx => {
      const plan = await this.lockPlan(user, id, trx);
      const reopening = ['completed', 'archived'].includes(plan.status) && input.status === 'active';
      if (['completed', 'archived'].includes(plan.status) && !reopening && input.status !== 'archived') {
        throw new BadRequestException('Reative o plano com uma justificativa antes de editá-lo.');
      }
      if ((input.status === 'archived' || reopening) && !input.reason) {
        throw new BadRequestException('Registre o motivo do arquivamento ou da reativação.');
      }
      if (input.status === 'completed') {
        const tasks = await trx('tasks').where({plan_id: id, organization_id: user.organizationId}).select('status');
        if (!tasks.length || tasks.some(task => !['done', 'cancelled'].includes(task.status))) {
          throw new BadRequestException('Conclua ou cancele todas as tarefas antes de concluir o plano.');
        }
      }
      const changes: Record<string, unknown> = {updated_at: new Date()};
      for (const key of ['title', 'objective', 'baseline', 'target', 'priority', 'status'] as const) {
        if (input[key] !== undefined) changes[key] = input[key] || null;
      }
      if (input.staleDays !== undefined) changes.stale_days = input.staleDays;
      await trx('action_plans').where({id}).update(changes);
      await record(trx, user, 'action_plan', id, reopening ? 'Plano reativado' : input.status === 'archived' ? 'Plano arquivado' : input.status === 'completed' ? 'Plano concluído' : 'Plano atualizado', {
        before: {title: plan.title, objective: plan.objective, status: plan.status, priority: plan.priority, baseline: plan.baseline, target: plan.target, staleDays: plan.stale_days},
        changes: input,
      });
      return {ok: true};
    });
  }

  async createTask(user: User, planId: string, input: z.infer<typeof taskInput>) {
    staff(user);
    return db.transaction(async trx => {
      const plan = await this.lockPlan(user, planId, trx);
      this.ensureOpenPlan(plan);
      await this.ensureAssignee(user, plan.enrollment_id, input.assigneeId, trx);
      const id = randomUUID(), now = new Date();
      await trx('tasks').insert({
        id, organization_id: user.organizationId, enrollment_id: plan.enrollment_id, plan_id: planId,
        created_by: user.id, assignee_id: input.assigneeId, title: input.title,
        description: input.description, completion_criteria: input.completionCriteria,
        priority: input.priority, due_at: input.dueAt, status: 'todo', created_at: now, updated_at: now,
      });
      await trx('action_plans').where({id: planId}).update({updated_at: now});
      await record(trx, user, 'task', id, 'Tarefa criada', input);
      await record(trx, user, 'action_plan', planId, 'Tarefa adicionada ao plano', {taskId: id, title: input.title});
      return {id};
    });
  }

  async updateTask(user: User, id: string, input: z.infer<typeof taskPatch>) {
    staff(user);
    return db.transaction(async trx => {
      const {task, plan} = await this.lockTask(user, id, trx);
      this.ensureOpenPlan(plan);
      if (['done', 'cancelled'].includes(task.status)) throw new BadRequestException('Reabra a tarefa antes de editar.');
      if (task.status === 'submitted') throw new BadRequestException('Devolva a entrega para ajustes antes de editar a tarefa.');
      if (input.assigneeId) await this.ensureAssignee(user, task.enrollment_id, input.assigneeId, trx);
      const changes: Record<string, unknown> = {updated_at: new Date()};
      const columns = {title: 'title', description: 'description', assigneeId: 'assignee_id', dueAt: 'due_at', completionCriteria: 'completion_criteria', priority: 'priority'} as const;
      for (const key of Object.keys(columns) as (keyof typeof columns)[]) {
        if (input[key] !== undefined) changes[columns[key]] = input[key];
      }
      await trx('tasks').where({id}).update(changes);
      await trx('action_plans').where({id: plan.id}).update({updated_at: new Date()});
      await record(trx, user, 'task', id, 'Tarefa atualizada', {
        before: {title: task.title, description: task.description, assigneeId: task.assignee_id,
          dueAt: task.due_at, completionCriteria: task.completion_criteria, priority: task.priority},
        changes: input,
      });
      return {ok: true};
    });
  }

  async transition(user: User, id: string, input: z.infer<typeof transitionInput>) {
    return db.transaction(async trx => {
      const {task, plan} = await this.lockTask(user, id, trx);
      this.ensureOpenPlan(plan);
      if (plan.status !== 'active') throw new BadRequestException('Ative o plano antes de executar suas tarefas.');
      const own = task.assignee_id === user.id;
      if (user.role === 'mentee' && (!own || !['todo', 'in_progress', 'blocked', 'submitted'].includes(input.status))) {
        throw new ForbiddenException('Você pode atualizar apenas a execução das suas tarefas.');
      }
      if (task.status === input.status) throw new BadRequestException('A tarefa já está nessa situação.');
      const terminal = ['done', 'cancelled'].includes(task.status);
      if (terminal && (user.role === 'mentee' || input.status !== 'in_progress' || !input.reason)) {
        throw new BadRequestException('Somente a equipe pode reabrir uma tarefa, com justificativa.');
      }
      if (user.role === 'mentee' && task.status === 'submitted') {
        throw new BadRequestException('A entrega está em revisão. Aguarde a devolutiva do mentor.');
      }
      if (input.status === 'blocked' && !input.blockReason) throw new BadRequestException('Descreva o impedimento.');
      if (input.status === 'cancelled' && !input.reason) throw new BadRequestException('Registre o motivo do cancelamento.');
      if (input.status === 'submitted' && !input.evidenceText) throw new BadRequestException('Descreva a evidência da entrega.');
      if (task.status === 'submitted' && input.status === 'in_progress' && !input.reviewNote) {
        throw new BadRequestException('Explique quais ajustes são necessários antes de devolver a tarefa.');
      }
      if (task.status === 'submitted' && !['done', 'in_progress', 'cancelled'].includes(input.status)) {
        throw new BadRequestException('A entrega deve ser aprovada, devolvida para ajustes ou cancelada com motivo.');
      }
      const assignee = await trx('users').where({id: task.assignee_id, organization_id: user.organizationId}).first();
      const evidence = input.evidenceText || task.evidence_text;
      if (input.status === 'done') {
        if (!evidence?.trim()) throw new BadRequestException('A conclusão precisa de uma evidência textual.');
        if (assignee.role === 'mentee' && task.status !== 'submitted') {
          throw new BadRequestException('A tarefa do mentorado precisa ser entregue antes da aprovação.');
        }
        if (assignee.role === 'mentor' && !own && user.role !== 'admin') {
          throw new ForbiddenException('O mentor responsável conclui sua tarefa; a administração pode intervir.');
        }
        if ((assignee.role === 'mentee' || !own) && !input.reviewNote) {
          throw new BadRequestException('Registre a revisão da evidência antes de aprovar.');
        }
      }
      if (input.evidenceUrl && !evidence?.trim()) throw new BadRequestException('Inclua uma descrição para a evidência.');
      const now = new Date();
      const changes: Record<string, unknown> = {
        status: input.status, updated_at: now,
        completed_at: input.status === 'done' ? now : null,
        block_reason: input.status === 'blocked' ? input.blockReason : null,
      };
      if (input.evidenceText) changes.evidence_text = input.evidenceText;
      if (input.evidenceUrl) changes.evidence_url = input.evidenceUrl;
      if (input.reviewNote) changes.review_note = input.reviewNote;
      if (input.status === 'submitted') changes.review_note = null;
      await trx('tasks').where({id}).update(changes);
      await trx('action_plans').where({id: plan.id}).update({
        updated_at: now,
        ...(['submitted', 'done'].includes(input.status) ? {last_progress_at: now} : {}),
      });
      const action = terminal ? 'Tarefa reaberta' : input.status === 'submitted' ? 'Evidência entregue' : input.status === 'done' ? 'Tarefa concluída' : input.status === 'blocked' ? 'Tarefa bloqueada' : input.status === 'cancelled' ? 'Tarefa cancelada' : task.status === 'submitted' ? 'Entrega devolvida para ajustes' : 'Execução da tarefa atualizada';
      const eventId = await record(trx, user, 'task', id, action, {from: task.status, ...input});
      if (input.status === 'done' || task.status === 'submitted' && input.status === 'in_progress') {
        await trx('notifications').insert({
          id: randomUUID(), organization_id: user.organizationId, user_id: task.assignee_id,
          enrollment_id: task.enrollment_id, plan_id: task.plan_id, task_id: id,
          dedupe_key: `task-review-${eventId}`, title: input.status === 'done' ? 'Tarefa concluída' : 'Sua entrega precisa de ajustes',
          body: task.title + (input.reviewNote ? ` · ${input.reviewNote}` : ''),
        }).onConflict(['user_id', 'dedupe_key']).ignore();
      }
      return {ok: true};
    });
  }
}

@Controller('api')
class PlansController {
  constructor(@Inject(PlansService) private readonly plans: PlansService) {}

  @Get('plans') list(@Req() req: any, @Query() query: unknown) {
    return this.plans.plans(req.user, z.object({enrollmentId: uuid.optional(), status: planStatus.optional()}).parse(query));
  }
  @Get('plans/:id') plan(@Req() req: any, @Param('id') id: string) {
    return this.plans.plan(req.user, uuid.parse(id));
  }
  @Post('plans') createPlan(@Req() req: any, @Body() body: unknown) {
    return this.plans.createPlan(req.user, planInput.parse(body));
  }
  @Patch('plans/:id') updatePlan(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.plans.updatePlan(req.user, uuid.parse(id), planPatch.parse(body));
  }
  @Get('tasks') tasks(@Req() req: any, @Query() query: unknown) {
    return this.plans.tasks(req.user, z.object({enrollmentId: uuid.optional(), planId: uuid.optional(), status: taskStatus.optional()}).parse(query));
  }
  @Get('tasks/:id') task(@Req() req: any, @Param('id') id: string) {
    return this.plans.task(req.user, uuid.parse(id));
  }
  @Post('plans/:id/tasks') createTask(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.plans.createTask(req.user, uuid.parse(id), taskInput.parse(body));
  }
  @Patch('tasks/:id') updateTask(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.plans.updateTask(req.user, uuid.parse(id), taskPatch.parse(body));
  }
  @Post('tasks/:id/transition') transition(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.plans.transition(req.user, uuid.parse(id), transitionInput.parse(body));
  }
  @Get('enrollments/:id/task-assignees') assignees(@Req() req: any, @Param('id') id: string) {
    return this.plans.assignees(req.user, uuid.parse(id));
  }
}

@Module({controllers: [PlansController], providers: [PlansService], exports: [PlansService]})
export class PlansModule {}
