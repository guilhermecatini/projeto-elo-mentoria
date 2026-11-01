import {BadRequestException} from '@nestjs/common';
import {DateTime} from 'luxon';

export function reportWindow(from:string,to:string,now=new Date()) {
  const zone='America/Sao_Paulo';
  const start=DateTime.fromISO(from,{zone}).startOf('day'),last=DateTime.fromISO(to,{zone}).startOf('day');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!start.isValid||!last.isValid)
    throw new BadRequestException('Informe datas válidas para o período.');
  const days=Math.round(last.diff(start,'days').days)+1;
  if(days<1||days>366)throw new BadRequestException('Escolha um período de um a 366 dias.');
  if(last>DateTime.fromJSDate(now,{zone}).startOf('day'))throw new BadRequestException('Consulte resultados até a data de hoje.');
  const end=last.plus({days:1}),previousStart=start.minus({days});
  return {from,to,days,timeZone:zone,startAt:start.toUTC().toISO()!,endAt:end.toUTC().toISO()!,
    previousFrom:previousStart.toISODate()!,previousTo:start.minus({days:1}).toISODate()!,previousStartAt:previousStart.toUTC().toISO()!};
}
export function percentile(values:number[],fraction:number) {
  const sorted=values.filter(x=>Number.isFinite(x)&&x>=0).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const at=(sorted.length-1)*fraction,low=Math.floor(at),high=Math.ceil(at);
  return Math.round((sorted[low]+(sorted[high]-sorted[low])*(at-low))*100)/100;
}
export function sample(values:number[]) {
  const clean=values.filter(x=>Number.isFinite(x)&&x>=0);
  return {n:clean.length,medianMinutes:percentile(clean,.5),p90Minutes:percentile(clean,.9)};
}
export function safeReportCell(value:unknown) {
  let text=String(value??'');
  if(/^[\s\u0000-\u001f\u007f]*[=+@-]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function reportCsv(rows:unknown[][]) {return '\uFEFF'+rows.map(row=>row.map(safeReportCell).join(';')).join('\r\n')+'\r\n';}
