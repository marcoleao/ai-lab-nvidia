# Preservação funcional da prévia de experiência

A fonte funcional é o portal atual em `sdlc/portal`. O protótipo demonstra a aplicação dos [padrões de experiência](../../portal/docs/PADROES_DE_EXPERIENCIA.md); não substitui contratos, executores, autorização, banco ou backlog. Uma omissão visual não autoriza remover uma funcionalidade existente.

| Área atual | Representação na nova entrada | Limite |
|---|---|---|
| Navegação global | Visão geral, Assistente, Sistemas, Releases, Integrações | Links locais; identidade azul do portal preservada |
| Hierarquia | Sistema → Projeto → Épico → História → Tarefa; breadcrumb e drill down | Entidades fictícias |
| Sistemas | ACTIVE/INACTIVE, inativos/arquivados, criação, edição, arquivamento | Alterações somente na sessão |
| Projetos | Aprovação separada de PLANNED/ACTIVE/COMPLETED/CANCELLED; reabertura com justificativa | Regras e resultados simulados |
| Acervo | Descendentes arquivados, status original e histórico em leitura | Sem reativação silenciosa |
| Repositórios/componentes | Propriedade do Sistema; associação ao trabalho; criar/vincular e situação | Sem provisionamento GitLab |
| Ambientes | Versões e links para releases no Sistema | Valores fictícios |
| Dashboard | Nove assuntos, filtros em cascata, participação, quatro semanas e indisponibilidade explícita | Métricas ilustrativas; não são evidência do processo real |
| Assistente | Analista/Tech Lead, entrevista, proposta estruturada, cobertura, histórico e confirmação | Respostas fixas; cria somente exemplos na sessão após confirmação |
| História | Resumo macro, fase/atividade permanente, próxima ação e interação contextual | Cenários manuais, sem executor |
| Tarefas | Planejamento/manual e processo; resultado, tentativas, achados e histórico | Status de processo somente pelos eventos simulados aplicáveis |
| Qualidade | Code Review, Security Scan e ciclos de correção antes do merge | Nenhuma análise real; qualquer vulnerabilidade bloqueia no cenário |
| Merge | Fluxo humano/assistido, confirmação, bloqueios e referência da revisão | Sem acesso ao GitLab ou credencial |
| Releases DRAFT | Criar vazio, selecionar Histórias, filtros, seleção preservada, associação pela História | Colaboração multiusuário não é executada |
| Pacotes e ramificações | Revisões históricas, manifesto, artefato, dependências, R1 rejeitada → R2 | Proposta futura, não executada no real |
| QA/HML/PRD | Novos controles por candidata e promoção do mesmo artefato | Continua backlog; nunca fabricar aprovação real |
| Integrações | Prontidão, diagnóstico textual, falha e nova consulta | Sem sondagem ou configuração externa |
| Consultas e rastreabilidade | Busca antes da página, ordem global, páginas de 20, recorte aplicado, URL/retorno, ocorrência antiga | Coleção estática completa; capacidade/concorrência do banco não validada |

## Condições para implementar posteriormente no produto

1. Comparar cada jornada com o portal real e registrar diferenças. Preservar autoria, conversas, decisões, histórico, autorização, arquivos produzidos e contratos de integração.
2. Adotar progressivamente UX-C01–C07 com consultas de servidor, volumes e concorrência representativos. A coleção fictícia não comprova atendimento dos limites do produto.
3. Manter status, gates e próxima ação independentes do filtro ou da página histórica consultada.
4. Não copiar fixtures para o portal real. Projetos de demonstração serão criados pelo usuário durante a demonstração.
5. A validação automatizada aqui comprova comportamento da simulação; o aceite de navegação pelo usuário e os testes de integração continuam necessários antes da migração.

O protótipo anterior foi preservado em `.artifacts/prototype-before-entry-replacement-20261024.tar.gz`. A nova entrada usa armazenamento próprio (`sdlc-experience-prototype-v2` e o namespace de História `v2-experience`), sem migrar o estado da prévia anterior.
