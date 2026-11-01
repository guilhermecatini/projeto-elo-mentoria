import {randomUUID} from 'node:crypto';
import {db} from './db';
import {businessMinutesBetween} from './calendar';
import {reconcileActionSignals} from './action-signals';
export async function reconcile(now=new Date()){
 await db.transaction(async trx=>{
  await trx.raw("SELECT pg_advisory_xact_lock(hashtext('elo-reconcile'))");
  const events=await trx('sla_events as s').join('tickets as t','t.id','s.ticket_id').join('enrollments as e','e.id','t.enrollment_id').join('programs as p','p.id','e.program_id').where(function(){this.where(function(){this.whereNull('s.fulfilled_at').whereNull('s.paused_at');}).orWhereNotNull('s.violated_at');}).select('s.*','t.subject','e.id as enrollmentId','p.calendar','p.escalation_minutes');
  for(const s of events){const due=new Date(s.due_at),start=new Date(s.started_at);const total=s.kind==='promised'?(due.getTime()-start.getTime())/60e3:businessMinutesBetween(start,due,s.calendar);const consumed=s.kind==='promised'?(now.getTime()-start.getTime())/60e3:businessMinutesBetween(start,now,s.calendar);const overdue=!!s.violated_at||now>=due;const level=overdue?(s.fulfilled_at||s.paused_at?'overdue':now.getTime()-due.getTime()>s.escalation_minutes*60e3?'escalated':'overdue'):total>0&&consumed/total>=.75?'warning':null;if(!level)continue;
   if(overdue&&!s.violated_at)await trx('sla_events').where({id:s.id}).update({violated_at:due});
   const mentors=await trx('assignments').where({enrollment_id:s.enrollmentId}).where('starts_at','<=',now).where(function(){this.whereNull('ends_at').orWhere('ends_at','>',now);}).select('mentor_id as id');const admins=overdue?await trx('users').where({organization_id:s.organization_id,role:'admin',active:true}).select('id'):[];
   for(const person of [...mentors,...admins])await trx('notifications').insert({id:randomUUID(),organization_id:s.organization_id,user_id:person.id,ticket_id:s.ticket_id,enrollment_id:s.enrollmentId,dedupe_key:`sla-${s.id}-${level}`,title:level==='warning'?'Prazo próximo do vencimento':level==='escalated'?'Atendimento exige intervenção':'Prazo de atendimento vencido',body:s.subject}).onConflict(['user_id','dedupe_key']).ignore();
  }
  const enrollments=await trx('enrollments as e').join('clients as c','c.id','e.client_id').join('programs as p','p.id','e.program_id').where('e.status','active').where('e.starts_at','<=',now).select('e.*','c.name','p.followup_days');
  for(const e of enrollments){const assignments=await trx('assignments').where({enrollment_id:e.id}).where('starts_at','<=',now).where(function(){this.whereNull('ends_at').orWhere('ends_at','>',now);});const reasons:string[]=[];if(!assignments.some(a=>a.kind==='primary'))reasons.push('Cliente sem mentor principal');const last=new Date(e.last_contact_at||e.starts_at);if(now.getTime()-last.getTime()>e.followup_days*86400e3)reasons.push('Cliente sem acompanhamento recente');if(!e.next_step_at)reasons.push('Cliente sem próximo passo');
   const recipients=[...assignments.map(a=>({id:a.mentor_id})),...await trx('users').where({organization_id:e.organization_id,role:'admin',active:true}).select('id')];
   for(const reason of reasons)for(const person of recipients)await trx('notifications').insert({id:randomUUID(),organization_id:e.organization_id,user_id:person.id,enrollment_id:e.id,dedupe_key:`attention-${e.id}-${reason}-${last.toISOString()}`,title:reason,body:e.name}).onConflict(['user_id','dedupe_key']).ignore();
  }
  await reconcileActionSignals(trx,now);
  await trx('worker_heartbeats').insert({id:'reconciler',last_seen_at:now}).onConflict('id').merge();
  await trx('sessions').where('expires_at','<',now).delete();
 });
}
