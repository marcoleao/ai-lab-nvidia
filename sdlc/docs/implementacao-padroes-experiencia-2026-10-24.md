# Adoção dos padrões de experiência no portal real

O portal real adota a revisão aprovada do protótipo, preservando identidade, hierarquia, autorizações, gates, conversas, versões e operações idempotentes. Esta entrega altera a apresentação e os contratos de consulta; não implementa os executores futuros de QA, homologação ou produção, nem altera aplicações geradas pelo SDLC.

Filtros começam recolhidos em desktop e celular. Recorte e quantidade permanecem visíveis; rascunhos não são aplicados ao ordenar ou paginar. Tabelas usam cabeçalhos clicáveis com direção e `aria-sort`, teclado e manutenção de foco; listas/cartões mantêm seletores de campo/direção. Fila e processamento confirmado usam ícone animado compartilhado; movimento reduzido mantém o estado estático. Falhas usam vermelho, texto, ícone e retomada aplicável. Espera humana e ausência de confirmação não simulam processamento.

## Contratos reais

- `GET /api/collections/items`: escopo por tipo/pai, busca de nome/chave, status, ciclo de Projeto, inclusão de inativos/arquivados, ordenação global por domínio e ID e páginas fixas de 20. Contagem e dados compartilham a transação. A query legada `/api/items` continua compatível para consumidores ainda não migrados.
- `GET /api/items/:id/history` e `/api/releases/:id/history`: histórico canônico completo, filtros de ator/tipo/resultado/período e correlação, páginas de 20, `asOf` e payload com campos selecionados. Ausência de resultado permanece “Não registrado”; o tipo de um evento de falha pode ter destaque visual sem fabricar um resultado.
- Releases: lista ordenada/paginada no banco, catálogo sem corte de 5.000 e seleção global acompanhada de membros/versões fora da página. Salvar continua sendo substituição explícita da composição com proteção concorrente. Criar DRAFT vazio e associar somente releases existentes pela História continuam disponíveis.
- Tarefas: consulta paginada própria, com situação corrente enriquecida pela jornada. Tentativas operacionais completas da jornada são paginadas no cliente. A projeção legada ainda limita verificações a 200 e eventos a 100 e informa sua cobertura; o histórico canônico completo é independente.

Destinos de uma operação, como Sistema/Projeto da entrevista, continuam visíveis. As consultas não criam entidades, não aprovam gates nem iniciam agentes. A política de métricas já aprovada permanece vigente; não foi introduzida nova coleta de termos pesquisados ou conteúdo de conversa como indicador.

## Validação e publicação

A compilação completa de API/web e o TypeScript passaram. Testes em banco descartável `portal_test` cobrem 525 filhos, 125 eventos, catálogo com mais de 5.000 Histórias, ordenação/desempate, acervo, filtros, seleção e versões. Testes de navegador cobrem tabelas/teclado, filtros/rascunhos/retorno, carregamento/falha/retomada, histórico antigo, História/Tarefa e composição de release entre páginas. Dados interceptados e fixtures ficaram exclusivamente no ambiente de teste.

Resultado consolidado: **63 cenários distintos verificados** — 27 de API, quatro de padrões/hierarquia, 27 de jornada/discussão/qualidade/merge e cinco de Releases. Retestes não foram somados. A imagem final `d80d64a6d257` passou pela compilação e pelos seis novos cenários de jornada; o cenário adicional diferencia geração de código de processamento de conversa. A publicação foi conferida por navegador no endereço real, com filtros recolhidos, ordenação nos cabeçalhos, viewport de 390 px e zero escritas de API durante essa conferência.

Antes da publicação, `.prepared/experience-preservation.py` registra backup, imagens anteriores, manifest e hashes de registros em 22 tabelas. A atualização deve conferir novamente ausência de trabalho ativo, preservar os overrides existentes de GitLab/LLM, recriar somente API/web e comparar os hashes após a publicação. Backups e evidências ficam em `.prepared`, fora do versionamento.

Publicado em **http://localhost:3310**, preservando os overrides de integrações e LLM e com o manifest preparado verificado. A comparação confirmou os registros de negócio das 22 tabelas. A reconciliação automática existente alterou somente `MergeOperation.checkedAt/updatedAt`; isso foi comprovado contra o dump restaurado em banco temporário sem rede, sem alterar nenhum registro do portal. A evidência adicional fica vinculada ao SHA do dump e mantém a verificação de todos os campos de negócio.

## Retomada

UX-C01–C04 foram adotados neste recorte. UX-C05 e C07 permanecem parciais; UX-C06 continua pendente para paginação de conversas, propostas e lookups e não amplia automaticamente o contexto da LLM. O [plano funcional](plano-portal-sdlc-2026-10-20.md) e os executores de testes/releases/QA/HML/PRD continuam preservados para retomada posterior. O [documento central](../portal/docs/PADROES_DE_EXPERIENCIA.md) é a referência de adoção e limites.
