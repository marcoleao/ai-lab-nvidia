# Laboratório e SDLC agêntico local

| Diretório | Responsabilidade |
| --- | --- |
| [lab/](lab/README.md) | Setup existente: WSL, Docker, GPU, Ollama e serviços do laboratório |
| [sdlc/](sdlc/README.md) | Setup do SDLC agêntico integrado ao laboratório |
| [vscode/](vscode/README.md) | Extensão de chat e instalação independente no VS Code |

Os setups têm configuração, estado e ciclos de vida próprios dentro deste repositório.

Consulte [Acessos e URLs](<Acessos e URLs.md>) para abrir os serviços locais e obter as credenciais de acesso.

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

O pacote de instalação do SDLC está em `sdlc/`, com [roteiro de instalação e aceitação](sdlc/docs/aceitacao-do-ambiente.md). As demos e seu histórico ficam exclusivamente no GitLab local do ambiente SDLC. Checkouts, builds e artefatos ficam nos diretórios e volumes desse ambiente, fora deste repositório. Aqui ficam apenas as ferramentas, configurações e modelos de referência necessários para operar o laboratório, o SDLC e a extensão.

## Validação

```powershell
.\lab\tests\validate.ps1
```

O workflow da raiz valida o laboratório em Windows e Linux. Licença e configurações do Git aplicam-se ao repositório inteiro.

Consulte a [revisão de criação e operação offline](sdlc/docs/revisao-criacao-offline-2026-10-19.md), com correções, evidências e limites do teste em ambiente limpo.
