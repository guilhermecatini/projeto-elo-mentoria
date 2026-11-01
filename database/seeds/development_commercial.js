const {randomUUID}=require('node:crypto');
exports.seed=async k=>{
 if(process.env.NODE_ENV==='production')throw new Error('Dados demonstrativos são proibidos em produção.');
 if(!process.env.DEMO_PASSWORD||process.env.DEMO_PASSWORD.length<12)throw new Error('Defina DEMO_PASSWORD de desenvolvimento.');
 const owner=await k('users').where({email:'admin@demo.local',role:'admin'}).first();if(!owner)throw new Error('Execute development.js primeiro.');
 const names=['Lead recebido','Em qualificação','Diagnóstico agendado','Diagnóstico realizado','Proposta enviada','Negociação','Ganho','Perdido'];
 await k.transaction(async trx=>{await trx('organizations').where({id:owner.organization_id}).forUpdate().first();const existing=await trx('commercial_stages').where({organization_id:owner.organization_id});
 const rows=names.map((name,position)=>({id:randomUUID(),organization_id:owner.organization_id,name,position,kind:position===6?'won':position===7?'lost':'open'})).filter(row=>!existing.length||(row.kind!=='open'&&!existing.some(stage=>stage.kind===row.kind))||(row.position===0&&!existing.some(stage=>stage.kind==='open'&&stage.active)));
 if(rows.length)await trx('commercial_stages').insert(rows);});
};
