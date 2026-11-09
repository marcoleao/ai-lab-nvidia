# Plataforma local de IA e engenharia de software

[Validação da fundação](docs/VALIDACAO_DA_FUNDACAO.md): entrada única para checks estáticos, testes Windows e execução nativa Linux/macOS. **Os nove jobs da fundação passaram na [CI real](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42647394054)**; três pacotes foram publicados como artefatos após o gate dos seis relatórios. Fontes no branch `codex/platform-validation-2026-11-09`. Go é dependência de build; a operação usa o pacote pronto. No Windows, a CLI executa no WSL2, sem binário Windows próprio.

[Hub local Homepage F8a](operations/HUB.md): preparação explícita `--phase hub` ou `-Through Hub`, com links nativos para identidade, cofre e Grafana. Instalação/manutenção com auditoria, separada do Portal SDLC, sem credenciais ou socket Docker. A CI valida os serviços e os links por HTTP em Docker AMD64/ARM64; confira a [evidência atual](docs/VALIDACAO_DA_FUNDACAO.md). Navegação humana, equipamentos, SSO e publicação continuam pendentes.

[Diagnóstico dos sinais F4b](operations/OBSERVABILITY-DIAGNOSTICS.md): `doctor --component telemetry` verifica cinco sondas HTTP e a métrica JVM, com fontes ausentes/atrasadas explícitas e prontidão separada dos backends. Em 09/11/2026, suíte Go integral/vet e 88 cenários Windows passaram, sem mudar Application Control. Serviços reais e equipamentos continuam a qualificar.

[Observabilidade local F3a/F4a](operations/OBSERVABILITY.md): fase explícita para Grafana, Prometheus, Loki e Collector, com dashboard nativo, fontes e alertas versionados. `install.sh install --phase observability` ou `install.ps1 -Action Install -Through Observability`. Só Grafana publica porta de loopback; coleta inicial cobre HTTP local/JVM da identidade, com demais fontes e pipeline de logs ainda pendentes. Código/testes não equivalem a serviços implantados ou qualificados nos equipamentos.

[Recuperação do runtime](operations/RUNTIME-LIFECYCLE.md): `start|stop|restart --component container-runtime` administra o Docker próprio Linux/WSL ou a instância Colima própria existente no Mac, com auditoria e retomada. Preserva engines externos e impede parada com workloads ativos/inventário incompleto. O modo padrão mantém os serviços preparados. A suíte Go integral passou em 09/11/2026, sem mudar a política Windows; qualificação de engine/VM real e CI permanecem pendentes.

[Operação e diagnóstico da fundação](operations/OPERATIONS.md): `status`, `doctor`, `start`, `stop`, `restart` e captura privada `logs` para os cinco serviços provisionados, comuns aos três perfis. Manutenção com auditoria, propriedade, correlação e retomada; consultas Windows preservam WSL desligado. A entrega inicial teve suíte Go/vet e 75 cenários Windows; serviços reais/equipamentos ainda a qualificar. Não instala as demais ferramentas ou publica na internet.

[Preparação dos adaptadores de ingresso F2c2b](operations/INGRESS.md): configurações privadas/revisadas para entrada direta e túnel, com identidade própria para mTLS, sem ativar exposição externa. A etapa é explícita; ausência de domínio conserva a instalação local. Suíte Go integral, 60 cenários Windows e validação estática; integração Caddy real permanece a executar na CI. Ativação pública e reconciliação das aplicações continuam pendentes.

[Origem TLS F2c2a](operations/ORIGIN-TLS.md): executor comum para entrada direta/túnel, com mTLS no loopback, rotação por revisão e compensação. Incluído em `all`/`-Through Origin` (padrão Windows), ainda sem encaminhar aplicações ou publicar na internet. Suítes isoladas, sondas TLS reais efêmeras e 53 cenários Windows; Caddy real e equipamentos ainda a qualificar.

| Diretório | Responsabilidade |
| --- | --- |
| [lab/](lab/README.md) | Setup existente: WSL, Docker, GPU, Ollama e serviços do laboratório |
| [sdlc/](sdlc/README.md) | Setup do SDLC agêntico integrado ao laboratório |
| [sdlc_demo/](sdlc_demo/README.md) | Demonstração estática e offline do Portal SDLC, com dados fictícios e promoções locais de exemplo |
| [vscode/](vscode/README.md) | Extensão de chat e instalação independente no VS Code |

Os setups têm configuração, estado e ciclos de vida próprios dentro deste repositório.

O escopo de evolução está na [fundação da plataforma](docs/FUNDACAO_DA_PLATAFORMA.md): arquitetura-alvo, infraestrutura, ferramentas, governança de IA, observabilidade, dashboards e aplicações, com o Portal SDLC como primeira aplicação. O backlog define critérios de prontidão; a proposta ainda não altera os caminhos de instalação abaixo. Backup e roteiro de demonstração ficam para etapas posteriores.

A primeira entrega implementa a [CLI comum com entrada shell e núcleo Go](operations/README.md), com `validate`, `inventory` e `plan`, [configuração da instalação](environments/platform.json) e perfis Windows Precision, macOS M3 Max e Dell GB10. O comando comum é `bash ./platform.sh ...`: Windows via Linux no WSL2, Mac nativo e GB10 Linux, sem executável Windows próprio ou certificado de code signing. Os comandos são somente de leitura e usam um binário preparado, sem exigir Go para operar. Os instaladores abaixo continuam sendo a implementação legada.

O novo instalador inclui WSL/base, CLI, S.O./GPU, runtime, [redes privadas](operations/NETWORK.md) e [identidade/cofre/borda locais F2b](operations/ACCESS.md), com Keycloak, PostgreSQL, OpenBao e Caddy. Windows: `./install.ps1` planeja e `./install.ps1 -Action Install` executa; Mac/GB10: `sh ./install.sh plan|install` no pacote nativo. Há testes isolados, 46 cenários Windows e pacotes dos três destinos. Qualificação física/SSO, publicação, ferramentas e aplicações continuam pendentes. Consultas F0 permanecem somente de leitura; `installation_ready=false`.

Consulte [Acessos e URLs](<Acessos e URLs.md>) para abrir os serviços locais e obter as credenciais de acesso.

[Diagnóstico de publicação F2c1](operations/PUBLICATION.md): `sh ./platform.sh publication` informa URLs candidatas, DNS/TLS, exclusões privadas e impacto de migração de domínio/issuer, sem depender de domínio existente e sem executar publicação. Adaptadores de ingresso/TLS, migração e qualificação externa permanecem pendentes.

Execute os bootstraps em **PowerShell como administrador, na mesma conta Windows da instalação**. Sem elevação, eles interrompem com orientação ao usuário. O `lab prepare` instala driver NVIDIA ausente via Windows Update; preserva drivers existentes. Veja [privilégios e driver](lab/docs/windows-prerequisites.md).

Para remover a instalação e executar um teste do zero, consulte o [roteiro de limpeza e recriação](cleanup-environment.md). `.\cleanup-environment.ps1` mostra somente o plano; a remoção exige `.\cleanup-environment.ps1 -Action Clean` e confirmação.

```powershell
# Preparação com internet: laboratório e SDLC, incluindo GitLab/Runner
.\lab\bootstrap.ps1 prepare all
.\sdlc\bootstrap.ps1 prepare
# Operação local, sem downloads
.\lab\bootstrap.ps1 up all
.\sdlc\bootstrap.ps1 up
# Extensão do VS Code, instalada separadamente
.\vscode\bootstrap.ps1 install
```

## Laboratório

Execute os comandos a partir de `lab/`:

```powershell
cd lab
.\ai.cmd status
# Iniciar componentes previamente preparados:
.\bootstrap.ps1 up
```

Configuração, secrets, cache e estado do laboratório ficam em `lab/`. A reorganização não reinstala serviços nem altera a distro existente. Consulte o [manual](lab/README.md).

## SDLC e projetos

O pacote de instalação do SDLC está em `sdlc/`, com [roteiro de instalação e aceitação](sdlc/docs/aceitacao-do-ambiente.md). As aplicações produzidas pelo SDLC e seu histórico ficam exclusivamente no GitLab local do ambiente SDLC. Checkouts, builds e artefatos ficam nos diretórios e volumes desse ambiente, fora deste repositório. A pasta [sdlc_demo/](sdlc_demo/README.md) contém uma demonstração independente da interface do portal: abra seu [index.html](sdlc_demo/index.html) diretamente no navegador, sem iniciar serviços. Os demais diretórios mantêm as ferramentas, configurações e modelos de referência para operar o laboratório, o SDLC e a extensão.

## Validação

```powershell
.\lab\tests\validate.ps1
```

O workflow da raiz valida o laboratório em Windows e Linux. Licença e configurações do Git aplicam-se ao repositório inteiro.

Consulte a [revisão de criação e operação offline](sdlc/docs/revisao-criacao-offline-2026-10-19.md), com correções, evidências e limites do teste em ambiente limpo.
