# Operação da plataforma

**Escopo ativo: Precision Windows/WSL2.** macOS M3 Max e Dell GB10 ficam no backlog. O [guia Precision](../docs/PRECISION.md) é a entrada de instalação e aceite. A distribuição ZIP inclui bootstrap Windows, CLI Linux AMD64 e três provas vinculadas; o padrão Windows é agora `-Through Hub`, incluindo observabilidade e Homepage. O código compartilhado/perfis restantes são preservados. A evidência histórica e os gates atuais estão na [validação da fundação](../docs/VALIDACAO_DA_FUNDACAO.md); instalação física e plataforma completa ainda não estão qualificadas. As notas de evolução abaixo preservam o recorte de cada fase.

[Hub Homepage F8a](HUB.md): instalação e manutenção do ponto de entrada visual nativo, com links locais da fundação e ciclo separado do Portal SDLC. Fase `hub`/`-Through Hub`, incluída no padrão Windows `Hub`. Os testes Go executaram e passaram na CI Linux; os seis jobs Precision do run 42660370192 passaram, incluindo bootstrap e ZIP real em Windows. Qualificação física permanece pendente. Consulte a evidência atual no guia de validação; as notas de fases abaixo registram o histórico anterior.

[Diagnóstico dos sinais F4b](OBSERVABILITY-DIAGNOSTICS.md): seis fontes HTTP/JVM explícitas no `doctor`, idade por timestamp da amostra e distinção entre backends disponíveis e sinais degradados. `doctor --component telemetry` verifica essa cobertura. Suíte Go integral/vet e 88 cenários Windows passaram em 09/11/2026, resolvendo a pendência anterior sem alteração de política. CI remota e equipamentos permanecem pendentes.

[Núcleo de observabilidade F3a/F4a](OBSERVABILITY.md): preparação e operação de Grafana, Prometheus, Loki e Collector; blueprints de instalação separados de coleta/dashboard. Fase explícita `observability`/`-Through Observability`, sem alterar o padrão `all`/`Origin`. Quatro serviços opcionais integram a manutenção diária quando preparados. Coleta HTTP/JVM inicial, backend de logs sem ingestão, SSO/publicação e qualificação pendentes. A suíte integral voltou a executar na F4b; CI com produtos reais configurada, sem execução remota comprovada.

[Ciclo de vida do runtime](RUNTIME-LIFECYCLE.md): escopo explícito `--component container-runtime` para start/stop/restart do engine próprio Linux/WSL e VM Colima própria existente. Sem controle do engine externo; parada exige inventário completo e ausência de workloads ativos. `status`/`doctor` acrescentam metadados do controlador/API. A regressão Go do runtime passou nesta continuação, após normalização de uma fixture. Qualificação real e CI permanecem pendentes; a evidência atual está em [OBSERVABILITY.md](OBSERVABILITY.md).

[Operação diária da fundação](OPERATIONS.md): comandos `status`, `doctor`, `start`, `stop`, `restart` e `logs`, com escopo padrão nos cinco serviços existentes. Consulta observa runtime; manutenção usa IDs/propriedade, journal, recibos idempotentes e recorder externo. Logs são exportados privadamente com limites, sem conteúdo no terminal/ledger. No Windows, `platform.ps1` transporta essas ações como administrador e só `start`/`restart` podem iniciar a distro própria parada. Outras camadas e qualificação física continuam pendentes.

[Adaptadores de ingresso F2c2b](INGRESS.md): fase explícita `--phase ingress` ou `-Through Ingress` materializa configurações privadas dos caminhos direto/túnel, sem ativação. Usa identidades mTLS próprias e revisão imutável; sem domínio/parâmetros adia a etapa sem efeitos. Configuração [de referência](../environments/ingress.example.json), schema compatível com a configuração atual e 60 cenários Windows. O padrão local permanece `Origin`; entrada pública e aplicações continuam pendentes.

[Origem TLS F2c2a](ORIGIN-TLS.md): transporte mTLS local e rotação por revisão, comum aos caminhos direto/túnel. `all` nativo e `-Through Origin` (novo padrão Windows) incluem a origem após F2b. `--phase origin` prepara somente o transporte depois de runtime/redes. Porta 9443, loopback, sem encaminhar aplicações. Ingresso/TLS públicos, migração e qualificação continuam pendentes.

[Publicação e migração F2c1](PUBLICATION.md): `sh ./platform.sh publication --format json` calcula candidatos, requisitos DNS/TLS, rotas e impacto de issuer/callbacks, mesmo sem domínio público. `--previous-config` compara uma configuração anterior. É somente leitura, sem observar ou executar publicação; adaptadores F2c2 permanecem pendentes.

O ponto de entrada comum é [platform.sh](../platform.sh), compatível com Bash e com o subconjunto POSIX de shell. O núcleo de validação/planejamento usa Go e somente a biblioteca padrão. No Windows, executa como Linux AMD64 dentro do WSL2; no Mac, como macOS ARM64 nativo; no GB10, como Linux ARM64. Não depende de certificado de assinatura de código Windows nem de um executável Windows próprio.

Go é necessário para desenvolver/compilar, não para executar o pacote distribuído. Catálogo/configuração são JSON versionado. A lógica permanece em um núcleo único, sem duplicar validação JSON/grafo em Bash. PowerShell pode ser usado na preparação inicial do host Windows; shell e APIs do host atendem aos adaptadores específicos. Os instaladores legados ainda não foram migrados.

O provisionamento do WSL2 e da distro dedicada pertence ao instalador da solução; não é uma preparação manual exigida do usuário. O WSL2 precisa estar operacional quando o launcher de consultas for executado. Git Bash não fornece o kernel Linux e é recusado como ambiente operacional pelo launcher. Chamar um `.exe` Windows pelo WSL ainda o submete às políticas Windows; o backend fornecido para WSL é Linux ELF. Nenhuma política de segurança é desativada por este projeto.

## Instalação e preparação do host

Implementados F1a–F1d (WSL/base, CLI, S.O./GPU, runtime), F2a (redes) e [F2b: Keycloak/PostgreSQL, OpenBao e Caddy locais](ACCESS.md). [install.ps1](../install.ps1) coordena Windows; [install.sh](../install.sh) e Go preparam Mac/GB10. [S.O./runtime](HOST-RUNTIME.md), [redes](NETWORK.md) e [entrega/recuperação da CLI](CLI-INSTALLATION.md). Demais camadas, publicação e qualificação física continuam pendentes.

A entrada de instalação identifica o sistema e prepara seus pré-requisitos antes de chamar o núcleo comum. No Windows, começa por um bootstrap nativo mínimo, usando componentes do sistema, como PowerShell e `wsl.exe`: Bash só passa a ser utilizado depois que o ambiente Linux existir. Não exige Git Bash, Go ou um executável Windows próprio. No Mac e no GB10, começa pelo shell disponível no equipamento e usa o adaptador de host correspondente.

| Etapa no Windows | Responsabilidade do instalador |
| --- | --- |
| Verificar o host | Identificar versão, virtualização, espaço, permissões, WSL existente e compatibilidade das políticas de execução. Apontar impedimentos antes das mudanças que deles dependam. |
| Preparar WSL2 | Instalar/habilitar os componentes necessários quando ausentes. Se houver reinício obrigatório, registrar a etapa e orientar a repetição da mesma entrada após o reinício, na mesma conta Windows. |
| Criar a distro da solução | Usar nome e armazenamento configuráveis vinculados à identidade da instalação; verificar versão e SHA-256 do rootfs antes da importação. Preservar outras distros e a distro padrão do usuário. |
| Preparar Linux e o núcleo comum | Configurar usuário, permissões e dependências; instalar o pacote Linux AMD64 previamente preparado e verificado. Dados e volumes Linux ficam no filesystem da distro. |
| Continuar a instalação | Encadear os módulos habilitados de infraestrutura, ferramentas, observabilidade, IA, runtime agêntico e aplicações conforme suas dependências. Portal SDLC é a primeira aplicação. Cada módulo tem sua própria etapa e verificação. |

O usuário inicia o instalador e atende às solicitações de elevação/reinício quando necessárias; o instalador executa a preparação. Desenvolvimento e testes do instalador não autorizam provisionar esta máquina por comandos avulsos durante a implementação.

Nome coincidente não comprova propriedade: uma distro existente sem identificação correspondente deve impedir a adoção automática. Repetições retomam etapas verificadas, sem recriar recursos saudáveis. Falhas registram fase, efeito confirmado ou incerto e instrução de retomada. Ações com efeitos seguem o [contrato de auditoria transversal](../sdlc/docs/implementacao-auditoria-2026-10-24.md), com trilha administrativa fora da distro que pode ser alterada/removida. Limpeza não é uma consequência implícita da instalação.

Políticas Windows continuam valendo para o bootstrap e para o WSL. Se impedirem a instalação, o diagnóstico deve identificar a restrição; o instalador não desativa Application Control nem promete executar sob qualquer política corporativa. Drivers existentes são preservados; preparação de driver ausente pertence ao adaptador do host, sem instalar driver NVIDIA Linux dentro do WSL.

F1 exige testes isolados de host sem WSL, WSL sem distro da solução, instalação existente, conflito de propriedade, falha de download/hash, reinício e retentativa. A qualificação no equipamento precisa comprovar a instalação desde os pré-requisitos, sem sequência manual de preparação do WSL. A execução diária continua separada da instalação, sem downloads ou provisionamento implícitos.

Referências de suporte ao desenho: [instalação do WSL](https://learn.microsoft.com/en-us/windows/wsl/install) e [importação de distro própria](https://learn.microsoft.com/en-us/windows/wsl/use-custom-distro).

### Usar o bootstrap Windows F1a

O padrão Windows inclui F1/F2a/F2b/F2c2a, observabilidade e Homepage, com pacote verificado (`-Through Hub`). `-Through Base`, `Host`, `Runtime`, `Network` e `Access` limitam a execução; `-Through Origin` termina em mTLS local; `-Through Observability` termina antes do hub. `-HostOnly` limita à base Linux descrita nesta seção.

Na pasta extraída do ZIP (ou checkout de desenvolvimento), o comando padrão apenas consulta o host e mostra o escopo, sem downloads, gravação de estado ou inicialização de distros:

```powershell
.\install.ps1
# Equivalente a:
.\install.ps1 -Action Plan
```

Para executar a preparação, o usuário inicia o comando abaixo em PowerShell como administrador, **na mesma conta Windows que usará a instalação**:

```powershell
.\install.ps1 -Action Install
# Somente WSL/base Linux:
.\install.ps1 -Action Install -HostOnly
```

Esta entrada não exige WSL/Bash/Go prévios. Ela verifica Windows 11 x64, virtualização, espaço e linguagem PowerShell suportada; prepara/atualiza WSL quando necessário; verifica o rootfs por SHA-256; importa a distro própria; configura um usuário Linux sem privilégios adicionais e habilita systemd. Reinicia somente essa distro quando necessário. Não altera a distro padrão, `.wslconfig`, políticas Windows, outras distros ou dados do LAB/SDLC. A instalação do componente compartilhado WSL permanece preservada em caso de falha; não há rollback que o desinstale ou apague distros automaticamente.

Saída `DEFERRED/WAITING`, código **3010**, pede reinício do Windows e repetição do mesmo comando/conta. Antes desse reinício, repetir o comando não reinstala WSL. A próxima execução verifica os recursos existentes; checkpoints não substituem a observação. Cada tentativa tem correlação própria e conserva as tentativas anteriores.

A identidade vem de [platform.json](../environments/platform.json), com perfil `precision-windows`. [windows.psd1](../environments/windows.psd1) configura nome da distro, usuário, raízes de armazenamento/controle, mínimo de disco e rootfs fixado. As raízes recebem um subdiretório com o ID da instalação. Controle e ledger ficam fora da distro, com ACL limitada à conta, SYSTEM e administradores. Não alterar nome, raiz, usuário ou hash de uma instalação existente para tentar adotá-la como nova; divergências são recusadas. O bootstrap lê identidade/perfil; a validação integral dos demais contratos JSON continua na CLI Go.

`linux_base_ready=true` confirma apenas WSL/Linux; `cli_ready` identifica a entrega F1b. F1c/F1d acrescentam `host_prerequisites_ready` e `container_runtime_ready`, conforme [escopo e limites](HOST-RUNTIME.md). **`installation_ready` e `gpu_container_qualified` permanecem `false`**. O rootfs reproduz a base do legado, com [hash oficial Canonical](https://cloud-images.ubuntu.com/wsl/releases/24.04/20240423/SHA256SUMS); a imagem de 2024 não é declarada atualizada. A fase host aplica pré-requisitos e atualizações confiáveis de segurança do userland; kernel/firmware e S.O. Windows continuam gerenciados externamente. Qualificação física/publicação permanecem pendentes.

O [catálogo do bootstrap](bootstrap/actions.psd1) identifica plano, transporte de consultas e ações administrativas de host/CLI. O [recorder de host](audit/WindowsRecorder.psm1) registra pedido antes dos efeitos, autoria de processo observada, correlação, hashes das fontes/perfil/pacote/configuração, comparação selecionada e conclusão/incerteza. O ledger é local, com encadeamento de hashes; não oferece WORM, assinatura independente nem detecção de remoção de um sufixo válido por administrador. Não importa código interno do SDLC nem grava `HistoryEvent`.

Em falhas dos provedores, `diagnostic-<operation_id>-<ação>.json` guarda detalhes privados na raiz de controle, sob a mesma ACL, separados de `admin.jsonl`. A correlação identifica a tentativa; saída bruta não vai ao resumo ou à projeção de auditoria. Se os arquivos de controle/ledger estiverem indisponíveis ou inválidos, o instalador não os apaga para tentar continuar.

Testes locais usam diretórios descartáveis e provedores simulados: nenhuma instalação WSL, distro, atualização ou serviço real executado. Fluxo integral e políticas precisam de qualificação física. Mac/GB10 têm preparação nativa implementada via `install.sh`; seus testes isolados não comprovam instalação real. A CLI comum F0 mantém os três destinos.

## Escopo implementado

| Comando | Contrato |
| --- | --- |
| `platform validate` | Valida configuração, catálogo e perfil selecionado. Configuração válida não significa instalação pronta. |
| `platform inventory` | Retorna o catálogo declarado completo, com contagem e adoção das fontes; não consulta processos ou serviços instalados. |
| `platform plan` | Calcula a ordem das dependências selecionadas. É um plano de trabalho para implementação/qualificação; não executa provisionamento. |
| `platform status` / `platform doctor` | Observação real da fundação existente, sem provisionar. Doctor acrescenta APIs/TLS/ledger e retorna 2 quando não saudável. |
| `platform start` / `stop` / `restart` | Mantém os containers próprios registrados; com `--component container-runtime`, mantém explicitamente o engine/VM próprio existente. Retomada e compensação dos flags de execução. |
| `platform logs --component <id>` | Captura limitada em arquivo privado; retorna somente metadados seguros. |
| `platform setup --action plan` | Plano nativo de preparação host/runtime; não grava controles, baixa ou executa processos. |
| `platform setup --action install` | Preparação administrativa explícita F1c/F1d, com propriedade, lock e ledger externo aos dados. No Windows é coordenada por `install.ps1`. |
| `platform setup --action install --phase network` | F2a: redes próprias, provas de DNS/isolamento/rota e limpeza de sondas; exige runtime preparado. |
| `platform setup --action install --phase access` | F2b: identidade, cofre e borda local; exige infraestrutura e mantém publicação/SSO completo não qualificados. |
| `platform setup --action install --phase infrastructure` | Host/runtime/redes, sem os provedores de acesso. `all` inclui também F2b. |

O núcleo `internal/platform` das consultas F0 não inicia processos, acessa rede ou escreve estado. Preparação e operação ficam separadas em `internal/provision`, selecionadas explicitamente por `setup` ou pelos seis comandos de runtime, e não ampliam os efeitos de `validate`/`inventory`/`plan`/`publication`. Demais camadas, qualificação real do engine/VM, observação integral e limpeza continuam pendentes. Nenhuma entrada gera backup nesta etapa.

O [catálogo de comandos](command-catalog.json) define ação, efeito e inaplicabilidade de comparação/rollback. Resultados têm fase, desfecho, decisão inaplicável, autoria não verificada e correlação. A saída não é persistida como auditoria nem constitui recibo administrativo/evento de negócio. Ações futuras com efeitos exigirão recorder compartilhado, catálogo e testes próprios. O ledger Linux existente não é importado pelo núcleo portátil.

## Compilar e executar

Toolchain fixada em [go.mod](go.mod): Go 1.27.3. Não há dependências de terceiros ou downloads de módulos nesta entrega; obter a toolchain é uma preparação conectada separada.

Para desenvolvimento, a partir da raiz no WSL2, macOS ou Linux com Go instalado:

```sh
cd operations
target="$(go env GOOS)-$(go env GOARCH)"
go build -trimpath -o "../.cache/platform/$target/platform" ./cmd/platform
cd ..
bash ./platform.sh validate
bash ./platform.sh inventory --format json
# Escolher o perfil do equipamento a preparar:
bash ./platform.sh plan --profile precision-windows
bash ./platform.sh plan --profile macos-m3-max
bash ./platform.sh plan --profile dell-gb10
```

Para experimentar as consultas F0 em um ambiente já preparado, extrair o pacote correspondente e executar `bash ./platform.sh ...`, sem instalar Go. Isso ainda não é a instalação completa da solução. O pacote contém launcher, executável, `operations/{catalog,command-catalog}.json` e `environments/`. O launcher só seleciona o binário e preserva argumentos/exit code: não baixa, compila, inicia WSL ou faz configuração implícita. A raiz é localizada pelo núcleo a partir do diretório atual ou do executável; `--root <diretório>` permite seleção explícita e `--config <arquivo>` aceita configuração externa relativa a essa raiz.

| Equipamento | Pacote e ambiente |
| --- | --- |
| Precision Windows x64 | `platform-linux-amd64`, executado dentro do WSL2 |
| Mac M3 Max | `platform-darwin-arm64`, executado no macOS; inferência Metal permanece nativa |
| Dell GB10 | `platform-linux-arm64`, executado no Linux do equipamento |

Para experimentar F0 no Windows preparado, abrir terminal da distro de teste e acessar o checkout antes dos comandos. Para builds/caches e volumes, preferir filesystem Linux do WSL; `/mnt/c` tem diferenças de desempenho/permissões a qualificar. F1a/F1b preparam WSL/CLI, acessível por [platform.ps1](../platform.ps1). F1c/F1d preparam host/runtime; demais camadas continuam pendentes.

## Configuração, perfis e escopo

- [Instalação](../environments/platform.json): identidade estável, perfil/conjunto padrão, publicação e overrides de portas.
- [Catálogo](catalog.json): camadas, componentes, dependências de inicialização, integrações e conjuntos.
- [Perfis](../environments/profiles/): arquitetura, aceleração, runtime, capacidade e qualificação declarada. Metal nativo e containers NVIDIA têm pré-requisitos distintos.
- `--stack foundation` inclui Portal SDLC e as capacidades compartilhadas declaradas. Replay é opcional.
- `--stack sdlc` seleciona as capacidades de desenvolvimento; `--component sdlc` calcula os pré-requisitos mínimos da aplicação. Integrações fora do recorte permanecem explícitas.
- `inventory` sem recorte inclui todos os componentes. `--stack` e `--component` selecionam a respectiva cadeia de dependências e são mutuamente exclusivos. Contagens identificam o recorte; não há truncamento.

Origens retornadas são **desejadas**, não endpoints observados ou publicados. Em modo `local`, as origens públicas ficam ausentes mesmo se houver domínio armazenado para uso futuro. Para planejar a publicação, definir modo `direct` ou `tunnel` e `base_domain`, ou URLs HTTPS por componente em `public_urls`. Isso não configura DNS, TLS, autenticação ou roteamento nesta etapa. A identidade da instalação independe do domínio.

Serviços privados/administrativos e inferência bruta não recebem origem pública. Este contrato usa origens separadas por serviço, sem prefixo de caminho. Credenciais nos JSON, campos desconhecidos e URLs com usuário/senha, query ou fragmento são recusados. Erros não reproduzem valores ou exceções do parser. Portas locais são ajustáveis no mapa `ports`, com validação de conflitos no catálogo.

O plano não inventa orçamento de inferência: a RAM total do Windows fica desconhecida até a observação real. Os 128 GiB declarados para Mac/GB10 não são reserva integral para modelos. Qualificação em arquivo é declarativa; a CLI não a comprova, e o runtime continua `not_observed`.

## Testes e distribuição

```sh
cd operations
go test ./... -count=1
go vet ./...
```

Os testes usam diretórios temporários e cobrem os três perfis, grafo e recortes, portas, domínio, bloqueio da publicação privada, entradas inválidas, erros seguros e retentativa sem escrita.

O bootstrap tem testes próprios, sem executar os provedores reais:

```powershell
.\tests\platform-installer.tests.ps1
```

```sh
sh tests/platform-wsl-config.tests.sh
sh tests/platform-core-release.tests.sh
```

Os 28 cenários Windows F1a/F1b foram ampliados para 36, com driver/reinício, encadeamento nativo, correlação e compensação F1c/F1d. Há suíte separada de driver e seis testes Python do seletor de segurança. Suíte Go dos três perfis e `go vet` passaram. AWK verifica preservação/idempotência; releases usam filesystem descartável e backend/CPU simulados no Git Bash. CI com Go nativo Linux/macOS configurada. Três pacotes compilados/gerados; resultado remoto e qualificação WSL/equipamentos permanecem pendentes. [Evidência e limites detalhados](HOST-RUNTIME.md#evidência-desta-implementação).

F2a amplia o coordenador Windows para 40 cenários e a suíte Go com redes próprias, conflitos, perda de resposta, provas e compensação. O inventário identifica `foundation_preparation` para host/runtime/redes, com `preparation_implemented_not_qualified`; a qualificação continua declarativa e o runtime não é observado por essas consultas. O plano ordena runtime antes das redes de containers e mantém inferência Metal independente da VM. CI de redes com Docker real foi configurada, ainda sem resultado remoto comprovado. [Contrato e evidência F2a](NETWORK.md).

F2b amplia para 46 cenários Windows e acrescenta testes isolados de provedores, bootstrap/retomada, políticas, revogação root, credenciais e compensação. O inventário identifica seis componentes com preparação implementada, sem declarar estado observado. CI opt-in com os quatro serviços reais foi configurada para Linux AMD64/ARM64; execução remota não comprovada. [Contrato, credenciais iniciais, recuperação e limites F2b](ACCESS.md).

A CI ativa exige testes nativos Linux AMD64, bootstrap Windows sem executáveis Go Windows, integração Docker AMD64 e verificação do ZIP real em Windows antes da release Precision. macOS/GB10 ficam no backlog. Testes em runners genéricos não qualificam GPU ou instalação integral no equipamento; consulte a evidência atual no guia de validação.

Na validação local de 06/11/2026, a suíte inicial do núcleo passou; o reteste e o `.exe` gerado foram bloqueados no Windows. O diagnóstico somente de leitura confirmou assinatura `NotSigned`, Smart App Control ativo e eventos 3077 da política `VerifiedAndReputableDesktop`, status `0xc0e90002` (`STATUS_SYSTEM_INTEGRITY_POLICY_VIOLATION`). A política foi preservada. Por decisão do usuário, não haverá contratação de assinatura Windows: a operação Windows passa pelo Linux no WSL2. Testes isolados do launcher verificam os três destinos, argumentos com espaços, exit code, pacote e recusa de Git Bash. Execução integral no WSL2 e nos equipamentos físicos continua pendente; nenhuma distro foi iniciada para este ensaio.

## Decisão de portabilidade

Shell fornece o comando comum nas três plataformas; Go conserva os contratos e a lógica já implementada. O Windows usa ambiente Linux, com suporte oficialmente oferecido pelo WSL2, sem exigir a assinatura pública de nossos binários Windows. O launcher comum evita recursos exclusivos de Bash moderno/GNU; diferenças de ferramentas BSD/Linux e operações privilegiadas ficam nos adaptadores.

Referências: [GOOS/GOARCH](https://go.dev/doc/install/source#environment), [WSL e binários Linux](https://learn.microsoft.com/en-us/windows/wsl/about), [filesystem/interoperabilidade WSL](https://learn.microsoft.com/en-us/windows/wsl/filesystems) e [Smart App Control](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions).
