# Observabilidade local — primeiro núcleo F3a/F4a

[Diagnóstico dos sinais F4b](OBSERVABILITY-DIAGNOSTICS.md), 09/11/2026: `doctor` distingue núcleo disponível de fontes HTTP/JVM ausentes, atrasadas ou degradadas. `observability.signals` mantém seis fontes explícitas; `doctor --component telemetry` verifica essa cobertura, sem alterar a UI nativa ou os blueprints instalados.

Entrega de 08/11/2026: preparação explícita de Grafana, Prometheus, Loki e OpenTelemetry Collector, com imagens oficiais fixadas por plataforma e configurações nativas versionadas. A instalação das ferramentas fica em [blueprints/middleware](blueprints/middleware/observability.json); coleta, fontes, alertas e dashboard ficam em [blueprints/observability](blueprints/observability). O Portal SDLC e as aplicações produzidas não são modificados.

## Instalar e operar

Depois de preparar a fundação local, no pacote apropriado, Mac/GB10 ou dentro da distro WSL2:

```sh
sh ./install.sh plan --phase observability
sh ./install.sh install --phase observability
sh ./platform.sh status
sh ./platform.sh doctor --component grafana
```

No Windows, mesma conta da instalação, PowerShell como administrador:

```powershell
.\install.ps1 -Action Plan -Through Observability
.\install.ps1 -Action Install -Through Observability
.\platform.ps1 doctor --component grafana
```

Windows encadeia as fases anteriores até origem TLS e depois observabilidade. No shell, a fase explícita exige runtime/redes e bootstrap de acesso já preparados; não reinstala o host. `all` nativo e o padrão Windows `Origin` continuam com o escopo anterior. A etapa é opcional para não consumir recursos ou ampliar a combinação instalada silenciosamente. Nenhum desses exemplos foi executado contra os serviços desta máquina durante o desenvolvimento.

Única porta publicada: **`http://grafana.localhost:3001`**, em IPv4 loopback. `ports.grafana` na configuração permite mudar a porta antes da preparação. Repetição com mudança de especificação exige migração explícita; a implementação não sobrescreve recursos existentes. Prometheus, Loki e Collector ficam na rede interna `services`, sem portas de host, socket Docker, bind mounts ou acesso aos arquivos privados do SDLC/agentes. A porta declarada 4318 permanece candidata para instrumentação futura: esta entrega não abre receptor OTLP.

Login nativo Grafana: usuário **`platform-admin`**. Senha aleatória e chave de criptografia ficam em `observability-seed.json` no controle privado: Linux `/var/lib/ai-platform-control/<id>`; Mac `~/Library/Application Support/AIPlatform/control/<id>`; Windows dentro da distro dedicada. Esses valores não são impressos, incluídos em argumentos, dashboard ou ledger. A chave é estável nas retentativas. Alteração da senha pelo produto não é desfeita automaticamente; divergência exige tratamento administrativo. Não há SSO/MFA qualificado ou autorização para exposição pública nesta etapa.

Os [comandos diários](OPERATIONS.md) aceitam `metrics`, `logs`, `telemetry` e `grafana` como componentes. `all` passa a incluir os quatro quando preparados, depois dos serviços da fundação; a parada usa a ordem inversa. `status` conserva os cinco serviços da fundação e acrescenta a coleção separada `observability.services`, incluindo componentes ainda não preparados. Logs de um componente continuam sendo captura privada e limitada. Parar o runtime próprio exige todos os workloads parados, inclusive essas ferramentas.

## O que é coletado

| Sinal | Fonte e interpretação |
| --- | --- |
| Coleta disponível | Prometheus `up` dos jobs `prometheus` e `telemetry`; falha/ausência é distinta de saúde. |
| Resposta HTTP local | Sondas GET sem credenciais: discovery Keycloak, saúde OpenBao, Grafana, Loki e Prometheus. HTTP 2xx não prova autorização ou regra de negócio; cofre selado pode retornar erro de saúde. |
| JVM/processo da identidade | Métricas `jvm_*` e `process_*` do endpoint interno Keycloak. Não representa memória do host/VM nem da GPU. |
| Alertas locais | Falta de scrape, respostas HTTP não saudáveis e menos de cinco sondas com medição; regras locais no Prometheus. Notificações externas/Alertmanager não configurados. |
| Logs | Loki preparado como backend e datasource. **Nenhum pipeline de logs de agentes/aplicações foi ativado.** A fonte pode estar vazia. |

Não há coleta de host/WSL/VM, disco, GPU NVIDIA/Metal, origem mTLS, GitLab/Sonar, modelos, agentes, traces ou aplicações/Portal SDLC. Essas lacunas aparecem no dashboard. Não se fabricam séries para preenchê-las. A coleta HTTP usa componente **alpha** do Collector, fixado na versão qualificada pelo código; não é fonte de gates do domínio. O pipeline só recebe métricas dos alvos estáticos internos. Sem receptor OTLP, leitores de arquivos, captura de prompts/respostas, exporters externos ou labels de execução/operação/usuário. O contador de erros com mensagens livres foi desabilitado para evitar conteúdo sensível e cardinalidade não limitada.

O dashboard nativo **“Fundação · Operação”**, UID `platform-foundation`, pasta `Plataforma`, possui cartões de disponibilidade, endpoints, tempo das sondas, memória JVM e cobertura. Datasources `platform-metrics`/`platform-logs` são provisionados como código. Dashboard/fontes não são editáveis pela UI; o produto conserva sua navegação e Explore. Não existe interface paralela no Portal.

Cartões usam consulta instantânea, sem transformar histórico saudável em estado atual. O Collector remove o código HTTP dos labels para que uma mudança 200→503 atualize a mesma série de classe de status, sem conservar um cartão saudável anterior por outro label. As sondas dependem do scrape vivo do Collector; métricas exportadas expiram após 45 s. Grafana mostra ausência/erro de consulta pelos seus estados nativos e “Sem medição” quando aplicável. Ainda há atraso normal de coleta, batch e scrape (15 s/5 s/15 s); ausência não é medida zero, e saúde atual não é aceite histórico de uma release.

## Versões, estado e limites

| Ferramenta | Versão fixada | Licença da distribuição adotada |
| --- | --- | --- |
| Grafana OSS | 13.3.0 | AGPL-3.0 |
| Prometheus | 3.16.0 | Apache-2.0 |
| Loki | 3.7.9 | AGPL-3.0 |
| Collector Contrib | 0.165.0 | Apache-2.0 |

[Manifesto](internal/provision/observability-images.json): índice, manifestos Linux AMD64/ARM64 e config digests verificados no registro oficial. Mac usa containers ARM64 na VM; isso não qualifica hardware ou GPU. Artefatos são obtidos somente na preparação; retomada diária usa containers existentes, sem pull. Os blueprints são embutidos no binário a partir das duas pastas separadas, mantendo o pacote operacional fechado de 11 arquivos e a compatibilidade do instalador/rollback da CLI.

Orçamento declarado adicional: aproximadamente 2 GiB de limites de memória e quatro CPUs como soma dos limites individuais, sem reserva/dimensionamento conjunto comprovados. Containers não root, filesystem de imagem somente leitura e capacidades removidas. Dados ficam em dez volumes nomeados próprios de configuração/estado, sem montar diretórios ou socket do host. Prometheus retém até 48 h/1 GB, conforme seu mecanismo; Loki retém 48 h, o que **não é uma quota rígida de disco**. Não há backup, HA ou qualificação de retenção sob carga. Analytics, atualização de plugins e verificação de updates Grafana/Loki foram desabilitados; não há instalação de plugins na inicialização.

`observability_core_ready=true` confirma que o coordenador verificou processos, banco Grafana, configuração/saúde dos dois datasources, dashboard e séries recentes de scrape dos dois jobs. Pode coexistir com uma sonda relatando falha: a capacidade de observar está pronta, não todos os endpoints observados. `status` observa processos/propriedade; `doctor` acrescenta essa prova. No Windows, `windows_observability_qualified=false` identifica que encaminhamento/UI em navegador ainda não foi qualificado. `installation_ready`, SSO e publicação externa permanecem falsos. Preparar o núcleo não conclui F3/F4 ou as aplicações.

## Auditoria e recuperação

A fase exige propriedade das raízes, lock e ausência de manutenção pendente. Cria credenciais privadas e obtém imagens em ações separadas; configura volumes selados e registra intenção antes de criar containers. Nomes, IDs, owner/spec, imagens/arquitetura, privilégios, mounts, redes e bind loopback são conferidos. Coincidência de nome não concede adoção. Retentativa não recria containers saudáveis nem reinicializa Keycloak/OpenBao.

Antes do startup, executa `promtool check config`, Loki `-verify-config` e Collector `validate` em containers temporários próprios: sem rede, portas ou host mounts, imagens já preparadas e limites explícitos. Intenção e limpeza confirmada permitem retomar uma validação interrompida. Falha não imprime a saída bruta na projeção administrativa. Essa validação estática não substitui probes dos produtos/coleção e a qualificação real.

Falha de startup/saúde tenta parar somente processos novos, preservando ferramentas anteriormente ativas, volumes, senha e chave. Compensação confirmada conserva `FAILED/COMPLETED`; incerteza conserva `UNKNOWN/OBSERVED`. Arquivos/recibos em `observability/`, `observability.resources.json`, `observability.intent.json`, `observability.validation.json` e `observability-seed.json` permitem diagnóstico/retentativa da mesma configuração. Não apagar controles ou volumes para forçar reparo; upgrade, migração e limpeza de dados exigem implementação própria. Não se promete rollback de bancos ou telemetria.

Catálogo/recorder: `PLATFORM_OBSERVABILITY_CREDENTIALS_PREPARED`, `PLATFORM_OBSERVABILITY_IMAGES_PREPARED`, `PLATFORM_OBSERVABILITY_CONFIG_VALIDATED`, `PLATFORM_OBSERVABILITY_SERVICES_PREPARED` e `PLATFORM_OBSERVABILITY_STARTUP_COMPENSATED`; Windows acrescenta `PLATFORM_OBSERVABILITY_LAYER_PREPARED`. Pedidos precedem efeitos; autoria/correlação e hashes dos blueprints/imagens/configuração acompanham comparações seguras. Auditoria fica fora dos dados alterados, sem `HistoryEvent`, segredos ou conteúdo de logs/prompts. As ações internas feitas diretamente nas UIs dos produtos não são declaradas cobertas pelo recorder da plataforma. [Contrato transversal](../sdlc/docs/implementacao-auditoria-2026-10-24.md).

## Evidência

Suíte Go integral/vet e 87 cenários Windows passaram em provedores isolados. Incluem três perfis, plano sem escrita, retentativa sem recriação, binding indevido, coleta parcial/desatualizada, credenciais/projeção seguras, manutenção/captura privada e compensação confirmada/incerta. A regressão do ciclo de runtime passou após normalização de opções em uma fixture. No reteste final, após ajustes dos blueprints, o Application Control voltou a bloquear o executável temporário `provision.test.exe`; esses ajustes finais aguardam execução na CI. Vet, compilação e pacotes dos três destinos não substituem essa execução. Nenhuma política foi alterada ou contornada.

CI Docker AMD64/ARM64 foi estendida com os quatro produtos reais, validação nativa, fontes/dashboard/scrapes e remoção confirmada de recursos descartáveis próprios (`PLATFORM_OBSERVABILITY_ISOLATED_TEST_REMOVED`). **Não foi executada remotamente nesta entrega.** Não houve download de camadas, containers iniciados ou alteração dos serviços humanos nesta máquina; a consulta aos registros obteve apenas manifestos/configurações públicos. Navegador, disponibilidade sob carga, SSO, publicação e equipamentos continuam pendentes.

Referências primárias consultadas: [provisionamento Grafana](https://grafana.com/docs/grafana/latest/administration/provisioning/), [Prometheus](https://prometheus.io/docs/prometheus/latest/configuration/configuration/), [Loki 3.7.9](https://github.com/grafana/loki/blob/v3.7.9/cmd/loki/loki-local-config.yaml), [HTTP Check 0.165.0](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/v0.165.0/receiver/httpcheckreceiver) e [exporter Prometheus](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/v0.165.0/exporter/prometheusexporter).
