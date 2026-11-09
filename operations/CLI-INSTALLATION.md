# Entrega e recuperação da CLI — F1b

A entrega F1b encadeia WSL2/base Linux e CLI com `-Through Base`. O padrão continua por [S.O./runtime](HOST-RUNTIME.md), [redes](NETWORK.md) e [identidade/cofre/borda locais F2b](ACCESS.md). `-Through Host`, `Runtime` e `Network` limitam às respectivas fases; `-HostOnly` limita a F1a. `installation_ready=false`: publicação, ferramentas, modelos e aplicações continuam pendentes.

## Pacote e execução

O instalador procura `.cache/platform-packages/platform-linux-amd64.tar.gz` e `platform-linux-amd64.sha256`, ou recebe arquivo/hash explícitos:

```powershell
.\install.ps1 -Action Plan
.\install.ps1 -Action Install
# Pacote em outro diretório:
.\install.ps1 -Action Install -CliPackage 'C:\pacotes\platform-linux-amd64.tar.gz' -CliPackageSha256 '<SHA256 do pacote aprovado>'
```

`Install` é executado pelo usuário, como administrador e na mesma conta Windows. O pacote/hash vem da CI ou do build abaixo; Go não é instalado no equipamento de operação. Ausência/hash inválido impede a preparação do host. `Plan` mostra `cli_package_verified`/`cli_package_issue`, sem baixar, compilar ou inicializar distros. SHA-256 confere integridade em relação ao valor esperado, sem substituir a aprovação da origem ou uma assinatura independente.

Após sucesso (`cli_ready=true`), pela mesma conta Windows, sem elevação:

```powershell
.\platform.ps1 validate
.\platform.ps1 inventory --format json
.\platform.ps1 plan --stack sdlc
```

[platform.ps1](../platform.ps1) confere proprietário e registro WSL e executa a CLI como o usuário Linux configurado, preservando saída e exit code. Dentro da distro, usar `sh /opt/ai-platform/core/platform.sh ...`. A entrada instalada vincula raiz, instalação e perfil; `validate`, `inventory`, `plan` e [publication](PUBLICATION.md) são somente de leitura e não persistem ocorrências administrativas. `cli_ready` não significa ambiente completo, APIs/Portal disponíveis ou publicação pela internet.

## Preparação, ativação e falha

O [módulo portátil](bootstrap/core-release.sh) roda sob o lock/auditoria do coordenador Windows. Não é um instalador público autônomo. Ele copia o pacote para uma área própria, confere hash e layout antes da extração, recusando nomes repetidos, arquivos extras, links, dispositivos e caminhos fora do conjunto permitido. Confere ELF/Mach-O e a arquitetura correspondente ao perfil. O pacote só fornece binário, launcher, catálogos, perfis e configuração de referência.

A configuração selecionada em `-Configuration` é copiada para a candidata e conferida por hash; o arquivo de entrada permanece intacto. A CLI valida o contrato completo e a identidade esperada por `--installation-id`. Um pacote antigo sem esse contrato é recusado. A candidata só vira release após essa validação.

Releases em `/opt/ai-platform/core/releases/<digest>` identificam pacote, configuração, instalação e perfil conjuntamente. `current` é um pequeno arquivo de seleção: sua substituição usa rename no mesmo filesystem. A entrada estável consulta esse arquivo e executa o binário da release. Não depende do checkout Windows para consultas diárias.

Ativação compara a seleção anterior antes da troca e verifica a entrada instalada depois. Falha preserva a release anterior ou faz compare-and-restore, inclusive retorno à ausência de release em primeira instalação. Restauração confirmada mantém FAILED/COMPLETED; sem confirmação, UNKNOWN/OBSERVED. Resposta perdida é reconciliada por observação, sem repetir a ativação automaticamente. Repetir a mesma entrega verifica e reutiliza a candidata. Alterar a configuração gera outra release, com código/configuração revertidos em conjunto se necessário.

Releases anteriores são preservadas para recuperação; não são backups de dados do LAB/SDLC. Candidatas interrompidas podem deixar diretórios temporários, sem serem adotadas como prontas ou removidas por limpeza global. Corrupção de release é recusada. Reparo, coleta de versões antigas e desinstalação permanecem pendentes.

As ações `PLATFORM_CLI_PREPARED`, `PLATFORM_CLI_ACTIVATED` e `PLATFORM_CLI_ACTIVATION_RESTORED` estão no [catálogo operacional](bootstrap/actions.psd1) e usam o recorder de host existente, fora da distro. Comparam digests e registram fontes/perfil/configuração/pacote, resultado, autoria e correlação. Detalhes de falha ficam nos diagnósticos privados, sem conteúdo bruto na projeção compartilhada.

## Build e evidência

Para desenvolvedores com Go, no shell do ambiente de build, a partir da raiz:

```sh
cd operations
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o ../.cache/platform/linux-amd64/platform ./cmd/platform
cd ..
sh operations/scripts/package-cli.sh linux-amd64 .cache/platform/linux-amd64/platform .cache/platform-packages
```

O [empacotador](scripts/package-cli.sh) recebe um binário já compilado e produz TAR/USTAR e checksum; não provisiona host nem baixa dependências. A CI usa o mesmo fluxo para `linux-amd64`, `linux-arm64` e `darwin-arm64`. O pacote contém somente fontes declarativas públicas e binário, sem controles privados, ledger ou dados de aplicações. Download e aprovação da distribuição ainda dependem do canal de entrega do projeto.

Os 28 cenários PowerShell F1a/F1b foram preservados e ampliados para 36 com F1c/F1d. Suíte Go e `go vet` passaram. O teste de releases exercita filesystem real descartável, com backend/CPU simulados em Git Bash: pacote, extração, configuração, idempotência, ativação, restauração, corrupção e recusa de arquivos. CI com Go nativo em Linux/macOS configurada, sem execução remota comprovada. Mac/GB10 agora têm entrada shell, adaptadores e recorder nativo de preparação; não têm ainda o coordenador de releases estáveis equivalente ao Windows. Qualificação física/WSL/GPU permanece pendente.
