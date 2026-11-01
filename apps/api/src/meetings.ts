import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  Inject, Injectable, Module, NotFoundException, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import type {Knex} from 'knex';
import {z} from 'zod';
import {db} from './db';
import {User} from './auth';
import {enrollment, scopedEnrollments} from './access';
import {PlansModule, PlansService} from './plans';

type Connection = Knex | Knex.Transaction;
const uuid = z.string().uuid();
const title = z.string().trim().min(1).max(200);
const content = z.string().trim().min(1).max(10000);
const optionalContent = z.string().trim().max(10000);
const instant = z.iso.datetime({offset: true});
const statuses = z.enum(['scheduled', 'held', 'no_show', 'cancelled']);
const attendance = z.enum(['pending', 'present', 'absent', 'excused']);
const location = z.string().trim().max(2000).refine(value => {
  if (!/^[a-z][a-z0-9+.-]*:|^\/\/|^www\./i.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}, 'Links de reunião devem usar HTTPS, sem credenciais.');
const participants = z.array(uuid).max(100).refine(ids => new Set(ids).size === ids.length, 'Participantes duplicados.');
const createInput = z.object({
  enrollmentId: uuid, title, startsAt: instant, endsAt: instant, hostId: uuid,
  participantIds: participants, location: location.optional(), agenda: optionalContent.optional(),
}).strict();
const patchInput = z.object({
  title: title.optional(), startsAt: instant.optional(), endsAt: instant.optional(), hostId: uuid.optional(),
  participantIds: participants.optional(), location: location.optional(), agenda: optionalContent.optional(),
  reason: content.optional(),
}).strict().refine(value => Object.keys(value).some(key => key !== 'reason'), 'Informe uma alteração.');
const minutesInput = z.object({
  summary: optionalContent, nextSteps: optionalContent,
  decisions: z.array(z.object({id: uuid.optional(), body: content}).strict()).max(100),
}).strict().refine(value => {
  const ids = value.decisions.flatMap(decision => decision.id ? [decision.id] : []);
  return new Set(ids).size === ids.length;
}, 'Uma decisão não pode aparecer duas vezes.');
const conversionInput = z.object({
  planId: uuid, assigneeId: uuid, dueAt: instant, completionCriteria: content,
  priority: z.enum(['low', 'normal', 'high']).default('normal'), title: title.optional(),
}).strict();

function staff(user: User) {
  if (user.role === 'mentee') throw new ForbiddenException('A equipe de mentoria gerencia as reuniões e atas.');
}
function active(e: any) {
  if (e.status !== 'active') throw new BadRequestException('A contratação precisa estar ativa para alterar a reunião.');
}
async function record(connection: Connection, user: User, id: string, action: string, details: unknown) {
  const eventId = randomUUID();
  await connection('audit_events').insert({id: eventId, organization_id: user.organizationId,
    actor_id: user.id, entity_type: 'meeting', entity_id: id, action, details: JSON.stringify(details)});
  return eventId;
}

export function validateMeetingSchedule(startsAt: string | Date, endsAt: string | Date, e: any) {
  const start = new Date(startsAt), end = new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 8 * 3600e3) {
    throw new BadRequestException('A reunião deve durar mais de zero e no máximo oito horas.');
  }
  if (start < new Date(e.starts_at) || end > new Date(e.ends_at)) {
    throw new BadRequestException('O horário da reunião deve estar dentro da vigência da contratação.');
  }
}
export function validateMeetingOutcome(currentStatus: string, nextStatus: string, startsAt: Date | string, endsAt: Date | string, reason: string | undefined, now = new Date()) {
  if (currentStatus !== 'scheduled') throw new BadRequestException('O resultado já foi registrado. O histórico da reunião será preservado.');
  if (nextStatus === 'held' && new Date(startsAt) > now) throw new BadRequestException('A reunião ainda não começou.');
  if (nextStatus === 'no_show' && new Date(endsAt) > now) throw new BadRequestException('Aguarde o horário final para registrar uma ausência.');
  if (['cancelled', 'no_show'].includes(nextStatus) && !reason?.trim()) throw new BadRequestException('Registre o motivo do cancelamento ou da ausência.');
}

@Injectable()
export class MeetingsService {
  constructor(@Inject(PlansService) private readonly plans: PlansService) {}

  private scoped(user: User, connection: Connection = db) {
    return connection('meetings as m').join('enrollments as e', 'e.id', 'm.enrollment_id')
      .join('clients as c', 'c.id', 'e.client_id')
      .where('m.organization_id', user.organizationId)
      .whereIn('m.enrollment_id', scopedEnrollments(user, connection).select('e.id'));
  }
  private async meetingRow(user: User, id: string, connection: Connection = db) {
    const row = await this.scoped(user, connection).where('m.id', id).select('m.*').first();
    if (!row) throw new NotFoundException('Reunião não encontrada.');
    return row;
  }
  private async lockEnrollment(user: User, id: string, trx: Knex.Transaction) {
    await enrollment(user, id, trx);
    await trx('enrollments').where({id, organization_id: user.organizationId}).forUpdate().first();
    const e = await enrollment(user, id, trx);
    active(e);
    return e;
  }
  private async lockMeeting(user: User, id: string, trx: Knex.Transaction) {
    const row = await this.meetingRow(user, id, trx);
    const e = await this.lockEnrollment(user, row.enrollment_id, trx);
    const meeting = await trx('meetings').where({id, organization_id: user.organizationId}).forUpdate().first();
    if (!meeting) throw new NotFoundException('Reunião não encontrada.');
    return {meeting, e};
  }

  async eligibleParticipants(user: User, enrollmentId: string, connection: Connection = db) {
    staff(user);
    await enrollment(user, enrollmentId, connection);
    const assigned = await this.plans.assignees(user, enrollmentId, connection);
    const admins = await connection('users').where({organization_id: user.organizationId, role: 'admin', active: true}).select('id', 'name', 'role');
    return [...admins, ...assigned].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  private async roster(user: User, enrollmentId: string, hostId: string, ids: string[], connection: Connection) {
    const allowed = await this.eligibleParticipants(user, enrollmentId, connection);
    const host = allowed.find(person => person.id === hostId && ['admin', 'mentor'].includes(person.role));
    if (!host) throw new BadRequestException('Escolha um administrador ou mentor com acesso vigente para conduzir a reunião.');
    const selected = [...new Set([...ids, hostId])];
    const people = selected.map(id => allowed.find(person => person.id === id));
    if (people.some(person => !person)) throw new BadRequestException('Todos os participantes devem estar ativos e autorizados nesta contratação.');
    if (!people.some(person => person?.role === 'mentee')) throw new BadRequestException('Inclua pelo menos um mentorado autorizado para esta reunião.');
    return {host, people: people as {id: string; name: string; role: string}[]};
  }

  private async notifyParticipants(trx: Knex.Transaction, user: User, meeting: any, eventId: string, title: string) {
    const allowed = await this.eligibleParticipants(user, meeting.enrollment_id, trx);
    const roster = await trx('meeting_participants').where({meeting_id: meeting.id}).whereNull('removed_at');
    for (const participant of roster.filter(person => allowed.some(candidate => candidate.id === person.user_id))) {
      await trx('notifications').insert({id: randomUUID(), organization_id: user.organizationId,
        user_id: participant.user_id, enrollment_id: meeting.enrollment_id, meeting_id: meeting.id,
        dedupe_key: `meeting:${eventId}`, title, body: meeting.title,
      }).onConflict(['user_id', 'dedupe_key']).ignore();
    }
  }

  private async hostAccess(rows: any[], connection: Connection = db) {
    const ids = [...new Set(rows.map(row => row.host_id))];
    const users = await connection('users').whereIn('id', ids).where({active: true}).select('id', 'role', 'organization_id');
    const now = new Date();
    const assignments = await connection('assignments').whereIn('enrollment_id', rows.map(row => row.enrollment_id))
      .where('starts_at', '<=', now).where(function () { this.whereNull('ends_at').orWhere('ends_at', '>', now); });
    return (row: any) => {
      const user = users.find(user => user.id === row.host_id && user.organization_id === row.organization_id);
      return !!user && (user.role === 'admin' || user.role === 'mentor' && assignments.some(a => a.enrollment_id === row.enrollment_id && a.mentor_id === user.id));
    };
  }

  async list(user: User, filters: {enrollmentId?: string; status?: string; from?: string; to?: string} = {}) {
    let query = this.scoped(user).select('m.*', 'e.status as enrollmentStatus', 'c.id as clientId', 'c.name as clientName').orderBy('m.starts_at', 'desc');
    if (filters.enrollmentId) query = query.where('m.enrollment_id', filters.enrollmentId);
    if (filters.status) query = query.where('m.status', filters.status);
    if (filters.from) query = query.where('m.starts_at', '>=', filters.from);
    if (filters.to) query = query.where('m.starts_at', '<=', filters.to);
    const rows = await query;
    if (!rows.length) return [];
    const ids = rows.map(row => row.id);
    const roster = await db('meeting_participants').whereIn('meeting_id', ids).whereNull('removed_at').select('meeting_id', 'attendance');
    const revisions = await db('meeting_minutes_revisions').whereIn('meeting_id', ids).select('meeting_id');
    const allowed = await this.hostAccess(rows);
    return rows.map(row => {
      const participants = roster.filter(person => person.meeting_id === row.id);
      return {
        id: row.id, enrollmentId: row.enrollment_id, enrollmentStatus: row.enrollmentStatus,
        clientId: row.clientId, clientName: row.clientName, title: row.title,
        startsAt: row.starts_at, endsAt: row.ends_at, hostId: row.host_id, hostName: row.host_name,
        hostHasAccess: allowed(row), status: row.status, location: row.location, agenda: row.agenda,
        heldAt: row.held_at, hasPublishedMinutes: revisions.some(revision => revision.meeting_id === row.id),
        attendanceSummary: {
          total: participants.length,
          pending: participants.filter(person => person.attendance === 'pending').length,
          present: participants.filter(person => person.attendance === 'present').length,
          absent: participants.filter(person => person.attendance === 'absent').length,
          excused: participants.filter(person => person.attendance === 'excused').length,
        },
        createdAt: row.created_at, updatedAt: row.updated_at,
      };
    });
  }

  async detail(user: User, id: string) {
    const row = await this.meetingRow(user, id);
    const meeting = (await this.list(user, {enrollmentId: row.enrollment_id})).find(item => item.id === id)!;
    const participants = await db('meeting_participants').where({meeting_id: id, organization_id: user.organizationId}).whereNull('removed_at').orderBy('name_snapshot');
    const decisions = await db('meeting_decisions').where({meeting_id: id, organization_id: user.organizationId}).orderBy('sort_order').orderBy('created_at');
    const published = await db('meeting_minutes_revisions').where({meeting_id: id, organization_id: user.organizationId}).orderBy('version', 'desc').first();
    const result: Record<string, unknown> = {
      ...meeting,
      participants: participants.map(person => ({userId: person.user_id, name: person.name_snapshot, role: person.role_snapshot,
        status: person.attendance, ...(user.role !== 'mentee' ? {note: person.note} : {})})),
      publishedMinutes: published ? {
        summary: published.summary, nextSteps: published.next_steps, version: published.version, publishedAt: published.published_at,
        decisions: published.decisions.map((decision: any) => ({...decision, taskId: decisions.find(row => row.id === decision.id)?.task_id || null})),
      } : null,
    };
    if (user.role !== 'mentee') {
      const draft = await db('meeting_minutes').where({meeting_id: id, organization_id: user.organizationId}).first();
      result.draftMinutes = draft ? {summary: draft.summary, nextSteps: draft.next_steps,
        decisions: decisions.filter(decision => !decision.removed_at).map(decision => ({id: decision.id, body: decision.draft_body, taskId: decision.task_id})),
        draftVersion: draft.draft_version, updatedAt: draft.updated_at} : null;
      result.history = await db('audit_events as a').leftJoin('users as u', 'u.id', 'a.actor_id')
        .where({'a.organization_id': user.organizationId, 'a.entity_type': 'meeting', 'a.entity_id': id})
        .select('a.id', 'a.action', 'a.details', 'a.created_at as createdAt', 'u.name as actorName')
        .orderBy('a.created_at', 'desc').limit(200);
    }
    return result;
  }

  async create(user: User, input: z.infer<typeof createInput>) {
    staff(user);
    return db.transaction(async trx => {
      const e = await this.lockEnrollment(user, input.enrollmentId, trx);
      validateMeetingSchedule(input.startsAt, input.endsAt, e);
      const {host, people} = await this.roster(user, e.id, input.hostId, input.participantIds, trx);
      const id = randomUUID();
      await trx('meetings').insert({id, organization_id: user.organizationId, enrollment_id: e.id, created_by: user.id,
        host_id: host.id, host_name: host.name, title: input.title, starts_at: input.startsAt, ends_at: input.endsAt,
        location: input.location || null, agenda: input.agenda || null});
      await trx('meeting_participants').insert(people.map(person => ({organization_id: user.organizationId, meeting_id: id,
        user_id: person.id, name_snapshot: person.name, role_snapshot: person.role})));
      const eventId = await record(trx, user, id, 'Reunião agendada', input);
      await this.notifyParticipants(trx, user, {id, enrollment_id: e.id, title: input.title}, eventId, 'Nova reunião agendada');
      return {id};
    });
  }

  async update(user: User, id: string, input: z.infer<typeof patchInput>) {
    staff(user);
    return db.transaction(async trx => {
      const {meeting, e} = await this.lockMeeting(user, id, trx);
      if (meeting.status !== 'scheduled') throw new BadRequestException('Somente reuniões agendadas podem ser remarcadas ou editadas.');
      const existing = await trx('meeting_participants').where({meeting_id: id}).whereNull('removed_at');
      const startsAt = input.startsAt || meeting.starts_at, endsAt = input.endsAt || meeting.ends_at;
      const hostId = input.hostId || meeting.host_id;
      const rosterIds = input.participantIds || existing.map(person => person.user_id);
      const selected = [...new Set([...rosterIds, hostId])];
      const timeChanged = new Date(startsAt).getTime() !== new Date(meeting.starts_at).getTime() || new Date(endsAt).getTime() !== new Date(meeting.ends_at).getTime();
      const rosterChanged = hostId !== meeting.host_id || [...selected].sort().join(',') !== existing.map(person => person.user_id).sort().join(',');
      if ((timeChanged || rosterChanged) && !input.reason) throw new BadRequestException('Registre o motivo da mudança de horário ou participantes.');
      validateMeetingSchedule(startsAt, endsAt, e);
      const {host, people} = await this.roster(user, e.id, hostId, selected, trx);
      const now = new Date();
      await trx('meetings').where({id}).update({title: input.title ?? meeting.title, starts_at: startsAt, ends_at: endsAt,
        host_id: host.id, host_name: host.name, location: input.location !== undefined ? input.location || null : meeting.location,
        agenda: input.agenda !== undefined ? input.agenda || null : meeting.agenda, updated_at: now});
      if (rosterChanged) {
        await trx('meeting_participants').where({meeting_id: id}).whereNotIn('user_id', selected).whereNull('removed_at').update({removed_at: now, updated_at: now});
        for (const person of people) {
          const prior = await trx('meeting_participants').where({meeting_id: id, user_id: person.id}).first();
          if (!prior) await trx('meeting_participants').insert({organization_id: user.organizationId, meeting_id: id, user_id: person.id,
            name_snapshot: person.name, role_snapshot: person.role});
          else if (prior.removed_at) await trx('meeting_participants').where({meeting_id: id, user_id: person.id}).update({
            removed_at: null, updated_at: now, name_snapshot: person.name, role_snapshot: person.role, attendance: 'pending', note: null});
        }
      }
      if (timeChanged) await trx('meeting_participants').where({meeting_id: id}).whereNull('removed_at').update({attendance: 'pending', note: null, updated_at: now});
      const eventId = await record(trx, user, id, timeChanged ? 'Reunião remarcada' : 'Reunião atualizada', {
        before: {title: meeting.title, startsAt: meeting.starts_at, endsAt: meeting.ends_at, hostId: meeting.host_id,
          participants: existing.map(person => ({userId: person.user_id, name: person.name_snapshot, status: person.attendance, note: person.note}))},
        changes: input,
      });
      await this.notifyParticipants(trx, user, {...meeting, title: input.title ?? meeting.title}, eventId, timeChanged ? 'Reunião remarcada' : 'Dados da reunião atualizados');
      return {ok: true};
    });
  }

  async outcome(user: User, id: string, input: {status: 'held' | 'no_show' | 'cancelled'; reason?: string}) {
    staff(user);
    return db.transaction(async trx => {
      const {meeting} = await this.lockMeeting(user, id, trx), now = new Date();
      validateMeetingOutcome(meeting.status, input.status, meeting.starts_at, meeting.ends_at, input.reason, now);
      await trx('meetings').where({id}).update({status: input.status, outcome_reason: input.reason || null,
        outcome_by: user.id, outcome_at: now, held_at: input.status === 'held' ? meeting.starts_at : null, updated_at: now});
      const action = input.status === 'held' ? 'Reunião registrada como realizada' : input.status === 'no_show' ? 'Ausência na reunião registrada' : 'Reunião cancelada';
      const eventId = await record(trx, user, id, action, {from: meeting.status, ...input});
      await this.notifyParticipants(trx, user, meeting, eventId, action);
      return {ok: true};
    });
  }

  async attendance(user: User, id: string, input: {participants: {userId: string; status: 'pending' | 'present' | 'absent' | 'excused'; note?: string}[]}) {
    staff(user);
    return db.transaction(async trx => {
      const {meeting} = await this.lockMeeting(user, id, trx), now = new Date();
      if (meeting.status === 'cancelled') throw new BadRequestException('A reunião cancelada mantém o registro de presença anterior.');
      if (new Date(meeting.starts_at) > now && input.participants.some(person => ['present', 'absent'].includes(person.status))) {
        throw new BadRequestException('Registre a presença ou ausência somente depois do início da reunião.');
      }
      const existing = await trx('meeting_participants').where({meeting_id: id}).whereNull('removed_at');
      for (const person of input.participants) {
        if (!existing.some(row => row.user_id === person.userId)) throw new BadRequestException('Participante não pertence à lista desta reunião.');
        await trx('meeting_participants').where({meeting_id: id, user_id: person.userId}).update({attendance: person.status, note: person.note || null, updated_at: now});
      }
      await record(trx, user, id, 'Presença atualizada', {before: existing.map(person => ({userId: person.user_id, status: person.attendance, note: person.note})), participants: input.participants});
      return {ok: true};
    });
  }

  async saveMinutes(user: User, id: string, input: z.infer<typeof minutesInput>) {
    staff(user);
    return db.transaction(async trx => {
      const {meeting} = await this.lockMeeting(user, id, trx);
      if (!['scheduled', 'held'].includes(meeting.status)) throw new BadRequestException('Esta reunião não permite editar uma ata.');
      const current = await trx('meeting_minutes').where({meeting_id: id}).first();
      const decisions = await trx('meeting_decisions').where({meeting_id: id}).forUpdate();
      const suppliedIds = input.decisions.flatMap(decision => decision.id ? [decision.id] : []);
      for (const decision of input.decisions) {
        if (decision.id && !decisions.some(row => row.id === decision.id)) throw new BadRequestException('Decisão não pertence a esta reunião.');
      }
      for (const converted of decisions.filter(decision => decision.task_id)) {
        const supplied = input.decisions.find(decision => decision.id === converted.id);
        if (!supplied || supplied.body !== converted.published_body) {
          throw new BadRequestException('Decisões convertidas em tarefas devem permanecer na ata com o texto original. Registre uma nova decisão para complementá-las.');
        }
      }
      const now = new Date(), version = (current?.draft_version || 0) + 1;
      await trx('meeting_minutes').insert({meeting_id: id, organization_id: user.organizationId, summary: input.summary,
        next_steps: input.nextSteps, draft_version: version, updated_by: user.id, updated_at: now}).onConflict('meeting_id').merge();
      await trx('meeting_decisions').where({meeting_id: id}).whereNotIn('id', suppliedIds).whereNull('removed_at').update({removed_at: now, updated_at: now});
      for (const [index, decision] of input.decisions.entries()) {
        if (decision.id) await trx('meeting_decisions').where({id: decision.id, meeting_id: id}).update({draft_body: decision.body, sort_order: index, removed_at: null, updated_at: now});
        else await trx('meeting_decisions').insert({id: randomUUID(), organization_id: user.organizationId, meeting_id: id,
          enrollment_id: meeting.enrollment_id, created_by: user.id, draft_body: decision.body, sort_order: index});
      }
      await record(trx, user, id, 'Rascunho de ata salvo', {draftVersion: version,
        before: current ? {summary: current.summary, nextSteps: current.next_steps,
          decisions: decisions.filter(row => !row.removed_at).map(row => ({id: row.id, body: row.draft_body}))} : null,
        changes: input,
      });
      return {ok: true, draftVersion: version};
    });
  }

  async publish(user: User, id: string) {
    staff(user);
    return db.transaction(async trx => {
      const {meeting} = await this.lockMeeting(user, id, trx);
      if (meeting.status !== 'held') throw new BadRequestException('Registre a reunião como realizada antes de publicar a ata.');
      const roster = await trx('meeting_participants').where({meeting_id: id}).whereNull('removed_at');
      if (!roster.length || roster.some(person => person.attendance === 'pending')) throw new BadRequestException('Defina a presença de todos os participantes antes de publicar.');
      const draft = await trx('meeting_minutes').where({meeting_id: id}).first();
      if (!draft?.summary.trim() || !draft.next_steps.trim()) throw new BadRequestException('Preencha o resumo e os próximos passos antes de publicar.');
      const decisions = await trx('meeting_decisions').where({meeting_id: id}).whereNull('removed_at').orderBy('sort_order');
      const snapshot = decisions.map(decision => ({id: decision.id, body: decision.draft_body}));
      const previous = await trx('meeting_minutes_revisions').where({meeting_id: id}).orderBy('version', 'desc').first();
      if (previous && previous.summary === draft.summary && previous.next_steps === draft.next_steps &&
        previous.decisions.length === snapshot.length && previous.decisions.every((decision: any, index: number) => decision.id === snapshot[index].id && decision.body === snapshot[index].body)) {
        return {ok: true, version: previous.version, alreadyPublished: true};
      }
      const version = (previous?.version || 0) + 1, now = new Date();
      await trx('meeting_minutes_revisions').insert({id: randomUUID(), organization_id: user.organizationId, meeting_id: id,
        version, summary: draft.summary, next_steps: draft.next_steps, decisions: JSON.stringify(snapshot), published_by: user.id, published_at: now});
      await trx('meeting_decisions').where({meeting_id: id}).whereNotNull('removed_at').update({published_body: null});
      for (const decision of decisions) await trx('meeting_decisions').where({id: decision.id}).update({published_body: decision.draft_body});
      if (!previous && roster.some(person => person.role_snapshot === 'mentee' && person.attendance === 'present') &&
        roster.some(person => ['admin', 'mentor'].includes(person.role_snapshot) && person.attendance === 'present')) {
        await trx('enrollments').where({id: meeting.enrollment_id}).update({last_contact_at: trx.raw('GREATEST(last_contact_at, ?::timestamptz)', [meeting.held_at])});
      }
      const eventId = await record(trx, user, id, 'Ata publicada', {version});
      await this.notifyParticipants(trx, user, meeting, eventId, 'Ata da reunião disponível');
      return {ok: true, version, alreadyPublished: false};
    });
  }

  async convertDecision(user: User, id: string, decisionId: string, input: z.infer<typeof conversionInput>) {
    staff(user);
    return db.transaction(async trx => {
      const initial = await this.meetingRow(user, id, trx);
      await this.lockEnrollment(user, initial.enrollment_id, trx);
      // Shared writer order: enrollment -> plan -> meeting -> decision -> task.
      const plan = await trx('action_plans').where({id: input.planId, organization_id: user.organizationId,
        enrollment_id: initial.enrollment_id}).forUpdate().first();
      if (!plan) throw new NotFoundException('Plano não encontrado nesta contratação.');
      const meeting = await trx('meetings').where({id, organization_id: user.organizationId}).forUpdate().first();
      const decision = await trx('meeting_decisions').where({id: decisionId, meeting_id: id, organization_id: user.organizationId}).forUpdate().first();
      if (!decision) throw new NotFoundException('Decisão não encontrada.');
      if (decision.task_id) {
        const existing = await trx('tasks').where({id: decision.task_id, organization_id: user.organizationId}).first();
        if (!existing || existing.plan_id !== input.planId) throw new ConflictException('A decisão já foi convertida em uma tarefa de outro plano.');
        return {id: existing.id, taskId: existing.id, created: false};
      }
      if (plan.status !== 'active') throw new BadRequestException('Escolha um plano ativo para receber a tarefa.');
      if (meeting.status !== 'held' || !decision.published_body) throw new BadRequestException('Publique a decisão na ata de uma reunião realizada antes de criar a tarefa.');
      if (decision.removed_at || decision.draft_body !== decision.published_body) throw new BadRequestException('Publique ou restaure a decisão alterada no rascunho antes de convertê-la.');
      const assignee = (await this.plans.assignees(user, meeting.enrollment_id, trx)).find(person => person.id === input.assigneeId);
      if (!assignee) throw new BadRequestException('Escolha um responsável ativo com acesso vigente à contratação.');
      const taskId = randomUUID(), now = new Date(), taskTitle = input.title || decision.published_body.slice(0, 200);
      await trx('tasks').insert({id: taskId, organization_id: user.organizationId, enrollment_id: meeting.enrollment_id,
        plan_id: plan.id, created_by: user.id, assignee_id: assignee.id, title: taskTitle,
        description: decision.published_body, completion_criteria: input.completionCriteria, priority: input.priority,
        due_at: input.dueAt, status: 'todo', created_from_decision_id: decision.id, created_at: now, updated_at: now});
      await trx('meeting_decisions').where({id: decisionId}).update({task_id: taskId, updated_at: now});
      await trx('action_plans').where({id: plan.id}).update({updated_at: now});
      await record(trx, user, id, 'Decisão convertida em tarefa', {decisionId, taskId, planId: plan.id});
      await trx('audit_events').insert({id: randomUUID(), organization_id: user.organizationId, actor_id: user.id,
        entity_type: 'task', entity_id: taskId, action: 'Tarefa criada a partir de uma decisão',
        details: JSON.stringify({meetingId: id, decisionId, ...input})});
      return {id: taskId, taskId, created: true};
    });
  }
}

@Controller('api')
class MeetingsController {
  constructor(@Inject(MeetingsService) private readonly meetings: MeetingsService) {}
  @Get('meetings') list(@Req() req: any, @Query() query: unknown) {
    return this.meetings.list(req.user, z.object({enrollmentId: uuid.optional(), status: statuses.optional(), from: instant.optional(), to: instant.optional()}).parse(query));
  }
  @Get('meetings/:id') detail(@Req() req: any, @Param('id') id: string) { return this.meetings.detail(req.user, uuid.parse(id)); }
  @Post('meetings') create(@Req() req: any, @Body() body: unknown) { return this.meetings.create(req.user, createInput.parse(body)); }
  @Patch('meetings/:id') update(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.meetings.update(req.user, uuid.parse(id), patchInput.parse(body));
  }
  @Post('meetings/:id/outcome') outcome(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.meetings.outcome(req.user, uuid.parse(id), z.object({status: z.enum(['held', 'no_show', 'cancelled']), reason: content.optional()}).strict().parse(body));
  }
  @Patch('meetings/:id/attendance') attendance(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const input = z.object({participants: z.array(z.object({userId: uuid, status: attendance, note: optionalContent.optional()}).strict()).min(1).max(100)
      .refine(rows => new Set(rows.map(row => row.userId)).size === rows.length, 'Participantes duplicados.')}).strict().parse(body);
    return this.meetings.attendance(req.user, uuid.parse(id), input);
  }
  @Patch('meetings/:id/minutes') saveMinutes(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.meetings.saveMinutes(req.user, uuid.parse(id), minutesInput.parse(body));
  }
  @Post('meetings/:id/minutes/publish') publish(@Req() req: any, @Param('id') id: string) { return this.meetings.publish(req.user, uuid.parse(id)); }
  @Post('meetings/:id/decisions/:decisionId/task') convert(@Req() req: any, @Param('id') id: string, @Param('decisionId') decisionId: string, @Body() body: unknown) {
    return this.meetings.convertDecision(req.user, uuid.parse(id), uuid.parse(decisionId), conversionInput.parse(body));
  }
  @Get('enrollments/:id/meeting-participants') participants(@Req() req: any, @Param('id') id: string) {
    return this.meetings.eligibleParticipants(req.user, uuid.parse(id));
  }
}

@Module({imports: [PlansModule], controllers: [MeetingsController], providers: [MeetingsService], exports: [MeetingsService]})
export class MeetingsModule {}
