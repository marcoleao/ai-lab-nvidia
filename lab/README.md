# AI Local Lab — NVIDIA / WSL2

Laboratório em distro exclusiva ai-local-lab: Docker, NVIDIA Container Toolkit, Ollama, Open WebUI, Qdrant, Python/PyTorch e Jupyter.

## Instalação e uso

Pré-requisitos: Windows 11 x64, virtualização habilitada, GPU NVIDIA e Git. Execute PowerShell 5.1+ como administrador na mesma conta Windows. Reserve 150–200 GB. O prepare instala driver NVIDIA ausente via Windows Update e preserva drivers existentes. Driver/WSL podem exigir reboot (saída 3010); retome o prepare administrativo. Consulte [privilégios e driver](docs/windows-prerequisites.md).

A partir da raiz do repositório:

```powershell
# Preparação explícita com internet
.\lab\bootstrap.ps1 prepare all
# Operação local, sem downloads ou builds
.\lab\bootstrap.ps1 up all
```

Prepare valida o SHA256 do rootfs Ubuntu datado, importa a distro própria, instala Docker/Toolkit, baixa imagens/modelos declarados, constrói Python pelo lock e preenche os caches MiniLM e cl100k_base. Registra configurações, IDs de imagens e modelos no manifesto privado. Se interrompido, repita prepare all.

Up exige preparação válida, usa --no-build/--pull never e executa doctor/smoke. Configuração alterada ou imagem ausente exige novo prepare. Containers têm saída externa bloqueada; comunicação local e respostas às portas publicadas permanecem permitidas. O bloqueio é reaplicado nas operações e na inicialização do Docker. Prepare libera temporariamente a saída e restaura o bloqueio ao terminar, inclusive em falha.

Não instala Docker Desktop nem driver NVIDIA Linux. Não altera a distro WSL padrão ou Windows Firewall.

Open WebUI: http://localhost:3000 (crie a conta administrativa no primeiro acesso). Qdrant: http://localhost:6333 (API key). Jupyter: http://localhost:8888 (token em lab/.env, nunca impresso pelo bootstrap).

## Comandos

Use bootstrap.ps1 ou ai.cmd dentro de lab/.

| Comando | Comportamento |
| --- | --- |
| prepare [all/core/rag/dev] | Preparar explicitamente com internet |
| sem argumento / up [all/core/rag/dev] | Iniciar e validar artefatos locais |
| down | Remover containers/rede; preservar volumes/imagens |
| restart | Reiniciar e validar usando imagens locais |
| status / doctor / test | Estado, diagnóstico e testes locais |
| models | Listar modelos instalados |
| dev / jupyter | Ativar serviços de desenvolvimento preparados |
| logs [serviço] [-f] / shell | Inspecionar serviços ou abrir a distro |
| reset / destroy | Remover dados; exige prepare/up antes de reutilizar |
| nuke | Remover somente a distro e artefatos gerenciados |

Reset/destroy pedem DELETE; nuke pede NUKE. --yes permite automação consciente. Modelos são preservados por padrão em reset/destroy, conforme preserve_models. --ephemeral, update e rebuild são recusados: caches persistentes e preparação explícita são necessários para operação offline.

## Configuração e limites

Edite config/lab.yaml, config/models.yaml e config/versions.env; após mudar infraestrutura/dependências, execute prepare all e up all. Modelos: qwen3:14b, gpt-oss:20b, qwen3-coder:30b e gemma3:27b. O smoke usa qwen3:14b com contexto pequeno. Em GPUs de 16 GB, modelos maiores podem usar CPU ou exceder memória; não são carregados simultaneamente.

Fontes são sincronizados para /opt/ai-local-lab no ext4. O container dev monta /opt/ai-local-lab/workspace; notebooks usam volume próprio. Demos do SDLC ficam no GitLab e nos workspaces do SDLC, fora deste repositório. Não há sincronização bidirecional automática.

O modo offline cobre os componentes preparados. Novos pacotes/modelos/imagens de pipeline e voz/Whisper exigem preparação específica. O bloqueio dos containers não desativa a internet do Windows ou de ações administrativas diretas no host. Tags fixadas e locks não garantem que uma preparação futura obtenha os mesmos bytes de registries/apt.

Secrets em lab/.env são ignorados pelo Git, protegidos por ACL e copiados com modo 0600. Portas usam localhost por padrão. Grupo Docker equivale a root na distro; este ambiente não é sandbox para código hostil.

## Validação

```powershell
.\lab\tests\validate.ps1
.\lab\bootstrap.ps1 doctor
.\lab\bootstrap.ps1 test
```

Consulte [bootstrap](docs/bootstrap.md), [ciclo de vida](docs/lifecycle.md) e a [revisão de criação e operação offline](../sdlc/docs/revisao-criacao-offline-2026-10-19.md). Registros antigos descrevem a versão testada na data correspondente.
