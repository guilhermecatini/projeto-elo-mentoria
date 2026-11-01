import {ForbiddenException,NotFoundException} from '@nestjs/common';
import {Knex} from 'knex';
import {User} from './auth';
import {db} from './db';
export function admin(u:User){if(u.role!=='admin')throw new ForbiddenException('Disponível para a administração.');}
export function scopedEnrollments(u:User,connection:Knex|Knex.Transaction=db){
 const q=connection('enrollments as e').where('e.organization_id',u.organizationId);
 if(u.role==='mentor')q.whereExists(connection('assignments as a').select(connection.raw('1')).whereRaw('a.enrollment_id=e.id').where('a.mentor_id',u.id).where('a.starts_at','<=',new Date()).where(function(){this.whereNull('a.ends_at').orWhere('a.ends_at','>',new Date());}));
 if(u.role==='mentee')q.whereExists(connection('client_members as m').select(connection.raw('1')).whereRaw('m.client_id=e.client_id').where('m.user_id',u.id));
 return q;
}
export async function enrollment(u:User,id:string,trx:Knex|Knex.Transaction=db){const row=await scopedEnrollments(u,trx).where('e.id',id).select('e.*').first();if(!row)throw new NotFoundException('Contratação não encontrada.');return row;}
export async function ticket(u:User,id:string,trx:Knex|Knex.Transaction=db,lock=false){let q=trx('tickets').where({id,organization_id:u.organizationId});if(lock)q=q.forUpdate();const row=await q.first();if(!row)throw new NotFoundException('Atendimento não encontrado.');await enrollment(u,row.enrollment_id,trx);return row;}
export async function audit(trx:Knex|Knex.Transaction,u:User,type:string,id:string,action:string,details:unknown={}){await trx('audit_events').insert({id:crypto.randomUUID(),organization_id:u.organizationId,actor_id:u.id,entity_type:type,entity_id:id,action,details:JSON.stringify(details)});}
