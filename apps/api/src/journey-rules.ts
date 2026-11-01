export type JourneySignal = { code:string; label:string; severity:'attention'|'incomplete'; actionUrl:string; dueAt?:string|null };
export function summarizeSatisfaction(rows:{score:number;context_type:string}[]) {
  const aggregate=(items:typeof rows)=>({n:items.length,average:items.length?Number((items.reduce((sum,item)=>sum+item.score,0)/items.length).toFixed(2)):null});
  return {...aggregate(rows),ticket:aggregate(rows.filter(r=>r.context_type==='ticket')),cycle:aggregate(rows.filter(r=>r.context_type==='cycle'))};
}
export function capacityState(capacity:number|null,load:number) { return capacity===null?'not_informed':load>capacity?'over_capacity':load===capacity?'at_capacity':'within_capacity'; }
export function intervalOverlap(aStart:Date|string,aEnd:Date|string,bStart:Date|string,bEnd:Date|string) { return new Date(aStart)<new Date(bEnd)&&new Date(bStart)<new Date(aEnd); }
export function evaluateJourneyHealth(input:{id:string;status:string;startsAt:string|Date;endsAt:string|Date;lastContactAt?:string|Date|null;followupDays:number;reviewedAt?:string|Date|null;primaryMentor:boolean;hasDiagnosis:boolean;hasPlan:boolean;hasSharedFeedback:boolean;signals?:JourneySignal[]},now=new Date()) {
  const reasons:JourneySignal[]=[...(input.signals||[])]; const root=`/journey/enrollments/${input.id}`;
  if (input.status!=='active'||new Date(input.startsAt)>now) return {status:'historical' as const,reasons:[],checkedAt:now.toISOString(),ruleWindowDays:90};
  if (!input.primaryMentor) reasons.push({code:'missing_mentor',label:'Sem mentor principal vigente',severity:'attention',actionUrl:root});
  const overdue=new Date(new Date(input.lastContactAt||input.startsAt).getTime()+input.followupDays*86400000);
  if (overdue<now) reasons.push({code:'missing_followup',label:'Sem acompanhamento relevante no intervalo do programa',severity:'attention',actionUrl:root,dueAt:overdue.toISOString()});
  if (new Date(input.endsAt).getTime()<=now.getTime()+30*86400000&&(!input.reviewedAt||new Date(input.reviewedAt).getTime()<new Date(input.endsAt).getTime()-30*86400000)) reasons.push({code:'ending_without_review',label:'Ciclo próximo do fim sem revisão recente',severity:'attention',actionUrl:root+'?tab=review',dueAt:new Date(input.endsAt).toISOString()});
  if (!input.hasDiagnosis) reasons.push({code:'missing_diagnosis',label:'Diagnóstico publicado ainda não informado',severity:'incomplete',actionUrl:`/diagnoses?enrollmentId=${input.id}`});
  if (!input.hasPlan) reasons.push({code:'missing_plan',label:'Plano ativo ainda não informado',severity:'incomplete',actionUrl:`/plans?enrollmentId=${input.id}`});
  if (!input.hasSharedFeedback) reasons.push({code:'missing_satisfaction',label:'Sem avaliação de satisfação disponível no período',severity:'incomplete',actionUrl:root+'?tab=satisfaction'});
  return {status:reasons.some(r=>r.severity==='attention')?'attention' as const:reasons.length?'incomplete' as const:'no_active_signals' as const,reasons,checkedAt:now.toISOString(),ruleWindowDays:90};
}
