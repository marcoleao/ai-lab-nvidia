/*
 * Acervo inteiramente fictício e determinístico para a apresentação offline.
 * Não contém dados exportados, credenciais, chamadas externas ou resultados reais.
 * Vocabulário de estados: sdlc/portal/packages/shared/src/states.ts.
 */
(function () {
  'use strict';

  var asOf = '2026-11-02T15:00:00-03:00';
  var items = [];
  var events = [];
  var conversations = [];
  var phases = ['specification', 'approved', 'coding', 'code_review', 'security_scan', 'merge_request', 'testing', 'uat', 'production', 'completed'];
  var labels = { system: 'Sistema', project: 'Projeto', epic: 'Épico', story: 'História', task: 'Tarefa' };
  var DAY = 86400000;
  var cutoff = new Date(asOf).getTime();

  function timestamp(offset, hour) {
    return new Date(cutoff - offset * DAY - (hour || 0) * 3600000).toISOString();
  }

  function add(id, kind, key, name, parentId, status, description, extra) {
    var order = items.length;
    var record = Object.assign({
      id: id, kind: kind, key: key, name: name, parentId: parentId,
      description: description, status: status, archived: false, revision: 1,
      createdAt: timestamp(42 + order % 13, 2), updatedAt: timestamp(order % 17, 1)
    }, extra || {});
    if (['system', 'project', 'epic'].indexOf(kind) !== -1) record.lifecycle = status;
    items.push(record);
    return record;
  }

  add('aurora', 'system', 'AURORA', 'Aurora · Comércio digital', null, 'active', 'Plataforma fictícia de catálogo, pedidos e pagamentos. Jornada principal da demonstração: do requisito de negócio à entrega de uma candidata imutável.');
  add('orion', 'system', 'ORIONS', 'Orion · Atendimento ao cliente', null, 'active', 'Central fictícia de atendimento com distribuição de solicitações, acompanhamento de prazos e histórico de relacionamento.');
  add('nexus', 'system', 'NEXUSD', 'Nexus · Gestão documental', null, 'active', 'Gestão fictícia de documentos com pesquisa, classificação, controle de acesso e trilha de alterações.');
  add('pulse', 'system', 'PULSES', 'Pulse · Inteligência operacional', null, 'inactive', 'Sistema fictício temporariamente inativo. A árvore permanece disponível para consulta; nenhuma execução é iniciada ao navegar.', { blocker: 'Sistema temporariamente inativo por revisão de prioridades. A retomada depende de uma decisão explícita.' });
  add('atlas', 'system', 'ATLASF', 'Atlas · Conciliação fiscal', null, 'inactive', 'Sistema fictício desativado após a conclusão da iniciativa fiscal. As entregas concluídas e as decisões de cancelamento continuam consultáveis.');
  add('legado', 'system', 'LEGACY', 'Legado · Acervo de migração', null, 'inactive', 'Sistema fictício arquivado após migração concluída. O acervo preserva os estados e as evidências de exemplo.', { archived: true });

  add('aurora-catalogo', 'project', 'CATALO', 'Evolução do catálogo digital', 'aurora', 'active', 'Facilitar a descoberta de produtos e oferecer uma experiência de catálogo consistente em diferentes dispositivos.');
  add('aurora-checkout', 'project', 'CHECKO', 'Checkout e acompanhamento de pedidos', 'aurora', 'active', 'Reduzir o esforço para concluir uma compra e consultar seu andamento.');
  add('aurora-vitrine', 'project', 'VITRIN', 'Lançamento da vitrine digital', 'aurora', 'completed', 'Iniciativa fictícia já entregue em produção, mantida como exemplo de projeto concluído.');
  add('orion-atendimento', 'project', 'ATENDE', 'Atendimento omnicanal', 'orion', 'active', 'Organizar a triagem e acompanhar compromissos de atendimento.');
  add('orion-autosservico', 'project', 'AUTOSS', 'Autosserviço do cliente', 'orion', 'inactive', 'Iniciativa fictícia pausada antes da próxima fatia. As situações dos descendentes foram preservadas.', { blocker: 'Projeto temporariamente pausado por decisão de negócio.' });
  add('nexus-documentos', 'project', 'DOCUME', 'Documentos com rastreabilidade', 'nexus', 'active', 'Disponibilizar documentos com acesso controlado e pesquisa por conteúdo.');
  add('nexus-assinatura', 'project', 'ASSINA', 'Assinatura de documentos', 'nexus', 'cancelled', 'Iniciativa fictícia cancelada após revisão de escopo; a história cancelada permanece no histórico.');
  add('pulse-indicadores', 'project', 'INDICA', 'Indicadores operacionais', 'pulse', 'inactive', 'Consolidar informações de operação. O trabalho está suspenso com o Sistema.');
  add('atlas-fiscal', 'project', 'FISCAL', 'Conciliação e conformidade', 'atlas', 'completed', 'Iniciativa encerrada com uma entrega confirmada e uma fatia cancelada.');
  add('legado-migracao', 'project', 'MIGRAR', 'Migração do acervo histórico', 'legado', 'completed', 'Iniciativa de migração concluída e arquivada.', { archived: true });

  add('aurora-descoberta', 'epic', 'AUR-E01', 'Descoberta de produtos', 'aurora-catalogo', 'active', 'Permitir que clientes encontrem produtos e consultem informações confiáveis.');
  add('aurora-experiencia', 'epic', 'AUR-E02', 'Experiência de navegação', 'aurora-catalogo', 'active', 'Melhorar filtros, acessibilidade e comparação de produtos.');
  add('aurora-pagamentos', 'epic', 'AUR-E03', 'Pagamento seguro', 'aurora-checkout', 'active', 'Oferecer confirmação clara de pagamento e tratar recusas com orientação.');
  add('aurora-pedidos', 'epic', 'AUR-E04', 'Pedidos e devoluções', 'aurora-checkout', 'active', 'Acompanhar entregas e solicitar devoluções.');
  add('aurora-lancamento', 'epic', 'AUR-E05', 'Vitrine inicial', 'aurora-vitrine', 'completed', 'Primeira entrega da vitrine, concluída em produção.');
  add('orion-triagem', 'epic', 'ORI-E01', 'Triagem de solicitações', 'orion-atendimento', 'active', 'Classificar e encaminhar solicitações por especialidade.');
  add('orion-prazos', 'epic', 'ORI-E02', 'Compromissos e prazos', 'orion-atendimento', 'active', 'Acompanhar o prazo de resposta de cada solicitação.');
  add('orion-base', 'epic', 'ORI-E03', 'Base de conhecimento', 'orion-autosservico', 'inactive', 'Publicar orientações de autosserviço. Trabalho pausado com o Projeto.');
  add('nexus-ingestao', 'epic', 'NEX-E01', 'Recepção de documentos', 'nexus-documentos', 'active', 'Receber arquivos e preservar seu contexto de origem.');
  add('nexus-pesquisa', 'epic', 'NEX-E02', 'Pesquisa documental', 'nexus-documentos', 'active', 'Encontrar documentos por classificação e conteúdo.');
  add('nexus-certificados', 'epic', 'NEX-E03', 'Assinatura com certificado', 'nexus-assinatura', 'cancelled', 'Fatia cancelada por revisão do escopo de negócio.');
  add('pulse-paineis', 'epic', 'PUL-E01', 'Painéis operacionais', 'pulse-indicadores', 'inactive', 'Consultar indicadores operacionais em um contexto único.');
  add('pulse-alertas', 'epic', 'PUL-E02', 'Alertas de tendência', 'pulse-indicadores', 'inactive', 'Sinalizar desvios de tendência; iniciativa suspensa.');
  add('atlas-conciliacao', 'epic', 'ATL-E01', 'Conciliação de lançamentos', 'atlas-fiscal', 'completed', 'Conciliação entregue e confirmada em produção.');
  add('atlas-compliance', 'epic', 'ATL-E02', 'Notificações de conformidade', 'atlas-fiscal', 'cancelled', 'Fatia cancelada antes de codificação, preservada para rastreabilidade.');
  add('legado-importacao', 'epic', 'LEG-E01', 'Importação do histórico', 'legado-migracao', 'completed', 'Importação fictícia concluída; conteúdo disponível somente para consulta.', { archived: true });

  var storyDefinitions = [
    ['aurora-busca', 'aurora-descoberta', 'Buscar produtos por nome', 6, 'Como cliente, quero buscar produtos por nome para encontrar rapidamente o que desejo comprar.', { devApproved: true, revision: 3 }],
    ['aurora-detalhe', 'aurora-descoberta', 'Consultar detalhes do produto', 6, 'Como cliente, quero consultar descrição, imagens e disponibilidade antes de decidir pela compra.', { devApproved: true, revision: 2 }],
    ['aurora-disponibilidade', 'aurora-descoberta', 'Exibir disponibilidade por região', 0, 'Como cliente, quero saber se o produto pode ser entregue na minha região antes de adicioná-lo ao carrinho.', { blocker: 'Dependência impeditiva: confirmar a regra de cobertura regional com a área de logística.' }],
    ['aurora-categorias', 'aurora-descoberta', 'Navegar por categorias', 2, 'Como cliente, quero navegar por categorias para descobrir produtos relacionados ao meu interesse.'],
    ['aurora-filtros', 'aurora-experiencia', 'Filtrar catálogo por faixa de preço', 3, 'Como cliente, quero filtrar os resultados por preço para comparar produtos dentro do meu orçamento.'],
    ['aurora-acessibilidade', 'aurora-experiencia', 'Navegar pelo catálogo com teclado', 4, 'Como cliente que utiliza teclado, quero acessar filtros e produtos com foco visível e ordem previsível.'],
    ['aurora-comparacao', 'aurora-experiencia', 'Comparar produtos selecionados', 5, 'Como cliente, quero comparar características de dois produtos para escolher a opção mais adequada.', { blocker: 'Merge impedido: a revisão ainda está em Draft. A liberação precisa de uma decisão explícita.' }],
    ['aurora-favoritos', 'aurora-experiencia', 'Salvar produtos favoritos', 1, 'Como cliente, quero salvar produtos favoritos para retornar a eles depois.'],
    ['aurora-pix', 'aurora-pagamentos', 'Confirmar pagamento por Pix', 6, 'Como cliente, quero receber confirmação do pagamento para saber que meu pedido foi registrado.', { devApproved: true }],
    ['aurora-cartao', 'aurora-pagamentos', 'Orientar uma recusa de pagamento', 7, 'Como cliente, quero compreender uma recusa de pagamento e conhecer as alternativas disponíveis.', { devApproved: true }],
    ['aurora-resumo', 'aurora-pagamentos', 'Conferir resumo antes de pagar', 6, 'Como cliente, quero conferir valores e endereço antes de confirmar o pagamento.', { devApproved: false }],
    ['aurora-rastreamento', 'aurora-pedidos', 'Acompanhar situação do pedido', 0, 'Como cliente, quero acompanhar o andamento do pedido sem precisar entrar em contato com o atendimento.'],
    ['aurora-devolucao', 'aurora-pedidos', 'Solicitar devolução de produto', 2, 'Como cliente, quero solicitar a devolução de um produto e acompanhar sua análise.'],
    ['aurora-reembolso', 'aurora-pedidos', 'Consultar previsão de reembolso', 6, 'Como cliente, quero consultar a previsão de reembolso após a aprovação da devolução.', { devApproved: true, revision: 2, blocker: 'A candidata anterior foi reprovada em QA. A revisão 2 foi validada novamente em DEV e a candidata sucessora está repetindo o QA completo.' }],
    ['aurora-vitrine-inicial', 'aurora-lancamento', 'Consultar a vitrine inicial', 9, 'Como visitante, quero consultar a vitrine inicial de produtos.', { devApproved: true }],
    ['aurora-destaques', 'aurora-lancamento', 'Consultar produtos em destaque', 9, 'Como visitante, quero conhecer os produtos em destaque na página inicial.', { devApproved: true }],
    ['orion-classificacao', 'orion-triagem', 'Classificar uma solicitação', 1, 'Como atendente, quero classificar a solicitação para encaminhá-la ao time adequado.'],
    ['orion-distribuicao', 'orion-triagem', 'Distribuir solicitações por especialidade', 3, 'Como supervisor, quero distribuir solicitações considerando a especialidade do time.'],
    ['orion-anexos', 'orion-triagem', 'Proteger anexos de solicitações', 4, 'Como solicitante, quero que somente pessoas autorizadas consultem meus anexos.', { blocker: 'Security Scan reprovado: falta validar a autorização na consulta do anexo. A aprovação anterior não vale para uma nova revisão.' }],
    ['orion-sla', 'orion-prazos', 'Definir compromisso de resposta', 0, 'Como supervisor, quero definir o compromisso de resposta conforme a prioridade da solicitação.'],
    ['orion-alerta', 'orion-prazos', 'Alertar aproximação do prazo', 6, 'Como atendente, quero receber um aviso antes do vencimento do prazo de resposta.', { devApproved: true }],
    ['orion-janela', 'orion-prazos', 'Exibir janela de atendimento', 8, 'Como cliente, quero consultar a janela de atendimento e o próximo horário disponível.', { devApproved: true, blocker: 'Resultado da implantação em PROD ainda não confirmado. Consultar o histórico não conclui a História.' }],
    ['orion-artigos', 'orion-base', 'Consultar artigos de ajuda', 0, 'Como cliente, quero consultar artigos de ajuda antes de abrir uma solicitação.', { blocker: 'Projeto de autosserviço temporariamente inativo. A consulta continua disponível.' }],
    ['orion-sugestoes', 'orion-base', 'Sugerir artigos relacionados', 2, 'Como cliente, quero receber sugestões de artigos relacionados à minha dúvida.', { blocker: 'Execução pausada pelo contexto do Projeto. O status de desenvolvimento foi preservado.' }],
    ['nexus-upload', 'nexus-ingestao', 'Enviar documento com classificação', 0, 'Como analista, quero enviar um documento com sua classificação para organizar o acervo.'],
    ['nexus-validacao', 'nexus-ingestao', 'Validar formato do documento', 2, 'Como analista, quero receber uma mensagem clara quando um arquivo não atende aos formatos permitidos.'],
    ['nexus-origem', 'nexus-ingestao', 'Consultar origem do documento', 6, 'Como auditor, quero consultar a origem e a data de recepção de um documento.', { devApproved: false, blocker: 'Teste técnico em DEV aprovado; o aceite humano global da História ainda está pendente.' }],
    ['nexus-texto', 'nexus-pesquisa', 'Pesquisar documentos por conteúdo', 0, 'Como analista, quero pesquisar o conteúdo textual dos documentos autorizados.'],
    ['nexus-taxonomia', 'nexus-pesquisa', 'Filtrar documentos por classificação', 1, 'Como analista, quero restringir a pesquisa às classificações relevantes.'],
    ['nexus-assinar', 'nexus-certificados', 'Assinar documento com certificado', -1, 'Como responsável, eu poderia assinar documentos com certificado. Esta fatia foi cancelada após revisão de escopo.'],
    ['pulse-indicador', 'pulse-paineis', 'Consultar indicador de atendimento', 0, 'Como gestor, quero consultar o volume de solicitações abertas no período.', { blocker: 'Sistema e Projeto inativos. A retomada precisa de decisão humana.' }],
    ['pulse-tendencia', 'pulse-alertas', 'Identificar tendência de aumento de fila', 6, 'Como gestor, quero reconhecer uma tendência de aumento de fila para avaliar capacidade.', { devApproved: false, blocker: 'Trabalho suspenso pelo Sistema. Evidência parcial em DEV não constitui aceite global.' }],
    ['atlas-conferir', 'atlas-conciliacao', 'Conferir lançamentos conciliados', 9, 'Como analista fiscal, quero conferir os lançamentos conciliados e suas referências.', { devApproved: true }],
    ['atlas-notificar', 'atlas-compliance', 'Receber aviso de divergência fiscal', -1, 'Como analista fiscal, eu poderia receber avisos de divergência. A fatia foi cancelada antes da implementação.'],
    ['legado-importar', 'legado-importacao', 'Importar histórico de solicitações', 9, 'Como auditor, quero consultar o histórico importado preservando sua origem.', { devApproved: true, archived: true }],
    ['legado-conferir', 'legado-importacao', 'Conferir integridade da migração', 9, 'Como auditor, quero conferir a integridade do acervo após a migração.', { devApproved: true, archived: true }]
  ];

  storyDefinitions.forEach(function (definition, index) {
    var phase = definition[3];
    var extra = Object.assign({ phase: Math.max(0, phase), devApproved: false }, definition[5] || {});
    var story = add(definition[0], 'story', 'H-' + String(index + 1).padStart(3, '0'), definition[2], definition[1], phase < 0 ? 'cancelled' : phases[phase], definition[4], extra);
    story.criteria = [
      { text: 'Apresentar o comportamento solicitado com informações claras e consistentes.', result: story.devApproved ? 'passed' : 'pending' },
      { text: 'Validar entradas obrigatórias e orientar a correção quando houver erro.', result: story.devApproved ? 'passed' : (phase === 6 && index % 2 === 0 ? 'failed' : 'pending') },
      { text: 'Permitir navegação por teclado com foco visível e rótulos acessíveis.', result: story.devApproved ? 'passed' : 'pending' },
      { text: 'Preservar o contexto e as informações após recarregar a página.', result: story.devApproved ? 'passed' : 'pending' }
    ];

    var taskDefinitions = [
      ['codificacao', 'Codificação', 2], ['revisao', 'Revisão de Código', 3],
      ['seguranca', 'Revisão de Segurança', 4], ['merge', 'Merge de Código', 5],
      ['dev', 'Teste em DEV', 6], ['qa', 'Teste em QA', 7]
    ];
    taskDefinitions.forEach(function (taskDefinition, taskIndex) {
      var taskStatus = phase < 0 ? 'cancelled' : phase > taskDefinition[2] ? 'done' : phase === taskDefinition[2] ? 'doing' : 'todo';
      if (taskDefinition[0] === 'dev' && story.devApproved) taskStatus = 'done';
      if (story.id === 'orion-anexos' && taskDefinition[0] === 'seguranca') taskStatus = 'doing';
      if (story.id === 'aurora-reembolso' && taskDefinition[0] === 'qa') taskStatus = 'doing';
      var task = add(story.id + '-' + taskDefinition[0], 'task', story.key + '-T' + String(taskIndex + 1), taskDefinition[1], story.id, taskStatus,
        taskDefinition[1] + ' da História “' + story.name + '”. Evidências e resultados desta tarefa são exemplos fictícios, independentes da aprovação global e da conclusão em produção.',
        { archived: story.archived, revision: story.revision });
      if (taskStatus === 'done') task.updatedAt = story.updatedAt;
    });
  });

  function digest(seed) {
    var value = '';
    for (var i = 0; i < 8; i += 1) value += ((seed * 2654435761 + i * 15485863) >>> 0).toString(16).padStart(8, '0');
    return 'sha256:' + value;
  }

  var releases = [
    { id: 'aurora-demo', key: 'AUR-2026.11', name: 'Catálogo · Busca e detalhes', systemId: 'aurora', status: 'OPEN', environment: 'DEV', scenario: 'ready', storyIds: ['aurora-busca', 'aurora-detalhe'], version: '1.4.0', candidate: null, digest: null, description: 'Percurso principal da apresentação. Todas as Histórias possuem Desenvolvimento Finalizado em DEV; a promoção ilustrativa fixa a candidata e mantém o mesmo artefato em QA, HML e PROD.' },
    { id: 'aurora-dev-pendente', key: 'AUR-2026.12', name: 'Catálogo · Disponibilidade e categorias', systemId: 'aurora', status: 'OPEN', environment: 'DEV', scenario: 'blocked', storyIds: ['aurora-disponibilidade', 'aurora-categorias'], version: '1.5.0', candidate: null, digest: null, description: 'Composição de trabalho ainda não elegível para QA.', blocker: 'As duas Histórias ainda não possuem aprovação válida de Desenvolvimento Finalizado. Há uma dependência de logística pendente.' },
    { id: 'aurora-qa', key: 'AUR-2026.09', name: 'Pagamento · Confirmação por Pix', systemId: 'aurora', status: 'CLOSED', environment: 'QA', scenario: 'ready', storyIds: ['aurora-pix'], version: '1.3.0', candidate: '1.3.0-rc.1', digest: digest(9), description: 'Candidata imutável com QA aprovado. Pronta para demonstrar a promoção do mesmo artefato para HML.' },
    { id: 'aurora-hml', key: 'AUR-2026.08', name: 'Pagamento · Orientação de recusa', systemId: 'aurora', status: 'CLOSED', environment: 'HML', scenario: 'blocked', storyIds: ['aurora-cartao'], version: '1.2.1', candidate: '1.2.1-rc.2', digest: digest(8), description: 'Candidata implantada em HML, aguardando homologação humana. A implantação não equivale à aprovação da homologação.', blocker: 'Homologação humana pendente em HML. A promoção para PROD exige aprovação explícita da candidata e das evidências desta composição.' },
    { id: 'aurora-producao', key: 'AUR-2026.07', name: 'Vitrine · Lançamento inicial', systemId: 'aurora', status: 'CLOSED', environment: 'PROD', scenario: 'done', storyIds: ['aurora-vitrine-inicial', 'aurora-destaques'], version: '1.2.0', candidate: '1.2.0-rc.1', digest: digest(7), description: 'Entrega fictícia confirmada em produção. Somente este marco concluiu as Histórias desta composição.' },
    { id: 'aurora-qa-reprovada', key: 'AUR-2026.10', name: 'Pedidos · Previsão de reembolso', systemId: 'aurora', status: 'CLOSED', environment: 'QA', scenario: 'failed', storyIds: ['aurora-reembolso'], version: '1.3.1', candidate: '1.3.1-rc.1', digest: digest(10), description: 'Candidata anterior preservada com reprovação em QA. Uma correção exige nova candidata e novo QA completo.', blocker: 'QA reprovado: o cálculo da previsão ignora feriados. Não é permitido promover esta candidata.' },
    { id: 'aurora-sucessora', key: 'AUR-2026.10-R2', name: 'Pedidos · Reembolso corrigido', systemId: 'aurora', status: 'CLOSED', environment: 'QA', scenario: 'running', storyIds: ['aurora-reembolso'], version: '1.3.1', candidate: '1.3.1-rc.2', digest: digest(11), predecessor: 'aurora-qa-reprovada', description: 'Candidata sucessora independente. O novo digest e a nova revisão repetem todos os testes em QA; a candidata reprovada não é sobrescrita.', blocker: 'Validação completa da candidata sucessora em andamento. O gate de HML ainda não está aprovado.' },
    { id: 'orion-qa-executando', key: 'ORI-2026.06', name: 'Atendimento · Alertas de prazo', systemId: 'orion', status: 'CLOSED', environment: 'QA', scenario: 'running', storyIds: ['orion-alerta'], version: '2.1.0', candidate: '2.1.0-rc.1', digest: digest(16), description: 'Exemplo de validação em andamento: iniciar a execução não equivale a concluí-la.', blocker: 'QA em andamento: 18 de 24 verificações ilustrativas concluídas.' },
    { id: 'orion-resultado-incerto', key: 'ORI-2026.05', name: 'Atendimento · Janela de atendimento', systemId: 'orion', status: 'CLOSED', environment: 'PROD', scenario: 'unknown', storyIds: ['orion-janela'], version: '2.0.3', candidate: '2.0.3-rc.2', digest: digest(15), description: 'Pedido de implantação aceito, mas resultado não confirmado. A História permanece aberta até confirmação da candidata em produção.', blocker: 'Resultado incerto: a resposta de confirmação não foi recebida. É necessário consultar a operação antes de qualquer nova tentativa.' },
    { id: 'nexus-rascunho', key: 'NEX-2026.04', name: 'Documentos · Próxima composição', systemId: 'nexus', status: 'OPEN', environment: 'DEV', scenario: 'draft', storyIds: [], version: '0.4.0', candidate: null, digest: null, description: 'Release aberta e vazia. Criar uma release e selecionar Histórias são decisões independentes; ausência de composição não autoriza QA.' },
    { id: 'nexus-cancelada', key: 'NEX-2026.03', name: 'Assinatura · Certificados digitais', systemId: 'nexus', status: 'CANCELED', environment: 'DEV', scenario: 'cancelled', storyIds: ['nexus-assinar'], version: '0.3.0', candidate: null, digest: null, description: 'Release cancelada por revisão de escopo. O cancelamento não remove código, não aprova Histórias e não apaga a auditoria.', blocker: 'Release cancelada. Consulta histórica disponível; nenhuma promoção pode ser iniciada.' },
    { id: 'atlas-producao', key: 'ATL-2026.02', name: 'Fiscal · Conciliação concluída', systemId: 'atlas', status: 'CLOSED', environment: 'PROD', scenario: 'done', storyIds: ['atlas-conferir'], version: '3.2.0', candidate: '3.2.0-rc.1', digest: digest(22), description: 'Entrega fictícia concluída antes da desativação do Sistema. A inatividade não apaga a entrega.' },
    { id: 'pulse-suspensa', key: 'PUL-2026.01', name: 'Operação · Tendência de fila', systemId: 'pulse', status: 'OPEN', environment: 'DEV', scenario: 'blocked', storyIds: ['pulse-tendencia'], version: '0.1.0', candidate: null, digest: null, description: 'Release em um Sistema temporariamente inativo. O estado dos itens foi preservado.', blocker: 'Sistema inativo e Desenvolvimento Finalizado pendente. A consulta não retoma o processamento.' },
    { id: 'legado-producao', key: 'LEG-2026.01', name: 'Migração · Acervo preservado', systemId: 'legado', status: 'CLOSED', environment: 'PROD', scenario: 'done', storyIds: ['legado-importar', 'legado-conferir'], version: '1.0.0', candidate: '1.0.0-rc.1', digest: digest(31), description: 'Entrega concluída de um Sistema arquivado. Referências e eventos permanecem em consulta.' }
  ];

  releases.forEach(function (release, index) {
    release.createdAt = timestamp(28 + index, 3);
    release.updatedAt = timestamp(index % 10, 2);
    if (release.id === 'aurora-sucessora') {
      release.createdAt = timestamp(4.5);
      release.updatedAt = timestamp(1);
    }
    release.storyRevisions = {};
    release.storyIds.forEach(function (id) {
      var story = items.find(function (item) { return item.id === id; });
      release.storyRevisions[id] = release.id === 'aurora-qa-reprovada' ? 1 : story.revision;
      if (release.scenario === 'done') {
        story.updatedAt = release.updatedAt;
        items.filter(function (item) { return item.parentId === id; }).forEach(function (task) { task.updatedAt = release.updatedAt; });
      }
    });
  });

  items.forEach(function (item) {
    if (item.kind === 'story' && item.devApproved && item.updatedAt < timestamp(12, 4)) item.updatedAt = timestamp(11);
    if (item.id === 'aurora-reembolso') item.updatedAt = timestamp(1);
  });

  // Datas do acervo sintético seguem a hierarquia, para a criação dos filhos
  // nunca anteceder a de seus pais nas conversas e ocorrências consultadas.
  var syntheticRoots = items.filter(function (item) { return item.kind === 'system'; });
  items.forEach(function (item) {
    var siblings = items.filter(function (candidate) { return candidate.kind === item.kind && candidate.parentId === item.parentId; });
    var siblingIndex = siblings.indexOf(item), created;
    if (item.kind === 'system') created = cutoff - 65 * DAY + syntheticRoots.indexOf(item) * 4 * DAY;
    else {
      var parent = items.find(function (candidate) { return candidate.id === item.parentId; });
      var offset = item.kind === 'task' ? DAY + siblingIndex * 3600000 : 2 * DAY + siblingIndex * (item.kind === 'story' ? 3 : 6) * 3600000;
      created = new Date(parent.createdAt).getTime() + offset;
    }
    item.createdAt = new Date(created).toISOString();
    if (new Date(item.updatedAt).getTime() < created) item.updatedAt = item.createdAt;
  });

  function event(itemId, at, actor, action, outcome, description, before, after) {
    var id = 'demo-event-' + String(events.length + 1).padStart(4, '0');
    var phase = outcome === 'UNKNOWN' ? 'OBSERVED' : 'COMPLETED';
    var decision = action === 'GATE_APPROVED' || action === 'DEVELOPMENT_COMPLETION_APPROVED' ? 'APPROVED' : action === 'DEMO_QA_VALIDATION' && outcome === 'FAILED' ? 'REJECTED' : 'NOT_APPLICABLE';
    events.push({ id: id, itemId: itemId, at: at, actor: actor, action: action, outcome: outcome, phase: phase, decision: decision, description: description, before: before === undefined ? null : before, after: after === undefined ? null : after, correlation: 'DEMO-' + String(events.length + 1).padStart(4, '0') });
  }

  items.forEach(function (item) {
    event(item.id, item.createdAt, 'Product Owner · Demonstração', 'ITEM_CREATED', 'SUCCEEDED', labels[item.kind] + ' criado no acervo fictício.', null, item.status);
    if (item.kind !== 'task') {
      event(item.id, timestamp(21 + items.indexOf(item) % 6, 2), 'Arquiteto · Demonstração', 'ITEM_UPDATED', 'SUCCEEDED', 'Contexto e descrição revisados. A consulta da auditoria não altera a situação atual.', 'Revisão anterior', 'Revisão ' + item.revision);
    }
    if (item.status !== 'specification' && item.status !== 'todo' && item.status !== 'active') {
      event(item.id, item.updatedAt, item.kind === 'task' ? 'Agente controlado · Demonstração' : 'Responsável · Demonstração', 'STATUS_CHANGED', 'SUCCEEDED', 'Situação registrada para este exemplo.', item.kind === 'task' ? 'todo' : item.kind === 'story' ? 'specification' : 'active', item.status);
    }
    if (item.kind === 'story' && item.phase >= 1 && item.status !== 'cancelled') {
      event(item.id, timestamp(19, 4), 'Product Owner · Demonstração', 'GATE_APPROVED', 'SUCCEEDED', 'G1 aprovado para a revisão da especificação identificada. Esta decisão autoriza codificação; não conclui a História.', 'G1 pendente', 'G1 aprovado · revisão ' + item.revision);
    }
    if (item.kind === 'story' && item.devApproved) {
      event(item.id, item.id === 'aurora-reembolso' ? timestamp(4) : timestamp(12, 4), 'Product Owner · Demonstração', 'DEVELOPMENT_COMPLETION_APPROVED', 'SUCCEEDED', 'Desenvolvimento Finalizado aprovado globalmente em DEV para a revisão ' + item.revision + '. A História será concluída somente após a entrada confirmada em PROD.', 'Aceite DEV pendente', 'Desenvolvimento Finalizado');
    }
    if (item.archived) event(item.id, item.updatedAt, 'Administrador · Demonstração', 'ITEM_ARCHIVED', 'SUCCEEDED', 'Item arquivado; situação anterior preservada e consulta somente leitura.', 'Não arquivado', 'Arquivado');
  });

  releases.forEach(function (release) {
    event(release.id, release.createdAt, 'Release Manager · Demonstração', 'RELEASE_CREATED', 'SUCCEEDED', 'Release fictícia criada em DEV. Criação e composição são decisões independentes.', null, 'OPEN · DEV');
    if (release.storyIds.length) event(release.id, release.predecessor ? timestamp(4.3) : timestamp(20, 2), 'Release Manager · Demonstração', 'RELEASE_COMPOSITION_CHANGED', 'SUCCEEDED', 'Composição de exemplo com ' + release.storyIds.length + ' História(s) do mesmo Sistema.', 'Composição vazia', release.storyIds.join(', '));
    if (release.candidate) event(release.id, release.predecessor ? timestamp(3.5) : timestamp(8, 2), 'Executor de release · Demonstração', 'DEMO_CANDIDATE_FIXED', 'SUCCEEDED', 'Candidata fictícia fixada com manifesto e artefato imutáveis.', null, release.candidate + ' · ' + release.digest);
    if (release.scenario === 'failed') event(release.id, release.updatedAt, 'QA Lead · Demonstração', 'DEMO_QA_VALIDATION', 'FAILED', release.blocker, 'Validação pendente', 'Validação reprovada');
    if (release.scenario === 'unknown') event(release.id, release.updatedAt, 'Executor de release · Demonstração', 'DEMO_DEPLOYMENT_OBSERVED', 'UNKNOWN', release.blocker, 'Pedido aceito', 'Resultado não confirmado');
    if (release.scenario === 'done') event(release.id, release.updatedAt, 'Release Manager · Demonstração', 'DEMO_PRODUCTION_CONFIRMED', 'SUCCEEDED', 'Entrada fictícia da candidata confirmada em produção, com o mesmo digest e sem rebuild. Histórias da composição concluídas.', 'HML homologado', 'PROD confirmado');
    if (release.scenario === 'cancelled') event(release.id, release.updatedAt, 'Release Manager · Demonstração', 'RELEASE_CANCELLED', 'SUCCEEDED', 'Cancelamento fictício por revisão de escopo. Registros anteriores preservados.', 'OPEN', 'CANCELED');
  });

  // Mais de uma página de história deliberadamente preservada no protagonista.
  for (var round = 1; round <= 23; round += 1) {
    event('aurora-busca', timestamp(25 - round * 0.8, 3), round % 2 ? 'Arquiteto · Demonstração' : 'Product Owner · Demonstração', 'DEMO_REVIEW_NOTE', 'SUCCEEDED', 'Rodada ilustrativa ' + round + ': revisão de clareza do requisito e conferência das evidências. Este registro histórico não substitui o G1 nem o aceite atuais.', 'Observação anterior', 'Observação de revisão ' + round);
  }

  // Transcrições preparadas: perguntas, respostas, revisões e recibos têm fontes próprias.
  var conversationSessions = [];
  var conversationOwners = { aurora: 'Marina Souza', orion: 'Paula Nunes', nexus: 'Renato Alves', pulse: 'Beatriz Lima', atlas: 'Carlos Melo', legado: 'Lívia Rocha' };
  function byId(id) { return items.find(function (item) { return item.id === id; }); }
  function rootOf(item) { while (item && item.parentId) item = byId(item.parentId); return item; }
  function plan(title, ids, summary, status) {
    return { title: title, summary: summary, status: status || 'reviewed', items: ids.map(function (id) {
      var item = byId(id);
      return { id: item.id, kind: item.kind, name: item.name, description: item.description };
    }) };
  }
  function transcript(itemId, suffix, title, summary, daysAgo, entries, options) {
    options = options || {};
    var sessionId = itemId + '-' + suffix;
    var owner = conversationOwners[rootOf(byId(itemId)).id];
    var sourceItem = byId(itemId);
    var start = Math.max(cutoff - daysAgo * DAY - 5 * 3600000, new Date(sourceItem.createdAt).getTime());
    var milestoneIndex = -1, finish = start;
    if (options.createdItemIds && options.createdItemIds.length) {
      start = new Date(sourceItem.createdAt).getTime() - 3600000;
      finish = Math.max.apply(Math, options.createdItemIds.map(function (id) { return new Date(byId(id).createdAt).getTime(); }));
      entries.forEach(function (entry, index) { if (entry[0] === 'system') milestoneIndex = index; });
    }
    entries.forEach(function (entry, index) {
      var role = entry[0], metadata = entry[3] || {};
      // Perguntas e respostas seguem o ritmo do diálogo; eventuais intervalos
      // longos pertencem à revisão humana, antes da aplicação do planejamento.
      var dialogueStart = milestoneIndex > 0 ? Math.min(start, finish - (milestoneIndex + 1) * 180000) : start;
      var at = dialogueStart + index * 180000;
      if (milestoneIndex > 0 && index === milestoneIndex - 1) at = finish - 180000;
      if (milestoneIndex > 0 && index >= milestoneIndex) at = finish + (index - milestoneIndex) * 180000;
      conversations.push({
        id: sessionId + '-m' + String(index + 1).padStart(2, '0'), itemId: itemId, sessionId: sessionId,
        author: role === 'assistant' ? 'Assistente SDLC' : role === 'system' ? 'Portal SDLC' : owner,
        role: role, at: new Date(at).toISOString(), text: entry[1],
        relatedItemIds: entry[2] || [], kind: role === 'system' ? 'milestone' : 'message',
        proposal: metadata.proposal || null
      });
    });
    var sessionMessages = conversations.filter(function (message) { return message.sessionId === sessionId; });
    conversationSessions.push({ id: sessionId, itemId: itemId, title: title, summary: summary,
      startedAt: sessionMessages[0].at, updatedAt: sessionMessages[sessionMessages.length - 1].at,
      status: options.status || 'completed', createdItemIds: options.createdItemIds || [], outcome: options.outcome || summary });
  }

  transcript('aurora', 'origem', 'Da ideia ao Sistema Aurora', 'Entrevista de descoberta, limites do produto e organização dos primeiros Projetos.', 60, [
    ['user', 'Quero tirar a Aurora das vendas por mensagem. Hoje a pessoa pede uma foto, pergunta o preço e precisa esperar alguém responder. Quero um catálogo digital que ela consiga consultar sozinha.'],
    ['assistant', 'Vamos começar pelo problema que você quer resolver. O catálogo será para pessoas que já conhecem a Aurora ou também para quem chega pela primeira vez? E o que precisa acontecer ao final dessa consulta?'],
    ['user', 'Os dois públicos. A pessoa precisa encontrar um produto, entender as características e saber se faz sentido comprar. A compra ainda pode terminar no atendimento no começo.'],
    ['assistant', 'Então o primeiro resultado de negócio é autonomia para descobrir e avaliar produtos; pagamento online pode entrar depois. Quem vai manter nomes, imagens, preços e disponibilidade?'],
    ['user', 'A equipe comercial já mantém uma planilha. Para a primeira entrega vamos preparar um catálogo revisado, sem criar um painel administrativo enorme.'],
    ['assistant', 'Certo. Vou separar a experiência de consulta da manutenção do catálogo. Para delimitar a consulta: a pessoa precisa se cadastrar para ver produtos? Há preços diferentes por cliente?'],
    ['user', 'Não precisa de cadastro. Os preços são os mesmos para todos. Não quero pedir nome, telefone ou e-mail só para navegar.'],
    ['assistant', 'Isso simplifica a primeira fatia e evita coletar dados sem necessidade. O visitante terá acesso ao catálogo público; a equipe comercial revisará o conteúdo antes de publicar. Há alguma restrição de negócio que eu deva considerar?'],
    ['user', 'Não podemos prometer entrega para todo lugar. E não podemos mostrar um produto como disponível sem ter confirmado a informação.'],
    ['assistant', 'Vou tratar disponibilidade e cobertura regional separadamente: a informação confirmada do produto entra no detalhe, e o cálculo de entrega por região fica dependente da regra de logística. Ainda precisamos de carrinho, favoritos e comparação na estreia?'],
    ['user', 'Favoritos e comparação ajudam, mas não são a prioridade. Primeiro quero busca por nome e uma página de detalhes boa no celular.'],
    ['assistant', 'Proponho organizar o produto contínuo como Sistema Aurora e separar iniciativas temporárias:\n• Lançamento da vitrine digital: a primeira presença pública.\n• Evolução do catálogo digital: busca, detalhes, navegação e acessibilidade.\n• Checkout e acompanhamento de pedidos: pagamento e pós-compra, em uma etapa própria.'],
    ['user', 'Faz sentido. Só ajuste uma coisa: a vitrine inicial já é uma entrega concluída. O que vamos planejar agora é a evolução do catálogo.'],
    ['assistant', 'Entendi. A vitrine será mantida como referência da primeira entrega. O Projeto atual será Evolução do catálogo digital; checkout continuará com objetivo e prioridade próprios. Assim a busca não fica esperando a integração de pagamentos.'],
    ['user', 'Isso. Quero também conseguir voltar e entender por que uma decisão foi tomada, inclusive quando mudarmos de ideia.'],
    ['assistant', 'Vou preservar as conversas no contexto em que ocorreram e ligar as propostas aos itens do planejamento. A conversa do Sistema explica o produto e seus Projetos; os critérios de uma História ficam no detalhamento daquela História.'],
    ['user', 'Que resultado você sugere para o Projeto do catálogo?'],
    ['assistant', 'Um cliente deve conseguir encontrar um produto pelo nome e consultar descrição, imagens e disponibilidade em poucos passos, inclusive pelo teclado. O primeiro recorte será busca e detalhes; filtros avançados e comparação continuam visíveis no backlog.'],
    ['user', 'Inclua também o caso de não encontrar nada. Não quero uma tela em branco nem que a pessoa perca o que digitou.'],
    ['assistant', 'Incluído. A busca sem resultados deve explicar a ausência, manter o termo e oferecer uma nova tentativa. Esse comportamento será verificável nos critérios da História de busca.'],
    ['assistant', 'Consolidei a organização abaixo. Revise os nomes e a separação das iniciativas antes de aplicar o planejamento.', ['aurora', 'aurora-catalogo', 'aurora-checkout', 'aurora-vitrine'], { proposal: plan('Organização do Sistema Aurora', ['aurora', 'aurora-catalogo', 'aurora-checkout', 'aurora-vitrine'], 'Produto contínuo de comércio digital, com evolução do catálogo separada da compra e do pós-compra.') }],
    ['user', 'Revisei a proposta. Os nomes e os limites estão corretos. Vou aplicar essa organização e continuar a entrevista no Projeto do catálogo.'],
    ['system', 'Marina Souza revisou e aplicou a organização do Sistema. Sistema e Projetos vinculados foram registrados pela ação de planejamento.', ['aurora', 'aurora-catalogo', 'aurora-checkout', 'aurora-vitrine'], { proposal: plan('Organização aplicada', ['aurora', 'aurora-catalogo', 'aurora-checkout', 'aurora-vitrine'], 'Organização confirmada por Marina Souza.', 'applied') }],
    ['assistant', 'Podemos continuar em Evolução do catálogo digital. Vou levar o objetivo e as restrições já combinadas como referência, e detalhar os Épicos e as Histórias naquele contexto.', ['aurora-catalogo']]
  ], { createdItemIds: ['aurora', 'aurora-catalogo', 'aurora-checkout', 'aurora-vitrine'], outcome: 'Sistema Aurora organizado; a próxima entrevista detalha o Projeto de evolução do catálogo.' });

  transcript('aurora-catalogo', 'planejamento', 'Planejamento do catálogo com a LLM', 'Da necessidade do cliente à proposta revisada de Épicos e Histórias.', 58, [
    ['user', 'Vamos detalhar a evolução do catálogo. O maior problema é que a pessoa não encontra rapidamente o produto que viu nas redes sociais.'],
    ['assistant', 'Para orientar a busca, como a pessoa costuma lembrar do produto: nome, código, categoria ou alguma característica?'],
    ['user', 'Quase sempre pelo nome. Às vezes lembra só de uma parte. O código é usado pela equipe, mas não precisamos colocá-lo na primeira busca pública.'],
    ['assistant', 'Vou limitar a primeira História à busca por nome completo ou parcial. Quando houver várias correspondências, quais informações bastam para escolher um resultado?'],
    ['user', 'Nome, imagem e preço. Ao clicar, a pessoa abre o detalhe. Sem abrir uma janela nova.'],
    ['assistant', 'E ao voltar do detalhe: devemos manter o termo pesquisado e os resultados que ela estava vendo?'],
    ['user', 'Sim. Não quero que ela tenha de começar tudo de novo. Isso vale principalmente no celular.'],
    ['assistant', 'Temos duas capacidades diferentes: descobrir produtos e navegar com continuidade. Eu as organizaria em dois Épicos: Descoberta de produtos e Experiência de navegação. A busca e o detalhe ficam no primeiro; filtros, teclado, favoritos e comparação ficam no segundo.'],
    ['user', 'Pode separar assim. Mas não coloque a navegação por teclado como um trabalho opcional para depois.'],
    ['assistant', 'Concordo com o ajuste: os critérios de teclado fazem parte da busca e do detalhe desde a primeira entrega. A História específica de acessibilidade cobre a revisão do catálogo como um todo; ela não adia esses critérios nas outras Histórias.'],
    ['user', 'Ótimo. No detalhe, a descrição e a disponibilidade têm de estar claras. Se não soubermos a entrega por região, não devemos inventar uma previsão.'],
    ['assistant', 'Vou distinguir disponibilidade informada do produto e cobertura de entrega por região. A consulta do detalhe mostra os dados confirmados; a História regional fica com uma dependência explícita da logística, ainda pendente.'],
    ['user', 'Como você dividiria as Histórias para que a primeira release seja pequena?'],
    ['assistant', 'Primeira composição sugerida:\n1. Buscar produtos por nome.\n2. Consultar detalhes do produto.\n\nBacklog de descoberta: disponibilidade por região e categorias.\nBacklog de experiência: faixa de preço, teclado, comparação e favoritos. Assim conseguimos validar o percurso completo sem esperar todas as capacidades.'],
    ['user', 'E se a busca não retornar nenhum produto?'],
    ['assistant', 'O catálogo informa que não encontrou produtos para o termo, mantém o texto no campo e permite pesquisar de novo. Isso entra como cenário de aceitação, junto com busca com resultado, abertura do detalhe e retorno ao recorte.'],
    ['user', 'Não inclua tolerância a erros de digitação agora. Se eu escrever diferente do nome cadastrado, tudo bem não encontrar.'],
    ['assistant', 'Ajustado. A primeira versão usa correspondência de nome; sugestões, busca aproximada e recomendação ficam fora do escopo. Vou registrar essa exclusão para que não apareçam como uma entrega implícita.'],
    ['user', 'Também quero evitar que uma mudança de filtro apague os favoritos quando essa capacidade chegar.'],
    ['assistant', 'Vou registrar essa regra na História de favoritos e manter a dependência informativa com a navegação. Ela não entra na candidata inicial de busca e detalhe.'],
    ['assistant', 'Preparei a proposta revisada com os dois Épicos e as oito Histórias. A separação entre primeira composição e backlog está explícita. Você pode revisar o objetivo de cada item abaixo.', ['aurora-descoberta', 'aurora-experiencia', 'aurora-busca', 'aurora-detalhe', 'aurora-disponibilidade', 'aurora-categorias', 'aurora-filtros', 'aurora-acessibilidade', 'aurora-comparacao', 'aurora-favoritos'], { proposal: plan('Catálogo · proposta revisada de planejamento', ['aurora-descoberta', 'aurora-experiencia', 'aurora-busca', 'aurora-detalhe', 'aurora-disponibilidade', 'aurora-categorias', 'aurora-filtros', 'aurora-acessibilidade', 'aurora-comparacao', 'aurora-favoritos'], 'Dois Épicos e oito Histórias; busca e detalhe compõem a primeira fatia, sem busca aproximada ou promessa de entrega regional.') }],
    ['user', 'Revisei os itens. A divisão está boa e a dependência de logística ficou clara. Vou aplicar a proposta, mantendo as demais Histórias no backlog.'],
    ['system', 'Proposta revisada e aplicada por Marina Souza. Dois Épicos e oito Histórias foram vinculados ao Projeto; cada História possui suas seis Tarefas de execução.', ['aurora-descoberta', 'aurora-experiencia', 'aurora-busca', 'aurora-detalhe', 'aurora-disponibilidade', 'aurora-categorias', 'aurora-filtros', 'aurora-acessibilidade', 'aurora-comparacao', 'aurora-favoritos'], { proposal: plan('Planejamento aplicado', ['aurora-descoberta', 'aurora-experiencia', 'aurora-busca', 'aurora-detalhe', 'aurora-disponibilidade', 'aurora-categorias', 'aurora-filtros', 'aurora-acessibilidade', 'aurora-comparacao', 'aurora-favoritos'], 'Planejamento aplicado após revisão humana; a especificação de cada História continua com revisão própria.', 'applied') }],
    ['assistant', 'O planejamento está organizado. Sugiro abrir Buscar produtos por nome para conferir os cenários e o comportamento de retorno antes da aprovação da especificação.', ['aurora-busca']]
  ], { createdItemIds: ['aurora-descoberta', 'aurora-experiencia', 'aurora-busca', 'aurora-detalhe', 'aurora-disponibilidade', 'aurora-categorias', 'aurora-filtros', 'aurora-acessibilidade', 'aurora-comparacao', 'aurora-favoritos'], outcome: 'Proposta de dois Épicos e oito Histórias revisada e aplicada. A primeira composição é busca e detalhe.' });

  transcript('aurora-catalogo', 'revisao', 'Retomada · composição da primeira entrega', 'Revisão de prioridade e conferência da separação entre entrega inicial e backlog.', 6, [
    ['user', 'Voltei ao Projeto. A busca e o detalhe já estão em DEV, mas ainda vejo categorias e disponibilidade regional em andamento. Isso impede a primeira release?'],
    ['assistant', 'A composição planejada AUR-2026.11 contém apenas busca e detalhe. Categorias e disponibilidade regional continuam em outra composição; a dependência de logística não deve ser tratada como resolvida para acelerar essa entrega.', ['aurora-busca', 'aurora-detalhe', 'aurora-disponibilidade', 'aurora-categorias']],
    ['user', 'Então mantenha o primeiro recorte. Quero conferir o aceite de busca e detalhe antes de levar a candidata para QA.'],
    ['assistant', 'Busca está na revisão 3 e detalhe na revisão 2. As duas possuem o aceite global de Desenvolvimento Finalizado registrado em DEV. Posso apontar as evidências de cada História; esse aceite ainda não representa sua conclusão em produção.', ['aurora-busca', 'aurora-detalhe']],
    ['user', 'Perfeito. A comparação continua fora da release inicial, mesmo com o código já revisado?'],
    ['assistant', 'Sim. Ela é outra História e está impedida no Merge Request em Draft. Esse impedimento fica no contexto da comparação e não altera o recorte de busca e detalhe.', ['aurora-comparacao']],
    ['system', 'Recorte da primeira entrega conferido por Marina Souza. A composição planejada permanece com as mesmas duas Histórias.', ['aurora-busca', 'aurora-detalhe']]
  ], { outcome: 'Mantido o recorte de busca e detalhe; as demais capacidades permanecem fora da primeira composição.' });

  transcript('aurora-busca', 'especificacao', 'Refinamento da busca e revisão da especificação', 'Perguntas, exemplos, ajuste do retorno e revisão humana dos critérios.', 55, [
    ['user', 'Quero detalhar Buscar produtos por nome. A pessoa deve encontrar um produto digitando só uma parte do nome.'],
    ['assistant', 'Vamos usar um exemplo para fixar a expectativa. Se houver um produto chamado “Bolsa Aurora”, pesquisar “bolsa” deve encontrá-lo mesmo com diferença entre maiúsculas e minúsculas?'],
    ['user', 'Sim. Mas não precisa corrigir a grafia nem sugerir outros produtos quando não encontrar.'],
    ['assistant', 'Combinado: correspondência por nome completo ou parcial, sem busca aproximada. Para o resultado vazio, sugiro mostrar o termo utilizado, manter o campo preenchido e permitir nova busca.'],
    ['user', 'Concordo. O botão não pode ficar indisponível depois de uma busca sem resultado.'],
    ['assistant', 'Incluí um cenário de recuperação: pesquisar um termo inexistente, ler a orientação, trocar o termo e encontrar um produto sem recarregar a página.'],
    ['user', 'E quando eu abrir o detalhe e voltar? Na versão anterior a busca era perdida.'],
    ['assistant', 'Vou acrescentar a preservação do termo e do recorte no retorno. A pessoa volta para os resultados que estava consultando, com foco previsível. Também verificaremos o percurso usando apenas teclado.'],
    ['user', 'Isso resolve. Deixe esse comportamento explícito na revisão, porque é importante no celular.'],
    ['assistant', 'Especificação consolidada:\n• Resultado por nome completo ou parcial.\n• Entradas validadas e mensagem clara para busca vazia.\n• Navegação por teclado, foco visível e rótulos acessíveis.\n• Termo e contexto preservados ao abrir o detalhe e retornar.\n\nNão entram busca aproximada, recomendações ou login obrigatório.', ['aurora-busca']],
    ['user', 'Revisei os cenários e os limites. Vou registrar a aprovação de especificação no controle G1.'],
    ['system', 'Marina Souza aplicou a revisão da especificação e registrou a decisão G1 na fonte própria da História. A decisão está vinculada à revisão aprovada.', ['aurora-busca']],
    ['assistant', 'A referência de especificação está disponível para o desenvolvimento. Os testes de retorno e de busca sem resultado devem usar os cenários que acabamos de conferir.']
  ], { outcome: 'Critérios refinados e aprovação G1 registrada separadamente da conversa.' });

  transcript('aurora-busca', 'aceite', 'Conferência da revisão 3 em DEV', 'Retomada da conversa depois dos testes e do aceite global da História.', 3, [
    ['user', 'Conferi a revisão 3 em DEV. Busquei um nome parcial, abri o detalhe e voltei. O termo e os resultados foram preservados.'],
    ['assistant', 'Falta conferir algum dos quatro critérios? Em especial, a troca de termo depois de uma busca sem resultado e o percurso por teclado estavam no recorte combinado.'],
    ['user', 'Conferi os dois. Também recarreguei a página e mantive o contexto. Os quatro critérios foram atendidos.'],
    ['assistant', 'Nesse caso você pode registrar o aceite global de Desenvolvimento Finalizado para a revisão 3, referenciando a implantação e a evidência que consultou. A mensagem da conversa, sozinha, não substitui esse registro.'],
    ['user', 'Registrei o aceite no formulário da História. Agora quero acompanhar a candidata junto com o detalhe do produto.'],
    ['system', 'Aceite global em DEV registrado por Marina Souza para a revisão 3. A Tarefa Teste em DEV foi concluída pela mesma decisão.', ['aurora-busca', 'aurora-busca-dev']],
    ['assistant', 'A História está pronta para compor a passagem DEV → QA da release planejada. Ela permanece aberta até a entrada confirmada da candidata em produção.', ['aurora-busca', 'aurora-detalhe']]
  ], { outcome: 'Revisão 3 aceita em DEV; História permanece aguardando a entrega da candidata em produção.' });

  var systemInterviews = {
    orion: [
      'A equipe atende por e-mail e telefone, mas ninguém sabe facilmente quem ficou responsável por cada solicitação. Quero organizar isso em um lugar só.',
      'O primeiro problema é distribuição do trabalho ou falta de visibilidade do prazo? Precisamos distinguir o solicitante, o atendente e quem acompanha a operação.',
      'Os dois. O supervisor distribui por especialidade e cada atendente precisa saber seu prazo. O cliente deve conseguir consultar quando será atendido.',
      'Vou organizar o Orion em Atendimento omnicanal, para triagem e compromissos, e Autosserviço do cliente, para artigos de ajuda. Anexos exigem controle de acesso em cada consulta; isso precisa constar desde o início.',
      'Pode seguir. Autosserviço é útil, mas vamos priorizar a triagem e os avisos de prazo. Não envie respostas automáticas ao cliente nesta primeira etapa.',
      'A proposta mantém a decisão do atendente sobre a resposta e separa a base de conhecimento da operação de atendimento. Seguem os Projetos para revisão.'
    ],
    nexus: [
      'Quero localizar os documentos da área sem depender de alguém lembrar em qual pasta salvou o arquivo. Também precisamos saber de onde cada documento veio.',
      'Quem poderá pesquisar o conteúdo? As mesmas pessoas que enviam os arquivos ou haverá grupos com acesso restrito?',
      'Há grupos restritos. A pesquisa não pode revelar nem o título de um documento que a pessoa não está autorizada a consultar.',
      'Vou tratar classificação, origem e autorização como parte da recepção e da pesquisa. A assinatura com certificado pode ficar em um Projeto próprio, pois tem regras e dependências diferentes.',
      'Boa separação. Primeiro precisamos de documentos rastreáveis. A assinatura depende de uma decisão da área jurídica.',
      'A organização proposta tem Documentos com rastreabilidade como iniciativa prioritária e Assinatura de documentos como fatia independente, ainda sujeita à decisão de escopo.'
    ],
    pulse: [
      'Hoje só percebemos que a fila de atendimento cresceu quando os prazos já estouraram. Quero um painel que ajude o gestor a perceber a tendência antes.',
      'Que decisão o gestor deverá tomar ao ver esse painel? E qual fonte identifica a data de entrada e a conclusão de cada solicitação?',
      'A decisão é redistribuir capacidade. Vamos usar a fonte operacional de atendimento; não quero uma pontuação de produtividade individual.',
      'Vou propor o Pulse com foco no volume em aberto e na tendência da fila. O Projeto separa a consulta do painel e a identificação de tendências, sem ranking de pessoas.',
      'Está correto. Depois precisamos pausar a iniciativa até confirmar a disponibilidade da fonte operacional.',
      'A dependência ficará explícita e a pausa preservará o planejamento. Não tratarei a ausência da fonte como volume zero nem como uma execução concluída.'
    ],
    atlas: [
      'Quero reduzir a conferência manual dos lançamentos fiscais. A equipe precisa localizar divergências e justificar o que foi conciliado.',
      'O objetivo é sugerir uma conciliação ou efetivar lançamentos automaticamente? Essa distinção muda o risco e a responsabilidade da operação.',
      'Apenas conferir e mostrar referências. Nenhum lançamento deve ser alterado automaticamente.',
      'Então o Atlas será organizado para consulta de conciliação e conformidade, preservando a origem dos lançamentos. Notificações podem ser uma capacidade separada da conferência.',
      'A conferência foi suficiente para o primeiro ciclo. As notificações serão canceladas e o Sistema poderá ser desativado após o encerramento.',
      'Vou manter a entrega de conferência consultável e registrar a decisão de escopo sobre as notificações. Desativar o Sistema não deve apagar as referências da entrega.'
    ],
    legado: [
      'Precisamos migrar o histórico antigo de solicitações e depois conseguir provar que os registros foram preservados. Não será um novo sistema de atendimento.',
      'Quais informações precisam manter a origem? Há identificadores antigos que os auditores continuarão usando para localizar um registro?',
      'Sim. Identificador original, datas e autoria devem ser preservados quando existirem. Campo que não foi capturado na origem não pode ser completado por suposição.',
      'Vou separar importação do histórico e conferência de integridade. O acervo final será apenas de consulta, com a origem acessível e ausências identificadas.',
      'Isso. Depois da conferência, queremos arquivar o Projeto e manter os registros disponíveis para auditoria.',
      'A proposta trata o acervo como resultado da migração e mantém a conferência como uma História própria. O arquivamento será posterior à conclusão e preservará a consulta.'
    ]
  };
  Object.keys(systemInterviews).forEach(function (id, index) {
    var childIds = items.filter(function (item) { return item.parentId === id; }).map(function (item) { return item.id; });
    var rows = systemInterviews[id].map(function (text, row) { return [row % 2 ? 'assistant' : 'user', text]; });
    rows.push(['assistant', 'Consolidei a organização do produto e das iniciativas abaixo para sua revisão.', [id].concat(childIds), { proposal: plan('Organização de ' + byId(id).name, [id].concat(childIds), 'Objetivo, responsabilidades e recortes de trabalho separados por iniciativa.') }]);
    rows.push(['user', 'Revisei os nomes, os limites e as responsabilidades. Vou aplicar essa organização.']);
    rows.push(['system', conversationOwners[id] + ' revisou e aplicou a organização do Sistema e de seus Projetos.', [id].concat(childIds)]);
    transcript(id, 'origem', 'Concepção e organização do produto', 'Entrevista de descoberta e proposta de organização das iniciativas.', 59 - index * 0.1, rows, { createdItemIds: [id].concat(childIds) });
  });

  var projectInterviews = {
    'aurora-checkout': ['Quero separar o pagamento da compra do acompanhamento do pedido. Hoje o cliente recebe orientações diferentes em cada canal.', 'O pedido pode ser confirmado antes de o pagamento estar concluído? Como a pessoa deve entender essa diferença?', 'Pode haver espera de confirmação, especialmente no Pix. Precisamos mostrar o estado com clareza e não anunciar pagamento sem confirmação.', 'Vou separar Pagamento seguro e Pedidos e devoluções. A confirmação por Pix, orientação de recusa e resumo antes de pagar têm resultados diferentes dos de rastreamento, devolução e reembolso.'],
    'aurora-vitrine': ['Antes de evoluir a busca, precisamos de uma vitrine simples que apresente os produtos da Aurora.', 'O visitante deve conseguir conhecer a oferta sem se cadastrar? E o que distingue a vitrine da consulta detalhada que virá depois?', 'Sem cadastro. A primeira entrega mostra a vitrine e os destaques. Busca e detalhes ficam para a evolução do catálogo.', 'O Projeto terá um Épico de Vitrine inicial, com Histórias separadas para a consulta geral e os destaques. O resultado esperado é uma presença pública navegável.'],
    'orion-atendimento': ['O supervisor precisa enxergar quem está responsável por cada atendimento e quais solicitações estão próximas do prazo.', 'A distribuição considera disponibilidade, especialidade ou uma fila única? O prazo começa na entrada ou quando o atendente assume?', 'A distribuição considera especialidade. O compromisso é contado a partir da entrada; assumir a solicitação não deve zerar o prazo.', 'Vou separar Triagem de solicitações e Compromissos e prazos. A classificação orienta a distribuição, enquanto os alertas e a janela de atendimento preservam o compromisso original.'],
    'orion-autosservico': ['Queremos que o cliente encontre uma orientação antes de abrir uma solicitação de atendimento.', 'Os artigos poderão ser sugeridos automaticamente ou o primeiro recorte será apenas consulta da base?', 'Começaremos pela consulta. As sugestões podem vir depois, mas este Projeto ficará pausado até revisarmos o conteúdo dos artigos.', 'A Base de conhecimento terá Histórias próprias para consultar artigos e sugerir relacionados. Vou preservar o recorte e a pendência de conteúdo sem iniciar a implementação durante a pausa.'],
    'nexus-documentos': ['Precisamos receber documentos com classificação e depois encontrá-los sem perder a origem do arquivo.', 'Um documento pode aparecer nos resultados antes de sua classificação e das permissões de acesso estarem definidas?', 'Não. O usuário só deve encontrar o que pode acessar. Precisamos também explicar claramente por que um arquivo foi recusado no envio.', 'Proponho Recepção de documentos e Pesquisa documental. Envio, validação de formato e origem ficam na recepção; pesquisa textual e filtro de classificação ficam na pesquisa.'],
    'nexus-assinatura': ['A área pediu assinatura com certificado, mas ainda não definimos quem responde pela validação jurídica do documento.', 'Existe uma decisão sobre os certificados aceitos e sobre a conferência de validade depois da assinatura?', 'Ainda não. A diretoria decidiu retirar essa iniciativa do ciclo atual, sem alterar os documentos já recebidos.', 'Vou manter a proposta de assinatura separada do Projeto documental e registrar a decisão de cancelamento. As referências do escopo permanecem para consulta futura.'],
    'pulse-indicadores': ['Quero começar com um indicador de solicitações abertas e uma forma de perceber o crescimento da fila.', 'Quais recortes ajudam a tomar uma decisão de capacidade sem expor uma classificação individual dos atendentes?', 'Equipe e período são suficientes. Não usaremos ranking de pessoas. Precisamos confirmar a disponibilidade dos dados antes de seguir.', 'Vou dividir em Painéis operacionais e Alertas de tendência. A dependência da fonte de atendimento permanece impeditiva; o planejamento pode ser consultado enquanto a iniciativa está suspensa.'],
    'atlas-fiscal': ['A primeira entrega deve permitir conferir lançamentos conciliados e suas referências, sem escrever no sistema fiscal.', 'Se a origem trouxer uma divergência, o Atlas deve corrigir o lançamento ou somente orientar a investigação?', 'Somente orientar. A correção continua no sistema fiscal, com a equipe responsável. As notificações foram retiradas do escopo.', 'A proposta mantém a conciliação como capacidade principal e as notificações como fatia separada, que poderá ser cancelada sem apagar o histórico da entrega concluída.'],
    'legado-migracao': ['Precisamos importar o histórico antigo e depois conferir se cada solicitação mantém seu identificador de origem.', 'A conferência será só por quantidade ou deve permitir localizar amostras e verificar campos preservados?', 'As duas coisas. Queremos conferir a contagem e localizar registros conhecidos. Não vamos preencher autores ou datas ausentes na origem.', 'A proposta separa Importar histórico de solicitações e Conferir integridade da migração. O resultado será um acervo consultável com as limitações de origem identificadas.']
  };
  Object.keys(projectInterviews).forEach(function (id, index) {
    var project = byId(id), epicIds = items.filter(function (item) { return item.parentId === id; }).map(function (item) { return item.id; });
    var rows = projectInterviews[id].map(function (text, row) { return [row % 2 ? 'assistant' : 'user', text]; });
    rows.push(['assistant', 'Organizei os Épicos abaixo. Confira se a separação mantém os resultados de negócio e os limites que discutimos.', epicIds, { proposal: plan('Proposta de Épicos do Projeto', epicIds, 'Recortes de capacidade derivados da entrevista do Projeto.') }]);
    rows.push(['user', 'A divisão está correta. Vou registrar o planejamento com esses vínculos e manter as decisões de prioridade que combinamos.']);
    rows.push(['system', conversationOwners[rootOf(project).id] + ' revisou e aplicou os vínculos dos Épicos ao Projeto.', epicIds]);
    if (['inactive', 'cancelled', 'completed'].indexOf(project.status) !== -1 || project.archived) {
      rows.push(['assistant', project.archived ? 'O Projeto está encerrado e arquivado. A conversa e as referências da migração permanecem disponíveis para consulta.' : project.status === 'cancelled' ? 'A decisão atual é cancelar esta iniciativa. O planejamento permanece consultável, sem retomar as atividades.' : project.status === 'completed' ? 'O Projeto foi encerrado após a entrega do recorte aprovado. As referências da entrega e do escopo retirado continuam acessíveis.' : 'A iniciativa está pausada. O planejamento foi preservado; a retomada exige uma decisão explícita sobre a prioridade e as dependências.']);
    }
    transcript(id, 'planejamento', 'Objetivo do Projeto e divisão em Épicos', 'Entrevista de planejamento com proposta revisada e vínculos dos Épicos.', 57 - index * 0.1, rows, { createdItemIds: epicIds });
  });

  var epicQuestions = {
    'aurora-descoberta': ['O cliente chega com um nome em mente ou quer explorar o catálogo sem saber exatamente o que procura?', 'Precisamos atender os dois caminhos, mas a primeira release prioriza buscar um nome e abrir o detalhe. Categorias e região ficam como próximas fatias.', 'Vou separar busca, detalhe, disponibilidade regional e categorias. A descoberta deve manter o termo pesquisado quando a pessoa retorna do detalhe; a regra regional continuará dependente da logística.'],
    'aurora-experiencia': ['O que mais atrapalha a comparação das opções: quantidade de resultados, perda de contexto ou falta de informações?', 'A pessoa perde o que selecionou e precisa repetir os filtros. Também precisamos garantir o uso pelo teclado.', 'Vou separar faixa de preço, revisão da navegação por teclado, comparação e favoritos. Os critérios básicos de acessibilidade continuam em todas as Histórias; a revisão transversal não os substitui.'],
    'aurora-pagamentos': ['Como o cliente diferencia uma compra concluída de um pagamento que ainda está aguardando confirmação?', 'A interface deve dizer exatamente o que foi confirmado. Se houver recusa, deve orientar outra tentativa sem criar outro pedido indevidamente.', 'Confirmar Pix, orientar uma recusa e conferir o resumo antes de pagar serão Histórias distintas. Confirmação de pagamento virá da fonte responsável, nunca da simples abertura da página.'],
    'aurora-pedidos': ['Depois da compra, quais perguntas geram mais contatos com a equipe?', 'Onde está o pedido, como devolver e quando vou receber o reembolso. Não podemos dar uma data sem considerar as regras da devolução.', 'Vou separar rastreamento, solicitação de devolução e previsão de reembolso. A previsão precisa declarar a regra de prazo; feriados e dias úteis não podem ficar implícitos.'],
    'aurora-lancamento': ['A vitrine precisa resolver toda a compra ou só apresentar a oferta inicial?', 'Só apresentar. Queremos um conjunto revisado de produtos e uma área de destaques, sem cadastro obrigatório.', 'A primeira entrega terá consulta da vitrine e consulta dos produtos em destaque. A evolução da busca fica em outro Projeto.'],
    'orion-triagem': ['O supervisor deve conseguir redistribuir uma solicitação sem perder quem a classificou inicialmente?', 'Sim. A classificação e o encaminhamento precisam continuar rastreáveis, e os anexos devem obedecer à autorização da solicitação.', 'Vou separar classificação, distribuição por especialidade e proteção dos anexos. A regra de autorização precisa existir na consulta de cada anexo.'],
    'orion-prazos': ['O alerta considera o prazo original ou pode começar novamente quando o atendimento muda de equipe?', 'Considera o compromisso original. Precisamos ainda explicar o próximo horário disponível fora da janela de atendimento.', 'Compromisso de resposta, alerta de prazo e janela de atendimento serão Histórias próprias. O histórico de encaminhamentos não altera o início do prazo.'],
    'orion-base': ['Os artigos serão públicos ou há conteúdo que depende de autenticação?', 'A primeira base é pública e revisada. Ainda não temos o conteúdo pronto, então o trabalho precisa permanecer pausado.', 'Vou manter consulta de artigos e sugestão de relacionados no backlog da base, com a pendência de revisão do conteúdo identificada.'],
    'nexus-ingestao': ['Quando um envio falhar por formato, o usuário pode corrigir sem preencher todos os dados novamente?', 'Sim. Deve receber uma mensagem clara e preservar a classificação já escolhida. Origem e data de recepção também precisam ficar acessíveis.', 'Envio com classificação, validação de formato e consulta da origem serão Histórias independentes, compartilhando as regras de acesso e de preservação do formulário.'],
    'nexus-pesquisa': ['O filtro de classificação será aplicado antes de mostrar os documentos ou apenas esconderá itens depois da busca?', 'A pesquisa precisa respeitar a autorização desde a origem. Nem o título de um documento restrito pode aparecer.', 'Vou separar pesquisa por conteúdo e filtro de classificação, com a autorização como critério obrigatório nos dois caminhos.'],
    'nexus-certificados': ['Há definição de certificado aceito e de quem valida a assinatura?', 'Não houve a definição jurídica necessária. Essa fatia foi cancelada e não deve gerar uma entrega parcial.', 'A História de assinatura permanecerá cancelada com sua origem e os motivos de escopo preservados. Os documentos existentes não serão alterados.'],
    'pulse-paineis': ['O gestor precisa de uma fotografia atual da fila ou de uma comparação por período?', 'A primeira consulta deve mostrar o volume atual e permitir escolher um período. A fonte ainda precisa ser confirmada.', 'Vou manter a consulta do indicador como uma História, com ausência de dados tratada explicitamente, sem apresentar zero como se fosse uma medição.'],
    'pulse-alertas': ['O alerta deve abrir uma ação automaticamente ou apenas chamar atenção para uma tendência?', 'Apenas chamar atenção. O gestor decide se precisa redistribuir capacidade; não queremos decisões automáticas.', 'A História de tendência vai explicar o período observado e preservar a decisão humana. A execução continua suspensa enquanto a fonte não for confirmada.'],
    'atlas-conciliacao': ['O analista consegue chegar da conciliação ao identificador do lançamento na origem?', 'Esse é o principal critério. Precisamos conferir valores e localizar a referência sem alterar o lançamento.', 'A História de conferência terá leitura das referências como parte do resultado de negócio. A correção seguirá no sistema de origem.'],
    'atlas-compliance': ['As notificações ainda são necessárias para o recorte de conferência que será entregue?', 'Não. Decidimos cancelar essa fatia antes da codificação e manter apenas a consulta de conciliação.', 'Vou preservar o escopo e a decisão de cancelamento. Não anunciarei envio de notificações como parte da entrega concluída.'],
    'legado-importacao': ['Como a equipe vai verificar que a importação preservou o histórico sem acrescentar fatos inexistentes?', 'Vamos comparar contagens, conferir amostras conhecidas e manter os identificadores e campos de origem, inclusive quando estiverem ausentes.', 'Importação e conferência de integridade terão Histórias distintas. A consulta do acervo mostrará os limites da origem em vez de completar lacunas por inferência.']
  };
  items.filter(function (item) { return item.kind === 'epic'; }).forEach(function (epic, index) {
    var facts = epicQuestions[epic.id], storyIds = items.filter(function (item) { return item.parentId === epic.id; }).map(function (item) { return item.id; });
    transcript(epic.id, 'recorte', 'Recorte de capacidade e proposta de Histórias', 'Detalhamento do Épico a partir do objetivo de negócio e dos limites acordados.', 54 - index * 0.02, [
      ['user', 'Vamos detalhar “' + epic.name + '” e separar o que cada História deve entregar.'],
      ['assistant', facts[0]], ['user', facts[1]], ['assistant', facts[2]],
      ['assistant', 'Esta é a divisão de Histórias para sua revisão.', storyIds, { proposal: plan('Histórias de ' + epic.name, storyIds, facts[2]) }],
      ['user', 'A divisão preserva o resultado que discutimos. Vou aplicar o detalhamento neste Épico.'],
      ['system', 'Detalhamento do Épico revisado e aplicado por ' + conversationOwners[rootOf(epic).id] + '.', storyIds]
    ], { createdItemIds: storyIds });
  });

  var storyScenarios = {
    'aurora-detalhe': ['Se a imagem não carregar, o cliente ainda consegue entender qual produto está consultando?', 'Sim. Nome, descrição, preço e disponibilidade devem continuar legíveis; a imagem precisa ter descrição alternativa.', 'Vou explicitar o conteúdo obrigatório e testar a continuidade sem imagem. Ao voltar, o catálogo mantém a pesquisa usada para chegar ao produto.'],
    'aurora-disponibilidade': ['Qual regra define se podemos entregar em uma região?', 'A logística ainda não confirmou a cobertura. Não podemos usar uma lista presumida nem prometer uma data.', 'A dependência de logística fica impeditiva. Vamos preparar os critérios, mas não aprovar a especificação ou anunciar cobertura sem uma fonte confirmada.'],
    'aurora-categorias': ['Um produto pode aparecer em mais de uma categoria? E a pessoa deve conseguir voltar a todas as opções?', 'Pode aparecer em mais de uma. A categoria escolhida precisa ficar visível, com um caminho claro para remover o recorte.', 'A História cobrirá seleção e remoção da categoria, lista vazia e continuidade da navegação até o detalhe.'],
    'aurora-filtros': ['O limite mínimo e o máximo de preço são inclusivos? O que deve acontecer se o mínimo for maior que o máximo?', 'Os dois limites são inclusivos. A pessoa deve receber orientação para corrigir a faixa, sem perder os valores digitados.', 'Vou incluir igualdade nos limites e faixa inválida nos casos de aceitação, além da combinação com a busca por nome.'],
    'aurora-acessibilidade': ['Qual percurso será usado para conferir a navegação sem mouse?', 'Entrar no catálogo, abrir os filtros, buscar, abrir um produto e retornar. O foco precisa estar visível em cada etapa.', 'O plano de teste seguirá esse percurso e verificará ordem de foco, rótulos e retorno ao controle de origem. A existência de um atalho isolado não será suficiente.'],
    'aurora-comparacao': ['Se o cliente filtrar a lista depois de selecionar dois produtos, a seleção deve ser apagada?', 'Não. Ele deve continuar sabendo quais produtos escolheu, mesmo que um deles fique fora do filtro.', 'Vou preservar a seleção fora do recorte e identificar os produtos comparados. A revisão atual está em Draft; esse impedimento precisa ser resolvido no fluxo do Merge Request.'],
    'aurora-favoritos': ['Salvar um favorito exige cadastro ou pode funcionar só nesta visita?', 'Nesta primeira versão, apenas nesta visita. Não quero prometer sincronização entre dispositivos.', 'O critério vai declarar esse limite, manter os favoritos ao alterar filtros e explicar a ausência de produtos salvos.'],
    'aurora-pix': ['Que confirmação permite informar ao cliente que o Pix foi recebido?', 'A confirmação do pagamento na fonte responsável. O simples retorno para a página não comprova recebimento.', 'Vou distinguir aguardando pagamento, confirmação recebida e falha de consulta, preservando a referência do pedido em todas as situações.'],
    'aurora-cartao': ['Quando o pagamento for recusado, podemos mostrar a razão técnica retornada pela integração?', 'Não queremos expor detalhes internos. A pessoa precisa de uma orientação compreensível e de alternativas para continuar.', 'A mensagem será segura e orientará outra forma de pagamento ou nova tentativa, sem afirmar um motivo que a fonte não confirmou.'],
    'aurora-resumo': ['O cliente deve conferir o valor final antes de confirmar o pagamento?', 'Sim. Produtos, quantidade, endereço e valor precisam estar claros; se algo mudar, a pessoa deve revisar novamente.', 'Vou incluir a conferência dos campos e a revisão quando houver mudança. O teste técnico em DEV não substituirá o aceite da experiência completa.'],
    'aurora-rastreamento': ['Quando não houver atualização recente, devemos mostrar o pedido como atrasado?', 'Só se houver uma regra que confirme o atraso. Fora disso, mostre o último estado e a data da atualização.', 'O critério distinguirá ausência de atualização e atraso confirmado, com uma orientação de contato quando não for possível consultar a fonte.'],
    'aurora-devolucao': ['O pedido de devolução já significa que o reembolso foi aprovado?', 'Não. Primeiro a solicitação passa por análise, e o cliente precisa acompanhar o que ainda está pendente.', 'Vou separar solicitação recebida, análise e resultado. Uma mensagem de recebimento não anunciará reembolso autorizado.'],
    'aurora-reembolso': ['A previsão de reembolso conta dias corridos ou dias úteis? Os feriados da região entram na conta?', 'Conta dias úteis e precisa considerar os feriados aplicáveis. Foi exatamente esse cenário que falhou em QA.', 'Vou manter a candidata reprovada preservada e registrar o cenário de feriado na revisão 2. A candidata sucessora precisa repetir o QA completo antes de homologação.'],
    'aurora-vitrine-inicial': ['Qual informação mínima torna a vitrine útil antes de existir uma busca detalhada?', 'Nome, imagem e preço dos produtos selecionados, com leitura boa no celular e sem cadastro.', 'A História terá o conjunto revisado de produtos e um estado claro caso não haja itens para apresentar. Busca e checkout continuam fora deste recorte.'],
    'aurora-destaques': ['Um produto deixa de ser destaque quando sai de estoque ou precisa de revisão da equipe?', 'A equipe revisa a seleção. Se a disponibilidade mudar, a vitrine não pode continuar prometendo algo que não foi confirmado.', 'Vou separar a seleção editorial e a disponibilidade consultada, mantendo a informação confirmada no cartão do destaque.'],
    'orion-classificacao': ['A classificação poderá ser ajustada depois do primeiro encaminhamento?', 'Sim, mas precisamos saber quem classificou antes e por que houve a alteração.', 'O critério preservará a classificação anterior e a autoria da mudança, sem reiniciar o compromisso de prazo.'],
    'orion-distribuicao': ['Se não houver um especialista disponível, a solicitação deve ser atribuída a alguém por aproximação?', 'Não. Deve ficar identificada como aguardando distribuição, para o supervisor decidir.', 'Vou distinguir atribuição confirmada de espera por especialidade, evitando apresentar uma responsabilidade que ninguém assumiu.'],
    'orion-anexos': ['A autorização do usuário é conferida na própria consulta do anexo ou só quando a tela da solicitação é aberta?', 'Precisa ser conferida na consulta do arquivo. Não podemos permitir o acesso por uma URL copiada de outra solicitação.', 'Esse critério é obrigatório. O Security Scan encontrou a verificação ausente; a correção exige nova revisão e nova evidência antes de integrar o código.'],
    'orion-sla': ['O prazo muda quando a prioridade é alterada?', 'A regra pode mudar o compromisso, mas a mudança e o responsável precisam ficar identificados. Não pode parecer que o prazo inicial nunca existiu.', 'Vou manter prazo original e compromisso atual distintos, com critério verificável para a mudança de prioridade.'],
    'orion-alerta': ['O atendente pode receber o mesmo alerta várias vezes para o mesmo compromisso?', 'Não deve receber duplicatas da mesma ocorrência. Uma mudança de prazo precisa continuar identificável.', 'O critério vai vincular o alerta à solicitação e ao compromisso correspondente, separando reenvio técnico de uma nova condição de alerta.'],
    'orion-janela': ['O que aparece quando o cliente consulta o atendimento fora do horário disponível?', 'O próximo horário válido, considerando a janela cadastrada. Não diga que existe alguém atendendo naquele momento.', 'Vou testar abertura, fechamento e mudança de dia. A implantação atual teve confirmação perdida; a História permanece aberta até consultarmos o resultado da candidata em produção.'],
    'orion-artigos': ['O cliente poderá consultar um artigo mesmo sem abrir uma solicitação?', 'Sim. O conteúdo é público, mas ainda precisamos revisar os textos antes de disponibilizar a base.', 'A consulta será independente da abertura de atendimento. A pendência de conteúdo mantém esta iniciativa pausada, sem apresentar artigos ainda não revisados como publicados.'],
    'orion-sugestoes': ['Que informação orienta a sugestão de artigos relacionados?', 'O assunto que a pessoa está consultando. Não vamos usar dados pessoais nem histórico de outros clientes.', 'A proposta limita as sugestões ao conteúdo do assunto atual e prevê uma ausência clara quando não houver artigos relacionados.'],
    'nexus-upload': ['Se o arquivo for recusado, a classificação já preenchida deve ser perdida?', 'Não. O analista precisa corrigir o arquivo sem preencher tudo outra vez e entender por que o envio foi recusado.', 'Vou preservar os campos válidos e associar a orientação ao arquivo recusado. Receber o pedido de envio não significa concluir a recepção do documento.'],
    'nexus-validacao': ['A mensagem de formato inválido deve informar quais tipos são aceitos?', 'Sim. Precisa aparecer junto ao campo, com nome acessível e sem apagar o restante do formulário.', 'O critério cobrirá mensagem, tipos permitidos, foco e tentativa de correção. Uma rejeição de formato não será confundida com erro do serviço.'],
    'nexus-origem': ['Se a origem não trouxe um autor, podemos usar o nome de quem consultou ou importou o arquivo?', 'Não. A origem desconhecida deve continuar identificada como não capturada; autoria da importação é outra informação.', 'Vou manter essas informações separadas. O teste técnico em DEV passou, mas falta o aceite humano global desta revisão antes de considerar o desenvolvimento finalizado.'],
    'nexus-texto': ['A pesquisa pode revelar um trecho de documento ao qual o usuário não tem acesso?', 'Não pode revelar título, trecho ou contagem que exponha documentos restritos.', 'A autorização fará parte do escopo da pesquisa, com cenários de permissão e de nenhum resultado verificáveis.'],
    'nexus-taxonomia': ['Uma classificação sem documentos deve desaparecer do filtro ou apresentar uma lista vazia?', 'Pode continuar disponível, mas o recorte e a ausência devem ficar claros. Remover o filtro deve recuperar a consulta anterior.', 'Vou incluir categoria sem resultado, remoção do recorte e preservação da busca, sempre respeitando as permissões dos documentos.'],
    'nexus-assinar': ['A assinatura será implementada mesmo sem a definição jurídica dos certificados?', 'Não. Decidimos cancelar esta fatia antes de implementar. Não queremos um mecanismo parcial sem regra de validade.', 'O escopo e a decisão ficarão preservados para consulta. O cancelamento não altera os documentos existentes nem representa aprovação de uma assinatura.'],
    'pulse-indicador': ['Se a fonte operacional estiver indisponível, o painel deve mostrar zero solicitações?', 'Não. Zero significaria fila vazia. Deve ficar claro que não houve medição.', 'Vou separar valor observado, data da leitura e indisponibilidade. A iniciativa continua suspensa enquanto confirmamos a fonte.'],
    'pulse-tendencia': ['Uma tendência de aumento deve redistribuir os atendimentos automaticamente?', 'Não. O gestor precisa avaliar a situação e decidir; o painel só deve chamar atenção para a mudança observada.', 'A História vai apresentar período e evidência da tendência. O trabalho está suspenso e a evidência parcial em DEV não equivale ao aceite global.'],
    'atlas-conferir': ['A conferência precisa permitir chegar ao identificador do lançamento na origem?', 'Sim. O analista deve entender a conciliação e localizar a fonte, sem alterar o lançamento por aqui.', 'Vou manter a referência de origem e os valores consultados explícitos. A entrega confirmada em produção cobre a consulta, sem automatizar correções fiscais.'],
    'atlas-notificar': ['As notificações são necessárias para concluir o recorte de conciliação?', 'Não. A área decidiu cancelar essa fatia antes da codificação e manter a consulta como entrega suficiente.', 'A decisão de cancelamento ficará vinculada à História. Não haverá promessa de aviso automático na entrega de conciliação.'],
    'legado-importar': ['Qual identificador permitirá localizar a solicitação depois da migração?', 'O identificador original deve continuar pesquisável, junto com a referência da origem. Datas e autores ausentes não serão preenchidos.', 'Vou preservar os identificadores e declarar as ausências da fonte. A importação precisa de conferência própria antes do arquivamento do acervo.'],
    'legado-conferir': ['Como confirmaremos a integridade sem apenas confiar no total importado?', 'Vamos comparar a contagem e consultar amostras conhecidas, verificando identificador, datas e campos de origem.', 'A conferência terá evidência separada da importação. Depois da conclusão, o acervo permanece apenas de consulta, com as limitações originais preservadas.']
  };
  items.filter(function (item) { return item.kind === 'story' && item.id !== 'aurora-busca'; }).forEach(function (story, index) {
    var facts = storyScenarios[story.id];
    var rows = [
      ['user', 'Vamos refinar “' + story.name + '”. ' + story.description],
      ['assistant', facts[0]], ['user', facts[1]], ['assistant', facts[2]],
      ['user', 'Está claro. Vou manter essa regra no detalhamento e conferir os cenários antes da próxima decisão.'],
      ['assistant', 'O detalhamento está vinculado a esta História. Os critérios e as evidências da revisão atual podem ser consultados no seu contexto.', [story.id]]
    ];
    transcript(story.id, 'refinamento', 'Refinamento · ' + story.name, 'Perguntas e decisões de negócio que orientam os critérios da História.', 51 - index * 0.02, rows, { status: story.status === 'specification' && story.blocker ? 'waiting' : 'completed', outcome: facts[2] });
  });

  transcript('pulse', 'pausa', 'Decisão de pausa e preservação do planejamento', 'Revisão de prioridade depois da entrevista de descoberta.', 9, [
    ['user', 'A fonte operacional ainda não está disponível e precisamos concentrar a equipe em atendimento. Vamos pausar o Pulse.'],
    ['assistant', 'A pausa deve atingir a iniciativa inteira ou somente a análise de tendências? O planejamento e as evidências existentes podem ser preservados nos dois casos.'],
    ['user', 'A iniciativa inteira. Quero consultar depois o que combinamos, mas ninguém deve retomar o trabalho automaticamente.'],
    ['assistant', 'Entendido. O motivo é revisão de prioridade e disponibilidade da fonte. A retomada dependerá de uma decisão explícita, sem concluir as Histórias que ainda estão abertas.'],
    ['system', 'Beatriz Lima registrou a inativação do Sistema e a suspensão do trabalho. Conversas e planejamento foram preservados.', ['pulse', 'pulse-indicadores']]
  ], { status: 'waiting', outcome: 'Sistema temporariamente inativo por revisão de prioridade e dependência da fonte operacional.' });

  events.sort(function (a, b) { return b.at.localeCompare(a.at) || b.id.localeCompare(a.id); });
  conversations.sort(function (a, b) { return a.at.localeCompare(b.at); });

  window.SDLC_DEMO = {
    schemaVersion: 2,
    asOf: asOf,
    personas: [
      { id: 'demo-po', name: 'Product Owner', role: 'product_owner' },
      { id: 'demo-arquiteto', name: 'Arquiteto', role: 'architect' },
      { id: 'demo-qa', name: 'QA Lead', role: 'qa_lead' },
      { id: 'demo-seguranca', name: 'Security Lead', role: 'security_lead' },
      { id: 'demo-release', name: 'Release Manager', role: 'release_manager' },
      { id: 'demo-admin', name: 'Administrador', role: 'admin' }
    ],
    items: items, releases: releases, events: events, conversations: conversations, conversationSessions: conversationSessions,
    stats: {
      weeks: [
        { label: '12–18 out', created: 23, completed: 10, deploys: 4, rework: 2 },
        { label: '19–25 out', created: 16, completed: 12, deploys: 5, rework: 4 },
        { label: '26 out–01 nov', created: 21, completed: 15, deploys: 6, rework: 2 },
        { label: '02 nov (parcial)', created: 4, completed: 2, deploys: 1, rework: 1 }
      ],
      dora: { deploymentFrequency: 4.5, leadTime: 38.4, changeFailureRate: 8.3, recoveryTime: 1.7, reliability: 99.6 },
      note: 'Série histórica e métricas DORA inteiramente fictícias, usadas para explicar definições. Fluxo semanal conta eventos e não equivale ao estoque do inventário. Não representa medição do portal real, meta ou evidência operacional.'
    }
  };
}());
