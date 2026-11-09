# Plataforma de IA e engenharia de software

**Entrega ativa: Precision Windows/WSL2.** macOS M3 Max e Dell GB10 ficam no backlog. O [guia Precision](docs/PRECISION.md) reúne instalação, operação, critérios de conclusão e pendências por camada. Backup e roteiro de demonstração ficam para etapas posteriores.

O instalador é distribuído em `precision-setup.zip`, com bootstrap Windows, CLI Linux AMD64 e provas de CI. O padrão `-Through Hub` prepara WSL2/base, CLI, S.O./GPU, runtime, redes, identidade/cofre/borda, origem mTLS, observabilidade e Homepage. Não exige instalar Git, Go ou Python no host de operação. Na pasta extraída:

```powershell
.\install.ps1 -Action Plan
# PowerShell como administrador, na mesma conta Windows:
.\install.ps1 -Action Install
```

O [guia de distribuição](operations/CLI-INSTALLATION.md) explica verificação e retomada após reinício. A [política Precision](operations/release-policy.json) exige três relatórios do mesmo commit/fontes: testes Linux AMD64, bootstrap Windows e integração Docker AMD64. **Os seis jobs da entrega Precision passaram na [CI real](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42660370192)**, incluindo a verificação do ZIP real em Windows e sua [release permanente](https://github.com/marcoleao/ai-lab-nvidia/releases/tag/precision-f7190400c5623d937b6a409a7c94c4550859f08a). A [evidência detalhada](docs/VALIDACAO_DA_FUNDACAO.md) conserva os limites de cada validação. A operação usa a CLI dentro do WSL2, sem executável Windows próprio ou alteração do Application Control.

O hub local usa as interfaces nativas de Keycloak, OpenBao e Grafana. O [estado por camada](docs/PRECISION.md) distingue o que já tem executor comum das ferramentas/aplicações ainda ligadas ao legado. `installation_ready=false`: CI da fundação não comprova a Precision instalada nem a plataforma completa. O domínio público permanece configurável e opcional na instalação local; entrada direta e túnel são preservados como caminhos futuros.

| Área | Responsabilidade |
| --- | --- |
| [operations/](operations/README.md) | Instalação, CLI comum, auditoria administrativa, manutenção e diagnóstico |
| [environments/](environments/platform.json) | Configuração da instalação e perfis de equipamento |
| [docs/](docs/FUNDACAO_DA_PLATAFORMA.md) | Arquitetura, backlog e evidências da fundação |
| [lab/](lab/README.md) | Implementação legada de WSL, Docker, GPU, Ollama e ferramentas |
| [sdlc/](sdlc/README.md) | Portal SDLC e runtime agêntico existentes, ainda a separar do legado |
| [vscode/](vscode/README.md) | Extensão de chat com instalação independente |
| [sdlc_demo/](sdlc_demo/README.md) | Demonstração estática existente, fora do escopo de implementação atual |

A [arquitetura da fundação](docs/FUNDACAO_DA_PLATAFORMA.md) separa infraestrutura, middleware, observabilidade, serviços de IA, agentes e aplicações, começando pelo Portal SDLC. A instalação nova preserva dados/recursos existentes; não executa limpeza implícita. O [roteiro de limpeza](cleanup-environment.md) descreve a remoção explícita do ambiente legado. Aplicações produzidas pelo SDLC e dados de negócio permanecem protegidos.

As seções seguintes documentam os caminhos legados. Sua execução não faz parte da instalação nova Precision. Consulte [Acessos e URLs](<Acessos e URLs.md>) para o ambiente existente e o guia Precision para a fundação nova.

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
