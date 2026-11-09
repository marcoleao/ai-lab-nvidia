# Hub local de serviços — Homepage, F8a

Entrega em código de 09/11/2026: preparação explícita do Homepage nativo, separada do Portal SDLC e dos backends de observabilidade. A página oferece três links configurados: Keycloak, OpenBao e o dashboard da fundação no Grafana. Não reconstrói funcionalidades dessas ferramentas ou declara disponibilidade pelos links. Demais ferramentas, IA, agentes, replay e aplicações permanecem no backlog.

## Preparar e operar

No pacote nativo Mac/GB10 ou dentro da distro dedicada WSL2, após runtime, redes, acesso e observabilidade preparados:

```sh
sh ./install.sh plan --phase hub
sh ./install.sh install --phase hub
sh ./platform.sh doctor --component homepage
```

No Windows, PowerShell como administrador, na mesma conta da instalação, com checkout e pacote atualizados:

```powershell
.\install.ps1 -Action Plan -Through Hub
.\install.ps1 -Action Install -Through Hub
.\platform.ps1 doctor --component homepage
```

Windows encadeia as fases até origem TLS e observabilidade antes do hub. No shell, `hub` é uma fase isolada com pré-requisitos já preparados. `all` nativo e o padrão Windows `Origin` mantêm o escopo anterior. O planejamento não escreve controles ou inicia processos; o plano Windows ainda é uma observação local e não qualifica o provedor Linux.

Endereço local **`http://home.localhost:3300`**, configurável por `ports.homepage` antes da preparação. A única publicação do container é IPv4 loopback. Não há autenticação/SSO habilitado no hub local; validação de Host não é identidade de usuário. `external_publication_ready=false`, `installation_ready=false` e `windows_hub_qualified=false`. Domínio e caminhos direto/túnel continuam configuráveis na fundação, com ativação e reconciliação deste consumidor pendentes.

`status`, `doctor`, `start`, `stop`, `restart` e captura privada `logs` aceitam `--component homepage`. `all` inclui o hub quando preparado, depois dos serviços básicos e da observabilidade; a parada ocorre na ordem inversa. Um link pode abrir uma ferramenta parada. Saúde das ferramentas continua no seu diagnóstico próprio; iniciar o hub não inicia implicitamente os destinos. `status` e `doctor` preservam os cinco serviços básicos e a coleção dos quatro de observabilidade; o hub usa `hub.service` separado.

## Configuração e prova

Instalação/recursos: [middleware/homepage.json](blueprints/middleware/homepage.json). Aparência nativa: [hub/settings.json](blueprints/hub/settings.json). Serviços são materializados como configuração JSON, subconjunto de YAML, com URLs locais canônicas e portas da instalação. Não há HTML/CSS/JavaScript customizados, ícones remotos, widgets, auto descoberta, Docker socket, bind mounts do host, tokens de ferramentas ou referências a prompts/resultados de agentes. Fontes/tema pertencem ao produto nativo. A descrição da página explicita o recorte atual; o Portal SDLC não recebe link até sua implantação própria ser implementada.

O container usa UID/GID 1000, imagem somente leitura, capacidades removidas, `no-new-privileges`, limite de memória 384 MiB, 0,5 CPU e 128 processos. Usa a rede privada `services`, um volume nomeado selado de configuração e dois tmpfs limitados de 32 MiB (`/tmp` e cache Next). Não tem volume de banco ou segredos. Logs do produto vão ao stdout; não tenta persistir logs no volume selado. Esses limites não equivalem a dimensionamento conjunto ou teste de carga.

`HOMEPAGE_ALLOWED_HOSTS` restringe o host/porta canônicos; localhost interno também é aceito pelo comportamento nativo do produto. O instalador confere comandos, variáveis configuradas, ausência de variáveis adicionais Homepage/NextAuth/Node options, imagem/arquitetura, owner/spec, nome/ID, rede, privilégios, mounts e bind loopback. A configuração selada é conferida na preparação. Operação diária confere identidade/especificação do container; o diagnóstico HTTP não é uma atestação completa do conteúdo do volume.

`hub_ready=true` na preparação, ou `hub.api_ready=true` no `doctor`, exige processo confirmado, resposta `up` em `/api/healthcheck` e página HTTP com os três links esperados. `scope_ready` identifica esse escopo. Não comprova login nos destinos, saúde global, qualidade visual em navegador ou encaminhamento Windows. Respostas são limitadas a 1 MiB, com conexão só ao loopback, sem proxy de ambiente ou redirecionamentos. HTML/erros brutos não entram na projeção administrativa. Campos desconhecidos do provedor são removidos pelo transporte Windows.

## Identidade, retentativa e limites

`hub-owner.json` no controle privado conserva a identidade aleatória do recurso; não é uma senha e não contém credenciais dos destinos. `hub.resources.json`, `hub.intent.json` e `hub/compose.json`/`empty.env` nos dados vinculam o recurso à configuração. Usa o mesmo lock e recorder administrativo, externo aos dados alterados. Pedidos precedem geração de identidade, pull, volumes e startup. Não altera `HistoryEvent`, aplicações produzidas, dados de negócio ou resultados de agentes.

Catálogo nativo: `PLATFORM_HUB_IDENTITY_PREPARED`, `PLATFORM_HUB_IMAGE_PREPARED`, `PLATFORM_HUB_SERVICE_PREPARED`, `PLATFORM_HUB_STARTUP_COMPENSATED`. Windows: `PLATFORM_HUB_LAYER_PREPARED`. Antes/depois usam hashes, autoria OS observada, correlação e fontes/digests; conteúdo HTTP, logs e credenciais dos destinos ficam fora do ledger. Comandos diários reutilizam o catálogo/recorder e os journals existentes.

Retentativa não recria um container confirmado. Startup com falha tenta parar apenas uma nova partida, preservando processos anteriores e configuração; compensação confirmada registra `FAILED/COMPLETED`, incerteza ou perda de processo anteriormente ativo conserva `UNKNOWN/OBSERVED`. Não remove o volume para forçar reparo. Journals de manutenção pendente impedem preparação concorrente. Recursos com nome coincidente não são adotados sem identidade e intenção/recibo próprios.

Mudança de porta/configuração/versão exige migração própria; esta fase não sobrescreve um recurso já publicado. O hash da observabilidade foi limitado às suas fontes originais, preservando a identidade anterior ao adicionar arquivos do hub. O hash global do recorder continua incluindo todos os blueprints. Teste de compatibilidade conserva o digest anterior da política de observabilidade. Não há limpeza pública, backup ou migração de dados nesta entrega.

## Versão e evidência

Imagem oficial Homepage **2.7.0**, fixada por manifest/config digests Linux AMD64 e ARM64 no [manifesto](internal/provision/middleware-images.json). Windows usa Linux AMD64 no WSL; Mac usa containers ARM64 na VM; GB10 usa Linux ARM64. Consultas aos registros obtiveram apenas metadados públicos, sem camadas. Artefatos são obtidos na preparação; operação diária usa containers existentes, sem pull.

A [LICENSE do tag](https://github.com/gethomepage/homepage/blob/v2.7.0/LICENSE) contém GPL v3. O [Dockerfile do mesmo tag](https://github.com/gethomepage/homepage/blob/v2.7.0/Dockerfile) anuncia Apache-2.0 no rótulo OCI; a divergência foi registrada e o manifesto local identifica GPL-3.0 pela fonte do projeto. Não se infere licença permissiva pelo rótulo da imagem.

**95 cenários Windows passaram**, incluindo encadeamento, preflight sem efeitos de host em recibo incompatível, falha com fundação preservada, projeção segura e operação do hub. `go vet` e compilação do código/testes passaram. A execução dos novos testes Go e da regressão integral foi bloqueada pelo Application Control; não houve alteração ou contorno de política. Testes incluem os três perfis, plano sem escrita, retentativa, compensação confirmada/incerta, drift, ambiente/comando divergentes, recibo/ID e manutenção pendente; inclusão no código não significa execução aprovada.

A CI Docker AMD64/ARM64 foi ampliada para startup real, verificação HTTP dos links e remoção confirmada de recursos descartáveis próprios (`PLATFORM_HUB_ISOLATED_TEST_REMOVED`). Não foi executada remotamente nesta entrega. Nenhum serviço humano foi instalado/iniciado ou publicado; navegador, hardware e execução integral no WSL continuam pendentes. Referências primárias adicionais: [instalação](https://github.com/gethomepage/homepage/blob/v2.7.0/docs/installation/docker.md), [entrypoint](https://github.com/gethomepage/homepage/blob/v2.7.0/docker-entrypoint.sh), [logger stdout](https://github.com/gethomepage/homepage/blob/v2.7.0/src/utils/logger.js) e [configuração nativa](https://github.com/gethomepage/homepage/blob/v2.7.0/docs/configs/settings.md).
