# Revisão de criação e operação offline — 19/10/2026

## Resultado

Foram corrigidas dependências de download no uso diário do laboratório e falhas de provisionamento/aceitação do SDLC. Preparação com internet e operação local estão separadas. Os testes funcionais passaram nas distros WSL existentes desta workstation; esta revisão não equivale a uma reinstalação integral em Windows limpo.

GitHub continua hospedando o código de instalação. Demos e histórico ficam no GitLab local; checkouts/builds/artefatos ficam nas distros. Não há necessidade de backup das demos.

## Criação do ambiente

Pré-requisitos externos ao bootstrap: Windows 11 x64, virtualização habilitada, GPU NVIDIA, Git e VS Code para a extensão. Todos os bootstraps exigem PowerShell administrativo na mesma conta Windows. Lab prepare instala driver NVIDIA ausente via Windows Update quando há pacote aplicável e preserva drivers existentes. Driver/WSL podem exigir reboot. Veja [privilégios e driver](../../lab/docs/windows-prerequisites.md) para testes e limites dessa alteração posterior à revisão inicial.

A partir da raiz:

```powershell
# Preparação com internet
.\lab\bootstrap.ps1 prepare all
.\sdlc\bootstrap.ps1 prepare
.\vscode\bootstrap.ps1 install

# Operação local
.\lab\bootstrap.ps1 up all
.\sdlc\bootstrap.ps1 up

# Verificação
.\lab\bootstrap.ps1 doctor
.\lab\bootstrap.ps1 test
.\sdlc\bootstrap.ps1 test
.\sdlc\bootstrap.ps1 report
.\vscode\bootstrap.ps1 test -HostSmoke
```

SDLC prepare inclui Git, GitLab e Runner; não há instalação separada desses componentes. A extensão fica em vscode/ e é instalada por pacote local.

## Problemas encontrados e correções

| Problema | Correção |
| --- | --- |
| Lab up instalava ferramentas, construía imagens e baixava modelos | Prepare separado; up/restart usam apenas artefatos locais |
| Doctor exigia HTTPS externo; smoke reconstruía imagem | Diagnóstico local, imagens preparadas e probes sem pull |
| WebUI podia baixar embeddings/tokenizer durante uso | MiniLM e cl100k_base preparados; caches testados sem rede; downloads automáticos desativados |
| Containers lab tinham saída externa | Regras próprias Docker bloqueiam saída e conexões iniciadas ao host, preservando comunicação local/respostas |
| Alterações de configuração/imagens passavam despercebidas | Manifesto de hashes e IDs; preparação inválida impede inicialização |
| Sync removia manifesto local | Manifesto preservado na sincronização |
| Saída textual do Ollama mudava de ordem após restart | Inventário usa manifesto local com layers identificados por digest |
| Reset/volumes efêmeros apagavam caches necessários | Reset exige novo prepare; modo efêmero recusado |
| Dependências host incompletas podiam ser ignoradas | Verificações explícitas das ferramentas necessárias, incluindo python3/curl/openssl |
| Rootfs usava URL current mutável | URL datada 20240423 com SHA256 conferida |
| GitLab podia escolher subnet conflitante com lab/WSL | Alocação explícita sem colisão com rotas existentes; migração preserva volumes |
| Aceitação SDLC falhava sem demo prévia | Teste cria seu projeto sintético quando necessário |
| Reinício GitLab podia deixar proxy com IP antigo | Resolução dinâmica do upstream Docker |

O bloqueio lab é reaplicado nas operações e na inicialização do Docker. Prepare libera temporariamente a saída e a restaura ao terminar, inclusive se o comando Linux falhar. SDLC usa redes internas e guardas próprios. Esses controles atuam nos containers gerenciados; não bloqueiam toda a internet do Windows.

## Evidências executadas

| Área | Evidência | Resultado |
| --- | --- | --- |
| Lab | Validação PowerShell/configuração, sintaxe Bash, testes de resiliência/download com falhas simuladas | Passou |
| Artefatos offline | Três testes de preparação ausente, configuração alterada e imagem alterada; seis contratos estáticos/API | Passou |
| Lab | Preparação real de imagens, quatro modelos e caches | Passou |
| Lab | up all sem build/pull; doctor com 24 verificações | Passou, zero erros |
| Retomada lab | down → up all com recriação da rede, guardas antes dos containers, doctor e smoke completos | Passou |
| GPU | Cálculo CUDA/PyTorch e Ollama qwen3:14b com residência em GPU | Passou em RTX 5000 Ada Laptop, 16 GB |
| Serviços lab | WebUI, Qdrant autenticado com escrita/leitura/remoção e Jupyter autenticado | Passou |
| RAG offline | MiniLM gerando vetor de 384 dimensões e tiktoken carregando com network none | Passou |
| Isolamento lab | Conexão TCP externa a partir de dev recusada | Passou |
| SDLC | Validação do pacote e nove testes GitLab/manage, incluindo primeira preparação | Passou |
| SDLC | Aceitação do núcleo sem demo prévia, permissões e operações locais | Passou |
| GitLab/Runner | Projeto descartável, MR, pipeline, merge, build/deploy e bloqueio de saída | Passou |
| VS Code | Onze testes e HostSmoke com instalação/ativação, comandos e abertura do webview no VS Code real | Passou |

Relatórios locais: sdlc/.state/acceptance-report.json e sdlc/.state/gitlab-acceptance-report.json. São estado de execução privado, não fontes a publicar.

## Limites da conclusão

Não foram executados nuke/reimport de todas as distros, reinstalação do Windows ou desconexão física da interface de rede. A criação do zero foi revisada no código/configuração e em testes de primeira preparação; os testes reais desta revisão reutilizaram as distros existentes. Um aceite integral de máquina limpa ainda exige esse ensaio em ambiente descartável.

A independência externa cobre os recursos preparados: modelos declarados, embeddings MiniLM, tokenizer cl100k_base, Qdrant, Python/PyTorch/Jupyter, núcleo SDLC, GitLab/Runner e pipeline de demonstração fornecido. Aplicações futuras precisam ter suas próprias imagens, pacotes npm/pip, modelos e ferramentas preparados localmente. Dependências ausentes falham offline.

Voz/Whisper, modelos adicionais, pesquisa web e APIs externas não fazem parte do pacote offline testado. Não se deve ativar recursos que exijam downloads esperando funcionamento automático. Atualizações do Windows/VS Code e comandos administrativos diretos no host são independentes dos serviços gerenciados.

Tags e locks reduzem variação, mas uma nova preparação online não garante reprodução byte a byte de apt, imagens ou modelos com tags mutáveis. Após preparar, os IDs/hashes locais são verificados. Remover volumes/caches exige nova preparação com internet.

## Referências

A [Canonical publica os checksums do rootfs datado](https://cloud-images.ubuntu.com/wsl/releases/24.04/20240423/SHA256SUMS). O SHA256 configurado para amd64 é 8251e27ffff381a4af5f41dcb94d867de3e0d9774a9241908ab34555d99315ea.

O [guia offline do Open WebUI](https://docs.openwebui.com/tutorials/maintenance/offline-mode/) exige preparar modelos/caches e explica que OFFLINE_MODE não bloqueia todas as integrações externas. O projeto combina configuração offline, caches locais e bloqueio de saída.
