# Regressão do Portal SDLC

**Microagentes locais:** `tests/coding-micro.test.py` integra CI/regressão de suporte; `lab/qwen-code/patch.test.mjs` integra o gate Linux com workspace/sondas. Os contratos verificam capacidade de arquivo/trecho, revisão congelada, UTF-16, delimitadores JSX, import restrito, sobreposição, recusa sem patch e ausência de execução da fonte inspecionada. A qualificação opt-in usa oito controles: soma, Provider, preço compacto, preço com pré-requisito, arquivo grande, protocolos, mensagem de diálogo e campos nativos obrigatórios. Exige preço exato sem prefixo duplicado, preservação do arquivo grande/categoria obrigatória, URL HTTP/HTTPS e recusa de `javascript:`, alteração de mensagem como dados e submit vazio bloqueado. Registra digest das fixtures, executor e ferramenta. Planos, seleções, propostas, validações e receitas ficam privados. Conjunto reprovado não autoriza instalar a ferramenta nem certifica o piloto. Contagem registrada não equivale a execução completa.

**Executor Qwen Code e recortes:** a descoberta de suítes backend inclui `coding-provider.test.ts`, `story-slicing.test.ts` e os casos de aplicação/repetição em `pipeline-planning.test.ts`. `full` também executa `tests/coding-executor.test.py`, `tests/coding-ui-agent.test.py` e `tests/browser-controls.test.mjs`; o CI mantém esses contratos explicitamente. A suíte de workspace fica em `lab/qwen-code/workspace.test.mjs`, executada no gate Linux com a imagem Node/Qwen preparada. Os testes de interface dos recortes e erros técnicos estão catalogados nos arquivos existentes; contagem do catálogo não significa que toda a regressão foi executada na entrega.

O conjunto corrente acrescenta um oitavo controle, `ui-native-required`: campos nativos SKU/Nome obrigatórios, preenchimento pela UI, preço exato e submit vazio ainda bloqueado. `ui_prerequisite_binding` vincula campo/botão de um cadastro auxiliar; `ui_form_field` só fornece um valor para um campo inválido observado. O Chromium lê a validação nativa pelo mesmo alvo acessível, sem mudar atributos/estado. A suíte de integração tem 13 controles, incluindo essa observação, campos anônimos misturados com nomeados e replay; a qualificação do modelo permanece opt-in e separada da aceitação real de joias.

As receitas privadas do operador local ficam em `ui-recorded-steps.json`, com revisão esperada, cenário, ações executadas e eventual asserção reprovada; `ui-action-*.json` preserva as observações intermediárias. Uma receita bem-sucedida precisa passar novamente no Chromium em contexto vazio. Não se promove essa sonda representativa a aceite integral do negócio. A qualificação sintética conserva diagnósticos/receitas selecionados, sem copiar configuração ou credenciais do SDK.

`python3 scripts/validate-coding-executor.py --model <modelo-local-preparado>` qualifica edição iterativa real em fixtures sintéticas, sem dados ou credenciais de aplicações. Exige imagem `sdlc-qwen-code:prepared` e o Ollama local já conectado. A evidência distingue validação de sintaxe/imports de comportamento; não substitui a aceitação de negócio pela interface. Preparação/smoke do LAB e qualificação não devem disputar inferência com uma jornada operacional em andamento.

`--ui-model` permite avaliar separadamente código/UI, sem trocar a instalação operacional; o recibo identifica os dois modelos. O experimento coder 7B/UI 14B `coding-live-20261031T064052Z-d71a6c` foi reprovado e não autoriza adoção. A fonte corrente separa padrões, mensagens e localidade decimal como dados; a ferramenta conserva seus contratos sintáticos. Localidade cobre apenas `toFixed` com precisão literal de 0 a 20; não é um editor geral de números. A expressão geral continua disponível para outros casos, sem aprovação presumida.

Após `bootstrap.ps1 prepare-agents`, `python3 tests/coding-browser.integration.py` verifica o Chromium real em código sintético: Provider ausente, Provider corrigido, entrada vazia, dependência não preparada e contexto sem entrada React. Não usa o banco ou a aplicação piloto. O contrato Python do executor cobre a correção interna mantendo identidade, revisão, alterações anteriores e orçamento combinado. A qualificação opt-in do modelo agora também exige a imagem `sdlc-coding-browser:prepared`; o smoke é somente abertura da entrada web, não o aceite dos fluxos de negócio. Os relatórios antigos anteriores a essa proteção continuam descrevendo apenas sua cobertura original.

`python3 scripts/validate-story-slicing.py --models qwen3.5:9b gemma4:12b` qualifica o planejamento real dos modelos em oito fatos sintéticos e três Histórias. Usa somente inferência local já preparada; não lê a base do portal, não gera propostas reais e não modifica a configuração. A fonte corrente do planejador é montada somente para leitura sobre a imagem de dependências; digest e modo de fonte são registrados. Respostas completas ficam privadas, o recibo resume referências/quantidade/tempo e não comprova interpretação semântica nem capacidade em outros domínios. O runner confiável tem acesso ao endpoint interno de inferência; não executa código produzido pelo modelo e não possui credenciais de aplicações. Recursos remanescentes só são encerrados após conferir nome/label próprios. Uma qualificação recusada registra FAILED; interrupção sem confirmação segue o contrato administrativo comum.

O ensaio corrente inclui o arquivo do cenário no fingerprint e usa temperatura 0,2/contexto 32768 como o relay operacional. Até duas rodadas de rascunho e vínculos compartilham o prazo de 240 segundos; a recuperação usa somente violações estruturais/cobertura, sem outro modelo aprovador. IDs e cópia literal dos critérios são responsabilidades do servidor. A etapa dos vínculos usa decisões booleanas nas chaves reais de fatos/Histórias, sem aceitar índices de Histórias inexistentes; essas associações permanecem propostas e devem ser revisadas pela pessoa. Recibos antigos com temperatura 0,1, o verificador semântico ou os índices numéricos de vínculo continuam históricos e não qualificam automaticamente o contrato corrente.

O vínculo corrente trata um único fato por chamada e conserva a resposta bruta em `factRows`, além do mapa combinado. Até 20 fatos e duas rodadas compartilham o mesmo prazo, com no máximo 42 chamadas; prazo vencido impede nova inferência. O ensaio positivo usa três correções independentes e preservação das funcionalidades existentes; o negativo exige recusar CRUD amplo em uma única História. A fixture histórica que agrupava várias operações em três Histórias não qualifica esse novo recorte. Fontes incluem agora também `requirements.ts`. `planning-live-20261031T075526Z-4491d1` passou em dez chamadas locais; isso confirma referências/recusa, sem aprovação semântica automática ou aceite do produto.

Reteste de 31/10: 82 testes dirigidos de codificação/jornada/planejamento e 41 de requisitos/pipeline/sessões passaram; dois cenários de retomada técnica desktop/celular passaram. Catálogo atual: 586/54. A jornada UI real publicou a revisão do MR !7 em DEV e teve cinco aprovações e duas falhas de imagem em sete casos; não certifica os 28 casos do catálogo. A full anterior com corte temporal reprovado continua reprovada. A execução integral final permanece para depois da aceitação do piloto, conforme o plano.

O ambiente rápido é exclusivo da automação. Containers, dependências, compilação incremental e dados de fixtures são reaproveitados; cada cenário cria seu contexto e declara sua dependência de isolamento. Um teste não pode depender da execução anterior. O portal humano continua separado, na porta 3310.

## Comandos no Windows

Na raiz do repositório, com Docker disponível no WSL `agentic-sdlc`:

```powershell
# Uma vez, ou após alteração do lock de dependências:
.\sdlc\portal\regression.ps1 toolchain
# No laboratório atual, reutiliza o cache existente após conferir o lock:
.\sdlc\portal\regression.ps1 toolchain --reuse-cached

# Ciclo diário: sincroniza somente arquivos alterados; mantém banco e serviços.
.\sdlc\portal\regression.ps1 fast
.\sdlc\portal\regression.ps1 fast contract-publications.spec.ts --grep 'confirmed MR'

# Backend selecionado, com esquema limpo para cada suíte de integração:
.\sdlc\portal\regression.ps1 backend releases.test.ts story-delivery.test.ts
# Interface selecionada em outra base, independente do ambiente rápido:
.\sdlc\portal\regression.ps1 browser releases.spec.ts

# Catálogo: revisar a diferença gerada antes de aceitar novos casos.
.\sdlc\portal\regression.ps1 catalog --write-catalog
# Regressão completa: recursos novos, backend, build de produção e interface.
.\sdlc\portal\regression.ps1 full

.\sdlc\portal\regression.ps1 status
.\sdlc\portal\regression.ps1 cleanup --scope fast
```

Em Linux/WSL, na pasta `sdlc/portal`, os mesmos argumentos são aceitos por `python3 scripts/regression.py`. Não há dependência de scripts privados de `.prepared`. A imagem de dependências/navegador é construída por `infra/Dockerfile.regression`; fontes e segredos não fazem parte dessa imagem. O cache antigo pode ser adotado após conferência do lock; o ID usado consta do recibo.

| Modo | Recursos/dados | Uso |
| --- | --- | --- |
| `fast` | `sdlc-regression-fast-*`, persistentes; Next dev, porta local 3390 | Fixtures próprias, sem limpeza global; smoke padrão de quatro casos |
| `backend` | `sdlc-regression-verify-*`; reset do esquema por suíte de integração e ao terminar | Domínio, API, PostgreSQL e migrações |
| `browser` | `sdlc-regression-ui-*`; base limpa no início | Arquivos que exigem base limpa e investigação visual |
| `full` | Remove/cria apenas os recursos próprios de `verify`; limpa ao final | Linha de base e aceite técnico completo, sem cache de dados |

Redes são internas, sem saída para provedores. Somente a porta do ambiente rápido é publicada no loopback. `DATABASE_URL` e `TEST_DATABASE_URL` precisam coincidir e apontar para `portal_test`. Propriedade, mounts, ambiente e anexos de rede são conferidos antes da remoção. O controlador impede dois comandos simultâneos no mesmo escopo. Nunca contornar o bloqueio com `docker exec` concorrente ou executar reset contra a base humana.

`tests/support/server.mjs` fornece adapters determinísticos e endpoints `__test` para disparar workers explicitamente. Não inicia timers de produção nem aceita credenciais GitLab/LLM operacionais. Esses endpoints não são importados por `apps/api/src/server.ts`.

## Registro dos testes de interface

1. Escrever o cenário em `tests/e2e/*.spec.ts`, com nome que descreva o comportamento observável. Registrar precondições e dados na fixture, com IDs únicos ou interceptações explícitas. Não editar dados reais para fabricar impedimentos.
2. Dirigir a interface por papéis, nomes e rótulos acessíveis. Verificar resultados, mensagens, foco e URL/contexto quando aplicável. Esperar estados; evitar pausas arbitrárias, ordem entre arquivos ou capturas sem asserção.
3. Para mutações, cobrir autoria, recusa, resposta perdida, repetição e preservação de rascunho quando pertinentes. O caminho feliz isolado não comprova esses contratos.
4. Registrar o arquivo em `catalog.json`: área, requisito/RA quando conhecido, isolamento e providers. `requirements: []` significa rastreabilidade pendente. Novos casos devem informar sua RA.
5. Rodar `catalog --write-catalog`. `cases.json` recebe IDs estáveis `UI-…`, derivados de arquivo e título completo. Renomear um caso muda seu ID; revisar a diferença. O executor recusa arquivos/casos não registrados.
6. Rodar o arquivo selecionado. Para habilitar reuso no `fast`, provar duas execuções consecutivas sem reset e sem dependência de dados anteriores; então declarar `scoped-fixtures`. Arquivos `fresh-database` são recusados no modo rápido.

O código Playwright registra passos e expectativas de forma reproduzível. Vídeo/gravação manual pode ajudar na escrita, mas não substitui fixture e asserções. Captura manual usa ambiente descartável de captura, separado do ambiente rápido exclusivo da automação.

O catálogo inicial contém 45 arquivos e 363 cenários. Parte usa interceptação HTTP; outra parte percorre UI/API/PostgreSQL reais com adapters externos simulados. Isso não comprova implantação real. A classificação de todos os casos por requisito e a revisão assistiva integral continuam no backlog.

## Relatórios e repetição

Cada execução gera `test-results/regression/<id>/`:

- `summary.json`: comando, hashes de runtime/testes, estabilidade das fontes, fases e resultado consolidado;
- `environment.json`: propriedade, IDs das imagens e operação administrativa correlacionada, quando executado pelo controlador;
- `backend.json` e JSON por arquivo: aprovados, falhos, não executados e erros de coleta;
- `browser.json`, `browser-cases.json`, `browser-junit.xml` e `html/index.html`: resultado por caso e ID;
- `browser-artifacts/`, `screenshots/` e logs: rastros das falhas e capturas solicitadas pelos cenários.

O modo `full` inclui também os contratos Python de auditoria administrativa, relay e proteção do controlador. O CI usa o mesmo `pnpm regression:ci` e publica relatórios também em falha. O comando Playwright direto escreve em `test-results/browser-direct`, para não limpar os relatórios e o ledger das rodadas consolidadas. Só aprova se todas as fases executadas passarem e a fonte permanecer estável. Testes GitLab reais opt-in ficam explicitamente não executados na rodada simulada. Não esconder falhas com retentativas automáticas: investigar pelo ID/trace, corrigir e anexar outra execução. Rodadas interrompidas e falhas anteriores permanecem registradas.

Relatórios detalhados são ignorados pelo Git. O recibo resumido, com contagens e limites, é versionado em `sdlc/docs/assets`. Copiar somente metadados seguros, sem tokens, prompts, conteúdo de negócio ou HTML de ambientes reais. O ledger administrativo próprio fica em `test-results/regression/control/audit`, fora das bases e dos containers removidos; não é apagado na limpeza dos ambientes.

## Limites e rotina

Para qualificar o revisor real sem usar dados de aplicação, executar `python3 scripts/validate-code-review.py --models <modelos-instalados>`, opcionalmente `--thinking`. Quatro controles sintéticos confrontam código correto, chamada inválida de API, recusa indevida de SVG HTTP e relato histórico já corrigido. O script usa o contexto e as instruções correntes do revisor; respostas completas permanecem privadas e não são executadas. Recibos registram falsos positivos, defeitos omitidos, precisão das linhas e fonte estável; reprovação não altera configuração ou pareceres existentes. As chamadas são sequenciais para não disputar a GPU com agentes ativos. Uma amostra aprovada não comprova qualidade geral nem aceita a aplicação piloto.

Rodar testes dirigidos a cada mudança, o smoke após alterações de navegação e `full` ao consolidar marcos e antes do aceite final. O modo rápido não comprova migração limpa, integração real nem deploy. O aceite do piloto exige provedores reais isolados e evidência do mesmo digest em QA → HML → PRD.

Não há clonagem de template de banco nesta versão: o ganho vem do reuso dos containers, browser/dependências, fonte incremental e fixtures próprias. Mudança de dependências exige atualizar a imagem; mudança de esquema exige validar migrações e rodada limpa. Se o volume de fixtures prejudicar desempenho, recriar o ambiente rápido pelo comando próprio, fora de uma execução.

## Escopo da palavra completa

`full` executa o catálogo completo do **Portal SDLC**, com os contratos auxiliares acima. A regressão de todo o repositório inclui ainda os outros jobs preservados em `.github/workflows/validate.yaml`: extensão VS Code, portal/controlador legado, integrações PostgreSQL do control, Windows/IaC e gates Linux. Esses jobs não são substituídos pela regressão do portal nem foram todos reexecutados por esta consolidação. A jornada real do piloto, com build/registry/deploy, será acrescentada quando os executores existirem; adapters simulados não constituem esse aceite.

## Validação real opt-in do contrato

`python3 scripts/regression-gitlab.py` (WSL, na pasta do portal) usa somente o GitLab local da instalação, em `127.0.0.1:3180`, com credenciais dedicadas lidas de arquivos privados. Cria um projeto privado `sdlc/regression-contract-<UUID>`, prepara o arquivo de contrato, libera Draft e integra o SHA fixado na main protegida; confere bytes e ancestralidade e remove apenas o projeto próprio. Não carrega o banco do portal nem modifica aplicações existentes. A preparação do projeto de ensaio define sua própria política sem pipeline; o adapter continua respeitando pipelines/proteções de qualquer destino real. A validação não comprova executores de aplicação.

O resultado fica em `test-results/regression/provider-live-*/provider-live.json`, correlacionado à trilha administrativa própria. Se a limpeza não for confirmada, o resultado falha. `python3 scripts/regression-gitlab.py --cleanup <caminho-do-provider-live.json>` retoma somente a remoção do projeto comprovadamente próprio. Em GitLab com exclusão adiada, o nome pode receber o sufixo `-deletion_scheduled-<id>`; o controlador exige o UUID, namespace, ID e tópico do ensaio antes da remoção definitiva. Nunca usar a remoção para projetos de aplicações. Esse teste é opt-in e fica separado da rodada com providers simulados.

## Construção DEV — RA-11

O catálogo recebe 20 casos novos em `development-build.spec.ts` (405 casos/47 arquivos no total). Preflight, persistência, auditoria e worker têm suítes backend próprias; `tests/build-executor.test.py` cobre o serviço em diretórios temporários e integra os checks auxiliares do modo full. Hashes passam a incluir `executor/`, a preparação de ferramentas e seu Dockerfile; sincronização não depende de `.prepared`.

`python3 scripts/validate-build-executor.py` é opt-in: executa compilação React real, verifica limites de sandbox e conteúdo da imagem e provoca um exit não zero em fixtures isoladas. Não lê banco do portal nem modifica piloto/aplicações. Recibo correlacionado em `test-results/regression/executor-live-*/executor-live.json`; a limpeza confere rótulos próprios antes de remover imagens/containers. Esse ensaio não é jornada GitLab → build → deploy nem substitui o aceite do piloto até PRD. [Perfil e preparação reproduzível](../../../docs/executor-node24-react-v1.md).
