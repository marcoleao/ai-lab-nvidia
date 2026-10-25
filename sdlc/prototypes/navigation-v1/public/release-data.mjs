// Cenários futuros inteiramente fictícios. Não são as Histórias do portal real.
const topics = ['Consultar solicitações', 'Receber notificações', 'Buscar protocolo', 'Anexar documentos', 'Filtrar solicitações', 'Consultar resumo', 'Exportar relatório', 'Atualizar contato', 'Acompanhar prioridade', 'Avaliar atendimento'];
const existingStoryIds = ['story-consulta', 'story-notificacoes', 'story-protocolo', 'story-anexos', 'story-filtros', 'story-resumo'];
let sharedEntities = null;
const storyEntityId = n => existingStoryIds[n - 1] || `story-release-h${String(n).padStart(2, '0')}`;
const topicName = n => `${topics[(n - 1) % topics.length]}${n > 10 ? ` · fluxo ${n}` : ''}`;
const epicIdFor = n => n <= 30
  ? n % 3 === 0 ? 'epic-acessibilidade' : 'epic-consulta'
  : n % 3 === 0 ? 'epic-operacao-comunicacao' : n % 3 === 1 ? 'epic-operacao-consulta' : 'epic-operacao-gestao';

// Compartilha o mesmo catálogo da navegação de Sistemas. O gerenciador pode
// restaurar dados da sessão antes desta chamada; edições e arquivos são mantidos.
export function integrateReleaseCatalog(entities) {
  sharedEntities = entities;
  const addMissing = record => {
    if (!entities.some(item => item.id === record.id)) entities.push(record);
  };
  addMissing({id: 'project-operacao', kind: 'project', key: 'PRJ-04', name: 'Operação de Atendimento', description: 'Projeto fictício de melhorias na operação, compartilhado com o planejamento de releases.', parentId: 'system-atendimento', status: 'approved', lifecycle: 'active'});
  [
    ['epic-operacao-consulta', 'EPC-04', 'Consulta operacional'],
    ['epic-operacao-comunicacao', 'EPC-05', 'Comunicação da operação'],
    ['epic-operacao-gestao', 'EPC-06', 'Gestão do atendimento'],
  ].forEach(([id, key, name]) => addMissing({id, kind: 'epic', key, name, description: 'Épico fictício com Histórias navegáveis e composição de releases no mesmo Sistema.', parentId: 'project-operacao', status: 'doing'}));
  for (let n = 7; n <= 60; n++) {
    addMissing({id: storyEntityId(n), kind: 'story', key: `HIS-${String(n).padStart(2, '0')}`, name: topicName(n), description: `Como pessoa da equipe de atendimento, quero ${topics[(n - 1) % topics.length].toLocaleLowerCase('pt-BR')} para acompanhar o atendimento. História fictícia ${n}, compartilhada entre a hierarquia e as releases.`, parentId: epicIdFor(n), status: n <= 50 ? 'testing' : n <= 55 ? 'security_scan' : 'testing', initialScenario: n <= 50 ? 'releaseReady' : n <= 55 ? 'releaseSecurity' : 'releaseTesting', currentRevision: 1});
  }
  // As primeiras seis Histórias já têm cenários de execução no protótipo.
  // Os pacotes históricos guardam r1; a execução em andamento refere-se a r2.
  existingStoryIds.forEach(id => {
    const entity = entities.find(item => item.id === id);
    if (entity && entity.currentRevision === undefined) entity.currentRevision = 2;
  });
  return entities;
}

const boundEntity = id => sharedEntities?.find(item => item.id === id);
function lineage(entity) {
  const path = [];
  while (entity && !path.some(item => item.id === entity.id)) {
    path.push(entity);
    entity = boundEntity(entity.parentId);
  }
  return path;
}
export function releaseStories(scenario = 'ten') {
  const count = scenario === 'sixty' ? 60 : 10;
  return Array.from({length: count}, (_, index) => {
    const n = index + 1, id = `H${String(n).padStart(2, '0')}`;
    const entityId = storyEntityId(n), entity = boundEntity(entityId), path = lineage(entity);
    const project = path.find(item => item.kind === 'project'), epic = path.find(item => item.kind === 'epic');
    const currentRevision = entity?.currentRevision ?? (n <= 6 ? 2 : 1);
    const archived = path.some(item => item.archived);
    const currentReady = n > 6 && n <= 50 && currentRevision === 1 && !archived;
    const commit = `${n.toString(16).padStart(3, '0')}a7c9`;
    return {id, entityId, key: entity?.key || `HIS-${String(n).padStart(2, '0')}`, name: entity?.name || topicName(n), revision: 1,
      currentRevision, currentReady, archived, currentCommit: currentRevision === 1 ? commit : `${commit.slice(0, 5)}${String(currentRevision).padStart(2, '0')}`,
      currentStatus: entity?.status?.toUpperCase().replaceAll('_', ' ') || (n <= 6 ? 'CODING' : n <= 55 && n > 50 ? 'SECURITY SCAN' : 'TESTING'),
      currentReason: archived ? 'A História ou um item da sua hierarquia foi arquivado.' : n <= 6 ? `A revisão atual r${currentRevision} ainda está em especificação ou implementação. A revisão r1 dos pacotes anteriores não aprova esta nova revisão.` : n <= 50 ? 'Revisão, segurança e testes individuais aprovados para a revisão atual r1 neste cenário.' : n <= 55 ? 'Correção de segurança pendente na revisão atual.' : 'Teste funcional da revisão atual encontrou uma falha.',
      project: project?.name || (n <= 30 ? 'Atendimento Digital' : 'Operação de Atendimento'),
      projectId: project?.id || (n <= 30 ? 'project-atendimento' : 'project-operacao'),
      epic: epic?.name || (n <= 30 ? n % 3 === 0 ? 'Acesso e acessibilidade' : 'Consulta de solicitações' : n % 3 === 0 ? 'Comunicação da operação' : n % 3 === 1 ? 'Consulta operacional' : 'Gestão do atendimento'),
      epicId: epic?.id || epicIdFor(n),
      component: n % 2 === 0 ? 'atendimento-web' : 'atendimento-api',
      ready: n <= 50, status: n <= 50 ? 'READY' : n <= 55 ? 'SECURITY SCAN' : 'TESTING',
      reason: n <= 50 ? 'Revisão, segurança e testes individuais aprovados no cenário.' : n <= 55 ? 'Correção de segurança pendente.' : 'Teste funcional encontrou uma falha.',
      dependencies: scenario === 'sixty' && n === 9 ? ['H07'] : [],
      branch: `story/${id.toLowerCase()}`, commit,
    };
  });
}
export const demoDigest = seed => `sha256:${seed.toString(16).padStart(4, '0')}${'a7b8c9d0'.repeat(8).slice(0, 60)}`;
// Datas fictícias conhecidas dos exemplos. Registros antigos criados pelo usuário
// sem data não recebem um horário inventado durante a atualização do cache.
export const releaseSeedDates = {
  'release-stable': '2026-10-08T12:00:00.000Z',
  'release-r1': '2026-10-20T13:00:00.000Z',
  'release-r2': '2026-10-21T15:00:00.000Z',
  'release-integration': '2026-10-22T12:00:00.000Z',
};
const history = (title, description) => ({title, description, time: 'Cenário inicial · horário fictício'});
export function initialReleases() {
  const ten = releaseStories('ten');
  const integration = releaseStories('sixty').map(story => ({...story, revision: story.currentRevision, commit: story.currentCommit, ready: story.currentReady, status: story.currentReady ? 'READY' : story.currentStatus, reason: story.currentReason}));
  const eligible = integration.filter(story => story.ready).length;
  return {
    version: 1, nextId: 3, notice: '', draft: null, inspectedStory: null,
    environments: {'system-atendimento': {integration: 'release-integration', qa: 'release-r2', hml: 'release-r1', prd: 'release-stable'}},
    items: [
      {id: 'release-stable', systemId: 'system-atendimento', label: 'R0', name: 'Base estável', version: '1.0.0', digest: demoDigest(100), stage: 'production', scenario: 'ten', stories: [], base: null, parent: null, history: [history('Produção preservada', 'Pacote estável de referência; conteúdo anterior às Histórias deste exemplo.')]},
      {id: 'release-integration', systemId: 'system-atendimento', label: 'INTEGRATION', name: 'Integração contínua', version: 'build-60', digest: demoDigest(160), stage: 'integration', scenario: 'sixty', stories: integration, base: 'release-stable', parent: null, history: [history('60 mudanças no cenário de integração', `${eligible} revisões atuais com verificações individuais aprovadas e ${integration.length - eligible} pendências. As seis primeiras Histórias têm uma revisão r2 em andamento; suas revisões r1 permanecem nos pacotes históricos. Essa integração não é candidata aprovada.`)]},
      {id: 'release-r1', systemId: 'system-atendimento', label: 'R1', name: 'Entrega original · 10 Histórias', version: '1.1.0-rc.1', digest: demoDigest(101), stage: 'rejected', scenario: 'ten', stories: ten, base: 'release-stable', parent: null, rejectedStory: 'H07', history: [history('Pacote R1 construído e fechado', '10 revisões de Histórias incluídas; manifesto e artefatos preservados.'), history('QA e gate G2 aprovados', 'Revisão, segurança e todos os testes do pacote R1 aprovados no cenário.'), history('R1 implantada em homologação', 'Exatamente o pacote de QA foi promovido.'), history('Homologação rejeitou H07', 'Usuário solicitou retirar a exportação de relatório. R1 bloqueada para produção; pacote não foi alterado.')]},
      {id: 'release-r2', systemId: 'system-atendimento', label: 'R2', name: 'Nova candidata · sem HIS-07', version: '1.1.0-rc.2', digest: demoDigest(102), stage: 'qa_checks', scenario: 'ten', stories: ten.filter(s => s.id !== 'H07'), base: 'release-stable', parent: 'release-r1', history: [history('Nova composição R2 preparada', '9 Histórias independentes neste cenário. H07 excluída do código e do manifesto; R1 preservada.'), history('Novo pacote implantado em QA isolado', 'Revisão, segurança e todos os testes obrigatórios precisam ser refeitos. Nenhuma aprovação de R1 foi reutilizada.')]},
    ],
  };
}

export const releaseStages = {
  integration: {label: 'INTEGRATION', title: 'Integração recebe mudanças continuamente', description: 'Este conteúdo inclui pendências. Prepare uma composição própria antes de promover.', tone: 'info'},
  rejected: {label: 'REJECTED', title: 'Homologação rejeitada · produção bloqueada', description: 'Uma alteração foi solicitada. Este pacote continua intacto e não pode seguir para produção; uma nova candidata deve voltar a QA, repetir todos os controles e receber nova homologação.', tone: 'danger'},
  qa_checks: {label: 'QA CHECKS', title: 'QA · novo pacote aguarda todos os controles', description: 'Revisão, segurança, testes funcionais e regressão precisam validar esta composição exata.', tone: 'warning'},
  qa_passed: {label: 'QA PASSED', title: 'QA validado · aprovação G2 pendente', description: 'As verificações simuladas deste pacote foram concluídas. Revise o resultado antes de autorizar homologação.', tone: 'warning'},
  qa_approved: {label: 'QA APPROVED', title: 'G2 aprovado · pronto para homologação', description: 'O mesmo pacote validado em QA pode ser implantado em HML, sem reconstrução.', tone: 'success'},
  hml_pending: {label: 'UAT', title: 'HML · nova homologação obrigatória', description: 'O pacote está em homologação. As decisões da candidata anterior não se aplicam a esta composição.', tone: 'warning'},
  hml_passed: {label: 'UAT APPROVED', title: 'Homologação aprovada · gate G3 pendente', description: 'O usuário homologou esta composição. Falta a autorização explícita de produção para o mesmo manifesto e artefatos.', tone: 'warning'},
  production_approved: {label: 'PRODUCTION APPROVED', title: 'G3 aprovado · promoção autorizada', description: 'Somente este pacote homologado pode seguir para produção. Nenhuma reconstrução será executada.', tone: 'success'},
  production: {label: 'PRODUCTION', title: 'Pacote em produção', description: 'A implantação usa os mesmos artefatos aprovados em homologação. O histórico e a composição permanecem preservados.', tone: 'success'},
};
