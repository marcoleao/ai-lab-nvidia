# Execução assistida: especificação, G1 e código para revisão

A consulta da História passa a oferecer **Preparar execução**. O usuário precisa aprovar o Projeto e o Épico, selecionar exatamente um repositório pronto na História e manter critérios de aceite estruturados. O modelo local prepara requisitos, arquitetura, casos de teste ligados aos critérios e riscos. O backend verifica cobertura de todos os critérios antes de disponibilizar a decisão G1.

Admin, Product Owner ou Arquiteto revisa os artefatos e confirma **Aprovar G1 e gerar código**. Só então a fila lê o código no GitLab, fixa o SHA da branch padrão e solicita um patch ao modelo. O patch aceito é persistido antes de qualquer publicação. O GitLab recebe um commit em `sdlc/story-<executionId>` e uma Merge Request em rascunho; `main` não recebe push ou merge.

## Limites desta entrega

É a primeira fatia de SDLC-12/14/15/17; não representa o pipeline completo da especificação. A preparação produz os três tipos de artefatos em uma consulta estruturada ao modelo, ainda sem três agentes de especificação independentes. A decisão G1 tem confirmação humana e evidência persistida; rejeição com tarefas de correção ainda não foi implementada. Cancelar permite voltar a SPECIFICATION e preparar uma nova execução.

O resultado da codificação é uma proposta de alteração real no GitLab. O código gerado não é executado dentro da API nem recebe credenciais ou ferramentas do host. Não há alegação de compilação ou testes aprovados. O executor isolado para build/testes, Code Review automático, Security Scan, pacotes e deploy QA/HML/PRD permanecem como próximas entregas. A História permanece em CODING após a publicação do rascunho.

Esta fatia aceita repositórios pequenos: até 100 entradas na árvore, 16 arquivos elegíveis e 18000 caracteres de código lido; o prompt de codificação completo não pode exceder 15000 caracteres. Até seis arquivos e 48000 bytes por patch. Recusa caminhos relativos perigosos, arquivos ocultos e infraestrutura. Alterações de dependências agora seguem o [ciclo de conversa e decisão](impedimentos-conversacionais-2026-10-20.md), com autorização explícita por execução para os manifestos suportados. Não altera CI ou Dockerfile. A instalação de pacotes e os ajustes de empacotamento ainda dependem de entregas futuras. O agente discute impedimentos e alternativas com o usuário, sem fallback de código.

## Persistência e recuperação

`StoryExecution` mantém etapa, snapshots, artefatos, patch, branch e recibo GitLab. Há no máximo uma execução ativa por História. Claims usam o mesmo lock transacional do planejamento, leases de seis minutos e exclusão de inferência entre conversa, execução e validação técnica.

Timeout ou interrupção marca a execução como falha, preservando a etapa. **Retomar execução** retoma explicitamente o mesmo registro. Na publicação, reutiliza o patch persistido e reconcilia branch e Merge Request; não gera outro patch. Mudança do contexto aprovado ou da base GitLab bloqueia a continuação. ACK HTTP perdido repete chave, persona e corpo; não cria outra execução.

Cancelar descarta a saída tardia do modelo. Durante publicação remota em andamento, a UI pede aguardar a reconciliação; a falha pode deixar branch ou MR no GitLab, que são preservadas para retomada. Não há exclusão remota automática.

## Validação

Trinta e cinco testes TypeScript passaram em PostgreSQL descartável: inclui G1 obrigatório, permissão, patch sem travessia/infraestrutura, retomada sem nova geração e idempotência do provedor GitLab. Um teste Chromium passou para leitura por persona, preparação com ACK perdido, confirmação G1, retomada com ACK perdido e link MR. Revisão UX aprovada em 1440 e 390 pixels, sem overflow ou duplicação.

O teste de GitLab descartável confirmou publicação de branch e MR reais em runtimes Node/Python, reutilização do mesmo resultado, `main` preservada, MR em rascunho e zero pipelines. Os ensaios são exclusivos dos ambientes descartáveis. Nenhuma história do usuário é iniciada ou aprovada pelo agente de desenvolvimento.

O segundo teste integrado usou `qwen3:14b` e PostgreSQL/GitLab descartáveis: preparou artefatos, aguardou a aprovação G1 feita pelo harness isolado, leu o código fixado no SHA, gerou arquivos e publicou a Merge Request pela fila persistida. Passou em 35288 ms após inicialização do GitLab. Os dois testes GitLab reais passaram; são adicionais aos 35 contratos e ao Chromium. A primeira tentativa desse ensaio encontrou HTTP 403 ao inicializar outro repositório neutro; o ensaio final reutilizou o repositório Python preparado e validado no primeiro teste. Isso não alterou permissões ou repositórios humanos. As capturas da revisão UX estão no diretório local privado `.prepared`.
