import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {db,migrationDb} from './db';
import {hash,token} from './auth';
import {defaultCalendar} from './calendar';
const root=resolve(__dirname,'../../..');
async function main(){const command=process.argv[2];
 if(command==='migrate'){const k=migrationDb();try{const result=await k.migrate.latest({directory:resolve(root,'database/migrations')});console.log('Migrations aplicadas:',result[1].length);}finally{await k.destroy();}}
 else if(command==='seed'){const k=migrationDb();try{await k.seed.run({directory:resolve(root,'database/seeds')});}finally{await k.destroy();}}
 else if(command==='bootstrap'){
  const email=process.env.ADMIN_EMAIL?.toLowerCase();if(!email||!email.includes('@'))throw new Error('Defina ADMIN_EMAIL.');const existing=await db('users').where({email}).first();if(existing){console.log('Administrador já existe. Credenciais preservadas.');return;}
  const raw=token();await db.transaction(async trx=>{let org=await trx('organizations').first();if(!org){org={id:randomUUID(),name:process.env.ORGANIZATION_NAME||'Minha mentoria'};await trx('organizations').insert(org);await trx('programs').insert({id:randomUUID(),organization_id:org.id,name:'Mentoria · 90 dias',calendar:JSON.stringify(defaultCalendar)});}const id=randomUUID();await trx('users').insert({id,organization_id:org.id,name:process.env.ADMIN_NAME||'Administrador',email,role:'admin'});await trx('access_tokens').insert({hash:hash(raw),user_id:id,purpose:'bootstrap',expires_at:new Date(Date.now()+24*3600e3)});});console.log(`Acesso inicial de uso único (24 horas): ${process.env.APP_ORIGIN}/ativar?token=${raw}`);
 }else if(command==='worker-health'){const h=await db('worker_heartbeats').where({id:'reconciler'}).first();if(!h||Date.now()-new Date(h.last_seen_at).getTime()>120000)throw new Error('Worker sem sinal recente.');}
 else if(command==='reconcile'){await (await import('./reconcile')).reconcile();console.log('Reconciliação concluída.');}
 else throw new Error('Comando esperado: migrate, seed, bootstrap, worker-health ou reconcile.');
}main().then(()=>db.destroy()).catch(async e=>{console.error(e.message);await db.destroy();process.exitCode=1;});
