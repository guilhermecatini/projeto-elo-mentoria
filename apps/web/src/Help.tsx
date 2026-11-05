import { Disclosure } from './components/ui/disclosure';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, Clock3, Copy, Info, ListChecks, Printer, Search, X } from 'lucide-react';
import { Button } from './components/ui/button';
import type { User } from './lib/api';
import { helpArticles, helpCategories, helpLearningPaths, helpReadingMinutes, helpRoles, searchHelpArticles, type HelpArticle } from './help-content';
import './help.css';

export function Help({ route, user, go, notify }: { route: string; user: User; go: (path: string) => void; notify: (message: string) => void }) {
  const params = new URLSearchParams(route.split('?')[1]);
  const routeQuery = params.get('q') || '';
  const category = helpCategories.some(item => item.id === params.get('category')) ? params.get('category') || '' : '';
  const articleId = route.split('?')[0].split('/')[2] || '';
  const [query, setQuery] = useState(routeQuery);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setQuery(routeQuery); }, [routeQuery]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (articleId) heading.current?.focus({ preventScroll: true });
  }, [articleId]);
  const available = useMemo(() => helpArticles.filter(article => article.roles.includes(user.role)), [user.role]);
  const results = useMemo(() => searchHelpArticles(query, user.role, category), [query, user.role, category]);
  const article = available.find(item => item.id === articleId);
  const learningPath = helpLearningPaths[user.role];
  const filters = new URLSearchParams();
  if (query.trim()) filters.set('q', query.trim());
  if (category) filters.set('category', category);
  const suffix = filters.size ? `?${filters}` : '';
  const articleHref = (id: string) => `#/help/${id}${suffix}`;
  const openCategory = (id: string) => {
    const next = new URLSearchParams();
    if (query.trim()) next.set('q', query.trim());
    if (id) next.set('category', id);
    go(`/help${next.size ? `?${next}` : ''}`);
  };

  return <div className="help">
    <div className="help-screen">
      <div className="page-title help-page-title"><div><span className="eyebrow">MANUAL DO ELO MENTORIA</span><h1>Central de ajuda</h1><p>Um passo de cada vez. Encontre a orientação para fazer do jeito certo.</p></div><span className="help-profile"><BookOpen size={16} />Guias para {helpRoles[user.role]}</span></div>
      {!articleId ? <>
        <section className="help-hero" aria-labelledby="help-welcome"><div className="help-hero-copy"><span className="help-kicker"><BookOpen size={17} />SEU GUIA, DO PRIMEIRO ACESSO À ROTINA</span><h2 id="help-welcome">Como podemos ajudar<br />no seu próximo passo?</h2><p>Aprenda a usar o sistema com roteiros, instruções e exemplos do seu dia a dia.</p></div><div className="help-hero-mark" aria-hidden="true"><BookOpen size={92} strokeWidth={1} /><span>Clareza para começar.<br />Confiança para continuar.</span></div>
          <form className="help-search" role="search" aria-label="Buscar no manual" onSubmit={event => { event.preventDefault(); go(`/help${suffix}`); }}><Search size={21} /><input aria-label="O que você quer aprender?" type="search" placeholder="Busque uma dúvida: enviar tarefa, publicar ata…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" className="icon-button" aria-label="Limpar busca do manual" onClick={() => { setQuery(''); const next = category ? `?category=${category}` : ''; go(`/help${next}`); }}><X size={18} /></button>}<Button type="submit">Buscar</Button></form>
        </section>
        {!query.trim() && !category && <section className="help-learning" aria-labelledby="help-learning-title"><div className="help-section-heading"><div><span className="eyebrow">PRIMEIROS PASSOS</span><h2 id="help-learning-title">Seu roteiro para começar</h2><p>{learningPath.title}.</p></div><a href="#/help/conheca-o-elo">Sou novo no Elo <ArrowRight size={16} /></a></div><ol className="help-learning-list">{learningPath.articles.map((id, index) => {
          const guide = available.find(item => item.id === id)!;
          return <li key={id}><a href={articleHref(id)}><span className="help-learning-number">{String(index + 1).padStart(2, '0')}</span><span>{guide.title}</span><ArrowRight size={17} /></a></li>;
        })}</ol></section>}
        <div className="help-section-heading help-library-heading"><div><span className="eyebrow">CONSULTE QUANDO PRECISAR</span><h2>Explore o manual</h2><p>Os guias apresentados correspondem ao seu perfil de acesso.</p></div><Button variant="outline" onClick={() => window.print()}><Printer size={16} />Imprimir manual do meu perfil</Button></div>
        <div className="help-library"><nav className="help-category-nav" aria-label="Capítulos do manual"><button aria-current={!category ? 'page' : undefined} onClick={() => openCategory('')}><BookOpen size={16} />Todos os capítulos<span>{available.length}</span></button>{helpCategories.map(item => <button key={item.id} aria-current={category === item.id ? 'page' : undefined} onClick={() => openCategory(item.id)}>{item.title}<span>{available.filter(article => article.category === item.id).length}</span></button>)}</nav><div className="help-results">
          <p className="help-result-count" role="status">{results.length} {results.length === 1 ? 'guia encontrado' : 'guias encontrados'}{query.trim() ? ` para “${query.trim()}”` : ''}</p>
          {!results.length ? <section className="help-empty"><Search size={30} /><h3>Nenhum guia encontrado</h3><p>Tente uma palavra mais simples, como “tarefa”, ou consulte todos os capítulos.</p><Button variant="outline" onClick={() => { setQuery(''); go('/help'); }}>Limpar busca e filtros</Button></section> : query.trim() ? <div className="help-search-results">{results.map(item => <ArticleLink key={item.id} article={item} href={articleHref(item.id)} />)}</div> : helpCategories.filter(item => !category || category === item.id).map(item => <section className="help-chapter" key={item.id} aria-labelledby={`help-chapter-${item.id}`}><div className="help-chapter-heading"><h3 id={`help-chapter-${item.id}`}>{item.title}</h3><p>{item.description}</p></div>{results.filter(article => article.category === item.id).map(guide => <ArticleLink key={guide.id} article={guide} href={articleHref(guide.id)} />)}</section>)}
        </div></div>
        <div className="help-bottom-note"><Info size={20} /><p><strong>Não sabe por onde começar?</strong> Leia “Entenda o sistema antes de começar” ou consulte “Resolva as dificuldades mais comuns”. Para conferir acessos e cadastros, procure a administração da sua mentoria.</p><a href="#/help/problemas-frequentes">Ver dúvidas frequentes <ArrowRight size={16} /></a></div>
      </> : article ? <>
        <nav className="help-breadcrumb" aria-label="Localização no manual"><a href={`#/help${suffix}`}>Todos os guias</a><ChevronRight size={14} /><a href={`#/help?category=${article.category}`}>{helpCategories.find(item => item.id === article.category)?.title}</a></nav>
        <div className="help-reading-layout"><aside className="help-reading-nav"><a className="help-back" href={`#/help${suffix}`}><ArrowLeft size={16} />Voltar ao manual</a><nav aria-label="Guias do seu perfil">{helpCategories.map(item => <div key={item.id}><h2>{item.title}</h2>{available.filter(guide => guide.category === item.id).map(guide => <a key={guide.id} href={articleHref(guide.id)} aria-current={guide.id === article.id ? 'page' : undefined}>{guide.title}</a>)}</div>)}</nav></aside>
          <div className="help-reading-main"><article className="help-article"><header><div className="help-article-meta"><span>{helpCategories.find(item => item.id === article.category)?.title}</span><span><Clock3 size={14} />{helpReadingMinutes(article)} min de leitura</span></div><h2 ref={heading} tabIndex={-1}>{article.title}</h2><p className="help-article-summary">{article.summary}</p><div className="help-article-tools"><Button size="sm" variant="outline" onClick={async () => { try { const url = new URL(location.href); url.hash = `/help/${article.id}`; await navigator.clipboard.writeText(url.toString()); notify('Link do guia copiado.'); } catch { notify('Não foi possível copiar. Você pode copiar o endereço do navegador.'); } }}><Copy size={15} />Copiar link</Button><Button size="sm" variant="outline" onClick={() => window.print()}><Printer size={15} />Imprimir guia</Button><span>{article.roles.map(role => helpRoles[role]).join(' · ')}</span></div></header>
            <ArticleBody article={article} withContents />
            {article.action && <div className="help-article-action"><p>Pronto para colocar em prática?</p><Button onClick={() => go(article.action!.route)}>{article.action.label}<ArrowRight size={16} /></Button></div>}
          </article>
          <section className="help-related" aria-labelledby="help-related-title"><h2 id="help-related-title">Continue aprendendo</h2><div>{article.related.map(id => available.find(item => item.id === id)).filter((item): item is HelpArticle => Boolean(item)).map(item => <ArticleLink key={item.id} article={item} href={articleHref(item.id)} />)}</div></section>
          <nav className="help-pagination" aria-label="Sequência de leitura">{available.indexOf(article) > 0 ? <a href={articleHref(available[available.indexOf(article) - 1].id)}><ArrowLeft size={17} /><span><small>Guia anterior</small>{available[available.indexOf(article) - 1].title}</span></a> : <span />}{available.indexOf(article) < available.length - 1 && <a href={articleHref(available[available.indexOf(article) + 1].id)}><span><small>Próximo guia</small>{available[available.indexOf(article) + 1].title}</span><ArrowRight size={17} /></a>}</nav>
          </div>
        </div>
      </> : <section className="help-empty"><BookOpen size={32} /><h2>Este guia não está disponível para seu perfil</h2><p>Escolha uma orientação no manual do seu perfil de acesso.</p><Button onClick={() => go('/help')}>Voltar à Central de ajuda</Button></section>}
    </div>
    <div className="help-print"><header><p>Elo Mentoria · Manual de uso</p><h1>{article ? article.title : `Manual para ${helpRoles[user.role]}`}</h1><p>Orientações passo a passo · Conteúdo correspondente às funcionalidades desta versão.</p></header>{(article ? [article] : available).map(item => <article key={item.id}><h2>{item.title}</h2><p>{item.summary}</p><ArticleBody article={item} /></article>)}</div>
  </div>;
}

function ArticleLink({ article, href }: { article: HelpArticle; href: string }) {
  return <a className="help-article-link" href={href}><span className="help-guide-icon"><BookOpen size={19} /></span><span><strong>{article.title}</strong><span>{article.summary}</span><small><Clock3 size={12} />{helpReadingMinutes(article)} min · {article.steps.length} passos</small></span><ChevronRight size={18} /></a>;
}

function ArticleBody({ article, withContents = false }: { article: HelpArticle; withContents?: boolean }) {
  return <div className="help-article-body">
    {!!article.prerequisites.length && <section className="help-prerequisites"><h3><ListChecks size={18} />Antes de começar</h3><ul>{article.prerequisites.map(item => <li key={item}>{item}</li>)}</ul></section>}
    {withContents && <Disclosure className="help-contents" title={`Neste guia · ${article.steps.length} passos`}><ol>{article.steps.map((step, index) => <li key={step.title}><button onClick={() => { const target = document.getElementById(`help-step-${index}`); target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); target?.focus({ preventScroll: true }); }}>{step.title}</button></li>)}</ol></Disclosure>}
    <ol className="help-steps">{article.steps.map((step, index) => <li key={step.title}><span className="help-step-number" aria-hidden="true">{index + 1}</span><div><h3 id={withContents ? `help-step-${index}` : undefined} tabIndex={withContents ? -1 : undefined}>{step.title}</h3><p>{step.text}</p></div></li>)}</ol>
    <section className="help-expected"><h3><CheckCircle2 size={19} />Como saber que deu certo</h3><p>{article.expected}</p></section>
    {article.notes?.map(note => <aside className="help-note" key={note.title}><Info size={18} /><div><h3>{note.title}</h3><p>{note.text}</p></div></aside>)}
  </div>;
}
