# Validação da fundação e liberação dos pacotes

Implementação de 09/11/2026. Go permanece no núcleo operacional; a CI ativa da Precision executa os testes desse núcleo em Linux AMD64. Linux ARM64 e macOS ARM64 ficam no backlog, com evidência anterior preservada. No Windows, validam-se bootstraps PowerShell, provedores isolados e distribuição. Compilar testes para outra plataforma não equivale a executá-los.

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
| Bootstrap/provedores Windows | Windows AMD64 | `WINDOWS_BOOTSTRAP_PASSED` |
| Redes, acesso, observabilidade, Homepage e limpeza reais | Linux AMD64 descartável | `DISPOSABLE_DOCKER_PASSED` |

Escopo ativo desde 09/11/2026: Precision Windows/WSL2. Linux ARM64 e macOS ARM64 ficam no backlog; sua evidência anterior é preservada abaixo. Os três relatórios incluem os contratos aplicáveis; testes de distribuição executam também em Windows, sem executar Go no Windows.

O workflow [validate.yaml](../.github/workflows/validate.yaml) separa os jobs nativos dos bootstraps Windows. Integrações requerem a opção `--disposable` e execução declarada no GitHub Actions. Executam somente os testes reais opt-in, com nomes obrigatórios e os recorders/limpeza próprios já implementados. Não são testes de driver, GPU física, Colima real, boot do equipamento ou instalação de host completa.

`go test -json` fornece evidência de execução: testes obrigatórios ausentes ou ignorados não contam como aprovados, mesmo com exit code 0. As fontes são copiadas com finais de linha normalizados, identificadas por hash e conferidas antes/depois; `.git`, caches, pesos, dados de aplicação e controles privados não fazem parte da cópia. Relatórios não incluem o conteúdo bruto de diagnósticos, prompts ou logs de produtos. Os testes podem imprimir detalhes de suas próprias fixtures isoladas nos logs da CI.

## Liberação

O job `platform-cli-build` depende do sucesso dos três conjuntos: nativo Linux AMD64, Windows e integração Docker AMD64. Antes do build, [release-gate.py](../operations/scripts/release-gate.py) exige exatamente esses três relatórios aprovados, com checks completos e vínculo ao mesmo commit, run e digest das fontes atuais. A [política de release](../operations/release-policy.json) fixa perfil/destino/backlog. Recibos antigos, ausentes, parciais, estáticos, bloqueados ou de outra arquitetura/fonte são recusados. Não há `continue-on-error` no caminho de liberação.

Somente depois são preparados TAR/checksum Linux AMD64 e `validation.json`, com os hashes das provas, e o ZIP Precision com instalador, CLI e relatórios. O TAR mantém seus 11 arquivos. `precision-setup-validation` extrai e verifica o ZIP real em Windows, sem provisionar o host: layout fechado, ausência de links/traversal, hashes do código/pacote e vínculo das provas ao mesmo código/run. A publicação exige esse recibo adicional aprovado e ligado ao hash do ZIP.

`precision-release` publica cinco arquivos imutáveis em GitHub Releases, após os gates, somente em push no repositório/branch de entrega fixados no workflow. O token pertence ao job, com permissão de escrita somente nesse job. A publicação começa em draft; perda de resposta retoma os mesmos arquivos já confirmados por digest. Conflito nunca sobrescreve arquivo existente, e release publicada incompleta é recusada. Repetir somente o job de publicação sobre o mesmo candidato pode resultar em `NO_CHANGE`; repetir toda a CI produz novas provas, que podem divergir da release imutável do mesmo commit e serão recusadas. Use outro commit para uma nova distribuição. Candidatos têm retenção de 30 dias; a release publicada é o canal permanente. Relatórios de tentativa ficam na CI. Candidato/hash isolados não constituem aprovação ou qualificação de hardware.

O catálogo [validation-catalog.json](../operations/validation-catalog.json) diferencia análise, execução nativa, bootstrap Windows, integração descartável e publicação de artefatos. Os relatórios são evidência de desenvolvimento/CI, com comparação de fonte e retentativa por nova tentativa; não criam eventos de domínio ou `HistoryEvent`. As mutações reais de provisionamento dentro das integrações reutilizam os recorders administrativos compartilhados e seu catálogo, fora dos dados alterados. Não se declara uma nova trilha de auditoria dos serviços humanos.

## Distribuição Precision corrigida — 09/11/2026

[Run 42686896308](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42686896308), commit `6a65810b36b65c63b03d5cdcbdc538b807658f2a`: seis jobs da distribuição aprovados e [release permanente corrigida](https://github.com/marcoleao/ai-lab-nvidia/releases/tag/precision-6a65810b36b65c63b03d5cdcbdc538b807658f2a). Os caminhos padrão de configuração/perfil dos entrypoints Windows são resolvidos no corpo do script, após os guards, preservando argumentos explícitos. Onze contratos de distribuição, incluindo chamada real dos scripts sobre módulo isolado, pastas com espaços, outro diretório de trabalho e nomes Windows curtos/longos. O teste novo reproduziu a falha do entrypoint anterior; não houve alteração de política Windows.

Digest de fontes `f5dc7f8a90a0f730ad2c6e9b598c3920d8046f6a7424604dbce2f31a794b4d62`, ZIP `1eacf48aa9242aa8e944a1073c0cfa893c5410f9d467168feb66dbd63611aeaa`, TAR `bcfd43afeb36148c8526940ac6cdfaaddf76be84dac58fce2377f462b5b8f012`. O ZIP público foi reconferido localmente e seu plano executou na Precision, com pacote verificado e efeito somente leitura. WSL foi observado disponível, sem distro da solução; instalação exige elevação. Nenhum driver, distro, runtime ou serviço foi provisionado. A release anterior continua como histórico, com falha conhecida na resolução de defaults; o guia aponta a corrigida.

A [regressão do Portal](../sdlc/docs/precision-regressao-portal-2026-11-09.md) foi concluída com sucesso no run 42683170276, commit `3883b1a8527f638179f8c916d1a7d64e87022392`: 1.092 testes backend em 95 arquivos e 686 cenários de navegador, sem falhas; quatro integrações reais opt-in não executadas. Os dois commits posteriores da distribuição não alteram arquivos do Portal, preservando essa prova. A nova pipeline também inicia outra regressão automática do Portal; sua conclusão é independente da liberação da fundação e não foi usada para antecipar aceite. Não se declara instalação independente/SSO/publicação do Portal no equipamento.

## Histórico da primeira entrega Precision — 09/11/2026

[Run 42660370192](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42660370192), commit `f7190400c5623d937b6a409a7c94c4550859f08a`: os seis jobs da fundação Precision passaram — nativo Linux AMD64, bootstrap Windows, Docker AMD64, build/empacotamento, verificação do ZIP real em Windows e publicação permanente. Digest das 141 fontes `53b323fd993c897f389758256177035bef730db5d40d19e6f047f28a386c8361`, idêntico nos relatórios e no pacote. A CLI registrou 279 testes/subtestes Go aprovados; os dois testes Docker foram executados no job próprio. `TestApprovedVendorArchives` continua opt-in, não executado nessa matriz. Os 95 cenários Windows, provedores GPU e dez contratos Python de validação passaram; dez contratos de distribuição passaram no Windows e executaram no Linux com três cenários específicos Windows ignorados, exigidos no job Windows.

A [release permanente](https://github.com/marcoleao/ai-lab-nvidia/releases/tag/precision-f7190400c5623d937b6a409a7c94c4550859f08a) está publicada, com cinco arquivos e digests confirmados. ZIP SHA-256 `930785a169d6cf8acdf8e1e1149a63e3819f6bc86fe60f883cb52c10fa58a898`; TAR SHA-256 `04f91a641e75b629a50a876ac9d21ebdd5566d4bfdd322e170fc5147edf65b62`. O ZIP público foi baixado e verificado novamente em Windows local, somente em diretório descartável, preservando o hash antes/depois. Não houve instalação no equipamento, inicialização de WSL, driver/GPU, provisionamento de host ou mudança de Application Control. O [guia Precision](PRECISION.md) lista o aceite físico e as camadas restantes.

Os jobs legados Linux/Windows, control, navegador do control e extensão passaram no run atual. A regressão completa do Portal permanece independente e ainda executava na última consulta. Seu run anterior terminou com 18 falhas backend em quatro arquivos, embora build/browser tenham passado; essa pendência está registrada no guia Precision e não foi corrigida nem convertida em aceite da aplicação nesta entrega.

## Histórico da matriz anterior

Foram validados localmente os contratos Python do executor/gate, a recusa de execução Go nativa no Windows, a análise/compilação dos três destinos e os testes Windows isolados. A máquina não possui distribuição WSL instalada. Nenhuma instalação, importação ou inicialização foi feita para executar os testes.

A publicação foi autorizada pelo usuário e realizada no branch `codex/platform-validation-2026-11-09`. A primeira [execução real](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42635748352) identificou diferenças de quebras de linha, caminho temporário no macOS e descoberta de módulos Windows. A execução real também revelou diferenças nas respostas do Docker, portas não ativadas em redes exclusivamente internas, IPs de containers parados e permissões/configuração da auditoria OpenBao. Esses adaptadores foram corrigidos e receberam cobertura de retentativa/recusa, mantendo os recorders compartilhados e a preservação de recursos existentes.

A [execução de integração anterior](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42644567916), commit `0adf3c356f85d27c7c7ce0b1113663e99a12fb38`, passou em Docker Linux AMD64 e ARM64: redes/DNS/negações/rotas, Keycloak/PostgreSQL/OpenBao/Caddy, origem mTLS e rotação, parser dos dois adaptadores de ingresso, operações de borda, backends/configuração/dashboard de observabilidade, chegada das seis fontes HTTP/JVM, Homepage com três links e limpeza própria confirmada.

A [execução intermediária](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42645393253) passou nos seis testes, mas o gate recusou os pacotes: `WindowsPath` e `PosixPath` ordenavam nomes com maiúsculas/minúsculas de forma diferente. A correção usa a mesma ordem de nomes relativos POSIX em todos os hosts; os contratos Python passaram a executar também no Windows. O gate conservou suas exigências e foi aprovado somente após a repetição completa.

**Evidência final da matriz anterior — 09/11/2026:** [run 42647394054](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42647394054), commit `124ac0c4c2def64df414e2718ccfc809b7e3697f`. Os nove jobs da fundação passaram: três testes nativos, bootstrap Windows, duas integrações Docker e três builds/empacotamentos. Os seis relatórios foram aceitos pelo gate, com o mesmo commit/run e digest das 135 fontes: `9d61a842055c22865c2160c756e6e2105139651beea2185ed6aa07e8ed6742b0`. Os relatórios Windows e Linux foram conferidos também a partir dos artefatos reais, com hashes idênticos das fontes.

| Artefato de CI | Conteúdo |
| --- | --- |
| [platform-linux-amd64](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42647394054/artifacts/13689315715) | TAR Linux AMD64 para WSL2, checksum e `validation.json` |
| [platform-linux-arm64](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42647394054/artifacts/13689080652) | TAR Linux ARM64 para GB10, checksum e `validation.json` |
| [platform-darwin-arm64](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42647394054/artifacts/13688996899) | TAR macOS ARM64, checksum e `validation.json` |

Os artefatos desta execução têm retenção de sete dias; são pacotes validados na CI, sem publicação de release permanente ou implantação automática. O código de operação não requer Go no equipamento de uso. O pacote Windows contém CLI Linux para o WSL2, sem executável Windows próprio.

O modo nativo registrou 279 testes e subtestes Go aprovados por destino. Passaram 95 cenários Windows de instalação/manutenção, os contratos dos provedores GPU e dez contratos Python de validação/gate, estes também no Windows. As duas integrações Docker são ignoradas no modo unit e exigidas nos jobs próprios; `TestApprovedVendorArchives` é opt-in e não foi executado nessa matriz. Não se declara instalação real de Docker/Colima/WSL, reinício do host, driver/GPU, navegador/SSO ou acesso pela internet. A regressão completa da aplicação Portal é um job independente, ainda em execução no último resultado observado; seu aceite não é substituído pela qualificação da fundação.

Os blueprints usam LF para calcular sua identidade, independentemente do checkout. A política de observabilidade conserva o digest das fontes originais com LF ao acrescentar o hub. Instalações antigas cujo hash tenha sido calculado com arquivos CRLF ou mistos exigem migração explícita; esta correção não adota nem sobrescreve recursos existentes.
