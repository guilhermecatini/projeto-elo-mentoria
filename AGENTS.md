# Diretrizes do projeto

## Experiência de uso e transições

O usuário deseja que o sistema tenha transições suaves e consistentes para tornar
a navegação mais fluida, agradável e confortável. Trate essa preferência como uma
diretriz permanente ao criar ou modificar a interface.

- Inclua transições nas mudanças de tela, abas, menus, diálogos, expansões e estados
  interativos, sempre que ajudarem a pessoa a perceber a mudança e manter o contexto.
- Use movimentos sutis, rápidos e coerentes com o estilo do Elo. Aproveite os padrões
  e tempos de transição existentes para manter a consistência entre os módulos.
- Preserve a resposta imediata dos controles e a leitura do conteúdo. Evite efeitos
  que atrasem ações, desloquem o layout ou distraiam durante o uso.
- Respeite `prefers-reduced-motion`, reduzindo ou desativando movimentos conforme
  a preferência da pessoa, e preserve a navegação por teclado e o foco acessível.
- Confira a fluidez e o desempenho tanto no computador quanto no celular ao alterar
  animações ou transições.

### Padrão implementado na interface

- Centralize tempos, curvas e efeitos em `apps/web/src/motion.css`.
- Use `useMotionRegion`, de `apps/web/src/lib/use-motion-region.ts`, para mudanças
  de conteúdo de abas. Anime o nó existente; preserve campos e rascunhos sem criar
  chaves de React apenas para repetir uma animação.
- Reutilize `Disclosure` e `Collapse` nas áreas expansíveis. Mantenha os campos de
  formulários montados ao recolher seções, preservando seus valores e sua associação
  com o formulário.
- Reutilize o componente `Dialog`. Para diálogos que o componente pai remove ao
  fechar, use `useDialogDismiss` para permitir a saída antes da desmontagem.
- Buscas, filtros e atualizações periódicas não devem repetir a animação da página
  inteira. Reserve a transição de navegação para mudanças de página ou de modo.
