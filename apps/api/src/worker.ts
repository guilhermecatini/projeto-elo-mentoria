import 'reflect-metadata';
import 'dotenv/config';
import {Queue,Worker} from 'bullmq';
import Redis from 'ioredis';
import {db} from './db';
import {reconcile} from './reconcile';
async function main(){
 const connection=new Redis(process.env.REDIS_URL||'redis://localhost:6379',{maxRetriesPerRequest:null});
 const queue=new Queue('elo-operations',{connection:connection as any});
 const worker=new Worker('elo-operations',async()=>reconcile(),{connection:connection.duplicate() as any,concurrency:1});
 worker.on('failed',()=>console.error('Falha na reconciliação; a próxima execução tentará novamente.'));
 await reconcile();await queue.upsertJobScheduler('sla-reconciliation',{every:30000},{name:'reconcile',data:{},opts:{attempts:5,backoff:{type:'exponential',delay:1000},removeOnComplete:100,removeOnFail:100}});
 console.log('Worker de atendimento iniciado.');
 async function stop(){await worker.close();await queue.close();await connection.quit();await db.destroy();process.exit(0);}process.on('SIGTERM',stop);process.on('SIGINT',stop);
}main().catch(()=>{console.error('Não foi possível iniciar o worker. Verifique banco e fila.');process.exit(1);});
