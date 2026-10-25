# CODE REVIEW e SECURITY SCAN antes do merge

## Decisão e sequência

O usuário determinou que as duas fases sejam executadas antes de liberar a integração e aprovou todas as métricas propostas. A política inicial de segurança bloqueia **qualquer achado**, independentemente da severidade. Falha, indisponibilidade, relatório inválido e análise incompleta não aprovam.

CODING publica um MR em rascunho, necessário para consultar o diff. CODE REVIEW e SECURITY SCAN são fases reais da História; MERGE é uma ação de integração, não um novo status. A faixa de ações mostra a próxima fase, estados, resultados, achados por arquivo/linha e confirmação de correção. O link de consulta ao GitLab permanece disponível; solicitar merge fica desabilitado sem as duas aprovações do mesmo commit. A API e o worker validam novamente as evidências, incluindo a base da branch de destino antes da escrita. Não há migração que transforme estados antigos em aprovações.

## Execução e evidências

`QualityCheck` mantém fase, estado, SHA do código e base, política, autor da solicitação, horários, resumo, achados, evidências e lease. Só o worker produz resultados; não existe endpoint de aprovação manual. A versão da política inclui o hash das regras do scanner. Uma nova revisão, nova política ou nova execução de Code Review invalida as aprovações anteriores aplicáveis. A História e a execução de codificação têm suas versões atualizadas em conjunto quando entram numa fase.

CODE REVIEW usa o modelo local para analisar blocos do diff e o código alterado. A saída estruturada é validada: caminho e linha precisam existir. Todos os blocos precisam ser analisados, e qualquer achado impede o avanço nesta primeira política. O modelo não executa testes, build ou lint; esses resultados não são inventados.

SECURITY SCAN usa Semgrep 1.181.0, com imagem fixada por digest e regras locais versionadas. Analisa código estaticamente e detecta padrões de segredos; não executa, importa ou instala o código recebido. O serviço roda sem credenciais, sem Docker socket, com filesystem somente de leitura, diretório temporário, limites de CPU/memória/PIDs e apenas rede interna do banco/API. As regras não são baixadas durante a análise. Arquivos ocultos de texto são alvos explícitos, `.gitignore` e `nosemgrep` não suprimem os gates. Relatório, versão, regras e cobertura dos arquivos suportados são verificados. Erros de sintaxe Python são recusados também pelo parser da linguagem.

**Cobertura inicial limitada:** sete regras locais para execução dinâmica/shell, TLS desabilitado, HTML inseguro e determinados formatos de chaves/tokens. Não equivale a cobertura completa de vulnerabilidades: SCA/CVEs de dependências, licenças, imagens e DAST ainda não estão integrados. Linguagens, arquivos, tamanho ou diff fora dos limites explicitamente suportados bloqueiam com diagnóstico. Limites atuais: 100 entradas de repositório, 256 KB totais, 64 KB por arquivo, até 16 diffs e até quatro blocos de revisão com 15 mil caracteres cada. O relatório apresenta o escopo efetivamente executado.

O GitLab recebe status externos reais `sdlc-code-review` e `sdlc-security-scan`, pendentes desde novas publicações do SDLC. São anexados ao pipeline existente quando disponível; a API do GitLab cria um pipeline externo quando não há um adequado. Outros jobs e proteções não são alterados. Um resultado aprovado exige a execução real correspondente; nunca é usado para representar testes ainda não executados. MRs antigos recebem esses status ao iniciar as novas verificações. A liberação de Draft e outras condições próprias do GitLab continuam sendo verificadas pelo agente de merge.

## Correção e conversa

Após reprovação, **Solicitar correção à IA** pede confirmação e devolve os achados ao agente de codificação, preservando escopo, G1 e autorizações. Uma necessidade de nova escolha ou dependência não autorizada segue a conversa de impedimentos já existente. O agente publica uma nova revisão no mesmo MR, com verificação de branch e metadados por arquivo; retomada reconcilia o mesmo commit pelo marcador da correção. O GitLab atualiza o MR assincronamente, por isso a consulta tem espera limitada e retomada idempotente.

As duas fases são exigidas novamente após corrigir. Conversar com o assistente de merge apenas esclarece: o modelo não recebe credenciais nem ferramentas de escrita. O contexto da conversa inclui os resultados mais recentes e é limitado para evitar exceder o orçamento da LLM. Não existe correção autônoma deste agente de desenvolvimento no produto gerado pelo SDLC; somente o usuário dispara as operações dentro da ferramenta.

## Métricas e navegação

Em **Visão geral → Merge Requests → Code Review e Security Scan**, cada fase mostra quatro semanas e total do período: solicitações, aprovações, reprovações por achados, falhas, novas verificações, pedidos de correção, duração mediana e achados por CRITICAL/HIGH/MEDIUM/LOW/INFO. Os mesmos filtros de participação, Sistema e Projeto se aplicam. Achados são ocorrências por verificação; o mesmo problema pode aparecer novamente em outro ciclo. Duração não inclui fila e mediana sem amostras é indisponível. Eventos idempotentes não duplicam solicitações, nem registram código ou conversa nas métricas.

As visualizações existentes de retrabalho e falhas também recebem os novos eventos. O backlog de pacote imutável, QA, homologação, produção, testes executados e demais scanners continua preservado; esta entrega não declara essas etapas implementadas.

## Referências técnicas

Correção de retomada (23/10): o GitLab rejeita determinadas transições para o próprio estado, como `PENDING → PENDING`. Antes de publicar, o adaptador consulta o último status do mesmo commit, branch, job e pipeline. Se já corresponde ao solicitado, não repete a escrita. Recusas HTTP 400/409/422 são reconciliadas apenas com evidência confirmada no GitLab; conflitos 409 têm até três tentativas. Uma recusa real informa o job, estado solicitado e estado confirmado, sem atribuir erros de transição a credenciais. O histórico de falhas permanece e a retomada continua sendo solicitada pelo usuário na ferramenta.

Validação desta correção: 16 cenários específicos de status, 56 testes sem banco e compilação API/web passaram. Os testes que exigem banco não foram reexecutados nesta correção de protocolo. Em um GitLab descartável, o teste real repetiu PENDING/RUNNING/SUCCESS, confirmou a preservação dos IDs dos status e verificou publicação de correção e invalidação por novo commit. Não executou merge nem operações de verificação na História do usuário.

Validação: 79 testes de backend passaram na regressão com banco de instalação vazio separado dos cenários de qualidade; 19 testes condicionais ficaram fora dessa rodada. O teste real de contexto/status externos/correção no GitLab foi executado separadamente e passou. Também passaram oito jornadas de navegador e cinco testes do scanner real sem rede. A revisão UX aprovou desktop e celular. Nenhuma verificação ou correção foi disparada na História do usuário por estes testes.

- [Semgrep CLI e execução de regras locais](https://docs.semgrep.dev/cli-reference).
- [GitLab: status de pipeline por commit e pipelines externos](https://docs.gitlab.com/api/commits/#set-commit-pipeline-status).
