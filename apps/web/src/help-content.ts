export type HelpRole = 'admin' | 'mentor' | 'mentee';
export const helpRoles: Record<HelpRole, string> = { admin: 'Administração', mentor: 'Mentor', mentee: 'Mentorado' };
export const helpCategories = [
  { id: 'inicio', title: 'Comece por aqui', description: 'Conheça o Elo, ative seu acesso e encontre sua rotina.' },
  { id: 'atendimento', title: 'Clientes e atendimentos', description: 'Organize a carteira, converse e acompanhe cada retorno.' },
  { id: 'execucao', title: 'Diagnósticos, planos e tarefas', description: 'Transforme a análise em ações, entregas e revisão.' },
  { id: 'reunioes', title: 'Reuniões e atas', description: 'Prepare o encontro e registre o que ficou combinado.' },
  { id: 'resultados', title: 'Indicadores e metas', description: 'Registre, publique e acompanhe os resultados mensais.' },
  { id: 'jornada', title: 'Jornada e relacionamento', description: 'Cuide da entrada, das revisões e dos próximos ciclos.' },
  { id: 'gestao', title: 'Materiais e gestão', description: 'Compartilhe orientações e organize a operação da mentoria.' },
  { id: 'referencia', title: 'Dúvidas e referência', description: 'Entenda alertas, termos e soluções para dificuldades comuns.' },
] as const;
export type HelpCategory = typeof helpCategories[number]['id'];
export type HelpArticle = {
  id: string;
  category: HelpCategory;
  title: string;
  summary: string;
  roles: HelpRole[];
  prerequisites: string[];
  steps: { title: string; text: string }[];
  expected: string;
  notes?: { title: string; text: string }[];
  related: string[];
  action?: { label: string; route: string };
};
const everyone: HelpRole[] = ['admin', 'mentor', 'mentee'];
const staff: HelpRole[] = ['admin', 'mentor'];

// Fonte única da Central de ajuda e do manual gerado por npm run docs:manual.
// Ao mudar uma tela, confira os rótulos e os procedimentos correspondentes aqui.
export const helpArticles: HelpArticle[] = [
  {
    id: 'conheca-o-elo', category: 'inicio', title: 'Entenda o sistema antes de começar', roles: everyone,
    summary: 'O que é o Elo, como as informações se conectam e por onde começar.',
    prerequisites: ['Ter recebido da empresa de mentoria o endereço da plataforma e a indicação do seu perfil.'],
    steps: [
      { title: 'Entenda o objetivo', text: 'O Elo organiza o acompanhamento da mentoria: dúvidas, avaliações da operação, planos de ação, tarefas, reuniões e resultados. Os dados das lojas são informados pela equipe; não presuma que vieram automaticamente do Mercado Livre.' },
      { title: 'Identifique seu perfil', text: 'Administração configura a operação e gerencia a organização. Mentor acompanha a carteira que lhe foi atribuída. Mentorado acompanha sua empresa, envia dúvidas e executa suas tarefas. Seu nome e perfil aparecem no menu lateral.' },
      { title: 'Diferencie empresa e contratação', text: 'Empresa é o cadastro do cliente. Contratação é um ciclo de mentoria dessa empresa, com programa, vigência e mentor. A mesma empresa pode ter vários ciclos. Antes de registrar qualquer informação, confira empresa, programa e datas do ciclo selecionado.' },
      { title: 'Conheça a sequência de trabalho', text: 'A entrada confere contexto e acessos. O diagnóstico identifica prioridades. O plano organiza ações. As tarefas registram execução e evidências. Reuniões e atendimentos mantêm o acompanhamento. Indicadores e revisões ajudam a decidir os próximos passos e a renovação.' },
      { title: 'Siga o roteiro do seu perfil', text: 'Volte ao início desta Central de ajuda e siga a trilha “Seu roteiro para começar”. Depois, consulte os demais guias conforme a atividade. A busca desta central procura no manual; a busca do cabeçalho da plataforma procura atendimentos.' },
    ],
    expected: 'Você sabe qual é seu papel, consegue distinguir a empresa do ciclo e entende a ordem básica de uso.',
    notes: [{ title: 'Informações compartilhadas', text: 'Rascunhos de diagnósticos, atas, resultados e materiais ficam na preparação da equipe. Quando aplicável, é preciso publicar para compartilhar com o mentorado. Notas internas de atendimento são reservadas à equipe; intervenções e notas comerciais são reservadas à administração.' }],
    related: ['primeiro-acesso', 'navegacao', 'glossario'], action: { label: 'Abrir meu painel', route: '/dashboard' },
  },
  {
    id: 'primeiro-acesso', category: 'inicio', title: 'Ative seu acesso e entre na plataforma', roles: everyone,
    summary: 'Use o convite, defina sua senha e saiba como pedir recuperação de acesso.',
    prerequisites: ['Receber da administração um link privado de ativação, ainda válido e não utilizado.'],
    steps: [
      { title: 'Abra o link recebido', text: 'Use o endereço completo enviado pela administração. O convite funciona uma única vez. Se o endereço não tiver convite, estiver vencido ou já tiver sido usado, peça um novo link à administração.' },
      { title: 'Defina sua senha', text: 'Em “Nova senha (mínimo de 12 caracteres)”, digite uma senha própria e repita em “Confirme a nova senha”. Clique em “Definir senha”. Guarde-a de forma segura.' },
      { title: 'Conclua a autenticação adicional, se solicitada', text: 'Se aparecer “Proteja seu acesso administrativo”, adicione a chave apresentada ao seu aplicativo autenticador. Digite o código de seis dígitos e clique em “Confirmar e ativar”. Guarde a chave com segurança para recuperar seu autenticador.' },
      { title: 'Entre no Elo', text: 'Quando aparecer “Seu acesso está pronto.”, clique em “Ir para o login”. Preencha seu e-mail e senha. Se sua conta usa autenticação em duas etapas, abra “Usar código de autenticação em duas etapas”, informe o código atual e clique em “Entrar na plataforma”.' },
      { title: 'Confira seu acesso', text: 'Verifique o nome e perfil no menu. Caso sua empresa ou carteira não apareça, solicite à administração a conferência do vínculo. Para sair em um computador compartilhado, use “Sair da plataforma”, junto ao seu nome.' },
    ],
    expected: 'O painel abre com seu nome e com os recursos permitidos para seu perfil.',
    notes: [{ title: 'Esqueceu a senha?', text: 'Peça à administração para usar “Recuperar acesso” em “Usuários e acessos”. O link é compartilhado pela administração; não há envio automático por e-mail nesta versão. A recuperação de um administrador único sem acesso exige suporte do responsável técnico.' }],
    related: ['navegacao', 'problemas-frequentes'],
  },
  {
    id: 'navegacao', category: 'inicio', title: 'Encontre as telas e confira o contexto', roles: everyone,
    summary: 'Aprenda a usar o menu, os filtros, os atalhos e a Central de ajuda.',
    prerequisites: ['Estar conectado à plataforma.'],
    steps: [
      { title: 'Comece pelo painel', text: 'A página inicial se chama “Visão da operação” para Administração, “Meu dia” para Mentor e “Minha evolução” para Mentorado. Os cartões e as prioridades levam aos registros que precisam de atenção.' },
      { title: 'Use o menu de acompanhamento', text: 'Escolha a atividade no menu lateral. No celular, toque no botão “Abrir navegação” no cabeçalho. Os itens disponíveis dependem do seu perfil. Comercial, integrações, programas e acessos são administrativos.' },
      { title: 'Selecione a empresa e o ciclo', text: 'Nos filtros de contratação, confira empresa, programa e vigência. Uma renovação gera outro ciclo; os registros anteriores continuam vinculados ao ciclo de origem. Não escolha apenas pelo nome da empresa.' },
      { title: 'Ajuste e confira os filtros', text: 'Se uma lista parecer vazia, limpe a busca, amplie o período e confira situação e contratação. Registros arquivados, concluídos ou de ciclos antigos podem depender de filtros de histórico.' },
      { title: 'Volte ao manual quando precisar', text: 'Abra “Central de ajuda” no menu ou no botão de ajuda do cabeçalho. Pesquise uma atividade, como “publicar ata” ou “enviar tarefa”. Cada guia tem passos, resultado esperado e links para continuar. Você pode copiar o link de um guia ou imprimir a leitura.' },
    ],
    expected: 'Você encontra a tela desejada e consegue confirmar a qual empresa e ciclo cada registro pertence.',
    related: ['conheca-o-elo', 'alertas', 'problemas-frequentes'], action: { label: 'Abrir meu painel', route: '/dashboard' },
  },
  {
    id: 'meu-perfil', category: 'inicio', title: 'Atualize seu perfil, sua foto e seus dados de acesso', roles: everyone,
    summary: 'Edite seus dados pessoais e cuide da foto, do e-mail e da senha da sua conta.',
    prerequisites: ['Estar conectado com sua própria conta. Para alterar senha ou e-mail, tenha a senha atual e o autenticador, quando ativo.'],
    steps: [
      { title: 'Abra seu perfil', text: 'Clique em “Meu perfil” no menu, no seu nome no rodapé da navegação ou no avatar do cabeçalho. O perfil é da pessoa conectada; permissões e vínculos continuam sob gestão da administração.' },
      { title: 'Atualize os dados pessoais', text: 'Na aba “Dados pessoais”, confira o nome completo e o telefone opcional com DDD. Clique em “Salvar alterações”. Se uma edição de outro acesso for detectada, recarregue os dados antes de tentar novamente. “Descartar alterações e recarregar” substitui o que ainda não foi salvo no formulário.' },
      { title: 'Adicione ou troque a foto', text: 'Use “Adicionar foto” ou “Escolher outra foto”. Selecione PNG, JPEG ou WEBP de até 2 MB e 20 megapixels. Na janela de recorte, arraste a imagem (ou use as setas do teclado) e ajuste o zoom. O círculo mostra o enquadramento do avatar. Clique em “Usar este recorte”, confira a prévia e finalize em “Salvar foto”. Antes de salvar, “Reajustar recorte” permite corrigir a seleção. A foto também identifica você nas mensagens de atendimentos, tarefas, reuniões e históricos que cada pessoa tem permissão para consultar. “Descartar seleção” mantém a foto anterior; “Remover foto” volta a exibir suas iniciais.' },
      { title: 'Altere a senha', text: 'Na aba “Segurança”, preencha senha atual, nova senha e confirmação. Use de 12 a 128 caracteres e informe o código do autenticador, se solicitado. Clique em “Alterar senha”. A sessão deste dispositivo é renovada e os outros acessos e links de recuperação anteriores são invalidados.' },
      { title: 'Altere o e-mail de acesso', text: 'Ainda em “Segurança”, informe o novo e-mail, a senha atual e o código do autenticador quando ativo. Confira a grafia e clique em “Atualizar e-mail”. Use o novo endereço no próximo login; os outros dispositivos precisarão entrar novamente. Não há envio automático de confirmação por e-mail nesta versão.' },
    ],
    expected: 'Os dados salvos aparecem no seu perfil; a foto recortada aparece nas suas identificações pela plataforma, e suas alterações de acesso passam a valer nos próximos logins.',
    notes: [{ title: 'Guarde seus dados de acesso', text: 'Não registre senhas ou códigos do autenticador em atendimentos, materiais ou notas. A tela não permite alterar seu papel, carteira ou empresas autorizadas.' }],
    related: ['primeiro-acesso', 'navegacao', 'problemas-frequentes'], action: {label: 'Abrir meu perfil', route: '/profile'},
  },
  {
    id: 'rotina-administracao', category: 'inicio', title: 'Roteiro de implantação para a Administração', roles: ['admin'],
    summary: 'A ordem recomendada para preparar a operação e começar a acompanhar os clientes.',
    prerequisites: ['Ter acesso de Administração. Se for a primeira conta da instalação, o responsável técnico deve concluir a preparação inicial.'],
    steps: [
      { title: 'Prepare programas e equipe', text: 'Cadastre o programa e revise expediente, feriados e prazos. Em “Usuários e acessos”, convide os mentores. Oriente cada pessoa a ativar sua própria conta.' },
      { title: 'Cadastre ou converta o cliente', text: 'Use “Adicionar cliente” em “Clientes e carteiras”, ou confirme o ganho de uma oportunidade no Comercial. Defina o programa, a vigência e o mentor principal. Não crie outro cadastro quando a empresa já existir.' },
      { title: 'Autorize o mentorado', text: 'Depois de existir a empresa, convide a pessoa com perfil Mentorado e selecione a empresa autorizada. Um e-mail de contato cadastrado no cliente não cria uma conta de acesso.' },
      { title: 'Confira a entrada', text: 'Abra o ciclo em “Jornada e relacionamento”, confira o checklist, registre entregáveis e contexto e agende o primeiro encontro. Confirme apenas os itens realmente conferidos.' },
      { title: 'Inicie o acompanhamento com o mentor', text: 'Prepare e publique o diagnóstico, crie um plano ativo e adicione tarefas com responsáveis, prazos e critérios. Combine como serão registrados atendimentos, atas e indicadores.' },
      { title: 'Estabeleça sua rotina de gestão', text: 'Acompanhe o painel, clientes sem mentor, prazos vencidos, entregas em revisão, capacidade e ciclos perto do fim. Use relatórios para investigar pendências. Registre valores contratados e recebimentos no financeiro, separadamente dos resultados das lojas.' },
    ],
    expected: 'O cliente tem ciclo, mentor, pessoas autorizadas e próximos passos registrados, e a equipe sabe onde trabalhar.',
    related: ['programas-e-prazos', 'usuarios-e-acessos', 'cadastrar-cliente', 'checklist-e-revisao'], action: { label: 'Abrir programas e prazos', route: '/programs' },
  },
  {
    id: 'rotina-mentor', category: 'inicio', title: 'Roteiro do Mentor: seu primeiro dia e sua rotina', roles: ['mentor'],
    summary: 'Organize a carteira e saiba o que conferir em cada dia de acompanhamento.',
    prerequisites: ['Ter ativado sua conta e recebido uma atribuição de carteira vigente da administração.'],
    steps: [
      { title: 'Conheça a carteira', text: 'Em “Clientes e carteiras”, abra cada empresa, confira o programa, a vigência, o contexto e o próximo passo. Se faltar um cliente esperado, peça à administração para conferir a atribuição.' },
      { title: 'Organize o dia pelas prioridades', text: 'Em “Meu dia”, abra prazos vencidos, perguntas sem resposta, tarefas bloqueadas e entregas em revisão. Na Central de alertas, use o link para tratar a causa de cada aviso.' },
      { title: 'Estruture o trabalho do cliente', text: 'Confira a entrada na Jornada, publique o diagnóstico e mantenha um plano ativo com tarefas claras. Cada tarefa precisa de uma pessoa responsável, prazo e critério de conclusão.' },
      { title: 'Registre os combinados', text: 'Responda a cada pergunta pública pelo vínculo de resposta. Registre acompanhamentos relevantes com próximo passo e prazo. Prepare reuniões, salve presenças e publique as atas após o encontro.' },
      { title: 'Revise entregas e resultados', text: 'Aprove entregas verificadas ou solicite ajustes com orientação. Registre os números do mês, confira a base e publique os resultados. Em revisões do ciclo, deixe uma síntese compartilhada e a próxima decisão.' },
      { title: 'Encerre o dia com um próximo passo', text: 'Confira promessas de retorno, pendências e próximos encontros. Avise a administração sobre necessidade de reatribuição, excesso de carga ou ausência. Solicitar ausência não cria cobertura automaticamente.' },
    ],
    expected: 'Sua carteira tem prioridades visíveis e cada cliente possui um próximo passo acompanhado.',
    related: ['responder-atendimento', 'criar-plano', 'revisar-entrega', 'publicar-ata'], action: { label: 'Abrir Meu dia', route: '/dashboard' },
  },
  {
    id: 'rotina-mentorado', category: 'inicio', title: 'Roteiro do Mentorado: comece e acompanhe sua evolução', roles: ['mentee'],
    summary: 'Saiba onde encontrar sua empresa, enviar dúvidas, cumprir tarefas e consultar resultados.',
    prerequisites: ['Ativar sua conta e ter autorização para a empresa que participa da mentoria.'],
    steps: [
      { title: 'Confira sua empresa', text: 'Abra “Minha empresa” e confira o programa, o mentor e a vigência. Se houver mais de um ciclo, confira as datas antes de acompanhar os registros.' },
      { title: 'Veja o que foi combinado', text: 'Consulte diagnósticos publicados e planos de ação. Em “Tarefas”, abra as suas tarefas, leia o critério de conclusão e observe os prazos. Você pode consultar tarefas do contexto autorizado, mas só executar as atribuídas a você.' },
      { title: 'Envie dúvidas com contexto', text: 'Em “Atendimentos”, crie um assunto por tema. Informe o que aconteceu, qual resultado esperava e o que já tentou. Acompanhe as respostas no próprio atendimento.' },
      { title: 'Execute e entregue', text: 'Inicie suas tarefas. Se houver um impedimento, informe o bloqueio. Ao terminar, registre a evidência, anexe os arquivos antes da entrega e envie para revisão. Aguarde a aprovação do mentor ou as orientações de ajuste.' },
      { title: 'Acompanhe encontros e números', text: 'Em “Reuniões”, confira horário, pauta e local/link. Depois, consulte a ata publicada. Em “Indicadores e metas”, veja a evolução e as metas disponibilizadas pela equipe. Em “Materiais”, encontre as orientações compartilhadas.' },
      { title: 'Volte ao painel e aos alertas', text: 'Abra “Minha evolução” e a Central de alertas para acompanhar avisos. Quando houver contexto disponível em “Jornada e relacionamento” → “Satisfação”, registre sua avaliação.' },
    ],
    expected: 'Você sabe onde pedir ajuda, o que precisa executar e como acompanhar os combinados e resultados.',
    related: ['abrir-atendimento', 'executar-tarefa', 'consultar-reunioes', 'consultar-evolucao'], action: { label: 'Abrir Minha evolução', route: '/dashboard' },
  },
  {
    id: 'cadastrar-cliente', category: 'atendimento', title: 'Cadastre um cliente e seu primeiro ciclo', roles: ['admin'],
    summary: 'Crie a empresa e a contratação sem confundir cadastro de cliente com acesso de usuário.',
    prerequisites: ['Ter um programa cadastrado e conhecer início e fim do ciclo. Para atribuir o mentor, ele deve estar ativo.'],
    steps: [
      { title: 'Procure a empresa primeiro', text: 'Abra “Clientes e carteiras” e busque pelo nome ou contato. Para renovar uma empresa já cadastrada, use a renovação na Jornada; evite duplicar o cliente.' },
      { title: 'Abra o cadastro', text: 'Clique em “Adicionar cliente”. Preencha “Nome da empresa”, “Pessoa de contato” e “E-mail de contato”. Confira a grafia e o contato responsável.' },
      { title: 'Defina a contratação', text: 'Escolha o programa, o mentor principal e as datas de início e fim. Se usar “Atribuir depois”, planeje resolver a pendência: o cadastro ficará sem um mentor principal.' },
      { title: 'Salve e confira', text: 'Clique em “Cadastrar cliente”. Abra o cliente e confirme a contratação, a vigência e o responsável. O histórico de responsabilidade permite conferir as atribuições.' },
      { title: 'Complete a entrada', text: 'Convide a pessoa mentorada em “Usuários e acessos”, vinculando-a à empresa. Depois, abra “Jornada, satisfação e histórico” no cliente para conferir o checklist e registrar os próximos passos.' },
    ],
    expected: 'A empresa aparece na carteira com seu ciclo. O acesso da pessoa mentorada só fica pronto depois do convite e da ativação.',
    related: ['usuarios-e-acessos', 'responsaveis-e-coberturas', 'checklist-e-revisao', 'renovar-ciclo'], action: { label: 'Abrir clientes e carteiras', route: '/clients' },
  },
  {
    id: 'registrar-acompanhamento', category: 'atendimento', title: 'Registre um acompanhamento e o próximo passo', roles: staff,
    summary: 'Documente uma interação relevante com o cliente e deixe a continuidade combinada.',
    prerequisites: ['Acesso vigente ao cliente e uma interação relevante que realmente aconteceu.'],
    steps: [
      { title: 'Abra o cliente e confira o ciclo', text: 'Entre em “Clientes e carteiras”, abra a empresa e confira programa e vigência. Leia o último contato e o próximo passo para entender o histórico recente.' },
      { title: 'Descreva a interação realizada', text: 'Clique em “Registrar acompanhamento”. Em “Resumo do acompanhamento”, registre o que foi conversado, o contexto e o resultado da interação. Evite um texto genérico que não permita compreender o contato.' },
      { title: 'Combine a continuidade', text: 'Preencha “Próximo passo combinado” e “Prazo do próximo passo”. Use o horário indicado pelo formulário e defina uma ação que permita à equipe saber como dar continuidade.' },
      { title: 'Salve e confira o registro', text: 'Clique em “Salvar registro”. Confira o acompanhamento na linha do tempo e o próximo passo na página do cliente. Se a continuidade exigir execução acompanhada, crie também uma tarefa com responsável e critério de conclusão.' },
    ],
    expected: 'O contato relevante e seu próximo passo ficam registrados no ciclo correto para orientar o acompanhamento.',
    notes: [{ title: 'Consultas não representam contato', text: 'Ler uma página, consultar um material, salvar indicadores ou alterar uma etapa não comprova interação com o cliente. Registre o acompanhamento apenas quando ele tiver ocorrido.' }],
    related: ['responder-atendimento', 'criar-plano', 'checklist-e-revisao'], action: { label: 'Abrir clientes e carteiras', route: '/clients' },
  },
  {
    id: 'responsaveis-e-coberturas', category: 'atendimento', title: 'Atribua um mentor ou uma cobertura temporária', roles: ['admin'],
    summary: 'Defina quem acompanha o ciclo e trate substituições com vigência explícita.',
    prerequisites: ['Cliente e contratação cadastrados; mentor ativo disponível para a atribuição.'],
    steps: [
      { title: 'Abra o cliente correto', text: 'Em “Clientes e carteiras”, abra a empresa e confira o ciclo. Localize a ação de gerenciamento de responsabilidade.' },
      { title: 'Escolha o tipo de atribuição', text: 'No diálogo “Gerenciar responsabilidade”, escolha “Mentor principal” para a responsabilidade principal ou “Cobertura temporária” para um apoio com prazo definido.' },
      { title: 'Selecione a pessoa e a vigência', text: 'Escolha o mentor autorizado. Em cobertura, informe um fim futuro no campo “Fim da cobertura (horário deste dispositivo)”. A cobertura começa no momento da atribuição.' },
      { title: 'Salve e revise o histórico', text: 'Clique em “Salvar atribuição”. Confira o responsável e o histórico de responsabilidade. A troca preserva mensagens e autoria anteriores; o acesso é reavaliado pelo vínculo vigente.' },
      { title: 'Confira a continuidade do atendimento', text: 'Revise tarefas, reuniões e promessas do cliente. Se alguma responsabilidade precisar de ajuste, faça a reatribuição no registro correspondente. A troca não apaga prazos ou pendências.' },
    ],
    expected: 'O mentor atribuído tem o acesso correspondente à vigência, e a responsabilidade fica registrada no histórico.',
    notes: [{ title: 'Ausência e cobertura são ações distintas', text: 'Aprovar uma ausência não distribui clientes. Atribua as coberturas explicitamente e confira se cobrem todo o período necessário. Cancelar uma ausência também não remove uma cobertura já atribuída.' }],
    related: ['capacidade-e-ausencias', 'alertas'], action: { label: 'Abrir carteira', route: '/clients' },
  },
  {
    id: 'abrir-atendimento', category: 'atendimento', title: 'Abra um atendimento com uma dúvida ou solicitação', roles: everyone,
    summary: 'Registre um assunto no ciclo certo e acompanhe as respostas em um único lugar.',
    prerequisites: ['Ter acesso à empresa e uma contratação que permita abrir o atendimento.'],
    steps: [
      { title: 'Confira se o assunto já existe', text: 'Abra “Atendimentos” e procure pelo tema. Se a mesma dúvida já estiver em andamento, continue naquela conversa. Use um novo atendimento para um assunto diferente.' },
      { title: 'Crie o atendimento', text: 'Clique em “Novo atendimento”. Selecione “Cliente / contratação” e confira empresa e ciclo. Escreva um assunto específico, por exemplo “Dúvida sobre custos do anúncio do produto A”.' },
      { title: 'Descreva o contexto', text: 'Em “Como podemos ajudar?”, informe o problema, quando ocorreu, o resultado esperado e o que já foi tentado. Inclua referências úteis e evite juntar temas sem relação no mesmo assunto.' },
      { title: 'Escolha a prioridade e envie', text: 'Selecione Padrão ou Urgente conforme o combinado da mentoria. Revise os dados e confirme o formulário. A prioridade orienta o prazo interno do programa.' },
      { title: 'Acompanhe pelo detalhe', text: 'Abra o atendimento criado para ler e enviar mensagens. Se precisar de arquivo, envie a mensagem e use os controles de anexos dela. Observe a situação e os prazos exibidos.' },
    ],
    expected: 'O assunto aparece na lista e sua mensagem está no histórico do atendimento da contratação escolhida.',
    notes: [{ title: 'Prioridade não substitui contexto', text: 'Uma mensagem completa ajuda a equipe a tratar a solicitação. Os prazos do Elo são os combinados internos do programa de mentoria.' }],
    related: ['anexar-arquivos', 'alertas', 'problemas-frequentes'], action: { label: 'Abrir atendimentos', route: '/tickets' },
  },
  {
    id: 'responder-atendimento', category: 'atendimento', title: 'Responda perguntas e resolva o atendimento corretamente', roles: staff,
    summary: 'Vincule respostas, combine retornos e encerre apenas quando as dúvidas estiverem tratadas.',
    prerequisites: ['Ter acesso vigente à contratação e abrir um atendimento ainda em acompanhamento.'],
    steps: [
      { title: 'Leia as perguntas e os prazos', text: 'Abra o atendimento e identifique cada dúvida pendente, promessas e próximos passos. Ler a conversa ou confirmar recebimento não trata automaticamente todas as perguntas.' },
      { title: 'Vincule a resposta à pergunta', text: 'Na pergunta pública que vai tratar, clique em “Responder a esta mensagem”. Confira o vínculo exibido no editor, mantenha “Mensagem pública”, escreva a orientação e envie. Repita para as demais perguntas que precisarem de tratamento.' },
      { title: 'Use notas internas com o público correto', text: 'Para discutir o caso com a equipe, selecione “Nota interna”. Essa nota não chega ao mentorado e não cumpre prazos de resposta pública. Revise o tipo da mensagem antes de cada envio.' },
      { title: 'Registre retornos e esperas explicitamente', text: 'Se precisar retornar depois, informe “Retorno prometido” com data e hora. Ao cumprir a promessa, assinale o cumprimento no envio quando disponível. Para aguardar informação do cliente, use “Aguardar mentorado” e registre a pergunta ou solicitação pública exigida.' },
      { title: 'Resolva com um resumo', text: 'Depois de tratar explicitamente todas as dúvidas, use “Resolver atendimento”, preencha “Resumo da solução” e confirme. Se o sistema apontar perguntas pendentes, responda a elas pelo vínculo antes de tentar novamente.' },
    ],
    expected: 'Cada pergunta tratada tem uma resposta vinculada e o atendimento só fica Resolvido após o resumo e a conferência das pendências.',
    notes: [{ title: 'A espera não elimina promessas', text: 'Aguardar o mentorado pausa a contagem da resolução conforme as regras do programa. Uma promessa de retorno continua exigível. A resposta do mentorado retoma o atendimento.' }],
    related: ['abrir-atendimento', 'acompanhar-atendimento', 'alertas'], action: { label: 'Abrir fila de atendimentos', route: '/tickets' },
  },
  {
    id: 'acompanhar-atendimento', category: 'atendimento', title: 'Acompanhe respostas e reabra um assunto', roles: everyone,
    summary: 'Entenda as situações da conversa e continue pelo mesmo histórico quando necessário.',
    prerequisites: ['Ter um atendimento acessível da sua empresa ou carteira.'],
    steps: [
      { title: 'Localize a conversa', text: 'Abra “Atendimentos”, use a busca por cliente ou assunto e confira os filtros. Para encontrar um assunto resolvido, amplie a situação para incluir o histórico.' },
      { title: 'Entenda quem precisa agir', text: '“Aguardando mentor” indica uma pergunta para a equipe. “Em tratamento” indica que a equipe está conduzindo o caso. “Aguardando mentorado” indica que falta uma informação ou ação do cliente. Leia a última solicitação para saber o que enviar.' },
      { title: 'Responda no mesmo assunto', text: 'Quando houver uma solicitação, envie a informação na própria conversa com o contexto necessário. No perfil Mentorado, suas mensagens são públicas para a equipe responsável. Confira o envio no histórico.' },
      { title: 'Reabra quando o problema continuar', text: 'Em um atendimento resolvido, use “Reabrir assunto” se ainda precisar tratar o mesmo tema. Explique o que continua acontecendo. A reabertura preserva a conversa e gera novos prazos.' },
    ],
    expected: 'Você identifica a próxima ação, mantém o contexto na mesma conversa e consegue retomar um assunto resolvido.',
    notes: [{ title: 'Tema novo', text: 'Se a dúvida for sobre outro tema, abra outro atendimento. Isso mantém os responsáveis, as respostas e os prazos mais fáceis de acompanhar.' }],
    related: ['abrir-atendimento', 'anexar-arquivos'], action: { label: 'Ver meus atendimentos', route: '/tickets' },
  },
  {
    id: 'anexar-arquivos', category: 'atendimento', title: 'Anexe e baixe arquivos de mensagens e tarefas', roles: everyone,
    summary: 'Envie evidências no lugar certo e confira quando o envio foi concluído.',
    prerequisites: ['Arquivo PDF, PNG, JPEG, WEBP, TXT ou CSV de até 10 MiB; acesso ao registro onde será anexado.'],
    steps: [
      { title: 'Abra o contexto correto', text: 'Para um atendimento, envie primeiro a mensagem e localize os controles de anexos dessa mensagem. O envio é permitido em mensagem própria e atendimento aberto. Em tarefa, abra a tarefa que você pode executar ou gerenciar e use a área de anexos antes de entregá-la.' },
      { title: 'Escolha e envie o arquivo', text: 'Selecione um arquivo permitido e inicie o envio pelo controle da área de anexos. Aguarde a conclusão; selecionar o arquivo no computador não significa que ele já foi salvo.' },
      { title: 'Confira o resultado', text: 'Verifique se o nome do arquivo aparece na lista de anexos do registro. Se houver falha de conexão ou validação, leia o motivo e tente novamente quando corrigido.' },
      { title: 'Baixe pelo próprio registro', text: 'Use a ação de download na lista de arquivos. O download depende da sua sessão e do acesso atual à empresa. Arquivos de notas internas continuam restritos à equipe.' },
    ],
    expected: 'O arquivo aparece no registro certo e pode ser baixado por quem tem autorização para aquele contexto.',
    notes: [{ title: 'Depois da entrega', text: 'Tarefas entregues para revisão, concluídas ou canceladas não recebem novos anexos. Peça à equipe que solicite ajustes ou reabra a tarefa para complementar a evidência. Os arquivos e a autoria anteriores ficam preservados.' }, { title: 'Arquivo recusado', text: 'Confira formato, conteúdo e tamanho. Não basta renomear uma extensão. Limites de quantidade ou armazenamento também podem impedir o envio; encaminhe a mensagem de erro à administração.' }],
    related: ['executar-tarefa', 'consultar-materiais'],
  },
  {
    id: 'preparar-diagnostico', category: 'execucao', title: 'Prepare e publique o diagnóstico técnico', roles: staff,
    summary: 'Avalie a operação do cliente e transforme recomendações em planos de ação.',
    prerequisites: ['Contratação ativa e acesso vigente à empresa; contexto e evidências para a avaliação.'],
    steps: [
      { title: 'Crie o diagnóstico no ciclo correto', text: 'Abra “Diagnósticos”, clique em “Novo diagnóstico”, selecione a contratação e o modelo inicial desejado. Preencha o título e os dados iniciais apresentados pelo formulário e confirme.' },
      { title: 'Registre o contexto', text: 'Em “Preparar diagnóstico”, descreva o contexto do negócio e o objetivo da avaliação. Revise as áreas sugeridas pelo modelo; você pode adicionar ou remover áreas do rascunho.' },
      { title: 'Avalie cada área com fundamento', text: 'Escolha a avaliação da área, escreva a observação e a recomendação, defina prioridade e inclua referência HTTPS se houver. Uma área avaliada precisa de observação. “Não se aplica” também exige explicar o motivo. Deixe “Não avaliado” quando ainda faltar informação.' },
      { title: 'Salve e publique', text: 'Clique em “Salvar rascunho”. Após conferir o contexto e pelo menos uma área avaliada, use “Publicar diagnóstico”. Em correções posteriores, salve e use “Publicar nova versão”. Confirme a versão compartilhada.' },
      { title: 'Transforme recomendações em ação', text: 'Na versão publicada, use “Gerar plano” em uma área ou “Vincular plano” para um plano ativo da mesma contratação. Revise objetivo, meta e prioridade antes de confirmar. Depois, adicione as tarefas do plano.' },
    ],
    expected: 'O mentorado consegue consultar a avaliação publicada, e as ações podem manter um vínculo com a versão que as motivou.',
    notes: [{ title: 'Diagnóstico técnico e comercial', text: 'O diagnóstico técnico avalia a operação durante a mentoria. O diagnóstico comercial fica no CRM e apoia a venda. As avaliações são preenchidas pela equipe.' }],
    related: ['criar-plano', 'consultar-diagnostico', 'problemas-frequentes'], action: { label: 'Abrir diagnósticos', route: '/diagnoses' },
  },
  {
    id: 'consultar-diagnostico', category: 'execucao', title: 'Consulte o diagnóstico e suas recomendações', roles: everyone,
    summary: 'Leia a avaliação compartilhada e encontre os planos relacionados.',
    prerequisites: ['Acesso à empresa e uma versão do diagnóstico publicada pela equipe.'],
    steps: [
      { title: 'Encontre a avaliação', text: 'Abra “Diagnósticos”, confira a contratação e selecione o diagnóstico. No perfil Mentorado, aparecem apenas as versões disponibilizadas pela equipe.' },
      { title: 'Leia contexto e versão', text: 'Confira o título, a versão e o contexto do negócio. Use o seletor de versão, quando disponível, para consultar uma publicação anterior.' },
      { title: 'Leia as áreas avaliadas', text: 'Para cada área, leia a avaliação, a observação, a recomendação e a prioridade. “Não avaliado” significa que a informação está incompleta; não significa que a operação está adequada.' },
      { title: 'Siga para o plano ou esclareça a dúvida', text: 'Abra os planos ligados à versão para acompanhar as ações. Se precisar entender uma recomendação, registre um atendimento citando o diagnóstico e a área.' },
    ],
    expected: 'Você entende o que foi observado, qual recomendação foi compartilhada e onde acompanhar as ações relacionadas.',
    related: ['criar-plano', 'executar-tarefa', 'abrir-atendimento'], action: { label: 'Consultar diagnósticos', route: '/diagnoses' },
  },
  {
    id: 'criar-plano', category: 'execucao', title: 'Crie um plano de ação e distribua as tarefas', roles: staff,
    summary: 'Defina o resultado esperado e os passos necessários para chegar até ele.',
    prerequisites: ['Contratação ativa; pessoas responsáveis com acesso vigente à empresa.'],
    steps: [
      { title: 'Defina o resultado', text: 'Em “Planos de ação”, clique em “Novo plano”. Escolha a contratação e escreva título e objetivo. Registre situação inicial e meta quando conhecidas e escolha a prioridade e o limite de dias sem progresso.' },
      { title: 'Crie e confira a situação do plano', text: 'Clique em “Criar plano”. Abra “Alterar situação” quando precisar colocar o plano em Ativo. Um plano em rascunho não substitui a necessidade de plano ativo no acompanhamento.' },
      { title: 'Adicione tarefas concretas', text: 'Dentro do plano, use “Adicionar tarefa”. Escreva o próximo passo, contexto, responsável individual, prazo, prioridade e critério de conclusão. Exemplo de critério: “Planilha com custos revisados dos 10 produtos e indicação das margens”.' },
      { title: 'Confira quem executa', text: 'Selecione uma pessoa disponível na lista. As opções consideram usuários ativos e permissões vigentes. Se a pessoa não aparecer, peça a conferência do acesso ou da atribuição. Administração gerencia os registros; os executores oferecidos são mentores e mentorados.' },
      { title: 'Acompanhe e conclua pelo trabalho realizado', text: 'Acompanhe execução, bloqueios e entregas em revisão. Concluir o plano exige tarefas e nenhuma pendência. Para arquivar, informe o motivo na mudança de situação e preserve o histórico.' },
    ],
    expected: 'Existe um plano ativo com objetivo claro e tarefas que indicam quem faz, até quando e o que será verificado.',
    notes: [{ title: 'Como ler o progresso', text: 'O progresso considera tarefas concluídas entre as não canceladas. Uma entrega aguardando revisão ainda não conta como concluída. Plano sem tarefas válidas mostra informação ausente. Mudar o título ou o prazo não representa progresso de execução.' }],
    related: ['executar-tarefa', 'revisar-entrega', 'preparar-diagnostico'], action: { label: 'Abrir planos de ação', route: '/plans' },
  },
  {
    id: 'executar-tarefa', category: 'execucao', title: 'Execute uma tarefa e envie a evidência', roles: everyone,
    summary: 'Inicie o trabalho, informe impedimentos e registre uma entrega verificável.',
    prerequisites: ['Tarefa atribuída a você, ou permissão da equipe para gerenciá-la, em um contexto que permita alterações.'],
    steps: [
      { title: 'Leia o combinado', text: 'Abra “Tarefas”, localize a tarefa e confira cliente, plano, responsável, prazo e “Critério de conclusão”. Só comece a entrega depois de entender o que precisa ser verificado.' },
      { title: 'Inicie ou informe o bloqueio', text: 'Use “Iniciar ou retomar tarefa” ao começar. Se houver um impedimento, use “Informar bloqueio” e descreva o que falta e o apoio necessário. Quando o impedimento for resolvido, retome a execução.' },
      { title: 'Prepare a evidência', text: 'Ao terminar, descreva o resultado em relação ao critério. Use um link HTTPS de evidência, se necessário, e confira a permissão de acesso do destino. Anexe os arquivos na tarefa antes de enviá-la para revisão ou conclusão.' },
      { title: 'Registre a entrega', text: 'Em tarefa do Mentorado, clique em “Enviar para revisão”, preencha a evidência e confirme em “Enviar entrega”. Em tarefa do Mentor, a equipe usa “Concluir com evidência” e confirma os dados exigidos.' },
      { title: 'Confira a próxima situação', text: 'O mentorado deve conferir se a tarefa ficou entregue e aguardar revisão. Se receber solicitação de ajustes, leia a orientação, retome a tarefa e envie nova evidência quando estiver pronta.' },
    ],
    expected: 'A entrega fica registrada com evidência. Uma tarefa do mentorado aguarda aprovação da equipe.',
    notes: [{ title: 'Entrega e aprovação', text: 'Enviar para revisão registra a entrega, mas ainda não conclui a tarefa. Enquanto estiver em revisão, os arquivos ficam bloqueados para alteração. A equipe precisa solicitar ajustes para liberar complementações.' }],
    related: ['anexar-arquivos', 'alertas', 'problemas-frequentes'], action: { label: 'Abrir tarefas', route: '/tasks' },
  },
  {
    id: 'revisar-entrega', category: 'execucao', title: 'Revise entregas, solicite ajustes e reabra tarefas', roles: staff,
    summary: 'Verifique a evidência antes de aprovar e explique o próximo passo quando houver ajustes.',
    prerequisites: ['Acesso vigente à tarefa; entrega aguardando revisão para usar a aprovação.'],
    steps: [
      { title: 'Localize a revisão pendente', text: 'Abra “Tarefas” e use a visão “Em revisão”, ou o atalho de entregas aguardando revisão no painel. Abra a tarefa e confira o critério de conclusão.' },
      { title: 'Verifique a entrega', text: 'Leia a evidência, abra os links autorizados e baixe os arquivos necessários. Compare o que foi entregue com o critério combinado.' },
      { title: 'Aprove uma entrega adequada', text: 'Use “Aprovar entrega”, preencha “Registro da revisão” com o que foi verificado e confirme. A tarefa passa a concluída e entra no progresso do plano.' },
      { title: 'Solicite ajustes quando necessário', text: 'Use “Solicitar ajustes” e descreva objetivamente o que falta e como será conferido. Confira o retorno da tarefa à execução para que o responsável possa complementar a evidência.' },
      { title: 'Preserve o motivo de mudanças posteriores', text: 'Para voltar a trabalhar em uma tarefa encerrada, use “Reabrir com motivo”. Para interromper uma ação que não deve ser executada, use “Cancelar com motivo”. O histórico fica preservado; cancelamento não equivale a entrega concluída.' },
    ],
    expected: 'A tarefa está aprovada com revisão registrada ou devolvida com orientação clara para a próxima entrega.',
    related: ['executar-tarefa', 'criar-plano'], action: { label: 'Abrir entregas em revisão', route: '/tasks?filter=submitted&owner=all' },
  },
  {
    id: 'agendar-reuniao', category: 'reunioes', title: 'Agende e registre o resultado de uma reunião', roles: staff,
    summary: 'Combine participantes, pauta e horário e registre o que realmente aconteceu.',
    prerequisites: ['Contratação ativa; responsável autorizado e pelo menos uma pessoa mentorada ativa da empresa.'],
    steps: [
      { title: 'Prepare o encontro', text: 'Em “Reuniões”, clique em “Agendar reunião”. Selecione contratação, título, início, fim e responsável. Preencha local ou link e pauta quando disponíveis.' },
      { title: 'Confira os participantes', text: 'Inclua as pessoas autorizadas que participarão. O responsável faz parte da lista e deve haver pelo menos um mentorado da empresa. A duração deve ser positiva, de até oito horas, dentro da vigência do ciclo.' },
      { title: 'Confirme a agenda', text: 'Clique em “Agendar encontro” e confira os dados na página da reunião. O Elo mantém agenda interna; combine a participação pelo canal usado pela empresa. Ele não cria automaticamente uma sala ou um evento em calendário externo.' },
      { title: 'Registre presenças após o início', text: 'Na área de participantes, informe presente, ausente ou falta justificada conforme o que ocorreu e use “Salvar presenças”. O login no sistema não confirma presença.' },
      { title: 'Registre o desfecho', text: 'Depois do início, use “Marcar como realizada” se o encontro aconteceu. Para não realização, aguarde o fim previsto e informe a justificativa. Cancelamentos e alterações de agenda também precisam de motivo. Depois de realizada, prepare e publique a ata.' },
    ],
    expected: 'A reunião tem agenda, participantes e resultado registrados sem presumir presença ou falta automaticamente.',
    notes: [{ title: 'Horários e desfechos', text: 'Campos com “horário deste dispositivo” usam o horário configurado no aparelho no preenchimento. A agenda exibe datas em São Paulo; confira a conversão se estiver em outro fuso. Um resultado final não é reaberto: registre outro encontro quando necessário.' }],
    related: ['publicar-ata', 'consultar-reunioes'], action: { label: 'Abrir reuniões', route: '/meetings' },
  },
  {
    id: 'publicar-ata', category: 'reunioes', title: 'Publique a ata e transforme decisões em tarefas', roles: staff,
    summary: 'Compartilhe os combinados do encontro e dê continuidade à execução.',
    prerequisites: ['Reunião marcada como realizada e presença definida para todos os participantes.'],
    steps: [
      { title: 'Abra a preparação da ata', text: 'Abra a reunião e escolha “Preparar ata”. Leia a pauta e confira o resultado e as presenças do encontro.' },
      { title: 'Registre os combinados', text: 'Preencha “Resumo do encontro” e “Próximos passos”. Use “Adicionar decisão” para registrar decisões específicas que devam ser acompanhadas.' },
      { title: 'Salve e publique', text: 'Use “Salvar rascunho”, revise o texto e clique em “Publicar ata”. Se a publicação estiver impedida, confira reunião realizada, resumo, próximos passos e presença de todos. O rascunho salvo continua reservado à equipe.' },
      { title: 'Gere uma tarefa para uma decisão', text: 'Na decisão publicada, use “Transformar em tarefa”. Escolha um plano ativo da mesma contratação, confira título, responsável, prazo, prioridade e critério de conclusão. Clique em “Criar tarefa vinculada”.' },
      { title: 'Corrija por uma nova versão', text: 'Se precisar corrigir a ata, ajuste o rascunho, salve e use “Publicar nova versão”. A versão anterior permanece no histórico. Decisão já convertida em tarefa tem sua origem preservada.' },
    ],
    expected: 'O mentorado consegue ler a ata publicada, e as decisões convertidas aparecem como tarefas vinculadas ao encontro.',
    related: ['agendar-reuniao', 'criar-plano', 'executar-tarefa'], action: { label: 'Abrir reuniões', route: '/meetings' },
  },
  {
    id: 'consultar-reunioes', category: 'reunioes', title: 'Consulte a agenda, a pauta e a ata compartilhada', roles: everyone,
    summary: 'Prepare-se para o encontro e acompanhe o que ficou combinado depois dele.',
    prerequisites: ['Acesso à contratação da reunião. Para ler a ata, ela deve ter sido publicada pela equipe.'],
    steps: [
      { title: 'Encontre a reunião', text: 'Em “Reuniões”, confira próximos encontros, encontros de hoje ou todo o histórico. Use o filtro de contratação para escolher o ciclo certo.' },
      { title: 'Confira o que foi agendado', text: 'Abra o encontro e leia título, data, início, fim, participantes, pauta e local/link. Confira o horário em São Paulo e organize sua participação conforme o combinado.' },
      { title: 'Leia a ata depois do encontro', text: 'Quando a equipe publicar, consulte “Ata compartilhada”. Leia resumo, decisões e próximos passos. Se a ata ainda não estiver compartilhada, aguarde a publicação ou peça orientação ao mentor.' },
      { title: 'Acompanhe a execução', text: 'Se uma decisão tiver virado tarefa, abra o vínculo correspondente e confira responsável, prazo e critério de conclusão. Registre dúvidas em um atendimento quando precisar esclarecer o combinado.' },
    ],
    expected: 'Você sabe quando e onde participar e consegue encontrar os próximos passos publicados após o encontro.',
    related: ['executar-tarefa', 'abrir-atendimento'], action: { label: 'Consultar reuniões', route: '/meetings' },
  },
  {
    id: 'registrar-indicadores', category: 'resultados', title: 'Registre e publique os resultados de um mês', roles: staff,
    summary: 'Informe os dados da loja com origem clara, confira os cálculos e compartilhe a publicação.',
    prerequisites: ['Contratação ativa, relatório de origem e valores conferidos do mês que será registrado.'],
    steps: [
      { title: 'Selecione o ciclo e o mês', text: 'Em “Indicadores e metas”, selecione a empresa/contratação e clique em “Registrar mês”. Existe um registro consolidado por mês e contratação. Para corrigir um mês existente, abra o próprio registro.' },
      { title: 'Descreva a base', text: 'Informe o mês, a situação e “Origem e base dos dados”, identificando conta, relatório e recorte. O mês atual deve ser Parcial. Use Fechado para mês anterior com dados consolidados. Não registre resultados futuros.' },
      { title: 'Preencha somente dados conhecidos', text: 'Informe os valores disponíveis nos campos correspondentes. Deixe em branco o que não foi informado. Use zero apenas quando o resultado observado for realmente zero. Estoque e catálogo representam a posição no fim do período.' },
      { title: 'Confira bases e cálculos', text: 'Na “Conferência da base”, marque somente o que realmente conferiu. Indicadores derivados dependem de denominadores e confirmações. Custos totais devem incluir os custos necessários, inclusive publicidade, para a margem estimada.' },
      { title: 'Salve, confira e publique', text: 'Use “Salvar rascunho”, confira os dados e depois “Publicar resultados”. Para corrigir uma publicação, prepare o registro, informe o motivo da correção, salve e publique a nova versão. A alteração privada não muda a versão compartilhada antes da publicação.' },
    ],
    expected: 'O mês publicado aparece na evolução da contratação e pode ser consultado pelo mentorado.',
    notes: [{ title: 'Vendas da loja e financeiro da mentoria', text: 'Estes resultados pertencem à operação do cliente. Valores contratados e pagamentos da mentoria são registrados separadamente no Comercial e financeiro.' }],
    related: ['importar-csv', 'definir-metas', 'consultar-evolucao'], action: { label: 'Abrir indicadores e metas', route: '/indicators' },
  },
  {
    id: 'importar-csv', category: 'resultados', title: 'Importe indicadores por CSV, da prévia à publicação', roles: staff,
    summary: 'Valide a planilha, confirme apenas meses novos válidos e revise os rascunhos criados.',
    prerequisites: ['Contratação ativa; arquivo UTF-8 com ponto e vírgula, até 64 KiB e 200 linhas de dados, conforme o modelo da tela.'],
    steps: [
      { title: 'Use o modelo da contratação', text: 'Abra “Indicadores e metas”, escolha a contratação e entre em “Importar CSV”. Baixe o modelo da tela e preserve os cabeçalhos. Cada arquivo atende somente uma contratação.' },
      { title: 'Prepare os valores sem ambiguidade', text: 'Preencha periodo como AAAA-MM, situacao como parcial ou fechado e origem com a base dos dados. Use vírgula ou ponto decimal, sem separador de milhar, e contagens inteiras. Deixe vazios os valores desconhecidos. Não repita um mês no arquivo.' },
      { title: 'Valide e leia toda a prévia', text: 'Selecione o arquivo ou cole o conteúdo e execute a validação oferecida na tela. Confira os meses novos válidos, os meses já existentes e os erros por linha. A prévia ainda não grava indicadores. Você pode baixar os erros para corrigir o arquivo.' },
      { title: 'Confirme conscientemente', text: 'Corrija o que for necessário e valide de novo. Quando houver linhas novas válidas, confira o resumo, marque a ciência de que serão criados rascunhos privados e confirme a importação. Meses existentes são preservados; linhas inválidas não são importadas.' },
      { title: 'Confira o lote e publique cada mês', text: 'Abra o relatório da importação e confira importados, ignorados e inválidos. Abra cada registro criado, revise os números e publique pelo fluxo normal. Importar o arquivo não publica resultados, metas ou evolução automaticamente.' },
    ],
    expected: 'O relatório identifica o resultado de cada linha, e os meses novos válidos existem como rascunhos para revisão da equipe.',
    notes: [{ title: 'Prévia vencida ou dados alterados', text: 'A prévia vale por 30 minutos. Alterar o conteúdo ou encontrar mudança nos meses cadastrados pode exigir nova validação. Se a resposta de uma confirmação se perder, confira o histórico do lote antes de iniciar outra importação.' }, { title: 'Mês repetido ou já existente', text: 'Todas as ocorrências de um mês repetido no arquivo ficam inválidas. Um mês já cadastrado, inclusive arquivado, não é substituído: corrija o registro existente pelo fluxo de edição e publicação.' }],
    related: ['registrar-indicadores', 'consultar-evolucao', 'problemas-frequentes'], action: { label: 'Abrir indicadores', route: '/indicators' },
  },
  {
    id: 'definir-metas', category: 'resultados', title: 'Defina metas e acompanhe o resultado', roles: staff,
    summary: 'Escolha indicador, mês, valor e sentido da meta e vincule o plano quando fizer sentido.',
    prerequisites: ['Contratação ativa; indicador e resultado esperado combinados com o cliente.'],
    steps: [
      { title: 'Abra as metas da contratação', text: 'Em “Indicadores e metas”, escolha a empresa/contratação, entre em “Metas” e clique em “Definir meta”.' },
      { title: 'Defina o alvo', text: 'Selecione indicador e mês. Escolha “Pelo menos” para um piso ou “No máximo” para um limite. Preencha o valor na unidade do indicador. Metas futuras são permitidas; existe uma meta por indicador e mês.' },
      { title: 'Registre o contexto e o plano', text: 'Explique o contexto da meta e, se houver, selecione um plano ativo da mesma contratação. Confira o vínculo e confirme em “Definir meta”.' },
      { title: 'Interprete o acompanhamento', text: 'A avaliação considera o resultado publicado do mês. Com dados parciais, fica em acompanhamento. Com mês fechado e valor calculável, informa atingida ou não atingida. Sem resultado, informa a ausência.' },
      { title: 'Corrija com justificativa', text: 'Para ajustar uma meta, use a edição e informe o motivo. Confira o histórico. Arquivar ou reativar preserva os registros e exige justificativa conforme o formulário.' },
    ],
    expected: 'A meta aparece na contratação com mês, indicador, direção e alvo, e é avaliada a partir dos dados publicados.',
    notes: [{ title: 'Meta de zero', text: 'Zero pode ser um alvo válido, por exemplo no máximo zero cancelamentos. O sistema não calcula um percentual artificial dividindo o resultado pelo alvo.' }],
    related: ['registrar-indicadores', 'consultar-evolucao', 'criar-plano'], action: { label: 'Abrir indicadores e metas', route: '/indicators' },
  },
  {
    id: 'consultar-evolucao', category: 'resultados', title: 'Consulte a evolução mensal, as metas e a exportação', roles: everyone,
    summary: 'Leia os resultados publicados sem confundir valores ausentes, zeros e meses parciais.',
    prerequisites: ['Acesso à empresa; resultados publicados pela equipe para os meses que serão consultados.'],
    steps: [
      { title: 'Selecione empresa e intervalo', text: 'Abra “Indicadores e metas”, confira a contratação e use a aba “Evolução mensal”. Ajuste “De” e “Até” para um intervalo de até 36 meses.' },
      { title: 'Leia gráficos e tabela', text: 'Escolha o indicador e confira os valores, situação do mês e origem. “Não informado” é ausência de dado; zero é um resultado observado. Um mês sem publicação permanece como uma lacuna.' },
      { title: 'Interprete as comparações', text: 'Comparações exigem meses consecutivos publicados e fechados, mesma origem e base confirmada. Meses parciais ou mudança de base não recebem uma comparação equivalente a mês fechado. Taxas são comparadas em pontos percentuais.' },
      { title: 'Consulte o registro e as metas', text: 'Abra o mês para ler contexto e versão compartilhada. Na aba “Metas”, confira mês, indicador, alvo e situação. “Em acompanhamento” pode indicar que o mês ainda é parcial; sem resultado publicado, a meta não recebe um resultado inventado.' },
      { title: 'Exporte quando precisar', text: 'Na evolução, use “Exportar evolução CSV”. O arquivo contém as publicações do ciclo e intervalo selecionados. Confira o recorte antes de compartilhar o arquivo fora da plataforma.' },
    ],
    expected: 'Você encontra os resultados publicados, entende as lacunas e consegue baixar a evolução do ciclo selecionado.',
    notes: [{ title: 'Um cálculo não apareceu?', text: 'Ticket, conversão, ROAS, ACOS, TACOS e margem dependem dos valores de base e das confirmações da equipe. Leia o motivo exibido e peça a conferência da origem. Falta de dado não é um resultado zero.' }],
    related: ['glossario', 'problemas-frequentes'], action: { label: 'Consultar evolução', route: '/indicators' },
  },
  {
    id: 'checklist-e-revisao', category: 'jornada', title: 'Confira a entrada e registre revisões do ciclo', roles: staff,
    summary: 'Organize contexto, entregáveis e revisões compartilhadas ao longo da mentoria.',
    prerequisites: ['Acesso vigente à contratação e informações reais para conferir a entrada.'],
    steps: [
      { title: 'Abra o ciclo', text: 'Em “Jornada e relacionamento”, escolha o ciclo ou use o atalho na página do cliente. Confira programa, vigência, etapa e situação.' },
      { title: 'Confira a entrada de verdade', text: 'Em “Entrada e contexto”, use “Conferir entrada”. Registre os entregáveis combinados e as informações iniciais compartilhadas. Confirme contatos, política e acessos apenas após conferir os respectivos itens.' },
      { title: 'Resolva os itens dependentes de cadastro', text: 'Mentor, primeira reunião e pessoas autorizadas dependem dos registros atuais. Um item não fica completo apenas por escrever que está pronto: atribua o mentor, agende a reunião e autorize as pessoas pelos módulos correspondentes.' },
      { title: 'Registre a revisão', text: 'Na aba “Revisões”, clique em “Registrar revisão”. Preencha a síntese e os próximos passos e, se necessário, a próxima revisão. O resumo será compartilhado com os mentorados da empresa.' },
      { title: 'Registre o contato relevante no lugar certo', text: 'Se houve uma interação relevante com o cliente, use “Registrar acompanhamento” na página do cliente, descreva a interação e combine próximo passo e prazo. Uma revisão administrativa, mudança de etapa ou simples leitura não registra automaticamente esse contato.' },
    ],
    expected: 'O checklist reflete o que foi conferido, e a revisão compartilhada orienta os próximos passos do ciclo.',
    related: ['cadastrar-cliente', 'agendar-reuniao', 'renovar-ciclo'], action: { label: 'Abrir jornada', route: '/journey' },
  },
  {
    id: 'intervencoes-administrativas', category: 'jornada', title: 'Registre e acompanhe uma intervenção administrativa', roles: ['admin'],
    summary: 'Trate uma pendência reservada da administração com responsável e data de revisão.',
    prerequisites: ['Acesso de Administração e contexto do ciclo que exige uma providência administrativa.'],
    steps: [
      { title: 'Abra a administração do ciclo', text: 'Em “Jornada e relacionamento”, abra a contratação e entre em “Administração”. Confira a empresa e a vigência antes de registrar o conteúdo reservado.' },
      { title: 'Descreva a providência', text: 'Em “Intervenções administrativas”, use “Intervir”. Preencha o contexto da intervenção, selecione o responsável e defina a data da revisão. Registre informações suficientes para acompanhar a decisão.' },
      { title: 'Salve e acompanhe o prazo', text: 'Confirme o formulário e confira a intervenção no ciclo. A indicação de responsável organiza a providência, mas não concede acesso à carteira automaticamente.' },
      { title: 'Registre o tratamento e a conclusão', text: 'Abra a intervenção registrada, informe tratamento e motivo e escolha a situação adequada. Reagende a revisão quando necessário ou registre a conclusão. Confira o histórico para preservar a explicação do que foi feito.' },
    ],
    expected: 'A providência administrativa tem responsável, revisão e tratamento registrados no espaço reservado.',
    notes: [{ title: 'Público reservado', text: 'Intervenções e notas administrativas não aparecem na jornada pública de mentor ou mentorado. Para comunicar uma orientação ao cliente, use um atendimento público ou uma revisão compartilhada apropriada.' }],
    related: ['checklist-e-revisao', 'responsaveis-e-coberturas', 'alertas'], action: { label: 'Abrir jornada', route: '/journey' },
  },
  {
    id: 'renovar-ciclo', category: 'jornada', title: 'Altere a situação, encerre ou renove um ciclo', roles: ['admin'],
    summary: 'Gerencie a vigência preservando o histórico e crie um ciclo separado para a renovação.',
    prerequisites: ['Acesso de Administração e decisão de situação ou renovação combinada com o cliente.'],
    steps: [
      { title: 'Revise o ciclo atual', text: 'Em “Jornada e relacionamento”, abra o ciclo e consulte revisões, pendências, datas e programa. Etapa de acompanhamento e situação contratual são informações distintas.' },
      { title: 'Altere a situação quando necessário', text: 'Use “Situação e etapa” para ajustar situação, etapa ou fim de vigência. Informe o motivo e confira os dados antes de salvar. Encerramento e cancelamento preservam o histórico.' },
      { title: 'Prepare a renovação', text: 'Use “Renovar ciclo”. Escolha programa e mentor do próximo ciclo, início, fim e motivo. O início novo precisa ser no fim do ciclo anterior ou depois. Um ciclo cancelado requer avaliação administrativa e não é renovado por essa operação.' },
      { title: 'Confirme e confira o novo ciclo', text: 'Após confirmar, abra o ciclo criado e confira vigência, mentor e checklist. A empresa e suas pessoas autorizadas permanecem vinculadas à mesma empresa, mas os registros de trabalho do ciclo anterior não são copiados.' },
      { title: 'Trate o ciclo anterior explicitamente', text: 'A renovação não encerra automaticamente a contratação anterior. Se o encerramento foi combinado, registre a mudança no ciclo de origem. Prepare os novos diagnósticos, planos, metas e encontros do ciclo novo conforme necessário.' },
    ],
    expected: 'A situação reflete a decisão administrativa, e a renovação aparece como outro ciclo ligado ao anterior, com histórico preservado.',
    notes: [{ title: 'Pausar não congela todos os relógios', text: 'A pausa contratual impede alterações em vários módulos, mas não congela silenciosamente os atendimentos já abertos. Confira as pendências e combine o tratamento antes de pausar.' }],
    related: ['checklist-e-revisao', 'responsaveis-e-coberturas', 'relatorios-gerenciais'], action: { label: 'Abrir ciclos', route: '/journey' },
  },
  {
    id: 'avaliar-mentoria', category: 'jornada', title: 'Envie ou corrija sua avaliação de satisfação', roles: ['mentee'],
    summary: 'Avalie um contexto disponível e escolha se deseja compartilhar a resposta com o mentor.',
    prerequisites: ['Ter acesso de Mentorado e um atendimento próprio resolvido ou ciclo elegível para avaliação.'],
    steps: [
      { title: 'Abra a satisfação', text: 'Em “Jornada e relacionamento”, entre em “Satisfação” e confira a empresa e o ciclo.' },
      { title: 'Escolha o que vai avaliar', text: 'Em “Contextos disponíveis para avaliar”, selecione o atendimento ou ciclo apresentado. Atendimentos precisam ser seus e estar resolvidos na primeira avaliação. Ciclos dependem de revisão, etapa ou encerramento elegível.' },
      { title: 'Informe sua percepção', text: 'Escolha uma nota de 1 a 5 e escreva um comentário se desejar. A avaliação deve refletir sua experiência.' },
      { title: 'Decida o compartilhamento', text: 'Revise a opção de compartilhar com o mentor antes de enviar. Ela começa desmarcada. A administração pode consultar as avaliações da organização; o mentor só recebe o que você compartilhar explicitamente.' },
      { title: 'Corrija se necessário', text: 'Na sua resposta, use “Corrigir minha avaliação”, informe o motivo e confirme a nova nota, comentário e compartilhamento. A versão anterior fica preservada no histórico e a nota atual substitui a anterior nos cálculos.' },
    ],
    expected: 'Sua resposta aparece no contexto correto com a opção de compartilhamento escolhida por você.',
    related: ['acompanhar-atendimento', 'problemas-frequentes'], action: { label: 'Abrir satisfação', route: '/journey/satisfaction' },
  },
  {
    id: 'consultar-satisfacao', category: 'jornada', title: 'Consulte satisfação e trate os pontos de atenção', roles: staff,
    summary: 'Leia avaliações respeitando o compartilhamento e o tamanho da amostra.',
    prerequisites: ['Ter acesso aos contextos da organização ou à carteira vigente.'],
    steps: [
      { title: 'Escolha o recorte', text: 'Abra “Jornada e relacionamento” → “Satisfação”. Ajuste empresa/ciclo e período da consulta.' },
      { title: 'Leia a média junto da amostra', text: 'Confira a média de 1 a 5 e a quantidade de respostas. Sem respostas, o sistema mostra “Não informado”. Observe separadamente os contextos de atendimento e ciclo.' },
      { title: 'Respeite a visibilidade', text: 'Administração consulta as respostas da organização. Mentor consulta somente as avaliações atualmente compartilhadas de sua carteira. Uma amostra diferente entre perfis pode ser consequência dessa escolha de privacidade.' },
      { title: 'Transforme feedback em providência', text: 'Leia o contexto permitido e combine a ação apropriada com o cliente. Registre acompanhamentos e próximos passos no fluxo correspondente. Se houver intervenção administrativa, mantenha as observações reservadas no espaço da administração.' },
    ],
    expected: 'A equipe entende o recorte da satisfação e registra ações coerentes sem alterar avaliações em nome do mentorado.',
    related: ['checklist-e-revisao', 'relatorios-gerenciais', 'alertas'], action: { label: 'Consultar satisfação', route: '/journey/satisfaction' },
  },
  {
    id: 'capacidade-e-ausencias', category: 'jornada', title: 'Consulte capacidade e planeje ausências e coberturas', roles: staff,
    summary: 'Organize a disponibilidade dos mentores sem deixar clientes sem acompanhamento.',
    prerequisites: ['Perfil Mentor ou Administração. A aprovação de ausência e o ajuste da capacidade são administrativos.'],
    steps: [
      { title: 'Confira a carga', text: 'Abra “Jornada e relacionamento” → “Capacidade e ausências”. Compare ciclos ativos atribuídos com a capacidade cadastrada. Uma capacidade zero significa que não há vagas; “Não informado” indica ausência de informação.' },
      { title: 'Solicite a ausência', text: 'Use “Solicitar ausência”, informe início, fim e motivo e confirme. O mentor consulta a própria disponibilidade e solicita a própria ausência. A administração analisa a solicitação.' },
      { title: 'Analise e registre a decisão', text: 'Administração abre a solicitação, confere período e impacto e escolhe aprovar, não aprovar ou cancelar conforme a situação. Informe o motivo da decisão. O mentor só ajusta ou cancela sua solicitação ainda pendente.' },
      { title: 'Atribua cobertura para os clientes afetados', text: 'No detalhe da ausência, confira “Clientes afetados no período”. A administração usa “Atribuir cobertura”, escolhe o mentor e o fim. A cobertura começa agora; confira se atende ao período necessário e às permissões concedidas.' },
      { title: 'Revise o impacto', text: 'Confira coberturas, responsáveis, encontros e prazos. Ajustar capacidade exige motivo; não redistribui clientes. Ausência aprovada não pausa os prazos automaticamente.' },
    ],
    expected: 'A ausência tem decisão explícita e cada cliente afetado recebe a cobertura necessária por atribuição registrada.',
    related: ['responsaveis-e-coberturas', 'alertas'], action: { label: 'Abrir capacidade e ausências', route: '/journey/capacity' },
  },
  {
    id: 'consultar-materiais', category: 'gestao', title: 'Encontre e consulte os materiais de orientação', roles: everyone,
    summary: 'Busque publicações, leia a orientação e baixe os arquivos disponibilizados.',
    prerequisites: ['Acesso ao público do material; para o mentorado, publicação compartilhada com a contratação autorizada.'],
    steps: [
      { title: 'Abra a biblioteca', text: 'Entre em “Materiais” pelo menu ou use “Materiais indicados” na página do cliente. Confira o filtro de contratação quando estiver presente.' },
      { title: 'Busque pelo tema', text: 'Use a busca de materiais publicados com palavras do título, tags ou orientação, por exemplo “catálogo” ou “estoque”. Clique em “Buscar”. Limpe o filtro quando quiser ampliar a consulta.' },
      { title: 'Leia a versão disponível', text: 'Abra o material, confira “Quando usar este material” e leia a orientação. Quando houver seletor de versão, confira qual publicação está consultando.' },
      { title: 'Abra referências e baixe arquivos', text: 'Use o link externo ou o download do arquivo no material. Links externos dependem das permissões do destino. Para baixar novamente um arquivo privado, volte ao material com sua sessão ativa.' },
    ],
    expected: 'Você encontra uma orientação autorizada e consegue consultar as referências e os arquivos publicados.',
    notes: [{ title: 'Como funciona a busca', text: 'A busca usa o título, a indicação, as tags e o texto inserido pela equipe. O conteúdo de um PDF ou imagem anexada não é extraído automaticamente. Se não encontrar um termo que existe apenas no arquivo, procure pelo tema ou peça orientação ao mentor.' }],
    related: ['problemas-frequentes', 'abrir-atendimento'], action: { label: 'Abrir materiais', route: '/materials' },
  },
  {
    id: 'publicar-material', category: 'gestao', title: 'Prepare e publique um material para o público certo', roles: staff,
    summary: 'Escolha destino e público antes de escrever e confira a publicação antes de compartilhar.',
    prerequisites: ['Permissão para o público escolhido e contratação ativa quando o material for vinculado a um ciclo.'],
    steps: [
      { title: 'Defina o destino antes de criar', text: 'Em “Materiais”, clique em “Novo material”. Preencha título, destino e “Quem pode consultar”. Para mentorados, selecione a contratação e o público “Cliente da contratação selecionada, após publicar”. Biblioteca de equipe é para uso interno; somente Administração pode criar conteúdo privado administrativo.' },
      { title: 'Crie e prepare o rascunho', text: 'Clique em “Criar rascunho”. Preencha quando usar o material, orientação, tags e fonte HTTPS quando houver. Escreva no texto os termos pelos quais o material deve ser encontrado.' },
      { title: 'Anexe o arquivo, se necessário', text: 'Escolha o arquivo e clique em “Enviar arquivo”. Cada versão referencia um arquivo privado. Confira o envio; formatos permitidos são PDF, PNG, JPEG, WEBP, TXT e CSV, até 10 MiB.' },
      { title: 'Salve e publique', text: 'Use “Salvar rascunho”, revise o conteúdo e o público e execute a publicação pelo botão da tela. Confira a versão publicada. Alterar o rascunho depois não substitui a publicação até publicar uma nova versão.' },
      { title: 'Preserve o destino correto', text: 'Público e contratação permanecem fixos após a criação. Se o destino estiver errado, crie outro material com o público correto e revise antes de publicar. Ao arquivar com motivo, o material sai das consultas do cliente e da busca, mantendo o histórico da equipe.' },
    ],
    expected: 'O conteúdo publicado fica disponível somente para o público definido, com texto pesquisável e arquivo da versão correta.',
    related: ['consultar-materiais', 'problemas-frequentes'], action: { label: 'Abrir biblioteca de materiais', route: '/materials' },
  },
  {
    id: 'relatorios-gerenciais', category: 'gestao', title: 'Use os relatórios para decidir o próximo passo', roles: staff,
    summary: 'Filtre a operação, abra as listas dos cartões e exporte o recorte autorizado.',
    prerequisites: ['Perfil Administração ou Mentor; acesso à carteira que deseja consultar.'],
    steps: [
      { title: 'Escolha os filtros', text: 'Abra “Relatórios gerenciais”. Selecione período, programa e empresa/contratação quando necessário. O período aceita até 366 dias e não aceita data final futura.' },
      { title: 'Separe a fila atual das atividades do período', text: 'A situação atual da carteira e a carga mostram pendências atuais. As atividades e medidas de resposta usam o período indicado. Um atendimento antigo ainda aberto pode aparecer na fila atual mesmo que tenha sido criado antes do período.' },
      { title: 'Abra os números para investigar', text: 'Clique no cartão de contratações ativas, atendimentos abertos, vencidos ou sem acompanhamento recente. Confira a lista correspondente e abra o atendimento ou ciclo que precisa de providência.' },
      { title: 'Leia indicadores com seus critérios', text: 'Confira amostra, numerador e denominador apresentados. “Não informado” significa ausência de base para calcular. Avaliações compartilhadas podem produzir amostras diferentes para Mentor e Administração.' },
      { title: 'Exporte e registre a ação', text: 'Use a exportação CSV oferecida na tela para baixar o recorte. Registre o tratamento no atendimento, tarefa, acompanhamento ou jornada correspondente. Abrir o relatório não resolve as pendências.' },
    ],
    expected: 'Você identifica os registros que explicam os números e consegue agir no contexto certo.',
    notes: [{ title: 'Resultados de uma loja', text: 'Para números de vendas, metas e evolução individual, use “Indicadores e metas”. O relatório gerencial acompanha a operação da mentoria. Mentorados consultam sua evolução individual.' }],
    related: ['alertas', 'consultar-evolucao', 'consultar-satisfacao'], action: { label: 'Abrir relatórios gerenciais', route: '/reports' },
  },
  {
    id: 'usuarios-e-acessos', category: 'gestao', title: 'Convide pessoas, recupere e desative acessos', roles: ['admin'],
    summary: 'Dê acesso pelo perfil correto e vincule cada mentorado à empresa autorizada.',
    prerequisites: ['Acesso de Administração; para convidar mentorado, empresa já cadastrada.'],
    steps: [
      { title: 'Abra a gestão de pessoas', text: 'Em “Usuários e acessos”, confira se a pessoa já possui cadastro. Se for necessário recuperar uma conta existente, use a recuperação em vez de criar outra conta.' },
      { title: 'Crie o convite com o perfil correto', text: 'Clique em “Convidar pessoa”, informe nome e e-mail e escolha Mentor, Mentorado ou Administrador. No perfil Mentorado, selecione “Empresa autorizada”. Revise e clique em “Criar convite”.' },
      { title: 'Compartilhe o link privado', text: 'No diálogo “Link de acesso criado”, use “Copiar link” e envie somente à pessoa responsável por um canal seguro da empresa. Confira a validade exibida. O Elo não envia esse link automaticamente.' },
      { title: 'Complete as permissões de trabalho', text: 'Para Mentor, atribua a carteira ou cobertura na empresa. Para Mentorado, confirme o vínculo autorizado à empresa. Perfil e acesso à carteira são controles complementares.' },
      { title: 'Recupere ou desative quando necessário', text: 'Use “Recuperar acesso” para gerar outro link de ativação da conta. Em “Editar”, ajuste nome, capacidade quando aplicável e situação. Desativar uma conta revoga suas sessões; confira também tarefas e reuniões que exigem reatribuição.' },
    ],
    expected: 'Cada pessoa ativa a própria conta e vê apenas o que seu perfil e seus vínculos permitem.',
    related: ['primeiro-acesso', 'responsaveis-e-coberturas', 'capacidade-e-ausencias'], action: { label: 'Abrir usuários e acessos', route: '/users' },
  },
  {
    id: 'programas-e-prazos', category: 'gestao', title: 'Configure programas, expediente e prazos', roles: ['admin'],
    summary: 'Defina a política interna que orienta o acompanhamento e os prazos de resposta.',
    prerequisites: ['Acesso de Administração e política de atendimento combinada pela empresa.'],
    steps: [
      { title: 'Cadastre o programa', text: 'Abra “Programas e prazos” e clique em “Novo programa”. Informe o nome e a duração do ciclo em dias e salve. Depois, abra “Editar política” para revisar a política completa.' },
      { title: 'Confira o calendário', text: 'Defina fuso horário, dias úteis, início e fim do expediente. Informe as datas sem expediente no formato AAAA-MM-DD, uma por linha. Confira os feriados que a empresa realmente observa.' },
      { title: 'Defina os prazos disponíveis', text: 'Preencha os campos de primeira resposta padrão e urgente em minutos úteis e a frequência de acompanhamento relevante em dias corridos. Revise os valores com a operação antes de salvar.' },
      { title: 'Salve e comunique a política', text: 'Clique em “Salvar programa”. Apresente o combinado à equipe e aos clientes durante a entrada da mentoria. Confira o cartão do programa para verificar o que ficou configurado.' },
    ],
    expected: 'O programa tem calendário e prazos internos definidos e disponíveis para as novas obrigações de atendimento.',
    notes: [{ title: 'Mudanças preservam prazos antigos', text: 'Uma alteração da política vale para os novos prazos e não reescreve os que já foram abertos. O calendário trabalha com um expediente por dia; configure feriados explicitamente. Os prazos são internos da mentoria.' }],
    related: ['rotina-administracao', 'responder-atendimento', 'alertas'], action: { label: 'Abrir programas e prazos', route: '/programs' },
  },
  {
    id: 'funil-comercial', category: 'gestao', title: 'Gerencie oportunidades e confirme uma venda', roles: ['admin'],
    summary: 'Acompanhe o contato comercial e transforme um ganho em contratação sem pular a entrada.',
    prerequisites: ['Acesso de Administração; para converter, programa e dados da contratação definidos.'],
    steps: [
      { title: 'Prepare as etapas', text: 'Abra “Comercial e financeiro”. Na configuração de etapas, crie as etapas iniciais se a operação ainda não as tiver e ajuste nomes e ordem conforme seu processo.' },
      { title: 'Cadastre a oportunidade', text: 'No “Funil comercial”, clique em “Nova oportunidade”. Preencha nome, empresa, contato, e-mail ou telefone e responsável. Registre origem, programa e proposta quando conhecidos. Próxima ação e prazo devem ser informados juntos.' },
      { title: 'Atualize a negociação', text: 'Abra a oportunidade para editar dados, preencher o diagnóstico comercial e mover entre etapas. Registre apenas o que foi informado pelo vendedor. Perdas e reaberturas exigem motivo e mantêm histórico.' },
      { title: 'Confirme o ganho', text: 'Use “Confirmar ganho”. Vincule uma empresa existente ou cadastre uma nova, escolha programa, vigência e mentor. Revise e confirme a conversão para criar o ciclo da mentoria.' },
      { title: 'Conclua a entrada e o financeiro', text: 'Abra a contratação criada e confira o checklist na Jornada. Convide as pessoas autorizadas e registre as condições financeiras separadamente. O ganho não cria conta, senha, recebimento ou envio automático de convite.' },
    ],
    expected: 'A oportunidade ganha aponta para uma contratação e a equipe consegue continuar pela entrada do cliente.',
    related: ['cadastrar-cliente', 'checklist-e-revisao', 'financeiro-mentoria'], action: { label: 'Abrir funil comercial', route: '/commercial' },
  },
  {
    id: 'financeiro-mentoria', category: 'gestao', title: 'Registre valores contratados, recebimentos e estornos', roles: ['admin'],
    summary: 'Mantenha o registro administrativo dos valores da mentoria com histórico de correções.',
    prerequisites: ['Acesso de Administração e contratação cadastrada; comprovante ou confirmação real para registrar recebimento.'],
    steps: [
      { title: 'Registre o valor contratado', text: 'Em “Comercial e financeiro”, abra “Contratos e recebimentos” e use “Registrar valor contratado”. Escolha a contratação, informe valor total, data de assinatura e observações e confirme.' },
      { title: 'Registre somente o que foi recebido', text: 'Abra o registro financeiro e use “Registrar recebimento”. Informe valor efetivo, data do recebimento, forma e referência do comprovante quando houver. O vencimento acordado é opcional. Recebimentos não podem ter data futura.' },
      { title: 'Confira os totais', text: 'Leia valor contratado, total recebido e diferença. Sem recebimento informado, o total permanece “Não informado”. Se todos os recebimentos registrados tiverem sido estornados, o total é zero confirmado. Uma diferença negativa pode representar crédito.' },
      { title: 'Corrija preservando o histórico', text: 'Para o valor contratado, use “Corrigir registro” e informe o motivo. Para corrigir um recebimento, registre estorno com motivo e lance outro recebimento correto quando necessário.' },
      { title: 'Consulte o período com atenção', text: 'Nos relatórios comerciais, confira as datas e a amostra. Valores contratados seguem a assinatura; recebimentos seguem a data efetiva. Os recortes podem se referir a conjuntos diferentes de contratos.' },
    ],
    expected: 'Valores e recebimentos da mentoria ficam registrados explicitamente, com autoria e histórico de correções.',
    notes: [{ title: 'Registro administrativo', text: 'O formulário registra valores; ele não cobra o cliente, processa pagamentos, emite nota fiscal ou cria parcelas automaticamente. Os indicadores de vendas das lojas permanecem em “Indicadores e metas”.' }],
    related: ['funil-comercial', 'registrar-indicadores'], action: { label: 'Abrir financeiro da mentoria', route: '/commercial/finance' },
  },
  {
    id: 'integracoes', category: 'gestao', title: 'Entenda o estado das integrações externas', roles: ['admin'],
    summary: 'Consulte requisitos e diferencie intenção de ativar de uma conexão validada.',
    prerequisites: ['Acesso de Administração; responsável técnico disponível para a preparação e validação externa.'],
    steps: [
      { title: 'Abra o estado de cada provedor', text: 'Entre em “Integrações” e leia os cartões de Mercado Livre, WhatsApp e e-mail. Confira situação, preferência e registros reais apresentados pela tela.' },
      { title: 'Leia os requisitos', text: 'Abra “Ver requisitos e próximos passos”. Encaminhe as pendências ao responsável técnico. As credenciais são configuradas no servidor; não cole senhas, chaves ou tokens em atendimentos, materiais ou notas.' },
      { title: 'Registre a preferência se apropriado', text: '“Quero preparar esta integração” registra interesse em ativar. A preferência não conecta a conta, não valida credenciais e não envia mensagens.' },
      { title: 'Continue usando os fluxos internos', text: 'Nesta versão, envio automático, webhooks públicos e sincronização externa ainda aguardam ativação e validação. Registre indicadores manualmente ou por CSV e acompanhe as notificações dentro do Elo.' },
    ],
    expected: 'A administração conhece as pendências reais e não confunde preparação com uma integração em funcionamento.',
    related: ['registrar-indicadores', 'importar-csv', 'alertas'], action: { label: 'Consultar integrações', route: '/integrations' },
  },
  {
    id: 'alertas', category: 'referencia', title: 'Leia os alertas e trate a causa da pendência', roles: everyone,
    summary: 'Entenda a diferença entre tomar ciência de um aviso e resolver o que o gerou.',
    prerequisites: ['Estar conectado à plataforma.'],
    steps: [
      { title: 'Abra a central', text: 'Clique no sino do cabeçalho ou em “Central de alertas” no menu. Alterne entre “Pendentes de ciência” e “Todos os alertas” para conferir o histórico.' },
      { title: 'Leia o motivo e abra a origem', text: 'Confira a descrição e use o atalho do alerta para abrir atendimento, tarefa, plano, reunião ou ciclo. Alguns avisos são históricos; confirme a situação atual na origem.' },
      { title: 'Execute a ação correspondente', text: 'Responda uma dúvida, cumpra um retorno, trate um bloqueio, revise uma entrega, publique uma ata ou combine o próximo passo conforme o motivo. Administração e Mentor também devem conferir itens sem responsável.' },
      { title: 'Registre sua ciência', text: 'Use “Registrar ciência” quando tiver lido o aviso. Essa ação é individual: ela organiza seus avisos, mas não resolve o atendimento ou a tarefa.' },
      { title: 'Confira a atualização', text: 'Depois de tratar a causa, volte ao registro e ao painel. As consultas e verificações são periódicas; a atualização pode levar alguns instantes. Um aviso antigo continua no histórico mesmo depois da solução.' },
    ],
    expected: 'Você distingue avisos lidos de pendências resolvidas e age pelo registro que originou o alerta.',
    notes: [{ title: 'Onde chegam as notificações', text: 'Os avisos operacionais ficam dentro do Elo. Nesta versão, não conte com envio automático por e-mail ou WhatsApp para lembrar os compromissos.' }],
    related: ['acompanhar-atendimento', 'executar-tarefa', 'problemas-frequentes'], action: { label: 'Abrir Central de alertas', route: '/notifications' },
  },
  {
    id: 'problemas-frequentes', category: 'referencia', title: 'Resolva as dificuldades mais comuns', roles: everyone,
    summary: 'O que conferir quando falta um cliente, uma publicação, um arquivo ou uma permissão.',
    prerequisites: ['Identificar a tela, empresa e ciclo em que a dificuldade acontece.'],
    steps: [
      { title: 'Não consigo entrar ou o convite não funciona', text: 'Confira e-mail, senha e código atual do autenticador, quando exigido. Links de ativação são de uso único e têm validade. Peça à administração um novo link de recuperação quando necessário.' },
      { title: 'Não encontro uma empresa ou um registro', text: 'Limpe busca e filtros e confira período, situação e contratação. Verifique se está olhando o ciclo renovado ou o anterior. Se continuar ausente, peça conferência da autorização à empresa ou da atribuição vigente do mentor.' },
      { title: 'O mentorado não vê o que foi salvo', text: 'A equipe deve conferir se o diagnóstico, resultado, ata ou material foi publicado. Salvar rascunho não compartilha. Em materiais, confira também público e contratação. Notas internas e observações administrativas não são conteúdo compartilhado.' },
      { title: 'Não consigo editar ou enviar uma entrega', text: 'Confira responsável da tarefa, situação e contratação. Mentorado executa apenas tarefas próprias. Arquivos ficam bloqueados após a entrega; solicite ajustes à equipe. Ciclos pausados ou encerrados restringem alterações em vários módulos.' },
      { title: 'O sistema informa que alguém atualizou o registro', text: 'Não sobrescreva sem conferir. Copie as alterações que deseja preservar, releia a versão salva e refaça a edição com o conteúdo atual. “Recarregar versão salva” substitui o rascunho local, conforme o aviso da tela.' },
      { title: 'A ação continua falhando', text: 'Confira sua conexão e a mensagem apresentada. Para anexos, revise formato e tamanho; para CSV, revise os erros por linha. Ao pedir suporte à administração, informe tela, horário aproximado, empresa/ciclo, ação e texto do erro. Envie apenas as informações necessárias, sem senhas, códigos ou tokens.' },
    ],
    expected: 'Você identifica as conferências básicas e consegue encaminhar uma descrição útil quando precisa de suporte.',
    notes: [{ title: 'Não procure um caminho para contornar o acesso', text: 'Links compartilhados continuam sujeitos às permissões atuais. A administração deve conferir os vínculos quando um acesso legítimo estiver faltando.' }],
    related: ['primeiro-acesso', 'navegacao', 'anexar-arquivos', 'glossario'],
  },
  {
    id: 'glossario', category: 'referencia', title: 'Glossário: os termos usados no Elo', roles: everyone,
    summary: 'Uma referência rápida para entender os nomes que aparecem nos guias e nas telas.',
    prerequisites: [],
    steps: [
      { title: 'Empresa, contratação e programa', text: 'Empresa é o cliente cadastrado. Contratação ou ciclo é um período de mentoria dessa empresa. Programa define a modalidade, duração e política de atendimento. Vigência é o intervalo de início e fim do ciclo.' },
      { title: 'Carteira, atribuição e cobertura', text: 'Carteira é o conjunto de clientes que um mentor pode acompanhar. Atribuição é o vínculo de responsabilidade que dá esse acesso. Cobertura é uma atribuição temporária com fim definido.' },
      { title: 'Etapa e situação', text: 'Etapa indica o momento do acompanhamento, como entrada, diagnóstico ou execução. Situação indica a condição do ciclo, como ativo, pausado, encerrado ou cancelado. Alterar a etapa não executa as atividades daquela fase.' },
      { title: 'Diagnóstico, plano, tarefa e evidência', text: 'Diagnóstico registra a avaliação da operação. Plano organiza um objetivo e suas ações. Tarefa é uma ação com responsável, prazo e critério de conclusão. Evidência é o texto, link ou arquivo que permite verificar a entrega.' },
      { title: 'Rascunho, publicação e versão', text: 'Rascunho é o conteúdo em preparação. Publicação disponibiliza uma revisão para o público autorizado. Versão identifica qual publicação está sendo consultada e preserva o histórico quando há correções.' },
      { title: 'Prazo útil, promessa e acompanhamento', text: 'SLA é o prazo interno de atendimento conforme o programa. Minutos úteis seguem expediente e calendário. Promessa é um retorno com data absoluta. Acompanhamento relevante registra uma interação e um próximo passo; ler uma página não equivale a esse contato.' },
      { title: 'Indicadores e base de cálculo', text: 'Faturamento e pedidos descrevem resultados informados da loja. Ticket médio é faturamento dividido por pedidos; conversão é pedidos divididos por visitas. ROAS relaciona vendas atribuídas e investimento em anúncios; ACOS faz a relação inversa em percentual. TACOS relaciona investimento e faturamento. Margem estimada relaciona faturamento menos custos totais ao faturamento. As bases precisam ser compatíveis e confirmadas.' },
      { title: 'Parcial, fechado, não informado e CSV', text: 'Parcial indica um mês ainda em acompanhamento. Fechado indica dados consolidados pela equipe. “Não informado” significa ausência de valor ou base; é diferente de zero. CSV é um arquivo de texto organizado em colunas, usado para importar e exportar dados conforme o modelo da tela.' },
    ],
    expected: 'Você consegue interpretar os termos sem confundir acesso, execução, publicação e resultado.',
    related: ['conheca-o-elo', 'consultar-evolucao', 'alertas'],
  },
];

export const helpLearningPaths: Record<HelpRole, { title: string; articles: string[] }> = {
  admin: { title: 'Prepare a operação e acompanhe os primeiros clientes', articles: ['rotina-administracao', 'programas-e-prazos', 'usuarios-e-acessos', 'cadastrar-cliente', 'checklist-e-revisao', 'criar-plano'] },
  mentor: { title: 'Conheça a carteira e conduza o acompanhamento', articles: ['rotina-mentor', 'responder-atendimento', 'preparar-diagnostico', 'criar-plano', 'revisar-entrega', 'publicar-ata'] },
  mentee: { title: 'Encontre seus combinados e dê o próximo passo', articles: ['rotina-mentorado', 'abrir-atendimento', 'executar-tarefa', 'consultar-reunioes', 'consultar-evolucao', 'consultar-materiais'] },
};

export function normalizeHelpText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

export function searchHelpArticles(query: string, role: HelpRole, category?: string): HelpArticle[] {
  const words = (value: string) => normalizeHelpText(value).split(/[^a-z0-9]+/).filter(Boolean);
  const terms = words(query);
  return helpArticles.filter(article => article.roles.includes(role) && (!category || article.category === category))
    .map((article, index) => {
      const title = words(article.title);
      const content = words([article.summary, ...article.prerequisites, ...article.steps.flatMap(step => [step.title, step.text]), article.expected, ...(article.notes || []).flatMap(note => [note.title, note.text])].join(' '));
      const matches = (tokens: string[], term: string) => tokens.some(token => token.startsWith(term));
      return { article, index, matches: terms.every(term => matches(title, term) || matches(content, term)), score: terms.reduce((score, term) => score + (matches(title, term) ? 3 : 0), 0) };
    })
    .filter(result => result.matches)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(result => result.article);
}

export function helpReadingMinutes(article: HelpArticle): number {
  const words = [article.summary, ...article.prerequisites, ...article.steps.flatMap(step => [step.title, step.text]), article.expected, ...(article.notes || []).flatMap(note => [note.title, note.text])].join(' ').split(/\s+/).length;
  return Math.max(2, Math.ceil(words / 180));
}
