# Validação desta entrega

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
