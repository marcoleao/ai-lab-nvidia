# Changelog

## 1.0.0 — 2026-10-14

Primeira versão estável do AI Local Lab, validada na workstation Windows 11 com NVIDIA RTX 5000 Ada Laptop de 16 GB.

- Bootstrap PowerShell idempotente para uma distro WSL2 dedicada e descartável.
- Docker Engine e NVIDIA Container Toolkit exclusivamente dentro da distro; stack de IA em containers.
- Ollama 0.40.4, Open WebUI 0.11.4, Qdrant, ambiente Python/PyTorch CUDA e JupyterLab autenticado.
- Modelos declarativos: qwen3:14b, gpt-oss:20b, qwen3-coder:30b e gemma3:27b.
- CLI para operação, diagnóstico, testes, atualização e remoção com verificação de propriedade.
- Portas locais por padrão, secrets gerados, persistência em volumes Linux e modo ephemeral.
- Retentativas de downloads transitórios; incompatibilidade HTTP 412 interrompe sem retentativas inúteis.
- Doctor aguarda inicialização de serviços; smoke valida inferência, residência em VRAM e computação CUDA real.
- Build compartilhado entre dev/Jupyter, lock Python e testes de regressão/CI.

### Validação

Bootstrap completo: cinco serviços healthy, quatro modelos instalados, doctor com 22 verificações e zero erros; smoke de Ollama/qwen3:14b, WebUI, Qdrant, Jupyter e PyTorch CUDA aprovado. Ciclo down → up → test confirmado pelo usuário.

### Limites conhecidos

- Inferência automatizada validada com qwen3:14b; modelos maiores podem exigir offload para CPU e ajuste de contexto na GPU de 16 GB.
- gemma3:27b não oferece tool calling na versão instalada.
- Ciclo destrutivo completo nuke → bootstrap ainda não foi comprovado nesta rodada.
- Tags de imagens/modelos e pacotes apt externos não garantem replay byte a byte.
