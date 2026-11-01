import {DateTime} from 'luxon';
export type Calendar = {timezone:string;days:number[];startHour:number;endHour:number;holidays:string[]};
export const defaultCalendar:Calendar={timezone:'America/Sao_Paulo',days:[1,2,3,4,5],startHour:9,endHour:18,holidays:[]};
function valid(c:Calendar){if(!c.days.length||c.startHour<0||c.endHour>24||c.startHour>=c.endHour||!DateTime.now().setZone(c.timezone).isValid)throw new Error('Calendário inválido');}
export function addBusinessMinutes(start:Date|string, minutes:number, c:Calendar=defaultCalendar):Date {
 valid(c); if(minutes<0||!Number.isFinite(minutes)) throw new Error('Prazo inválido');
 let at=DateTime.fromJSDate(new Date(start)).setZone(c.timezone); let left=minutes;
 for(let guard=0;guard<3660;guard++){
  if(!c.days.includes(at.weekday)||c.holidays.includes(at.toISODate()!)){at=at.plus({days:1}).startOf('day').set({hour:c.startHour});continue;}
  const begin=at.startOf('day').plus({hours:c.startHour});const end=at.startOf('day').plus({hours:c.endHour});
  if(at<begin)at=begin;if(at>=end){at=at.plus({days:1}).startOf('day').plus({hours:c.startHour});continue;}
  const available=end.diff(at,'minutes').minutes;
  if(left<=available)return at.plus({minutes:left}).toUTC().toJSDate();
  left-=available;at=at.plus({days:1}).startOf('day').plus({hours:c.startHour});
 }
 throw new Error('Calendário sem disponibilidade');
}
export function businessMinutesBetween(start:Date|string,end:Date|string,c:Calendar=defaultCalendar):number {
 valid(c);let at=DateTime.fromJSDate(new Date(start)).setZone(c.timezone);const until=DateTime.fromJSDate(new Date(end)).setZone(c.timezone);let total=0;
 for(let guard=0;at<until&&guard<3660;guard++){
  if(c.days.includes(at.weekday)&&!c.holidays.includes(at.toISODate()!)){
   const begin=at.startOf('day').plus({hours:c.startHour});const finish=at.startOf('day').plus({hours:c.endHour});
   const a=at>begin?at:begin;const b=until<finish?until:finish;if(b>a)total+=b.diff(a,'minutes').minutes;
  }at=at.plus({days:1}).startOf('day');
 }return total;
}
