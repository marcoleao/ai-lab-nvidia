# Validação desta entrega

## Aceite operacional da versão 1.0.0 — 2026-10-14

O log final fornecido pelo usuário confirmou bootstrap completo: todos os cinco serviços healthy, os quatro modelos declarados instalados, doctor com 22 checks/0 erros, inferência qwen3:14b usando VRAM, PyTorch CUDA, WebUI, Qdrant autenticado e Jupyter aprovados. O usuário confirmou também sucesso no ciclo down → up → test. Isso comprova operação e stop/start, sem estender a conclusão à inferência dos outros três modelos nem ao ciclo destrutivo nuke → bootstrap.

Para preparar o release foram repetidos parser/testes PowerShell, sintaxe Bash, testes de retentativa e integração da lista de modelos, ShellCheck 0.11.0, Compose config, build Docker e seis contratos Python. A instalação frozen de todas as 149 dependências foi executada novamente após alterar a versão do projeto para 1.0.0. Esses gates passaram sem recriar serviços ou remover dados.

## Incompatibilidade de modelo — 2026-10-14

O novo log completou qwen3:14b, mas gpt-oss:20b retornou HTTP 412 exigindo Ollama mais novo. O projeto agora fixa ollama/ollama:0.40.4 (release estável oficial consultada nessa data). A classificação do erro retorna 65 e interrompe retentativas; os testes verificam também que tee não mascara saídas 1/255.

A atualização do container Ollama foi aplicada com volume preservado. A versão 0.40.4 e health foram confirmados; a API de pull aceitou o manifesto gpt-oss:20b e iniciou progresso de camada, encerrando-se o teste de transferência antes do download completo. Uma inferência curta qwen3:14b com contexto 2048 respondeu e mostrou residência em VRAM. Modelos restantes e o ciclo completo bootstrap ainda devem ser concluídos; não foram apagados dados nem executado nuke/reset.

## Correções de resiliência — 2026-10-14

O log da workstation comprovou build/frozen sync da imagem original, cinco containers inicialmente healthy, passthrough CUDA e computação real PyTorch. A falha de bootstrap ocorreu no pull de qwen3:14b (saída 255); não há evidência suficiente para atribuir a causa a rede ou WSL. Os modelos seguintes não foram baixados porque o fluxo interrompeu.

Nas correções, foram executados: validação PowerShell, sintaxe Bash, testes de retentativa (recuperação, exaustão, cancelamento, preservação do stdin da lista), transição starting → healthy, timeout e unhealthy; Compose config, build Docker em tag de validação usando cache existente, testes Python/YAML/TOML e multiplicação de matrizes CUDA na RTX 5000 Ada Laptop de 16 GB. O build corrigido não mostrou InvalidDefaultArgInFrom.

Os serviços existentes não foram recriados durante esses testes, e não foram iniciados downloads de modelos. O usuário deve aplicar a configuração corrigida com bootstrap. A falha real de download não foi reproduzida; retentativas foram verificadas por simulação. Shellcheck e o ciclo destrutivo completo A–G ainda não foram executados nesta revisão. O registro abaixo descreve a entrega inicial, não o estado atual das validações.

Executado no ambiente de desenvolvimento em 2026-10-02:

- Inspeção do repositório vazio e configuração Git existente; nenhuma convenção de IaC preexistente.
- Parser PowerShell nativo em todos os scripts versionados.
- `bash -n` em todos os scripts Bash (Bash do Git preexistente).
- `tests/validate.ps1`: leitura/validação de lab.yaml, rejeição de caminhos destrutivos inseguros, geração de secrets e fechamento/hashes do lock; criação a partir de `.env.example`, segunda inicialização idempotente e ACL Windows sem exigência de administrador.
- CLI rejeitou profile inválido, opção fora de contexto e serviço de logs desconhecido, com exit code 1, sem provisionar.
- Releases fixadas consultadas nos repositórios oficiais; URL de rootfs verificada no índice Canonical.
- Lock de 149 pacotes construído a partir de metadados/artefatos PyPI, com versões diretas fixadas, conferência de constraints transitivas e SHA256 de cada artefato. Resolução limitada a Python 3.11/Linux; PyTorch fornecido pela base CUDA. Essa geração não substitui uma execução real do uv.

Não executado aqui: shellcheck (ausente), parser YAML/TOML/Python completo, instalação `uv --frozen`, `docker compose config`, build Docker, smoke com GPU e matriz A–G. Este ambiente não tem WSL instalado nem Docker; Python disponível no PATH é apenas o alias Windows Store. Nenhum runtime foi instalado no Windows para validar.

As verificações pendentes estão automatizadas em `scripts/linux/quality-gates.sh`, `tests/validate_repo.py` e `.github/workflows/validate.yaml`. O pipeline precisa ser efetivamente executado; criar workflow não equivale a ele passar. Bootstrap executa healthchecks/GPU/inferência na workstation; `test` repete smoke. A compatibilidade end-to-end e aceitação bootstrap → nuke → bootstrap permanecem sem comprovação até execução real.
