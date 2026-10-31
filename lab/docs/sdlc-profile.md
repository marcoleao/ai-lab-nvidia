# Perfil mínimo para o SDLC

O perfil `sdlc` prepara o LAB somente como serviço de inferência do Portal. Não modifica a lista geral de modelos ou suas versões e não instala ferramentas de experimentação.

Na raiz do repositório, em PowerShell administrativo:

```powershell
.\lab\bootstrap.ps1 prepare sdlc
.\lab\bootstrap.ps1 up sdlc
.\lab\bootstrap.ps1 doctor

.\sdlc\install.ps1 prepare
.\sdlc\install.ps1 up
.\sdlc\install.ps1 doctor
```

LAB e SDLC têm instaladores separados. O primeiro prepara WSL, Docker, suporte NVIDIA e Ollama; o segundo prepara Portal, GitLab, scanner, Qwen Code/SDK, Chromium e executores. Reboot solicitado pelo preparo do Windows/driver/WSL deve ser concluído antes de prosseguir. Não é necessário instalar Node ou Python manualmente no Windows.

## Escopo

| Recurso no LAB | Perfil `sdlc` |
| --- | --- |
| Distro própria, Docker, NVIDIA Container Toolkit, rede isolada e Ollama | Necessários, mantidos |
| Conversa/planejamento | `qwen3.5:9b` |
| Código/UI | `qwen3:14b` |
| Open WebUI, Qdrant e Jupyter | Não iniciados |
| Imagens CUDA de diagnóstico, PyTorch/Python de experimentação e Node | Não baixadas/preparadas pelo perfil |
| MiniLM, embeddings e caches de tokenização | Não preparados ou exigidos |
| Container permanente Qwen Code no LAB | Não preparado ou iniciado; a ferramenta fica no SDLC |

A política de seleção está em `lab/config/sdlc-profile.json`. Os dois nomes precisam existir na declaração geral `models.yaml`; não se acrescenta um modelo por efeito da seleção. A imagem preparada no LAB é apenas `OLLAMA_IMAGE` de `versions.env`. Os demais perfis mantêm sua preparação geral e continuam disponíveis.

`sdlc` é exclusivo: não se combina com `core`, `agents`, `dev` ou `rag`. `all` continua representando os perfis gerais. O perfil explícito fica persistido; repetir `prepare`/`up` sem argumento preserva a última seleção válida. Em uma instalação sem seleção anterior, a configuração geral continua sendo o padrão.

## Manifesto, diagnóstico e GPU

O manifesto offline v3 identifica os perfis, a seleção, os arquivos e os ativos realmente exigidos. No perfil mínimo, verifica apenas Ollama e os dois modelos selecionados, sem exigir imagens ou caches de outros perfis. Um manifesto anterior, de outro perfil ou com fontes/ativos alterados exige novo `prepare`; `up` não baixa ou constrói implicitamente.

O `doctor` verifica GPU disponível no WSL, runtime NVIDIA, Ollama e modelos. Não exige CUDA/PyTorch nem caches do WebUI nesse perfil. O `up` executa também o smoke: Python padrão do host consulta o endereço privado do Ollama, gera uma resposta curta com o modelo geral selecionado e exige residência em VRAM. Isso comprova esse caminho de GPU, não a qualidade dos agentes ou da aplicação. O modelo de código é conferido como instalado; seu aceite funcional continua na jornada SDLC. Não há provedor externo.

Limites de memória, paralelismo, cache e versões existentes não foram ajustados nesta entrega. Instalar somente dois modelos reduz downloads/disco; a memória efetiva durante inferência ainda depende do modelo e dos demais serviços ativos.

## Instalação existente e mudança de perfil

Esta opção não apaga modelos extras, imagens, volumes, projetos ou dados anteriores. Em uma instalação existente, encerre o LAB pelo comando normal antes de trocar:

```powershell
.\lab\bootstrap.ps1 down
.\lab\bootstrap.ps1 prepare sdlc
.\lab\bootstrap.ps1 up sdlc
```

Não faça a troca enquanto os agentes estiverem usando a inferência. Se serviços opcionais do mesmo LAB permanecerem ativos, o diagnóstico recusa confirmar o perfil mínimo e orienta `down`; não encerra serviços de outro proprietário nem exclui pesos para liberar espaço. Migrar de perfil preserva dados, portanto não substitui uma instalação realmente limpa.

A seleção da configuração/modelos é auditada e restaurada se uma escrita falhar; restauração incerta permanece UNKNOWN. A preparação conserva o manifesto anterior em caso de falha e só confirma o novo após inventariar os ativos. Retentativa é explícita. A sincronização geral de fontes e todas as operações legadas do LAB não são declaradas como uma transação global.

## Verificação e limites

Contratos em `lab/tests/test_sdlc_profile.py` e `lab/tests/sdlc-profile.tests.ps1` cobrem seleção exclusiva, retentativa persistida, preservação de declarações/pesos, rollback confirmado/incerto, auditoria indisponível, ausência de preparação opcional, manifesto por perfil e rejeição de inferência sem VRAM. Integram os gates existentes. A renderização estática do Compose selecionou somente `ollama`; `core,agents` continuou selecionando seus três serviços.

Não foi executado `prepare/up` real, download de pesos ou inferência nesta implementação. A instalação limpa e o teste funcional ficam para o usuário, conforme o [roteiro completo](../../sdlc/docs/instalacao-manual-ate-dev-2026-10-31.md).
