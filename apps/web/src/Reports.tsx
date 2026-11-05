import {PersonName} from './components/Avatar';
import { Disclosure } from './components/ui/disclosure';
import { useMotionRegion } from './lib/use-motion-region';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {BarChart3,Download,ArrowRight,LoaderCircle,Info} from 'lucide-react';
import {api,type User} from './lib/api';
import {Button} from './components/ui/button';
import './reports.css';

type Props={route:string;user:User;go:(url:string)=>void;notify:(message:string)=>void};
type Sample={n:number;medianMinutes:number|null;p90Minutes:number|null};
type Summary={ticketsCreated:number;resolvedTickets:number;resolutionEpisodes:number;reopenedTickets:number;reopeningRate:number|null;
  firstResponse:Sample;nextResponse:Sample;resolution:Sample;compliance:{eligible:number;onTime:number;rate:number|null;byKind:{kind:string;label:string;eligible:number;onTime:number;rate:number|null}[]};
  meetings:{scheduled:number;held:number;noShow:number;cancelled:number;pending:number};tasksCompleted:number;humanInteractions:number;followupsRecorded:number;
  satisfaction:{n:number;average:number|null;sharedOnly:boolean};renewal:{eligible:number;renewed:number;rate:number|null}};
type Portfolio={enrollmentId:string;clientId:string;clientName:string;programName:string;programId:string;mentorId:string|null;mentorName:string; mentorAvatarUrl?: string | null;lastContactAt:string|null;dueAt:string;followupDays:number;withoutRecentContact:boolean;reason:string;actionUrl:string};
type Report={period:{from:string;to:string;previousFrom:string;previousTo:string;updatedAt:string};current:Summary;previous:Summary;
  snapshot:{activeEnrollments:number;uniqueActiveClients:number;openTickets:number;waitingTickets:number;overdueTickets:number;overdueObligations:number;overdueTasks:number;withoutRecentContact:number;activePlans:number};
  queue:{id:string;enrollmentId:string;clientName:string;subject:string;status:string;priority:string;mentorName:string; mentorAvatarUrl?: string | null;overdue:boolean;reasons:string[];oldestDueAt:string|null;actionUrl:string}[];
  portfolio:Portfolio[];followupQueue:Portfolio[];
  byMentor:{mentorId:string;name:string;avatarUrl?:string|null;capacity:number;activeEnrollments:number;coverageEnrollments:number;overdueTickets:number;withoutRecentContact:number;approvedAbsence:boolean;urgentOpenTickets:number}[];
  programs:{id:string;name:string}[];clients:{enrollmentId:string;name:string;programName:string;startsAt:string;endsAt:string}[];definitions:string[]};
type View='portfolio'|'open'|'overdue'|'followups';
const viewLabels:Record<View,string>={portfolio:'Contratações ativas',open:'Atendimentos abertos',overdue:'Atendimentos vencidos',followups:'Sem acompanhamento recente'};
const statuses:Record<string,string>={new:'Novo',waiting_mentor:'Aguardando mentor',in_progress:'Em tratamento',waiting_mentee:'Aguardando mentorado',reopened:'Reaberto'};
function today(){const p=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Sao_Paulo'}).formatToParts(new Date());return `${p.find(v=>v.type==='year')!.value}-${p.find(v=>v.type==='month')!.value}-${p.find(v=>v.type==='day')!.value}`;}
const shifted=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const number=(v:number|null|undefined,suffix='')=>v===null||v===undefined?'Não informado':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(v)+suffix;
const date=(v:string)=>new Date(v.length===10?v+'T12:00:00Z':v).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
const moment=(v:string)=>new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

export function Reports({route,user,go}:Props){
  const initial=new URLSearchParams(route.split('?')[1]);
  const [from,setFrom]=useState(initial.get('from')||shifted(today(),-29)),[to,setTo]=useState(initial.get('to')||today());
  const [programId,setProgram]=useState(initial.get('programId')||''),[enrollmentId,setEnrollment]=useState(initial.get('enrollmentId')||''),[view,setView]=useState<View>('open');
  const params=new URLSearchParams({from,to,...programId?{programId}:{},...enrollmentId?{enrollmentId}:{}});
  const report=useQuery({queryKey:['operational-report',from,to,programId,enrollmentId],queryFn:()=>api<Report>('/reports/operations?'+params),enabled:user.role!=='mentee'&&!!from&&!!to,refetchInterval:60000});
  if(user.role==='mentee')return <div className="empty"><h2>Seus resultados estão na evolução da empresa</h2><Button onClick={()=>go('/indicators')}>Abrir indicadores</Button></div>;
  const r=report.data;
  function openView(next:View){setView(next);document.getElementById('reports-action-list')?.scrollIntoView({behavior:'smooth',block:'start'});}
  const cards=r?[
    {view:'portfolio' as const,value:r.snapshot.activeEnrollments,hint:`${r.snapshot.uniqueActiveClients} empresas únicas. Ver cada contratação.`},
    {view:'open' as const,value:r.snapshot.openTickets,hint:`${r.snapshot.waitingTickets} com resposta da equipe pendente e prazo em andamento.`},
    {view:'overdue' as const,value:r.snapshot.overdueTickets,hint:`${r.snapshot.overdueObligations} obrigações vencidas ainda abertas.`},
    {view:'followups' as const,value:r.snapshot.withoutRecentContact,hint:'Prazo de acompanhamento do programa ultrapassado.'},
  ]:[];
  return <div className="reports-page"><div className="page-title"><div><span className="eyebrow">OPERAÇÃO COM CONTEXTO</span><h1>Relatórios gerenciais</h1><p>Compare períodos equivalentes e abra as listas que explicam a situação da carteira.</p></div><BarChart3/></div>
    <section className="panel reports-filters"><label className="field"><span>De</span><input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label className="field"><span>Até</span><input type="date" value={to} min={from} max={today()} onChange={e=>setTo(e.target.value)}/></label>
      <label className="field"><span>Programa</span><select value={programId} onChange={e=>{setProgram(e.target.value);setEnrollment('');}}><option value="">Todos os programas autorizados</option>{r?.programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="field"><span>Empresa / contratação</span><select value={enrollmentId} onChange={e=>setEnrollment(e.target.value)}><option value="">Toda a carteira autorizada</option>{r?.clients.map(c=><option key={c.enrollmentId} value={c.enrollmentId}>{c.name} · {c.programName} · {date(c.startsAt)} a {date(c.endsAt)}</option>)}</select></label></section>
    {report.error&&<div className="error-box" role="alert">{report.error.message}</div>}
    {report.isPending?<div className="loading"><LoaderCircle className="spin"/>Preparando relatório…</div>:r&&<>
      <div className="reports-context"><p>{date(from)} a {date(to)} · anterior: {date(r.period.previousFrom)} a {date(r.period.previousTo)}<small>Consulta em {moment(r.period.updatedAt)} · horários de São Paulo</small></p><a className="indicator-download" href={'/api/reports/operations/export.csv?'+params} download><Download size={16}/>Baixar relatório CSV</a></div>
      <h2>Situação atual da carteira</h2><p className="reports-hint">As listas mantêm os filtros de programa e empresa. Pendências antigas continuam aparecendo enquanto estiverem abertas.</p>
      <div className="reports-cards">{cards.map(card=><button key={card.view} className={'panel reports-card'+(view===card.view?' selected':'')} aria-pressed={view===card.view} onClick={()=>openView(card.view)}><span>{viewLabels[card.view]}</span><strong>{card.value}</strong><small>{card.hint}</small><span className="reports-card-link">Ver lista <ArrowRight size={13}/></span></button>)}</div>
      <p className="reports-hint reports-current-extra">No mesmo escopo atual: {r.snapshot.activePlans} planos ativos · {r.snapshot.overdueTasks} tarefas em execução atrasadas. Entregas aguardando revisão não contam como atraso de execução.</p>
      <ActionList report={r} view={view} onView={setView} go={go}/>
      <section className="panel reports-section"><div className="panel-heading"><div><h2>Respostas e cumprimento de prazos</h2><p>Mediana e p90 com tamanho de amostra. Respostas usam minutos úteis; resolução usa minutos corridos.</p></div></div><div className="table-scroll"><table><thead><tr><th>Indicador</th><th>Período selecionado</th><th>Período anterior</th></tr></thead><tbody>
        {(['firstResponse','nextResponse','resolution'] as const).map((key,index)=><tr key={key}><th>{['Primeira resposta','Próximas respostas','Resolução desde a abertura original'][index]}</th>{(['current','previous'] as const).map(period=><td key={period}>Mediana: {number(r[period][key].medianMinutes,' min')}<small>p90: {number(r[period][key].p90Minutes,' min')} · n={r[period][key].n} {index===2?'resoluções':'respostas'}</small></td>)}</tr>)}
        {r.current.compliance.byKind.map(kind=><tr key={kind.kind}><th>Cumprimento · {kind.label}</th>{(['current','previous'] as const).map(period=>{const item=r[period].compliance.byKind.find(k=>k.kind===kind.kind);return <td key={period}>{number(item?.rate,'%')}<small>{item?.onTime||0} no prazo / {item?.eligible||0} obrigações elegíveis</small></td>;})}</tr>)}
      </tbody></table></div></section>
      <PeriodResults report={r}/>
      <section className="panel reports-section"><div className="panel-heading"><div><h2>Satisfação e renovação</h2><p>Amostras e denominadores acompanham os resultados. As notas usam escala de 1 a 5.</p></div></div><div className="table-scroll"><table><thead><tr><th>Indicador e base</th><th>Período selecionado</th><th>Período anterior</th></tr></thead><tbody>
        <tr><th>Satisfação média<small>{r.current.satisfaction.sharedOnly?'Somente avaliações compartilhadas com o mentor':'Todas as avaliações autorizadas da carteira'}</small></th>{(['current','previous'] as const).map(period=><td key={period}>{number(r[period].satisfaction.average)}{r[period].satisfaction.average!==null?' / 5':''}<small>n={r[period].satisfaction.n} avaliações</small></td>)}</tr>
        <tr><th>Renovação de ciclos encerrados<small>Ciclos encerrados com fim da vigência no intervalo; cancelados excluídos.</small></th>{(['current','previous'] as const).map(period=><td key={period}>{number(r[period].renewal.rate,'%')}<small>{r[period].renewal.renewed} renovados / {r[period].renewal.eligible} ciclos elegíveis</small></td>)}</tr>
      </tbody></table></div><p className="reports-section-note">Amostras pequenas ou diferentes precisam de contexto. As avaliações não são somadas com resultados financeiros nem usadas para classificar mentores.</p></section>
      <section className="panel reports-section"><div className="panel-heading"><div><h2>Carteira e carga atuais</h2><p>Atribuições vigentes, incluindo coberturas. Uma contratação pode aparecer em mais de uma linha; não some os totais por mentor.</p></div><Button variant="outline" onClick={()=>go('/journey/capacity')}>Ver capacidade e ausências</Button></div><div className="table-scroll"><table><thead><tr><th>Mentor</th><th>Contratações / capacidade</th><th>Em cobertura</th><th>Urgências abertas</th><th>Vencidos</th><th>Sem contato recente</th><th>Disponibilidade atual</th></tr></thead><tbody>{r.byMentor.map(m=><tr key={m.mentorId}><th><PersonName name={m.name} src={m.avatarUrl} /></th><td>{m.activeEnrollments} / {number(m.capacity)}</td><td>{m.coverageEnrollments}</td><td>{m.urgentOpenTickets}</td><td>{m.overdueTickets}</td><td>{m.withoutRecentContact}</td><td><span className={'badge '+(m.approvedAbsence?'amber':'neutral')}>{m.approvedAbsence?'Ausência aprovada agora':'Sem ausência aprovada agora'}</span></td></tr>)}</tbody></table>{!r.byMentor.length&&<p className="small-empty">Nenhum mentor com atribuição vigente neste escopo.</p>}</div></section>
      {enrollmentId&&<div className="reports-shortcuts"><Button variant="outline" onClick={()=>go(`/indicators?enrollmentId=${enrollmentId}`)}>Resultados e metas desta contratação</Button><Button variant="outline" onClick={()=>go(`/journey/enrollments/${enrollmentId}`)}>Abrir esta jornada</Button></div>}
      <Disclosure className="panel reports-definitions" title={<><Info size={17}/>Critérios e limites deste relatório</>}>{r.definitions.map(d=><p key={d}>{d}</p>)}</Disclosure>
    </>}
  </div>;
}

function ActionList({report,view,onView,go}:{report:Report;view:View;onView:(value:View)=>void;go:Props['go']}){
  const listMotion=useMotionRegion(view);
  const contracts=view==='portfolio'||view==='followups';
  const portfolio=view==='followups'?report.followupQueue:report.portfolio;
  const tickets=report.queue.filter(row=>view!=='overdue'||row.overdue);
  return <section ref={listMotion} id="reports-action-list" className="panel reports-section reports-action-list"><div className="panel-heading"><div><h2>{viewLabels[view]}</h2><p>{contracts?`${portfolio.length} contratações nos filtros selecionados, mesmo sem chamados.`:`${tickets.length} atendimentos nos filtros selecionados.`}</p></div><select aria-label="Lista do indicador atual" value={view} onChange={e=>onView(e.target.value as View)}>{Object.entries(viewLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div><div className="table-scroll">
    {contracts?<table><thead><tr><th>Empresa e programa</th><th>Responsável atual</th><th>Motivo</th><th>Prazo de acompanhamento</th><th>Ação</th></tr></thead><tbody>{portfolio.map(row=><tr key={row.enrollmentId}><td><strong>{row.clientName}</strong><small>{row.programName}</small></td><td><PersonName name={row.mentorName} src={row.mentorAvatarUrl} /></td><td>{row.reason}<small>{row.lastContactAt?`Último contato: ${moment(row.lastContactAt)}`:'Nenhum contato registrado'}</small></td><td>{moment(row.dueAt)}<small>{row.followupDays} dias corridos após contato ou início do ciclo</small></td><td><button className="text-button" onClick={()=>go(row.actionUrl)}>Abrir jornada <ArrowRight size={13}/></button></td></tr>)}</tbody></table>:<table><thead><tr><th>Empresa e assunto</th><th>Responsável atual</th><th>Situação</th><th>Motivo e prazo</th><th>Ação</th></tr></thead><tbody>{tickets.map(row=><tr key={row.id}><td><strong>{row.clientName}</strong><small>{row.subject}{row.priority==='urgent'?' · urgente':''}</small></td><td><PersonName name={row.mentorName} src={row.mentorAvatarUrl} /></td><td><span className={'badge '+(row.overdue?'red':'neutral')}>{statuses[row.status]||'Em acompanhamento'}</span></td><td>{row.reasons.join('; ')||'Acompanhar próximo passo'}<small>{row.oldestDueAt?`Prazo mais antigo: ${moment(row.oldestDueAt)}`:'Sem prazo vencido aberto'}</small></td><td><button className="text-button" onClick={()=>go(row.actionUrl)}>Abrir atendimento <ArrowRight size={13}/></button></td></tr>)}</tbody></table>}
    {!(contracts?portfolio:tickets).length&&<p className="small-empty">Nenhum registro nesta lista com os filtros selecionados.</p>}
  </div></section>;
}
function PeriodResults({report:r}:{report:Report}){
  const metrics=[['Atendimentos criados no período',r.current.ticketsCreated,r.previous.ticketsCreated],['Assuntos resolvidos no período',r.current.resolvedTickets,r.previous.resolvedTickets],
    ['Mensagens públicas humanas da equipe',r.current.humanInteractions,r.previous.humanInteractions],['Acompanhamentos registrados',r.current.followupsRecorded,r.previous.followupsRecorded],
    ['Reuniões previstas no período',r.current.meetings.scheduled,r.previous.meetings.scheduled],['Reuniões realizadas',r.current.meetings.held,r.previous.meetings.held],
    ['Reuniões sem comparecimento',r.current.meetings.noShow,r.previous.meetings.noShow],['Reuniões canceladas',r.current.meetings.cancelled,r.previous.meetings.cancelled],
    ['Reuniões com resultado pendente',r.current.meetings.pending,r.previous.meetings.pending],['Tarefas concluídas ao menos uma vez',r.current.tasksCompleted,r.previous.tasksCompleted]] as const;
  return <section className="panel reports-section"><div className="panel-heading"><div><h2>Atividades do período</h2><p>Contagens da mentoria. Tarefas reabertas preservam a conclusão auditada; lojas e taxas financeiras não são somadas.</p></div></div><div className="reports-results">{metrics.map(([label,current,previous])=><div key={label}><span>{label}</span><strong>{number(current)}</strong><small>Anterior: {number(previous)}</small></div>)}<div><span>Reabertura dos assuntos resolvidos na coorte</span><strong>{number(r.current.reopeningRate,'%')}</strong><small>{r.current.reopenedTickets} reabertos / {r.current.resolvedTickets} assuntos resolvidos</small><small>Anterior: {number(r.previous.reopeningRate,'%')} · {r.previous.reopenedTickets} / {r.previous.resolvedTickets} assuntos</small></div></div></section>;
}
