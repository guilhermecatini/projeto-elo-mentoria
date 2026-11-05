import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { helpArticles, helpCategories, helpLearningPaths, searchHelpArticles, type HelpRole } from '../src/help-content';

test('todos os guias e roteiros apontam para conteúdo existente e disponível ao perfil', () => {
  assert.equal(new Set(helpArticles.map(article => article.id)).size, helpArticles.length);
  for (const article of helpArticles) {
    assert.match(article.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(helpCategories.some(category => category.id === article.category));
    assert.ok(article.roles.length > 0);
    assert.ok(article.steps.length >= 4);
    assert.ok(article.expected.trim());
    for (const id of article.related) assert.ok(helpArticles.some(item => item.id === id), `${article.id}: vínculo inexistente ${id}`);
  }
  for (const role of ['admin', 'mentor', 'mentee'] as HelpRole[]) {
    for (const id of helpLearningPaths[role].articles) assert.ok(helpArticles.find(article => article.id === id)?.roles.includes(role), `${role}: guia inacessível ${id}`);
    for (const category of helpCategories) assert.ok(helpArticles.some(article => article.category === category.id && article.roles.includes(role)), `${role}: capítulo vazio ${category.id}`);
  }
});

test('a busca ignora acentos e caixa, busca no procedimento e combina as palavras', () => {
  assert.deepEqual(searchHelpArticles('DIAGNOSTICO', 'mentor').map(article => article.id), searchHelpArticles('diagnóstico', 'mentor').map(article => article.id));
  assert.ok(searchHelpArticles('publicar ata', 'mentor').some(article => article.id === 'publicar-ata'));
  assert.ok(searchHelpArticles('64 KiB', 'mentor').some(article => article.id === 'importar-csv'));
  assert.ok(!searchHelpArticles('ata', 'admin').some(article => article.id === 'financeiro-mentoria'), 'ata não deve corresponder apenas a um trecho de contratação');
  assert.equal(searchHelpArticles('uma-palavra-inexistente', 'admin').length, 0);
  assert.equal(searchHelpArticles('  ', 'mentee').length, helpArticles.filter(article => article.roles.includes('mentee')).length);
});

test('busca e capítulos respeitam o perfil e priorizam o título', () => {
  const results = searchHelpArticles('recebimentos', 'admin');
  assert.equal(results[0].id, 'financeiro-mentoria');
  assert.ok(!searchHelpArticles('recebimentos', 'mentee').some(article => article.id === 'financeiro-mentoria'));
  const categoryResults = searchHelpArticles('', 'mentor', 'reunioes');
  assert.ok(categoryResults.length > 0);
  assert.ok(categoryResults.every(article => article.category === 'reunioes' && article.roles.includes('mentor')));
});

test('atalhos dos guias apontam para módulos existentes e permitidos', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const adminOnly = ['commercial', 'integrations', 'users', 'programs', 'mentors'];
  for (const article of helpArticles) {
    if (!article.action) continue;
    const module = article.action.route.split(/[/?]/)[1];
    assert.ok(app.includes(`active === '${module}'`), `${article.id}: módulo desconhecido ${module}`);
    if (adminOnly.includes(module)) assert.deepEqual(article.roles, ['admin']);
    if (module === 'reports') assert.ok(!article.roles.includes('mentee'));
  }
});
