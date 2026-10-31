# AI Local Lab — NVIDIA / WSL2

Laboratório em distro exclusiva ai-local-lab: Docker, NVIDIA Container Toolkit, Ollama, Open WebUI, Qdrant, Python/PyTorch e Jupyter.

O perfil padrão é `core,agents`: Ollama, WebUI e ferramenta Qwen Code preparada. Use `prepare agents` e `up agents` para esse recorte; `rag`, `dev` e `all` continuam disponíveis. A mudança de perfil preserva volumes e não garante que serviços anteriormente iniciados tenham sido parados. Não aumente memória WSL automaticamente: as distros compartilham a VM e a pressão do Windows também precisa ser conferida.

Correções locais com escopo menor (31/10): o Portal prepara `micro-json-v1`, com localizador, seletor de trechos, um editor por capacidade e perfil de imports, seguidos de planejamento, pré-requisitos e operação da UI. Padrões, mensagens e localidade decimal são propostas de dados com montagem pelo coordenador; os demais casos usam expressão validada. O bootstrap de codificação seleciona `qwen3:14b`, sem raciocínio; o modelo geral continua no 9B. Oito controles sintéticos passaram com fonte estável; executor e portal foram publicados, e a nova versão do catálogo chegou a DEV. Aceite real ainda parcial (cinco casos UI aprovados e dois reprovados), acompanhado no [plano LP](../sdlc/docs/agentes-locais-escopo-reduzido-2026-10-31.md). O coder 7B/UI 14B foi avaliado e reprovado, sem adoção operacional. Qwen Code/SDK permanecem fixados; o parser Babel também usa versão e integridade no lock. Ferramentas não executam código de projeto durante edição/sintaxe. Os testes de UI só rodam a candidata no Chromium isolado; um controle sem nome usa correspondência exata e índice entre anônimos, sem atingir campos nomeados.

O Compose declara `LLAMA_ARG_CACHE_RAM=0`: o runner fixado reconhece esse parâmetro nativo, evitando reter estados de prompts de perfis diferentes na RAM. Em 31/10, uma interrupção real coincidiu com `oom_kill=1` e salvamento de estados de aproximadamente 586 MiB. A política foi aplicada por `scripts/linux/inference_cache_policy.py`, com cinco contratos de idempotência/recusa/rollback, incluindo recusa de fonte vinculada, e preservação de imagem, volumes, rede e portas; não aumenta o limite de memória nem altera quantização/modelo. O processo nativo confirmou a variável e o log de cache desativado. É compatível com o [problema relatado no Ollama](https://github.com/ollama/ollama/issues/18264); o recurso foi conferido no `--help` da versão instalada, sem depender de uma variável ainda proposta em PR. A sequência de validação e o aceite da aplicação são acompanhados separadamente no plano LP.

Relógio do LAB WSL: as distros próprias usam a autoridade Windows/Hyper-V. O bootstrap aplica um drop-in identificado de `systemd-timesyncd`, condicionado para não iniciar no WSL, e interrompe o sincronizador Linux concorrente. A ação administrativa preserva fontes anteriores/novas e rollback fora das bases. Em 31/10, uma amostra de 90 segundos mostrou três recuos de aproximadamente 2,47 s com dois sincronizadores ativos; após a política, outra amostra não encontrou saltos. A suíte afetada passou no reteste. [Evidência e limites](../sdlc/docs/assets/avaliacao-modelos-lab-2026-10-30/relogio-lab-20261031.json). A rodada integral anterior continua reprovada; seu resultado não foi reescrito.

Qwen Code `0.26.4` e SDK `0.1.26` usam lock npm e Node 24, sem scripts de instalação ou dependências nativas opcionais. O bootstrap prepara a imagem e confere a versão com rede desativada. A instalação da ferramenta não autoriza código, Git ou deploy: o Portal utiliza seu executor separado, sem rede, com ferramentas limitadas, validação e gates existentes. Depois de conectar o modelo local, `sdlc/portal/bootstrap.ps1 prepare-agents` prepara e instala esse executor no Docker do SDLC; `up` o conecta ao Portal. A codificação usa `qwen3:14b` por padrão, independentemente do modelo geral de conversa/planejamento. Para outro modelo previamente instalado e qualificado, informar `-CodingModel <nome>`. Não há download implícito de modelo nesse comando; ausência do modelo interrompe a instalação.

`prepare-agents` do Portal prepara também o verificador Chromium da entrada React. Reaproveita a imagem de dependências/browser se o lock confere; na primeira instalação prepara esse cache pelo Dockerfile de regressão. Essa preparação pode baixar dependências declaradas; os jobs operacionais usam somente imagens já preparadas e rede desativada. A imagem de navegador roda sem credencial de inferência e não executa scripts de pacote/backend do projeto. É uma verificação de inicialização, sem substituir os testes de uso da aplicação.

O codificador também pode declarar interações em `validate_candidate.steps`: até 20 ações por nomes acessíveis, com asserção de texto, visibilidade ou imagem. Elas são executadas no navegador isolado dentro da chamada da ferramenta, que devolve a prova e eventuais erros na mesma conversa. Há no máximo quatro verificações interativas por job; a candidata final passa por nova conferência, dentro do mesmo orçamento e SHA. O teste usa dados criados pela UI de um contexto efêmero, sem alterar a aplicação publicada. Esse retorno reduz correções cegas, mas não substitui revisão/segurança nem os casos independentes de aceitação em DEV. O relatório identifica os passos executados e as asserções confirmadas; uma proposta não é apresentada como teste executado.

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
| prepare [all/core/rag/dev/agents] | Preparar explicitamente com internet |
| sem argumento / up [all/core/rag/dev/agents] | Iniciar e validar artefatos locais |
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

Edite config/lab.yaml, config/models.yaml e config/versions.env; após mudar infraestrutura/dependências, execute prepare e up no perfil escolhido. Modelos: qwen3.5:9b, gemma4:12b, qwen3:14b, gpt-oss:20b, qwen3-coder:30b, gemma3:27b e qwen2.5-coder:7b-instruct-q4_K_M. Presença dos pesos não significa adoção/qualificação. O smoke usa o primeiro modelo declarado, com contexto de 4K e pensamento desativado; isso não qualifica construção de aplicações. Em GPUs de 16 GB, modelos maiores podem usar CPU ou exceder memória; não são carregados simultaneamente.

A ponte do LAB usa `10.239.0.0/24`, pool dinâmico `10.239.0.128/25` e Ollama fixo em `10.239.0.10`, sem publicar sua porta por padrão. Os três valores são declarados em `config/lab.yaml`. `prepare` migra a ponte antiga somente após conferir ownership, endpoints e ausência de sobreposição, conservando containers/volumes e recibo privado de restauração em `audit/network-migrations`. `up` recusa uma rede divergente. O conector do Portal deriva o endereço dessa declaração; um IP dinâmico obtido por inspect não deve ser persistido como contrato. O bootstrap mantém o WSL ativo enquanto os serviços são usados e reconcilia as três pontes próprias do SDLC após operações do LAB. Depois de interromper a distro manualmente, retome pelo bootstrap para restaurar também o keepalive.

Neste notebook de 32 GB, qualificação de modelos e regressão completa devem ser executadas em sequência. Não somar os dois trabalhos durante a validação: a pressão de memória já interrompeu o WSL. Isso é uma restrição operacional documentada; ainda não existe um escalonador global de memória que coordene todos os comandos manuais.

O Ollama tem limite declarado de 8 GiB de RAM e 10 GiB no total RAM+swap (`ollama_memory_limit_gb` / `ollama_memory_swap_limit_gb`), um modelo carregado e uma inferência por vez. Essa barreira limita RAM/swap do container; não limita toda a memória do Windows, não reserva VRAM e não garante que um modelo maior caiba. Sob falta de memória, a operação deve falhar sem aprovar gates. O orçamento precisa de nova qualificação antes de ser ampliado. O teste do Gemma 12B sofreu interrupção de infraestrutura e não foi adotado como codificador por esse ensaio.

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
