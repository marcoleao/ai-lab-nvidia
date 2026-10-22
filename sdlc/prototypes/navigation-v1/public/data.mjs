// Dados inteiramente fictícios. Este módulo não consulta nem altera o SDLC.
export const entities = [
  { id: 'system-atendimento', kind: 'system', key: 'SIS-01', name: 'Atendimento ao Cliente', description: 'Sistema fictício para acompanhar solicitações de atendimento.', parentId: null, status: 'active' },
  { id: 'system-pedidos', kind: 'system', key: 'SIS-02', name: 'Gestão de Pedidos', description: 'Sistema fictício para acompanhar pedidos e suas ocorrências.', parentId: null, status: 'active' },
  { id: 'project-atendimento', kind: 'project', key: 'PRJ-01', name: 'Atendimento Digital', description: 'Oferecer ao cliente uma consulta simples e acessível de suas solicitações.', parentId: 'system-atendimento', status: 'approved', lifecycle: 'active' },
  { id: 'project-triagem', kind: 'project', key: 'PRJ-02', name: 'Triagem Assistida', description: 'Avaliar uma nova experiência de triagem para a equipe de atendimento.', parentId: 'system-atendimento', status: 'awaiting_approval', lifecycle: 'planned' },
  { id: 'project-pedidos', kind: 'project', key: 'PRJ-03', name: 'Acompanhamento de Entregas', description: 'Dar visibilidade às ocorrências e aos prazos dos pedidos.', parentId: 'system-pedidos', status: 'approved', lifecycle: 'active' },
  { id: 'epic-consulta', kind: 'epic', key: 'EPC-01', name: 'Consulta de solicitações', description: 'Permitir que o cliente encontre suas solicitações e entenda o próximo passo de cada atendimento.', parentId: 'project-atendimento', status: 'doing' },
  { id: 'epic-acessibilidade', kind: 'epic', key: 'EPC-02', name: 'Acesso e acessibilidade', description: 'Garantir acesso seguro, linguagem clara e navegação por teclado.', parentId: 'project-atendimento', status: 'approved' },
  { id: 'epic-entregas', kind: 'epic', key: 'EPC-03', name: 'Visibilidade da entrega', description: 'Apresentar a previsão de entrega e as ocorrências que exigem atenção.', parentId: 'project-pedidos', status: 'todo' },
  { id: 'story-consulta', kind: 'story', key: 'HIS-01', name: 'Consultar andamento da solicitação', description: 'Como cliente, quero consultar a situação da minha solicitação para saber se preciso realizar alguma ação.', parentId: 'epic-consulta', status: 'specification', initialScenario: 'approval' },
  { id: 'story-notificacoes', kind: 'story', key: 'HIS-02', name: 'Receber aviso de atualização', description: 'Como cliente, quero ser avisado sobre mudanças relevantes na minha solicitação.', parentId: 'epic-consulta', status: 'coding', initialScenario: 'queued' },
  { id: 'story-protocolo', kind: 'story', key: 'HIS-03', name: 'Encontrar solicitação pelo protocolo', description: 'Como cliente, quero localizar uma solicitação pelo seu número de protocolo.', parentId: 'epic-consulta', status: 'coding', initialScenario: 'running' },
  { id: 'story-anexos', kind: 'story', key: 'HIS-04', name: 'Anexar documentos à solicitação', description: 'Como cliente, quero anexar documentos à solicitação e entender os tipos e limites aceitos.', parentId: 'epic-consulta', status: 'coding', initialScenario: 'impediment' },
  { id: 'story-filtros', kind: 'story', key: 'HIS-05', name: 'Filtrar solicitações por situação', description: 'Como cliente, quero filtrar minhas solicitações para encontrar as que precisam de atenção.', parentId: 'epic-consulta', status: 'coding', initialScenario: 'failed' },
  { id: 'story-resumo', kind: 'story', key: 'HIS-06', name: 'Visualizar resumo do atendimento', description: 'Como cliente, quero ver um resumo das últimas atualizações em linguagem clara.', parentId: 'epic-consulta', status: 'coding', initialScenario: 'mr' },
  { id: 'task-criterios', kind: 'task', key: 'TAR-01', name: 'Definir situações e critérios de aceite', description: 'Registrar o significado das situações e os critérios verificáveis para consulta.', parentId: 'story-consulta', status: 'done' },
  { id: 'task-consulta', kind: 'task', key: 'TAR-02', name: 'Construir a consulta de andamento', description: 'Apresentar o andamento, a última atualização e a próxima ação esperada.', parentId: 'story-consulta', status: 'todo' },
  { id: 'task-acessibilidade', kind: 'task', key: 'TAR-03', name: 'Verificar teclado e mensagens', description: 'Conferir foco, rótulos e compreensão das mensagens do fluxo de consulta.', parentId: 'story-consulta', status: 'todo' },
  { id: 'task-protocolo', kind: 'task', key: 'TAR-04', name: 'Implementar busca por protocolo', description: 'Atividade fictícia de geração da busca e tratamento de resultado vazio.', parentId: 'story-protocolo', status: 'doing' },
  { id: 'task-documentos', kind: 'task', key: 'TAR-05', name: 'Definir tipos e limite dos anexos', description: 'Aguardar decisão explícita sobre os formatos aceitos e o tamanho máximo por arquivo.', parentId: 'story-anexos', status: 'todo' },
  { id: 'task-filtros', kind: 'task', key: 'TAR-06', name: 'Corrigir proposta de filtros', description: 'Retomar a correção técnica do patch, preservando as decisões e as permissões aprovadas.', parentId: 'story-filtros', status: 'doing' },
  { id: 'task-resumo', kind: 'task', key: 'TAR-07', name: 'Preparar proposta de resumo', description: 'Proposta fictícia disponível para consulta. Revisão e testes ainda não executados.', parentId: 'story-resumo', status: 'done' },
];

const technical = (operation, attempt = 1) => ({ model: 'Modelo de demonstração · nenhuma chamada real', operation, attempt });
const event = (time, title, description) => ({ time, title, description });

export const scenarios = {
  approval: {
    label: 'Aprovação da especificação', businessStatus: 'SPECIFICATION', executionStatus: 'WAITING APPROVAL',
    title: 'Especificação pronta para sua revisão',
    description: 'Leia o objetivo, os critérios e os riscos antes de aprovar o início da geração de código. Esta aprovação é a decisão G1 simulada.',
    who: 'Pessoa responsável pela aprovação', nextAction: 'review_spec', actionLabel: 'Revisar especificação', stage: 'Especificação',
    events: [event('14:28', 'Especificação preparada', 'Objetivo, critérios de aceite e riscos disponíveis para revisão.'), event('14:29', 'Aguardando aprovação G1', 'A geração de código ainda não começou.')],
    technical: technical('Aguardando decisão G1'),
  },
  queued: {
    label: 'Aguardando na fila', businessStatus: 'CODING', executionStatus: 'QUEUED',
    title: 'Pedido recebido; aguardando processamento',
    description: 'A especificação foi aprovada. O pedido está na fila e nenhuma geração começou. Não é necessário reenviar.',
    who: 'Executor do SDLC', nextAction: 'advance_demo', actionLabel: 'Simular início do processamento', stage: 'Fila de geração',
    events: [event('14:30', 'Especificação aprovada', 'A decisão G1 e a versão da especificação foram registradas na simulação.'), event('14:31', 'Pedido colocado na fila', 'Aguarda um executor disponível.')],
    technical: technical('Fila · nenhuma chamada ao modelo iniciada'),
  },
  running: {
    label: 'Geração em andamento', businessStatus: 'CODING', executionStatus: 'RUNNING',
    title: 'Aguardando resposta do modelo',
    description: 'A solicitação ao modelo foi enviada. A resposta ainda não chegou; não há evidência de progresso interno nem percentual disponível. Você pode navegar e voltar depois.',
    who: 'Agente de implementação', nextAction: 'advance_demo', actionLabel: 'Simular resposta do modelo', stage: 'Geração de código',
    events: [event('14:31', 'Executor iniciou a etapa', 'A versão aprovada e o contexto de implementação foram carregados.'), event('14:32', 'Solicitação enviada ao modelo', 'Último evento confirmado. Nenhuma resposta recebida até este ponto da simulação.')],
    technical: technical('Geração · aguardando resposta completa'),
  },
  impediment: {
    label: 'Decisão necessária', businessStatus: 'CODING', executionStatus: 'WAITING INPUT',
    title: 'É preciso definir os tipos e o limite dos anexos',
    description: 'A especificação não define os formatos aceitos e o tamanho por arquivo. O agente interrompeu a geração e fez uma pergunta. A conversa e a aprovação anterior estão preservadas. O exemplo seguirá uma resposta hardcoded: PDF e imagens de até 10 MB.',
    who: 'Pessoa responsável pelo negócio', nextAction: 'respond', actionLabel: 'Responder impedimento', stage: 'Decisão de negócio',
    events: [event('14:32', 'Contexto analisado', 'O agente encontrou tipos e limites dos anexos ainda não especificados.'), event('14:33', 'Pergunta registrada', 'Nenhuma decisão real foi escolhida. A conversa usa um encaminhamento fictício declarado.')],
    technical: technical('Discussão · decisão pendente'),
  },
  failed: {
    label: 'Falha de validação do patch', businessStatus: 'CODING', executionStatus: 'FAILED',
    title: 'Falha na validação: arquivo duplicado',
    description: 'A validação encontrou um caminho duplicado após a primeira tentativa e duas correções automáticas. A execução foi interrompida sem publicar código. A especificação, a aprovação G1 e as permissões continuam preservadas. Retomar inicia um novo ciclo limitado de correção técnica.',
    who: 'Pessoa autorizada a retomar a execução', nextAction: 'retry', actionLabel: 'Retomar correção técnica', stage: 'Validação da proposta · limite atingido',
    events: [event('14:33', 'Primeira proposta recusada', 'DUPLICATE_PATH: src/consulta.js apareceu duas vezes no patch fictício.'), event('14:34', 'Correções automáticas executadas', 'As tentativas 2 e 3 receberam o diagnóstico, mas repetiram a falha técnica.'), event('14:35', 'Limite de correções atingido', 'A execução parou após três tentativas. Nenhuma publicação foi iniciada.')],
    technical: technical('Validação · DUPLICATE_PATH: src/consulta.js', 3),
  },
  mr: {
    label: 'Proposta de código disponível', businessStatus: 'CODING', executionStatus: 'SUCCEEDED',
    title: 'Merge Request em rascunho criado',
    description: 'A proposta de código está disponível para consulta. A História continua em CODING: revisão, segurança, testes e implantação ainda não foram executados. Essas próximas capacidades estão indisponíveis na versão atual.',
    who: 'Equipe pode consultar a proposta', nextAction: 'view_delivery', actionLabel: 'Consultar proposta de código', stage: 'Proposta publicada',
    events: [event('14:34', 'Proposta validada', 'Validação da estrutura do resultado concluída; isso não comprova testes funcionais.'), event('14:36', 'Publicação confirmada', 'Merge Request fictício em rascunho disponível. Nenhum deploy realizado.')],
    technical: technical('Publicação · Merge Request em rascunho'),
  },
  communication: {
    label: 'Falha ao atualizar a tela', businessStatus: 'CODING', executionStatus: 'STATUS UNAVAILABLE',
    title: 'Não foi possível atualizar a situação',
    description: 'A tela perdeu a conexão. Na última consulta bem-sucedida, às 14:32, o modelo ainda estava processando. Isso não confirma uma falha da execução e não deve criar um novo pedido.',
    who: 'Interface · reconectar para consultar a situação', nextAction: 'retry_connection', actionLabel: 'Tentar atualizar a situação', stage: 'Última informação: geração de código',
    events: [event('14:32', 'Última consulta bem-sucedida', 'A execução estava aguardando a resposta do modelo.'), event('14:34', 'Atualização da tela falhou', 'O estado atual da execução é desconhecido. Nenhuma execução foi cancelada.')],
    technical: technical('Consulta da interface · conexão indisponível'),
  },
  correcting: {
    label: 'Correção técnica automática', businessStatus: 'CODING', executionStatus: 'RUNNING',
    title: 'Agente corrigindo o formato da proposta',
    description: 'A primeira resposta repetiu um arquivo. O agente recebeu o diagnóstico e está corrigindo essa falha técnica, sem mudar o escopo ou as permissões aprovadas. Você não precisa repetir a conversa.',
    who: 'Agente de implementação', nextAction: 'advance_demo', actionLabel: 'Simular correção concluída', stage: 'Correção técnica · tentativa 2 de 3',
    events: [event('14:33', 'Validação recusou a proposta', 'O mesmo caminho de arquivo apareceu duas vezes.'), event('14:34', 'Correção técnica iniciada', 'Diagnóstico enviado ao agente. Limite de duas correções automáticas após a primeira tentativa.')],
    technical: technical('Validação · DUPLICATE_PATH: src/consulta.js', 2),
  },
  decisionReview: {
    label: 'Revisão da decisão', businessStatus: 'CODING', executionStatus: 'WAITING INPUT',
    title: 'Confira a decisão antes de atualizar a especificação',
    description: 'O encaminhamento hardcoded aceita PDF e imagens de até 10 MB por arquivo. Confira o resumo e o efeito. Confirmar atualiza a especificação e solicita nova revisão G1; ainda não retoma a geração. Nenhuma decisão real será registrada.',
    who: 'Pessoa responsável pelo negócio', nextAction: 'review_decision', actionLabel: 'Revisar decisão proposta', stage: 'Confirmação da decisão',
    events: [event('14:34', 'Resposta recebida', 'A conversa preservou o contexto da História e apresentou o encaminhamento fixo de exemplo.'), event('14:35', 'Decisão resumida para confirmação', 'PDF e imagens de até 10 MB por arquivo. Nenhuma alteração foi aplicada sem sua confirmação simulada.')],
    technical: technical('Discussão · proposta de decisão'),
  },
  regate: {
    label: 'Revisão da especificação atualizada', businessStatus: 'SPECIFICATION', executionStatus: 'WAITING APPROVAL',
    title: 'Decisão aplicada; revise a especificação atualizada',
    description: 'A decisão simulada de aceitar PDF e imagens de até 10 MB por anexo foi incorporada à especificação do exemplo. Confira seu impacto nos requisitos e nos critérios de aceite. A geração aguarda nova aprovação G1.',
    who: 'Pessoa responsável pela aprovação', nextAction: 'review_spec', actionLabel: 'Revisar especificação atualizada', stage: 'Nova revisão G1',
    events: [event('14:36', 'Decisão confirmada', 'O resumo foi confirmado explicitamente nesta simulação.'), event('14:37', 'Especificação atualizada', 'Nova versão aguardando aprovação; geração ainda não retomada.')],
    technical: technical('Aguardando G1 · nova versão'),
  },
  cancelled: {
    label: 'Execução cancelada', businessStatus: 'CODING', executionStatus: 'CANCELLED',
    title: 'Continuidade desta execução cancelada',
    description: 'A continuidade foi interrompida e os registros foram preservados. Uma chamada ao modelo que já estivesse em andamento poderia terminar, mas seu resultado não autorizaria publicação. A História não foi concluída.',
    who: 'Pessoa autorizada a preparar nova execução', nextAction: 'prepare_run', actionLabel: 'Preparar nova execução simulada', stage: 'Execução encerrada',
    events: [event('14:33', 'Cancelamento solicitado', 'Interromper a continuidade não garante abortar uma chamada já enviada ao modelo.'), event('14:34', 'Cancelamento registrado', 'Nenhum novo passo de publicação será iniciado nesta execução simulada.')],
    technical: technical('Execução · continuidade cancelada'),
  },
};

export const specification = {
  objective: 'Permitir que o cliente acompanhe uma solicitação e entenda, em linguagem simples, sua situação atual e a próxima ação esperada.',
  requirements: [
    'Consultar uma solicitação pelo protocolo dentro do contexto do cliente autenticado.',
    'Mostrar situação, última atualização confirmada e eventual ação necessária.',
    'Explicar resultado vazio, indisponibilidade e impedimentos sem expor dados de outro cliente.',
    'Preservar filtros e contexto ao voltar da consulta para a lista.',
  ],
  acceptance: [
    'Dado um protocolo válido do cliente, exibir a solicitação correspondente e sua última atualização.',
    'Dado um protocolo inexistente ou sem acesso, apresentar mensagem clara sem revelar informações de terceiros.',
    'Se a consulta falhar, preservar o protocolo informado e oferecer nova consulta.',
    'Permitir concluir a consulta por teclado, com rótulos e foco visíveis.',
  ],
  architecture: 'Proposta fictícia: interface de consulta com serviço de solicitações e verificação de acesso. As decisões técnicas e os arquivos seriam aprofundados aqui. Este protótipo não possui API, autenticação, repositório ou modelo de IA conectados.',
  risks: [
    'Exposição de dados de outro cliente se a autorização não for verificada.',
    'Confundir uma informação antiga com uma atualização em tempo real.',
    'Formatos aceitos e tamanho máximo dos anexos precisam de decisão explícita quando anexos fizerem parte do escopo. O cenário demonstrativo utiliza PDF e imagens de até 10 MB por arquivo.',
  ],
  testCases: [
    'Consulta com protocolo válido, protocolo não encontrado e solicitação sem autorização.',
    'Serviço indisponível, preservação do campo e nova tentativa de consulta.',
    'Navegação por teclado, foco após erro e compreensão da última atualização.',
    'Retorno à lista com filtros preservados.',
  ],
};

export const initialMessages = [
  { role: 'assistant', content: 'Encontrei uma decisão pendente: quais tipos de anexo e qual limite por arquivo devem ser aceitos? A especificação ainda não define esses critérios.' },
  { role: 'assistant', content: 'Para testar a navegação, esta conversa seguirá o encaminhamento hardcoded de PDF e imagens de até 10 MB por arquivo, independentemente do texto enviado. Você revisará o resumo antes de confirmar. Nenhuma decisão real será registrada e nenhuma IA está conectada.' },
];

export const walkthrough = [
  { title: 'Do macro para o detalhe', description: 'Abra Atendimento ao Cliente → Atendimento Digital → Consulta de solicitações. Cada página apresenta apenas seus filhos imediatos.', entityId: 'system-atendimento' },
  { title: 'Entenda a próxima decisão', description: 'Abra Consultar andamento da solicitação e use Revisar especificação. A aprovação explícita leva à fila simulada.', entityId: 'story-consulta', scenario: 'approval' },
  { title: 'Acompanhe sem adivinhar', description: 'Explore fila, geração e correção técnica. Os eventos indicam o que foi confirmado e o que ainda é desconhecido.', entityId: 'story-protocolo', scenario: 'running' },
  { title: 'Resolva um impedimento', description: 'Abra a conversa no contexto da História, confira a decisão proposta e revise a nova especificação antes de retomar.', entityId: 'story-anexos', scenario: 'impediment' },
  { title: 'Recupere uma falha técnica', description: 'Veja o diagnóstico de caminho duplicado e retome a correção técnica após o limite de três tentativas. Uma falha de atualização da tela é apresentada separadamente.', entityId: 'story-filtros', scenario: 'failed' },
  { title: 'Reconheça o limite da entrega', description: 'Consulte o Merge Request fictício. A História continua em CODING; revisão, segurança, testes e implantação permanecem indisponíveis.', entityId: 'story-resumo', scenario: 'mr' },
];
