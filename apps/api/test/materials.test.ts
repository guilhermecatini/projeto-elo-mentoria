import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialContentSchema,materialChunks,materialHash,materialExcerpt} from '../src/material-content';
test('materiais validam fonte HTTPS e não aceitam HTML como URL ou credenciais',()=>{
  assert.equal(materialContentSchema.parse({title:'Orientação',link:'https://example.org/documento'}).link,'https://example.org/documento');
  assert.equal(materialContentSchema.parse({title:'Orientação',link:''}).link,'');
  for(const link of ['não é um link','javascript:alert(1)','http://example.org','https://usuario:senha@example.org'])assert.equal(materialContentSchema.safeParse({title:'Orientação',link}).success,false);
});
test('texto ausente permanece vazio e rascunho exige título e limites explícitos',()=>{
  const content=materialContentSchema.parse({title:'Orientação'});assert.equal(content.body,'');assert.equal(content.fileId,null);
  assert.equal(materialContentSchema.safeParse({title:' '}).success,false);assert.equal(materialContentSchema.safeParse({title:'Teste',body:'x'.repeat(30001)}).success,false);
});
test('fragmentos preservam Unicode, sobreposição e a fonte pode ser reconstruída',()=>{
  const content=materialContentSchema.parse({title:'Orientação',body:'📦'.repeat(2800)}),chunks=materialChunks(content);
  assert.ok(chunks.length>1);assert.ok(chunks.every(chunk=>!chunk.includes('\ufffd')));
  assert.equal(Array.from(chunks[0]).slice(1000).join(''),Array.from(chunks[1]).slice(0,200).join(''));
  const reconstructed=chunks[0]+chunks.slice(1).map(chunk=>Array.from(chunk).slice(200).join('')).join('');assert.equal(reconstructed,content.title+'\n'+content.body);
});
test('hash inclui versão de conteúdo e trechos retornam texto sem interpretar marcação',()=>{
  const a=materialContentSchema.parse({title:'Margem',body:'Custos e frete precisam ser conferidos.'});
  assert.equal(materialHash(a),materialHash({...a}));assert.notEqual(materialHash(a),materialHash({...a,body:a.body+' Outro dado.'}));
  assert.ok(materialExcerpt(a.body,'frete').includes('frete'));assert.equal(materialExcerpt('<script>texto</script>','texto'),'<script>texto</script>');
});
