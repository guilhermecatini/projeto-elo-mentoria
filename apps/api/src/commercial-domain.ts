import {BadRequestException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {DateTime} from 'luxon';
import {z} from 'zod';
export const commercialMoney = z.string().trim().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/, 'Use um valor em reais com até duas casas decimais.')
  .refine(value => Number(value) <= 1e12, 'O valor excede o limite permitido.').transform(value => {const [a,b='']=value.split('.');return `${a}.${b.padEnd(2,'0')}`;});
export const commercialDiagnosis = z.object({sellerSituation:z.string().trim().max(4000).default(''),maturity:z.enum(['not_informed','starting','organizing','scaling']).default('not_informed'),
  reportedRevenueBand:z.string().trim().max(200).default(''),difficulties:z.string().trim().max(6000).default(''),objective:z.string().trim().max(6000).default('')}).strict();
export function cents(value:string){const [a,b='']=value.split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));}
export function reais(value:bigint){const sign=value<0n?'-':'';const abs=value<0n?-value:value;return `${sign}${abs/100n}.${String(abs%100n).padStart(2,'0')}`;}
export function totalMoney(values:(string|null|undefined)[]){const informed=values.filter((x):x is string=>x!==null&&x!==undefined);return informed.length?reais(informed.reduce((n,x)=>n+cents(x),0n)):null;}
function canonical(value:any):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export function commercialHash(value:unknown){return createHash('sha256').update(canonical(value)).digest('hex');}
export function commercialDate(value:string,now=new Date()){const day=DateTime.fromISO(value,{zone:'America/Sao_Paulo'});if(!day.isValid||day.toISODate()!==value)throw new BadRequestException('Informe uma data válida.');if(value>DateTime.fromJSDate(now).setZone('America/Sao_Paulo').toISODate()!)throw new BadRequestException('O registro não pode ter data futura.');return value;}
export function reportWindow(from:string,to:string){const start=DateTime.fromISO(from,{zone:'America/Sao_Paulo'}).startOf('day'),end=DateTime.fromISO(to,{zone:'America/Sao_Paulo'}).plus({days:1}).startOf('day');const days=end.diff(start,'days').days;if(!start.isValid||!end.isValid||days<=0||days>366)throw new BadRequestException('Escolha um intervalo de até 366 dias, com início anterior ao fim.');return {start:start.toJSDate(),end:end.toJSDate(),days};}
export function median(values:number[]){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return Math.round((sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2)*100)/100;}
export function commercialCsv(rows:unknown[][]){const cell=(x:unknown)=>{let s=String(x??'Não informado');if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';}
export const DEFAULT_COMMERCIAL_STAGES=['Lead recebido','Em qualificação','Diagnóstico agendado','Diagnóstico realizado','Proposta enviada','Negociação','Ganho','Perdido'];
