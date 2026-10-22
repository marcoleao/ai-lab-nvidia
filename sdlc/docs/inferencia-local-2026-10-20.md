# Conexão de inferência local — 20/10/2026

Continuação implementada: [assistente real com conversa persistida](assistente-real-2026-10-20.md). A seção de próxima entrega abaixo descreve o estado anterior a essa continuação; aplicação de planos permanece pendente.

A API do portal 3310 está conectada ao Ollama do laboratório, sem depender da extensão VS Code. O modelo selecionado é `qwen3:14b`. O catálogo real contém também `gemma3:27b`, `qwen3-coder:30b` e `gpt-oss:20b`; o relay permite gerar texto somente com o modelo selecionado.

## Canal operacional

`API → relay autenticado no gateway interno do portal → Ollama na rede do laboratório`.

O serviço systemd `sdlc-llm-relay.service` roda na distro SDLC, com fonte/configuração em `/opt/agentic-sdlc/portal/llm-relay`. Escuta apenas no gateway da bridge do portal, `172.21.0.1:11435`, e aceita a sub-rede dessa bridge com uma credencial própria. Não há publicação de porta em localhost, alteração do Compose do laboratório, download ou cópia de modelos. A credencial fica fora do Git e é montada somente na API. O navegador não recebe a credencial nem chama o Ollama diretamente.

O relay aceita apenas GET `/v1/models` e POST `/v1/chat/completions`, sem streaming ou ferramentas. Bloqueia outros modelos, gerenciamento/download de modelos, campos não previstos e redirecionamentos. Limites: uma inferência por vez, 64 KiB por requisição, 20 mensagens, 2048 tokens de saída e 2 MiB de resposta. O upstream tem limite de 120 segundos. Logs do relay não registram prompts ou credenciais.

O provider TypeScript valida catálogo, modelo da resposta, saída vazia/truncada e JSON quando solicitado. Tem timeout e sinal de cancelamento; não fabrica respostas em falhas e não troca de modelo automaticamente. Cancelar a espera na API não garante interrupção imediata da geração já iniciada no Ollama; o relay mantém sua exclusão de concorrência até concluir ou expirar. Não é ainda um worker persistente nem uma fila de conversas.

O formato HTTP segue a [compatibilidade documentada pelo Ollama](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx). Não há chamada a provedor de nuvem.

## Endpoints da API

- GET `/api/integrations/models`: catálogo e modelo selecionado.
- GET `/api/integrations/health`: valida que o modelo selecionado está presente; não executa inferência. READY nesse check significa disponibilidade do catálogo, não aceite do pipeline.
- POST `/api/integrations/llm/probe`, corpo `{}`, com persona Admin ou Arquiteto: uma validação técnica fixa, sem prompts de negócio, criação de itens ou escrita de histórico. A API recusa validações concorrentes.

## Evidências

O POST técnico real retornou `model=qwen3:14b`, `content=PRONTO`, `elapsedMs=18406`, `scope=technical-inference-only`. O teste carregou um modelo já instalado; não fez download. A consulta autenticada ao catálogo passou pela API e o acesso sem credencial ao relay retornou HTTP 401.

Build de produção/TypeScript e 25 contratos TypeScript passaram, mais um teste Python do handler real do relay em servidores locais descartáveis. Cobrem catálogo, limites, autenticação, bloqueio de endpoints/campos, ausência de encaminhamento da credencial ao upstream, timeout/cancelamento, saída inválida, exclusão de concorrência e autorização da API. Testes de domínio usam PostgreSQL descartável; não foram criadas fixtures no planejamento humano. O teste destrutivo GitLab permanece separado e não foi reexecutado nesta entrega. A configuração de CI foi ampliada, sem alegar execução remota.

## Operação e recuperação

Dentro da distro SDLC, execute como root `python3 <caminho-do-repositório>/sdlc/portal/scripts/connect-llm.py --upstream http://172.18.0.2:11434 --model qwen3:14b` e depois aplique `sdlc/portal/bootstrap.ps1 up` no Windows. O configurador verifica o catálogo antes de instalar o relay e grava `.prepared/compose.llm.json`; o bootstrap incorpora esse override juntamente com o GitLab. Não imprima nem copie o conteúdo do arquivo de credencial para comandos/documentos.

Endereços são fatos desta instalação. Após recriar redes ou o contêiner Ollama, descubra novamente o IP interno e reexecute o configurador. Alterações na fonte do relay exigem reaplicá-lo. O serviço reinicia em falhas e no boot; depende de Docker e do gateway da rede existir. Para diagnóstico, use `systemctl status sdlc-llm-relay.service` e os endpoints acima. Parar o portal preserva o serviço de relay, que pode ser parado separadamente com systemctl. A fonte do relay instalado deve acompanhar a imagem/API na recuperação; não se declara bloqueio completo de saída do stack com esta conexão.

## Próxima entrega

A assistente lateral continua uma prévia de perguntas fixas e não usa esta inferência. Conectar conversa real exige persistência de sessões/turnos, contexto por Sistema/Projeto, recuperação de falhas e propostas estruturadas/versionadas. Aplicar um plano continuará sendo uma operação distinta, revisável, autorizada e auditada. Registry, executor e deploy permanecem pendentes.
