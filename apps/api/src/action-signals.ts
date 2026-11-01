import {randomUUID} from 'node:crypto';
import type {Knex} from 'knex';
import type {User} from './auth';
import {scopedEnrollments} from './access';
import {loadMeetingSignals} from './meeting-signals';
import {loadJourneySignals} from './journey-signals';

export type ActionSignal = {
  id: string; type: 'missing_plan'|'stalled_plan'|'overdue_task'|'blocked_task'|'pending_review'|'orphan_task'|'missing_next_meeting'|'overdue_meeting'|'unpublished_minutes'|'orphan_meeting'|'ending_without_review'|'mentor_absence'|'mentor_overcapacity'|'waiting_mentee_stale'|'low_satisfaction';
  organizationId: string; enrollmentId: string; clientId: string; clientName: string;
  mentorName: string|null; reason: string; dueAt: Date|null; severity: string;
  actionUrl: string; adminOnly?: boolean; mentorUserId?: string; ticketId?: string; planId?: string; taskId?: string; assigneeId?: string; meetingId?: string;
};
type Row = Record<string, any>;

// The clock is injected so boundaries and worker catch-up use the same rules as the panel.
export function evaluateActionSignals(enrollments: Row[], plans: Row[], tasks: Row[], now = new Date()): ActionSignal[] {
  const result: ActionSignal[] = [];
  for (const e of enrollments) {
    if (e.status !== 'active' || (e.starts_at && new Date(e.starts_at)>now)) continue;
    const currentPlans = plans.filter(p => p.enrollment_id === e.id && p.status === 'active');
    const base = {organizationId:e.organization_id,enrollmentId:e.id,clientId:e.client_id,clientName:e.client_name,mentorName:e.mentor_name||null};
    if (!currentPlans.length) result.push({...base,id:`missing_plan:${e.id}`,type:'missing_plan',reason:'Cliente sem plano ativo',dueAt:null,severity:'warning',actionUrl:`/plans?enrollmentId=${e.id}&filter=missing`});
    for (const p of currentPlans) {
      const staleAt = new Date(new Date(p.last_progress_at).getTime() + p.stale_days*86400000);
      if (now >= staleAt) result.push({...base,id:`stalled_plan:${p.id}`,type:'stalled_plan',planId:p.id,reason:`Plano parado: ${p.title}`,dueAt:staleAt,severity:'warning',actionUrl:`/plans/${p.id}`});
      for (const task of tasks.filter(t => t.plan_id === p.id && !['done','cancelled'].includes(t.status))) {
        const common = {...base,planId:p.id,taskId:task.id,assigneeId:task.assignee_id,actionUrl:`/tasks/${task.id}`};
        if (!task.assignee_has_access) result.push({...common,id:`orphan_task:${task.id}`,type:'orphan_task',reason:`Reatribuir responsável: ${task.title}`,dueAt:new Date(task.due_at),severity:'critical'});
        if (task.status === 'submitted') {
          result.push({...common,id:`pending_review:${task.id}`,type:'pending_review',reason:`Entrega aguardando revisão: ${task.title}`,dueAt:null,severity:'warning'});
          continue; // Delivery meets the delivery deadline; the review is a separate obligation.
        }
        if (new Date(task.due_at) < now) result.push({...common,id:`overdue_task:${task.id}`,type:'overdue_task',reason:`Tarefa vencida: ${task.title}`,dueAt:new Date(task.due_at),severity:'critical'});
        if (task.status === 'blocked') result.push({...common,id:`blocked_task:${task.id}`,type:'blocked_task',reason:`Tarefa bloqueada: ${task.title}`,dueAt:new Date(task.due_at),severity:'warning'});
      }
    }
  }
  return result;
}

export async function loadActionSignals(connection: Knex|Knex.Transaction, now = new Date(), user?: User) {
  const q = user ? scopedEnrollments(user, connection) : connection('enrollments as e');
  const enrollments: Row[] = await q.join('clients as c','c.id','e.client_id').where('e.status','active').where('e.starts_at','<=',now)
    .select('e.id','e.organization_id','e.client_id','e.status','c.name as client_name');
  const ids = enrollments.map(e => e.id);
  if (!ids.length) return [];
  const assignments: Row[] = await connection('assignments as a').join('users as u','u.id','a.mentor_id')
    .whereIn('a.enrollment_id',ids).where('u.active',true).where('a.starts_at','<=',now)
    .where(function(){this.whereNull('a.ends_at').orWhere('a.ends_at','>',now);})
    .select('a.*','u.name as mentor_name').orderBy('a.starts_at','desc');
  for (const e of enrollments) e.mentor_name = (assignments.find(a => a.enrollment_id===e.id&&a.kind==='coverage')||assignments.find(a => a.enrollment_id===e.id&&a.kind==='primary'))?.mentor_name;
  const plans: Row[] = await connection('action_plans').whereIn('enrollment_id',ids);
  const tasks: Row[] = await connection('tasks as t').join('users as u','u.id','t.assignee_id').whereIn('t.enrollment_id',ids)
    .select('t.*','u.role as assignee_role','u.active as assignee_active');
  const members: Row[] = await connection('client_members').whereIn('client_id',enrollments.map(e => e.client_id));
  for (const task of tasks) {
    const e = enrollments.find(e => e.id === task.enrollment_id)!;
    task.assignee_has_access = task.assignee_active && (task.assignee_role==='mentor'
      ? assignments.some(a => a.enrollment_id===e.id&&a.mentor_id===task.assignee_id)
      : task.assignee_role==='mentee' && members.some(m => m.client_id===e.client_id&&m.user_id===task.assignee_id));
  }
  return [...evaluateActionSignals(enrollments,plans,tasks,now),...await loadMeetingSignals(connection,enrollments,assignments,now,user),...await loadJourneySignals(connection,enrollments,assignments,now,user)];
}

// Called inside the existing reconciler transaction/advisory lock.
export async function reconcileActionSignals(trx: Knex.Transaction, now: Date) {
  const signals = await loadActionSignals(trx,now);
  const states: Row[] = await trx('action_signal_states').select('*');
  const present = new Set(signals.map(s => s.organizationId+':'+s.id));
  for (const state of states) {
    if (state.active && !present.has(state.organization_id+':'+state.signal_key)) {
      await trx('action_signal_states').where({organization_id:state.organization_id,signal_key:state.signal_key}).update({active:false,cleared_at:now});
    }
  }
  const users: Row[] = await trx('users').where({active:true}).select('id','organization_id','role');
  const assignments: Row[] = await trx('assignments').where('starts_at','<=',now)
    .where(function(){this.whereNull('ends_at').orWhere('ends_at','>',now);});
  const members: Row[] = await trx('client_members');
  for (const signal of signals) {
    const state = states.find(s => s.organization_id===signal.organizationId&&s.signal_key===signal.id);
    const episode = state ? state.episode+(state.active?0:1) : 1;
    if (!state) await trx('action_signal_states').insert({organization_id:signal.organizationId,signal_key:signal.id,enrollment_id:signal.enrollmentId,episode,active:true,first_seen_at:now});
    else if (!state.active) await trx('action_signal_states').where({organization_id:signal.organizationId,signal_key:signal.id}).update({episode,active:true,first_seen_at:now,cleared_at:null});
    const recipients = users.filter(u => u.organization_id===signal.organizationId && (
      u.role==='admin'||u.role==='mentor'&&!signal.adminOnly&&(!signal.mentorUserId||signal.mentorUserId===u.id)&&assignments.some(a=>a.enrollment_id===signal.enrollmentId&&a.mentor_id===u.id)
      ||u.role==='mentee'&&u.id===signal.assigneeId&&['overdue_task','blocked_task'].includes(signal.type)&&members.some(m=>m.client_id===signal.clientId&&m.user_id===u.id)
    ));
    for (const recipient of recipients) await trx('notifications').insert({
      id:randomUUID(),organization_id:signal.organizationId,user_id:recipient.id,enrollment_id:signal.enrollmentId,
      ticket_id:signal.ticketId||null,plan_id:signal.planId||null,task_id:signal.taskId||null,meeting_id:signal.meetingId||null,dedupe_key:`action:${signal.id}:${episode}`,
      title:signal.reason,body:signal.clientName,
    }).onConflict(['user_id','dedupe_key']).ignore();
  }
}
