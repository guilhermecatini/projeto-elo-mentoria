import {DateTime} from 'luxon';
import type {Knex} from 'knex';
import type {User} from './auth';
import type {ActionSignal} from './action-signals';
import {scopedEnrollments} from './access';

type Row = Record<string, any>;

export function evaluateMeetingSignals(enrollments: Row[], meetings: Row[], now = new Date(), includeStaff = true): ActionSignal[] {
  const signals: ActionSignal[] = [];
  for (const e of enrollments) {
    if (e.status !== 'active' || (e.starts_at && new Date(e.starts_at)>now)) continue;
    const current = meetings.filter(m => m.enrollment_id === e.id);
    const base = {organizationId:e.organization_id,enrollmentId:e.id,clientId:e.client_id,clientName:e.client_name,mentorName:e.mentor_name||null};
    if (!current.some(m => m.status === 'scheduled' && new Date(m.ends_at) >= now && m.host_has_access)) {
      signals.push({...base,id:`missing_next_meeting:${e.id}`,type:'missing_next_meeting',reason:'Cliente sem próxima reunião',dueAt:null,severity:'warning',actionUrl:`/meetings?enrollmentId=${e.id}&filter=missing`});
    }
    for (const m of current) {
      const common = {...base,meetingId:m.id,actionUrl:`/meetings/${m.id}`};
      if (m.status === 'scheduled' && new Date(m.ends_at) < now) {
        signals.push({...common,id:`overdue_meeting:${m.id}`,type:'overdue_meeting',reason:`Reunião sem resultado registrado: ${m.title}`,dueAt:new Date(m.ends_at),severity:'critical'});
      }
      if (includeStaff && m.status === 'scheduled' && new Date(m.ends_at) >= now && !m.host_has_access) {
        signals.push({...common,id:`orphan_meeting:${m.id}`,type:'orphan_meeting',reason:`Reatribuir responsável da reunião: ${m.title}`,dueAt:new Date(m.starts_at),severity:'critical'});
      }
      if (includeStaff && m.status === 'held' && !m.has_published_minutes) {
        signals.push({...common,id:`unpublished_minutes:${m.id}`,type:'unpublished_minutes',reason:`Publicar ata da reunião: ${m.title}`,dueAt:new Date(m.ends_at),severity:'warning'});
      }
    }
  }
  return signals;
}

// The caller already scoped enrollments and current assignments. Shared by panel and worker.
export async function loadMeetingSignals(connection:Knex|Knex.Transaction,enrollments:Row[],assignments:Row[],now:Date,user?:User) {
  if (!enrollments.length) return [];
  const meetings:Row[] = await connection('meetings as m').join('users as h','h.id','m.host_id')
    .whereIn('m.enrollment_id',enrollments.map(e=>e.id))
    .select('m.*','h.active as host_active','h.role as host_role',connection.raw('EXISTS (SELECT 1 FROM meeting_minutes_revisions r WHERE r.meeting_id = m.id) as has_published_minutes'));
  for (const m of meetings) m.host_has_access = m.host_active && (m.host_role==='admin' || m.host_role==='mentor' && assignments.some(a=>a.enrollment_id===m.enrollment_id&&a.mentor_id===m.host_id));
  return evaluateMeetingSignals(enrollments,meetings,now,user?.role!=='mentee');
}

export function meetingDayBounds(now = new Date()) {
  const day = DateTime.fromJSDate(now).setZone('America/Sao_Paulo').startOf('day');
  return {start:day.toUTC().toJSDate(),end:day.plus({days:1}).toUTC().toJSDate()};
}

export async function countMeetingsToday(connection:Knex|Knex.Transaction,user:User,now = new Date()) {
  const {start,end} = meetingDayBounds(now);
  const result = await connection('meetings').whereIn('enrollment_id',scopedEnrollments(user,connection).where('e.status','active').where('e.starts_at','<=',now).select('e.id'))
    .whereNot('status','cancelled').where('starts_at','>=',start).where('starts_at','<',end).count<{count:string}>('* as count').first();
  return Number(result?.count||0);
}
