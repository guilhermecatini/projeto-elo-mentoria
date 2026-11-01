import type {Knex} from 'knex';
import type {User} from './auth';
import type {ActionSignal} from './action-signals';
type Row=Record<string,any>;
export function evaluateJourneySignals(enrollments:Row[],assignments:Row[],mentors:Row[],absences:Row[],feedback:Row[],waiting:Row[],now=new Date(),user?:Pick<User,'id'|'role'>):ActionSignal[]{
  if(user?.role==='mentee')return [];
  const result:ActionSignal[]=[];const current=enrollments.filter(e=>e.status==='active'&&new Date(e.starts_at)<=now);
  const approved=absences.filter(a=>a.status==='approved');
  const hasAccess=(mentorId:string,enrollmentId:string)=>assignments.some(a=>a.mentor_id===mentorId&&a.enrollment_id===enrollmentId);
  for(const e of current){
    const base={organizationId:e.organization_id,enrollmentId:e.id,clientId:e.client_id,clientName:e.client_name,mentorName:e.mentor_name||null};
    if(new Date(e.ends_at).getTime()<=+now+30*86400000&&(!e.reviewed_at||new Date(e.reviewed_at).getTime()<new Date(e.ends_at).getTime()-30*86400000))result.push({...base,id:`ending_without_review:${e.id}`,type:'ending_without_review',reason:'Ciclo próximo do fim sem revisão recente',dueAt:new Date(e.ends_at),severity:'warning',actionUrl:`/journey/enrollments/${e.id}?tab=review`});
    for(const absence of approved.filter(a=>a.organization_id===e.organization_id&&new Date(a.starts_at)<=now&&new Date(a.ends_at)>now&&hasAccess(a.mentor_id,e.id))){
      if(user?.role==='mentor'&&user.id!==absence.mentor_id)continue;
      const covered=assignments.some(a=>a.enrollment_id===e.id&&a.mentor_id!==absence.mentor_id&&a.kind==='coverage'&&new Date(a.starts_at)<=now&&(!a.ends_at||new Date(a.ends_at)>=new Date(absence.ends_at))&&!approved.some(other=>other.mentor_id===a.mentor_id&&new Date(other.starts_at)<new Date(absence.ends_at)&&new Date(other.ends_at)>now));
      if(!covered)result.push({...base,id:`mentor_absence:${absence.id}:${e.id}`,type:'mentor_absence',reason:'Ausência de mentor sem cobertura para o período restante',dueAt:new Date(absence.ends_at),severity:'critical',actionUrl:`/journey/absences/${absence.id}`,mentorUserId:absence.mentor_id});
    }
    for(const mentor of mentors.filter(m=>m.organization_id===e.organization_id&&m.active&&m.capacity!==null&&hasAccess(m.id,e.id))){
      if(user?.role==='mentor'&&user.id!==mentor.id)continue;
      const load=new Set(assignments.filter(a=>a.mentor_id===mentor.id&&current.some(c=>c.id===a.enrollment_id)).map(a=>a.enrollment_id)).size;
      if(load>mentor.capacity)result.push({...base,id:`mentor_overcapacity:${mentor.id}:${e.id}`,type:'mentor_overcapacity',reason:'Carteira de mentor acima da capacidade registrada',dueAt:null,severity:'warning',actionUrl:`/journey/capacity?mentorId=${mentor.id}`,mentorUserId:mentor.id});
    }
    for(const response of feedback.filter(r=>r.enrollment_id===e.id&&r.score<=2&&new Date(r.created_at)>=new Date(+now-90*86400000))){
      if(user?.role==='mentor'&&!response.shared_with_mentor)continue;
      result.push({...base,id:`low_satisfaction:${response.id}`,type:'low_satisfaction',reason:'Avaliação de satisfação baixa no ciclo',dueAt:new Date(response.created_at),severity:'warning',actionUrl:`/journey/enrollments/${e.id}?tab=satisfaction`,adminOnly:!response.shared_with_mentor});
    }
    for(const t of waiting.filter(t=>t.enrollment_id===e.id&&t.status==='waiting_mentee')){
      const due=new Date(new Date(t.waiting_since||t.updated_at).getTime()+Number(e.followup_days||7)*86400000);
      if(due<=now)result.push({...base,id:`waiting_mentee_stale:${t.id}`,type:'waiting_mentee_stale',reason:'Mentorado sem resposta à solicitação no intervalo do programa',dueAt:due,severity:'warning',actionUrl:`/tickets/${t.id}`,ticketId:t.id});
    }
  }
  return result;
}
export async function loadJourneySignals(connection:Knex|Knex.Transaction,scopedRows:Row[],assignments:Row[],now:Date,user?:User){
  if(user?.role==='mentee'||!scopedRows.length)return [];
  const ids=scopedRows.map(e=>e.id);const mentorIds=[...new Set(assignments.map(a=>a.mentor_id))];
  const [enrollments,mentors,absences,feedback,waitingRows]=await Promise.all([
    connection('enrollments as e').join('programs as p','p.id','e.program_id').join('clients as c','c.id','e.client_id').whereIn('e.id',ids).select('e.*','p.followup_days','c.name as client_name'),
    connection('users').whereIn('id',mentorIds).select('id','organization_id','capacity','active'),
    connection('mentor_absences').whereIn('mentor_id',mentorIds).where('status','approved').where('ends_at','>',now),
    connection('satisfaction_responses').whereIn('enrollment_id',ids).where('score','<=',2).where('created_at','>=',new Date(+now-90*86400000)),
    connection('tickets as t').leftJoin('sla_events as s',function(){this.on('s.ticket_id','=','t.id').andOnVal('s.kind','=','resolution').andOnNull('s.fulfilled_at');}).whereIn('t.enrollment_id',ids).where('t.status','waiting_mentee').select('t.id','t.enrollment_id','t.status','t.updated_at','s.paused_at'),
  ]);
  const waiting:Row[]=[];for(const row of waitingRows){const found=waiting.find(t=>t.id===row.id);if(!found){waiting.push({...row,waiting_since:row.paused_at||row.updated_at});}else if(row.paused_at&&new Date(row.paused_at)<new Date(found.waiting_since))found.waiting_since=row.paused_at;}
  for(const e of enrollments)e.mentor_name=scopedRows.find(r=>r.id===e.id)?.mentor_name;
  return evaluateJourneySignals(enrollments,assignments,mentors,absences,feedback,waiting,now,user);
}
