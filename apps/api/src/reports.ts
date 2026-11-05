import {Controller,ForbiddenException,Get,Inject,Injectable,Module,Query,Req,Res} from '@nestjs/common';
import {z} from 'zod';
import {db} from './db';
import {User} from './auth';
import {scopedEnrollments} from './access';
import {businessMinutesBetween} from './calendar';
import {reportWindow,reportCsv,sample} from './report-math';

const filters=z.object({from:z.string(),to:z.string(),enrollmentId:z.string().uuid().optional(),programId:z.string().uuid().optional(),mentorId:z.string().uuid().optional()}).strict();
type Filters=z.infer<typeof filters>;
const isBetween=(date:any,start:string,end:string)=>!!date&&new Date(date)>=new Date(start)&&new Date(date)<new Date(end);
const time=(value:any)=>new Date(value).getTime();
function staff(user:User){if(user.role==='mentee')throw new ForbiddenException('Relatórios operacionais são destinados à equipe de mentoria.');}
function inPeriod(row:any,field:string,start:string,end:string){return isBetween(row[field],start,end);}
const slaLabels:Record<string,string>={first:'Primeira resposta',next:'Próxima resposta',promised:'Retorno prometido',resolution:'Resolução'};

@Injectable()
export class ReportsService {
  async operations(user:User,input:Filters) {
    staff(user);const now=new Date(),window=reportWindow(input.from,input.to,now);
    if(user.role==='mentor'&&input.mentorId&&input.mentorId!==user.id)throw new ForbiddenException('Selecione sua própria carteira.');
    const enrolled=await scopedEnrollments(user).join('clients as c','c.id','e.client_id').join('programs as p','p.id','e.program_id')
      .select('e.*','c.name as clientName','p.name as programName','p.calendar','p.followup_days');
    const allIds=enrolled.map(e=>e.id);
    const assignments=allIds.length?await db('assignments as a').join('users as u','u.id','a.mentor_id').whereIn('a.enrollment_id',allIds)
      .where('u.active',true).where('a.starts_at','<=',now).where(function(){this.whereNull('a.ends_at').orWhere('a.ends_at','>',now);})
      .select('a.*','u.name as mentorName','u.capacity').orderBy('a.starts_at','desc'):[];
    const scoped=enrolled.filter(e=>(!input.enrollmentId||e.id===input.enrollmentId)&&(!input.programId||e.program_id===input.programId)
      &&(!input.mentorId||assignments.some(a=>a.enrollment_id===e.id&&a.mentor_id===input.mentorId)));
    const ids=scoped.map(e=>e.id),enrollMap=new Map(scoped.map(e=>[e.id,e]));
    const owner=(id:string)=>assignments.find(a=>a.enrollment_id===id&&a.kind==='coverage')||assignments.find(a=>a.enrollment_id===id&&a.kind==='primary');
    const tickets=ids.length?await db('tickets').where({organization_id:user.organizationId}).whereIn('enrollment_id',ids):[];
    const ticketIds=tickets.map(t=>t.id);
    const [events,messages,audits,meetings,tasks,plans,followups,feedback,renewals,absences]=await Promise.all([
      ticketIds.length?db('sla_events').where({organization_id:user.organizationId}).whereIn('ticket_id',ticketIds):[],
      ticketIds.length?db('messages as m').join('users as u','u.id','m.author_id').where('m.organization_id',user.organizationId)
        .whereIn('m.ticket_id',ticketIds).where({'m.kind':'public'}).whereIn('u.role',['admin','mentor']).select('m.ticket_id','m.created_at','m.author_id'):[],
      ticketIds.length?db('audit_events').where({organization_id:user.organizationId,entity_type:'ticket',action:'Situação alterada'}).whereIn('entity_id',ticketIds):[],
      ids.length?db('meetings').where({organization_id:user.organizationId}).whereIn('enrollment_id',ids):[],
      ids.length?db('tasks').where({organization_id:user.organizationId}).whereIn('enrollment_id',ids):[],
      ids.length?db('action_plans').where({organization_id:user.organizationId}).whereIn('enrollment_id',ids):[],
      ids.length?db('audit_events').where({organization_id:user.organizationId,entity_type:'enrollment',action:'Acompanhamento registrado'}).whereIn('entity_id',ids):[],
      ids.length?db('satisfaction_responses').where({organization_id:user.organizationId}).whereIn('enrollment_id',ids).modify(q=>{if(user.role==='mentor')q.where('shared_with_mentor',true);}).select('score','created_at'):[],
      ids.length?db('journey_renewals').where({organization_id:user.organizationId}).whereIn('source_enrollment_id',ids):[],
      db('mentor_absences').where({organization_id:user.organizationId,status:'approved'}).where('starts_at','<=',now).where('ends_at','>',now).select('mentor_id'),
    ]);
    const taskAudit=tasks.length?await db('audit_events').where({organization_id:user.organizationId,entity_type:'task',action:'Tarefa concluída'}).whereIn('entity_id',tasks.map(t=>t.id)):[];
    const ticketMap=new Map(tickets.map(t=>[t.id,t]));
    const humanResponse=(event:any)=>messages.some(m=>m.ticket_id===event.ticket_id&&time(m.created_at)===time(event.fulfilled_at));
    const durations=(kind:string,start:string,end:string)=>events.filter(s=>s.kind===kind&&inPeriod(s,'fulfilled_at',start,end)&&humanResponse(s)).flatMap(s=>{
      const t=ticketMap.get(s.ticket_id),e=t&&enrollMap.get(t.enrollment_id);
      if(!e||time(s.fulfilled_at)<time(s.started_at)||time(s.fulfilled_at)-time(s.started_at)>3650*86400e3)return [];
      try{return [businessMinutesBetween(s.started_at,s.fulfilled_at,e.calendar)];}catch{return [];}
    });
    const resolutionEvents=audits.filter(a=>a.details?.to==='resolved').map(a=>({ticketId:a.entity_id,at:a.created_at}));
    for(const t of tickets)if(t.resolved_at&&!resolutionEvents.some(a=>a.ticketId===t.id))resolutionEvents.push({ticketId:t.id,at:t.resolved_at});
    const cohort=(start:string,end:string)=>{
      const completed=resolutionEvents.filter(r=>isBetween(r.at,start,end));
      const resolvedIds=new Set(completed.map(r=>r.ticketId));
      const reopened=new Set(audits.filter(a=>a.details?.to==='reopened'&&time(a.created_at)<=time(now)&&resolvedIds.has(a.entity_id)&&completed.some(r=>r.ticketId===a.entity_id&&time(r.at)<=time(a.created_at))).map(a=>a.entity_id));
      const eligible=events.filter(s=>(inPeriod(s,'due_at',start,end)&&time(s.due_at)<=time(now))||inPeriod(s,'fulfilled_at',start,end));
      const relevant=eligible.filter(s=>!s.paused_at||s.fulfilled_at||s.violated_at);
      const within=relevant.filter(s=>s.fulfilled_at&&!s.violated_at&&time(s.fulfilled_at)<=time(s.due_at));
      const byKind=Object.keys(slaLabels).map(kind=>{const rows=relevant.filter(s=>s.kind===kind),onTime=within.filter(s=>s.kind===kind).length;return {kind,label:slaLabels[kind],eligible:rows.length,onTime,rate:rows.length?Math.round(onTime/rows.length*10000)/100:null};});
      const scheduled=meetings.filter(m=>inPeriod(m,'starts_at',start,end));
      const created=tickets.filter(t=>inPeriod(t,'created_at',start,end));
      const doneIds=new Set(taskAudit.filter(a=>inPeriod(a,'created_at',start,end)).map(a=>a.entity_id));
      for(const t of tasks)if(t.completed_at&&inPeriod(t,'completed_at',start,end)&&!taskAudit.some(a=>a.entity_id===t.id))doneIds.add(t.id);
      const answers=feedback.filter((s:any)=>inPeriod(s,'created_at',start,end));
      const eligibleCycles=scoped.filter(e=>e.status==='closed'&&inPeriod(e,'ends_at',start,end));
      const renewedCycles=eligibleCycles.filter(e=>renewals.some(r=>r.source_enrollment_id===e.id));
      const responseFirst=durations('first',start,end),responseNext=durations('next',start,end);
      return {ticketsCreated:created.length,resolvedTickets:resolvedIds.size,resolutionEpisodes:completed.length,reopenedTickets:reopened.size,
        reopeningRate:resolvedIds.size?Math.round(reopened.size/resolvedIds.size*10000)/100:null,
        firstResponse:sample(responseFirst),nextResponse:sample(responseNext),
        resolution:sample(completed.flatMap(r=>{const t=ticketMap.get(r.ticketId);return t&&time(r.at)>=time(t.created_at)?[(time(r.at)-time(t.created_at))/60000]:[];})),
        compliance:{eligible:relevant.length,onTime:within.length,rate:relevant.length?Math.round(within.length/relevant.length*10000)/100:null,byKind},
        meetings:{scheduled:scheduled.length,held:scheduled.filter(m=>m.status==='held').length,noShow:scheduled.filter(m=>m.status==='no_show').length,cancelled:scheduled.filter(m=>m.status==='cancelled').length,pending:scheduled.filter(m=>m.status==='scheduled').length},
        tasksCompleted:doneIds.size,humanInteractions:messages.filter(m=>inPeriod(m,'created_at',start,end)).length,
        followupsRecorded:followups.filter(f=>inPeriod(f,'created_at',start,end)).length,
        satisfaction:{n:answers.length,average:answers.length?Math.round(answers.reduce((sum:number,a:any)=>sum+a.score,0)/answers.length*100)/100:null,sharedOnly:user.role==='mentor'},
        renewal:{eligible:eligibleCycles.length,renewed:renewedCycles.length,rate:eligibleCycles.length?Math.round(renewedCycles.length/eligibleCycles.length*10000)/100:null}};
    };
    const current=cohort(window.startAt,window.endAt),previous=cohort(window.previousStartAt,window.startAt);
    const active=scoped.filter(e=>e.status==='active'&&time(e.starts_at)<=time(now));
    const overdueEvents=events.filter(s=>ticketMap.get(s.ticket_id)?.status!=='resolved'&&!s.fulfilled_at&&!s.paused_at&&time(s.due_at)<time(now));
    const overdueTicketIds=new Set(overdueEvents.map(s=>s.ticket_id));
    const waiting=tickets.filter(t=>t.status!=='resolved'&&events.some(s=>s.ticket_id===t.id&&['first','next'].includes(s.kind)&&!s.fulfilled_at&&!s.paused_at));
    const taskOverdue=tasks.filter(t=>!['done','cancelled','submitted'].includes(t.status)&&t.due_at&&time(t.due_at)<time(now));
    const stagnant=active.filter(e=>time(now)-time(e.last_contact_at||e.starts_at)>e.followup_days*86400e3);
    const portfolio=active.map(e=>{const a=owner(e.id),withoutRecentContact=stagnant.some(item=>item.id===e.id);
      return {enrollmentId:e.id,clientId:e.client_id,clientName:e.clientName,programName:e.programName,programId:e.program_id,
        mentorId:a?.mentor_id||null,mentorName:a?.mentorName||'Sem responsável',lastContactAt:e.last_contact_at,
        dueAt:new Date(time(e.last_contact_at||e.starts_at)+e.followup_days*86400e3).toISOString(),followupDays:e.followup_days,
        withoutRecentContact,reason:withoutRecentContact?(e.last_contact_at?'Prazo de acompanhamento excedido':'Sem contato registrado desde o início do ciclo'):'Dentro do prazo de acompanhamento',
        actionUrl:`/journey/enrollments/${e.id}`};}).sort((a,b)=>a.clientName.localeCompare(b.clientName,'pt-BR'));
    const followupQueue=portfolio.filter(e=>e.withoutRecentContact).sort((a,b)=>time(a.dueAt)-time(b.dueAt));
    const queue=tickets.filter(t=>t.status!=='resolved').map(t=>{
      const e=enrollMap.get(t.enrollment_id)!;const a=owner(e.id);const pending=overdueEvents.filter(s=>s.ticket_id===t.id);
      return {id:t.id,enrollmentId:e.id,clientName:e.clientName,subject:t.subject,status:t.status,priority:t.priority,mentorId:a?.mentor_id||null,mentorName:a?.mentorName||'Sem responsável',overdue:overdueTicketIds.has(t.id),
        reasons:pending.map(s=>slaLabels[s.kind]+' vencida'),oldestDueAt:pending.map(s=>s.due_at).sort((a,b)=>time(a)-time(b))[0]||null,actionUrl:`/tickets/${t.id}`};
    }).sort((a,b)=>Number(b.overdue)-Number(a.overdue)||time(a.oldestDueAt||now)-time(b.oldestDueAt||now));
    const byMentor=Array.from(new Set(assignments.filter(a=>ids.includes(a.enrollment_id)).map(a=>a.mentor_id))).filter(id=>user.role==='admin'||id===user.id).map(id=>{
      const a=assignments.find(a=>a.mentor_id===id)!;const portfolio=active.filter(e=>assignments.some(row=>row.enrollment_id===e.id&&row.mentor_id===id));const portfolioIds=portfolio.map(e=>e.id);
      return {mentorId:id,name:a.mentorName,capacity:a.capacity,activeEnrollments:portfolio.length,coverageEnrollments:portfolio.filter(e=>assignments.some(row=>row.enrollment_id===e.id&&row.mentor_id===id&&row.kind==='coverage')).length,
        overdueTickets:tickets.filter(t=>portfolioIds.includes(t.enrollment_id)&&overdueTicketIds.has(t.id)).length,withoutRecentContact:stagnant.filter(e=>portfolioIds.includes(e.id)).length,
        approvedAbsence:absences.some(a=>a.mentor_id===id),urgentOpenTickets:tickets.filter(t=>portfolioIds.includes(t.enrollment_id)&&t.status!=='resolved'&&t.priority==='urgent').length};
    });
    return {period:{...window,updatedAt:now.toISOString()},current,previous,
      snapshot:{activeEnrollments:active.length,uniqueActiveClients:new Set(active.map(e=>e.client_id)).size,openTickets:queue.length,waitingTickets:waiting.length,overdueTickets:overdueTicketIds.size,
        overdueObligations:overdueEvents.length,overdueTasks:taskOverdue.length,withoutRecentContact:stagnant.length,activePlans:plans.filter(p=>p.status==='active').length},
      queue,portfolio,followupQueue,byMentor,programs:Array.from(new Map(enrolled.map(e=>[e.program_id,{id:e.program_id,name:e.programName}])).values()),
      clients:enrolled.filter(e=>(!input.programId||e.program_id===input.programId)&&(!input.mentorId||assignments.some(a=>a.enrollment_id===e.id&&a.mentor_id===input.mentorId)))
        .map(e=>({enrollmentId:e.id,name:e.clientName,programName:e.programName,startsAt:e.starts_at,endsAt:e.ends_at})),
      definitions:['Períodos usam datas de São Paulo, início inclusivo e fim exclusivo; comparação com o intervalo imediatamente anterior de igual duração.',
        'Fila e atrasos abertos retratam a situação atual de toda a carteira autorizada, inclusive assuntos antigos; não são limitados à data de abertura do período.',
        'Contratações ativas e acompanhamento consideram situação ativa e início da vigência até a consulta. O prazo de acompanhamento usa dias corridos do programa desde o último contato registrado ou o início do ciclo. Cada card abre sua lista, mantendo empresa e programa selecionados.',
        'Cumprimento: obrigações com vencimento já ocorrido no período ou cumprimento no período; cumpridas no prazo e sem violação / elegíveis. Obrigações pausadas sem violação ficam fora do denominador.',
        'Primeira e próximas respostas: minutos úteis de eventos cumpridos por mensagem pública humana no mesmo instante; mediana e p90 interpolados, com amostra. Usa o calendário atualmente configurado no programa.',
        'Resolução: minutos corridos desde a abertura original até cada resolução registrada no período. Reabertura: assuntos resolvidos na coorte que tiveram reabertura posterior até esta consulta / assuntos distintos resolvidos na coorte.',
        'Reuniões são agrupadas pela data prevista de início; tarefas contam uma vez por período quando houve conclusão auditada, mesmo se depois reabertas. Registros antigos sem auditoria usam a conclusão preservada. Interações humanas contam mensagens públicas da equipe, sem notas internas ou automações.',
        'Satisfação usa as últimas avaliações dos respondentes criadas no período, com amostra e escala de 1 a 5. Mentores recebem somente avaliações compartilhadas; não há comparação entre amostras de visibilidade diferente.',
        'Renovação: ciclos com situação encerrada e fim de vigência no período, vinculados a um novo ciclo / ciclos encerrados elegíveis. Cancelados ficam fora. Ciclos que ainda não foram encerrados não entram no denominador.',
        'Carteira por mentor considera atribuições vigentes na consulta, incluindo coberturas. Linhas de mentores podem compartilhar contratações; seus totais não devem ser somados. Não é ranking de qualidade.']};
  }
  async csv(user:User,input:Filters){
    const r=await this.operations(user,input);
    const rows:unknown[][]=[['Relatório operacional','De','Até','Atualizado'],['Carteira autorizada',r.period.from,r.period.to,r.period.updatedAt],
      ['Indicador','Resultado','Amostra/unidade'],['Contratações ativas atuais',r.snapshot.activeEnrollments,'contratações'],['Empresas únicas ativas',r.snapshot.uniqueActiveClients,'empresas'],
      ['Atendimentos abertos atuais',r.snapshot.openTickets,'assuntos'],['Atendimentos vencidos atuais',r.snapshot.overdueTickets,'assuntos'],
      ['Primeira resposta mediana',r.current.firstResponse.medianMinutes,`${r.current.firstResponse.n} respostas; minutos úteis`],['Primeira resposta p90',r.current.firstResponse.p90Minutes,`${r.current.firstResponse.n} respostas; minutos úteis`],
      ['Próxima resposta mediana',r.current.nextResponse.medianMinutes,`${r.current.nextResponse.n} respostas; minutos úteis`],['Cumprimento de prazo',r.current.compliance.rate,`${r.current.compliance.eligible} obrigações; %`],
      ['Reabertura da coorte',r.current.reopeningRate,`${r.current.resolvedTickets} assuntos resolvidos; %`],['Reuniões realizadas',r.current.meetings.held,'início previsto no período'],['Tarefas concluídas',r.current.tasksCompleted,'conclusão no período'],
      ['Acompanhamentos registrados',r.current.followupsRecorded,'registros humanos no período'],
      ['Satisfação média',r.current.satisfaction.average,`${r.current.satisfaction.n} avaliações; escala 1 a 5; ${r.current.satisfaction.sharedOnly?'somente compartilhadas':'todas autorizadas'}`],
      ['Renovação de ciclos encerrados',r.current.renewal.rate,`${r.current.renewal.renewed} renovados / ${r.current.renewal.eligible} elegíveis; %`],
      [],['Cliente','Assunto','Situação','Responsável atual','Motivos de atraso','Prazo mais antigo']];
    const statuses:Record<string,string>={new:'Novo',waiting_mentor:'Aguardando mentor',in_progress:'Em tratamento',waiting_mentee:'Aguardando mentorado',reopened:'Reaberto'};
    for(const q of r.queue)rows.push([q.clientName,q.subject,statuses[q.status]||q.status,q.mentorName,q.reasons.join(' | '),q.oldestDueAt]);
    rows.push([],['Contratações ativas','Programa','Responsável atual','Acompanhamento','Prazo de acompanhamento']);
    for(const e of r.portfolio)rows.push([e.clientName,e.programName,e.mentorName,e.reason,e.dueAt]);
    rows.push([],['Mentor','Contratações ativas','Capacidade','Coberturas','Urgências abertas','Ausência aprovada agora']);
    for(const m of r.byMentor)rows.push([m.name,m.activeEnrollments,m.capacity,m.coverageEnrollments,m.urgentOpenTickets,m.approvedAbsence?'Sim':'Não']);
    rows.push([],['Critérios']);for(const d of r.definitions)rows.push([d]);return reportCsv(rows);
  }
}
@Controller('api/reports')
class ReportsController {
  constructor(@Inject(ReportsService)private readonly service:ReportsService){}
  @Get('operations') operations(@Req()req:any,@Query()q:unknown){return this.service.operations(req.user,filters.parse(q));}
  @Get('operations/export.csv') async csv(@Req()req:any,@Query()q:unknown,@Res()res:any){const body=await this.service.csv(req.user,filters.parse(q));res.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="relatorio-operacional.csv"').header('Cache-Control','private, no-store').send(body);}
}
@Module({controllers:[ReportsController],providers:[ReportsService]})
export class ReportsModule{}
