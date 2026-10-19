# Arquitetura

Windows fornece driver NVIDIA, WSL e operações PowerShell. Ubuntu 24.04 LTS é importado em WSL2 sem mudar distro padrão. systemd gerencia Docker, Container Toolkit injeta o acesso à GPU Windows; não há instalação de driver NVIDIA Linux nem CUDA no host.

Containers comunicam-se por DNS da rede bridge privada `ai-local-lab_lab`: Ollama, WebUI, Qdrant, AI Dev e Jupyter. Rede bridge não é `internal: true`, pois modelos e bibliotecas podem precisar de downloads externos. Portas de acesso ao Windows usam loopback; Ollama só é publicado por opção. O VHDX contém o engine, pacotes, imagens, volumes e workspace. Removê-lo via unregister elimina o runtime de IA.

Uma imagem dev serve AI Dev e Jupyter para evitar divergência de dependências. Profiles `agents`/`observability` são pontos de extensão: adicione serviços, volumes, secrets e healthchecks no Git; estenda `active_services`, seleção de profiles e smoke tests ao incluí-los. vLLM, LiteLLM, LangGraph Server, MCP, embeddings/rerankers, MinIO, PostgreSQL, Redis e observabilidade não são instalados agora.

Não existe sync bidirecional automático de código. Windows é a fonte; runtime usa cópia ext4. `workspace` recebe atualizações sem delete; implantação recebe rsync com delete e exclusões de dados/secrets. Nenhum modelo/imagem é gravado no Git Windows.
