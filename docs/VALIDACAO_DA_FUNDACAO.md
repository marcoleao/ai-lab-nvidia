# Validação da fundação e liberação dos pacotes

Implementação de 09/11/2026. Go permanece no núcleo operacional; os testes desse núcleo executam nativamente em Linux AMD64, Linux ARM64 e macOS ARM64. No Windows, validam-se os bootstraps PowerShell e os provedores isolados. Compilar testes para outra plataforma não equivale a executá-los.

## Comandos de desenvolvimento

Em Linux ou macOS, com Go na versão de `operations/go.mod` e Python 3.12 ou superior:

```sh
sh operations/validate.sh --mode unit
```

O comando cria uma cópia temporária somente das fontes da fundação, executa Go tests/vet, valida a CLI, testa instalação/retentativa/rollback da release em diretório descartável e os contratos auxiliares. No WSL, fontes e executáveis de teste ficam em filesystem Linux, evitando depender das permissões de `/mnt/c`. Não instala pacotes, cria distro, inicia runtime, acessa Docker ou atualiza políticas do host.

No Windows:

```powershell
# Análise e compilação dos três destinos; resultado STATIC_ONLY:
.\validate-platform.ps1 -Mode Static
# Testes isolados dos bootstraps/provedores Windows:
.\validate-platform.ps1 -Mode Windows
# Testes nativos em uma distribuição Linux já preparada e em execução:
.\validate-platform.ps1 -Mode Native -WslDistribution '<distro-de-desenvolvimento>'
```

`Native` sem distribuição Linux retorna `DEFERRED/WAITING`, código 42, `PLATFORM_NATIVE_VALIDATION_REQUIRED`, antes de resolver/executar Go. Git Bash também é recusado como executor do núcleo. O wrapper só aceita uma distro já em execução, selecionada explicitamente; não instala/inicia WSL ou altera o Application Control. A preparação de um ambiente de desenvolvimento WSL continua sendo uma ação separada do instalador; esta entrega não a executou nesta máquina.

Os relatórios ficam em `.cache/platform-validation/`, com tentativa/correlação, autoria OS observada, fase/resultado, checks, versão de fonte e escopo. `STATIC_ONLY`, `NOT_EXECUTED` e `DEFERRED` não autorizam liberação. Código 0 da análise estática significa somente que as verificações anunciadas passaram. A versão do Go é conferida, `GOTOOLCHAIN=local`, telemetria desativada e `CGO_ENABLED=0`; o modo unit desabilita as integrações Docker mesmo que o ambiente do chamador as tenha habilitado.

## CI obrigatória

| Verificação | Ambiente | Evidência exigida |
| --- | --- | --- |
| Unitários/CLI/release instalada | Linux AMD64 | `NATIVE_UNIT_PASSED` |
| Unitários/CLI/release instalada | Linux ARM64 | `NATIVE_UNIT_PASSED` |
| Unitários/CLI/release instalada | macOS ARM64 | `NATIVE_UNIT_PASSED` |
| Bootstrap/provedores Windows | Windows AMD64 | `WINDOWS_BOOTSTRAP_PASSED` |
| Redes, acesso, observabilidade, Homepage e limpeza reais | Linux AMD64 descartável | `DISPOSABLE_DOCKER_PASSED` |
| Mesmo recorte Docker | Linux ARM64 descartável | `DISPOSABLE_DOCKER_PASSED` |

O workflow [validate.yaml](../.github/workflows/validate.yaml) separa os jobs nativos dos bootstraps Windows. Integrações requerem a opção `--disposable` e execução declarada no GitHub Actions. Executam somente os testes reais opt-in, com nomes obrigatórios e os recorders/limpeza próprios já implementados. Não são testes de driver, GPU física, Colima real, boot do equipamento ou instalação de host completa.

`go test -json` fornece evidência de execução: testes obrigatórios ausentes ou ignorados não contam como aprovados, mesmo com exit code 0. As fontes são copiadas com finais de linha normalizados, identificadas por hash e conferidas antes/depois; `.git`, caches, pesos, dados de aplicação e controles privados não fazem parte da cópia. Relatórios não incluem o conteúdo bruto de diagnósticos, prompts ou logs de produtos. Os testes podem imprimir detalhes de suas próprias fixtures isoladas nos logs da CI.

## Liberação

O job `platform-cli-build` depende do sucesso dos três conjuntos: nativos, Windows e integrações. Antes do build/publicação, [release-gate.py](../operations/scripts/release-gate.py) exige exatamente seis relatórios aprovados, com checks completos e vínculo ao mesmo commit, run e digest das fontes atuais. Recibos antigos, ausentes, parciais, estáticos, bloqueados ou de outra arquitetura/fonte são recusados. Não há `continue-on-error` no caminho de liberação.

Somente depois são publicados os três TARs/checksums e `validation.json`, com os hashes dos relatórios de suporte. O layout operacional dos TARs continua fechado em 11 arquivos; o recibo é externo ao TAR. Artefatos de diagnóstico de tentativas falhas são publicados separadamente, sem serem pacotes liberados. O empacotador local ainda pode gerar candidatos para desenvolvimento; arquivo/hash local isolados não constituem aprovação da CI ou qualificação do hardware.

O catálogo [validation-catalog.json](../operations/validation-catalog.json) diferencia análise, execução nativa, bootstrap Windows, integração descartável e publicação de artefatos. Os relatórios são evidência de desenvolvimento/CI, com comparação de fonte e retentativa por nova tentativa; não criam eventos de domínio ou `HistoryEvent`. As mutações reais de provisionamento dentro das integrações reutilizam os recorders administrativos compartilhados e seu catálogo, fora dos dados alterados. Não se declara uma nova trilha de auditoria dos serviços humanos.

## Situação desta entrega

Foram validados localmente os contratos Python do executor/gate, a recusa de execução Go nativa no Windows, a análise/compilação dos três destinos e os testes Windows isolados. A máquina não possui distribuição WSL instalada. Nenhuma instalação, importação ou inicialização foi feita para executar os testes.

A publicação foi autorizada pelo usuário e realizada no branch `codex/platform-validation-2026-11-09`. A primeira [execução real](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42635748352) identificou diferenças de quebras de linha, caminho temporário no macOS e descoberta de módulos Windows. Os pacotes continuam bloqueados até a aprovação dos seis relatórios; publicar as fontes não equivale a qualificar a instalação.

Os blueprints usam LF para calcular sua identidade, independentemente do checkout. A política de observabilidade conserva o digest das fontes originais com LF ao acrescentar o hub. Instalações antigas cujo hash tenha sido calculado com arquivos CRLF ou mistos exigem migração explícita; esta correção não adota nem sobrescreve recursos existentes.
