import {createHash} from 'node:crypto';
import {z} from 'zod';
export const materialContentSchema = z.object({
  title:z.string().trim().min(1).max(200), body:z.string().trim().max(30000).default(''),
  indication:z.string().trim().max(2000).default(''), tags:z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  link:z.union([z.url().max(2048).refine(value=>{if(!URL.canParse(value))return false;const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;},'Use HTTPS sem credenciais.'),z.literal('')]).default(''),
  fileId:z.string().uuid().nullable().default(null),
}).strict();
export type MaterialContent=z.infer<typeof materialContentSchema>;
export function materialHash(content:MaterialContent){
  return createHash('sha256').update(JSON.stringify([content.title,content.body,content.indication,content.tags,content.link,content.fileId])).digest('hex');
}
export function materialChunks(content:MaterialContent){
  const text=[content.title,content.indication,content.body,content.tags.join(' ')].filter(Boolean).join('\n');
  const chars=Array.from(text),chunks:string[]=[];
  for(let start=0;start<chars.length;start+=1000)chunks.push(chars.slice(start,start+1200).join(''));
  return chunks;
}
export function materialExcerpt(content:string,query:string){
  const match=content.toLocaleLowerCase('pt-BR').indexOf(query.toLocaleLowerCase('pt-BR'));
  const start=Math.max(0,match-70); return (start?'…':'')+content.slice(start,start+260)+(start+260<content.length?'…':'');
}
