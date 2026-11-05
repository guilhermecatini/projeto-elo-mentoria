import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { helpArticles, helpCategories, helpLearningPaths, helpRoles, type HelpRole } from '../apps/web/src/help-content';

const lines = [
  '# Manual de uso do Elo Mentoria',
  '',
  'Guia passo a passo para quem está começando. Na plataforma, abra **Central de ajuda** no menu ou no botão de ajuda do cabeçalho. A central oferece busca, roteiros por perfil, links para as telas e impressão.',
  '',
  'Este manual reúne os três perfis. Na central, cada pessoa encontra os guias correspondentes ao próprio acesso. Antes de registrar uma informação, confira sempre empresa, programa e vigência da contratação.',
  '',
  '## Roteiros para começar',
  '',
  '- [Entenda o sistema antes de começar](#conheca-o-elo)',
  '- [Ative seu acesso e entre na plataforma](#primeiro-acesso)',
  '- [Encontre as telas e confira o contexto](#navegacao)',
  '',
];
for (const role of Object.keys(helpRoles) as HelpRole[]) {
  lines.push(`### ${helpRoles[role]}`, '', helpLearningPaths[role].title + '.', '');
  helpLearningPaths[role].articles.forEach((id, index) => {
    const article = helpArticles.find(item => item.id === id)!;
    lines.push(`${index + 1}. [${article.title}](#${id})`);
  });
  lines.push('');
}
lines.push('## Índice por assunto', '');
for (const category of helpCategories) {
  lines.push(`### ${category.title}`, '', category.description, '');
  helpArticles.filter(article => article.category === category.id).forEach(article => lines.push(`- [${article.title}](#${article.id})`));
  lines.push('');
}
for (const category of helpCategories) {
  lines.push(`## ${category.title}`, '');
  for (const article of helpArticles.filter(item => item.category === category.id)) {
    lines.push(`<a id="${article.id}"></a>`, '', `### ${article.title}`, '', article.summary, '', `**Para quem:** ${article.roles.map(role => helpRoles[role]).join(', ')}.`, '');
    if (article.prerequisites.length) lines.push('**Antes de começar**', '', ...article.prerequisites.map(item => `- ${item}`), '');
    article.steps.forEach((step, index) => lines.push(`${index + 1}. **${step.title}.** ${step.text}`, ''));
    lines.push('**Como saber que deu certo:** ' + article.expected, '');
    article.notes?.forEach(note => lines.push(`> **${note.title}:** ${note.text}`, ''));
    if (article.action) lines.push(`**Onde praticar:** na plataforma, abra #${article.action.route} (${article.action.label}).`, '');
    lines.push('**Continue aprendendo**', '', ...article.related.map(id => {
      const related = helpArticles.find(item => item.id === id)!;
      return `- [${related.title}](#${id})`;
    }), '');
  }
}
lines.push('---', '', 'Documento gerado a partir de `apps/web/src/help-content.ts`, a mesma fonte da Central de ajuda. Após atualizar as instruções, execute `npm run docs:manual` para regenerar este arquivo. Não inclua dados de clientes, senhas ou credenciais nos exemplos.', '');
const target = fileURLToPath(new URL('../docs/manual-usuario.md', import.meta.url));
const output = lines.join('\n');
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) throw new Error('Manual desatualizado. Execute npm run docs:manual.');
  console.log(`Manual sincronizado: ${helpArticles.length} guias.`);
} else {
  writeFileSync(target, output, 'utf8');
  console.log(`Manual gerado: ${helpArticles.length} guias em docs/manual-usuario.md.`);
}
