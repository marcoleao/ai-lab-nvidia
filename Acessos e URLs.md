# URLs para testes locais

Abra os endereços no navegador da máquina onde o ambiente está instalado. As portas abaixo correspondem à configuração atual do projeto e funcionam sem internet após a preparação dos ambientes.

## Aplicações

| Aplicação | URL | O que testar / acesso |
| --- | --- | --- |
| Open WebUI | [http://localhost:3000](http://localhost:3000) | Chat com modelos locais. Crie a conta administrativa no primeiro acesso. Requer lab core. |
| Portal SDLC | [http://localhost:3100](http://localhost:3100) | Projetos, conversas, propostas e backlog. Cole a chave obtida pelo comando access abaixo. |
| Portal SDLC — nova fundação | [http://localhost:3310](http://localhost:3310) | Criar Sistema → Projeto → Épico → História → Tarefa e avaliar navegação/status. Selecione uma persona. Banco separado; inicia vazio. Ainda sem execução de agentes ou deploy. Bootstrap próprio em sdlc/portal. |
| Forgejo | [http://localhost:3101](http://localhost:3101) | Interface técnica do backlog versionado do portal. Exige conta local; cadastro público desabilitado. |
| GitLab | [http://localhost:3180](http://localhost:3180) | Repositórios das demos, Issues, Merge Requests, pipelines, jobs e artefatos. Usuário root; obtenha a senha pelo comando abaixo. |
| Demo publicada | [http://localhost:3181](http://localhost:3181) | Aplicação publicada pelo pipeline GitLab. Antes do primeiro deploy, pode exibir a página inicial do serviço. |
| JupyterLab | [http://localhost:8888/lab](http://localhost:8888/lab) | Notebooks e execução Python/GPU. Informe JUPYTER_TOKEN do arquivo privado lab/.env. Requer lab dev. |
| Qdrant — API | [http://localhost:6333](http://localhost:6333) | Banco vetorial. Requisições autenticadas usam o header api-key com QDRANT_API_KEY de lab/.env. Requer lab rag. |

O comando lab up all habilita core, rag e dev. Os serviços SDLC são iniciados juntos pelo sdlc up. O primeiro início do GitLab pode levar vários minutos.

A nova fundação usa `.\sdlc\portal\bootstrap.ps1 prepare` e depois `up`, de forma independente do portal legado. Consulte [operação e limites](sdlc/portal/README.md). Não precisa da chave do portal antigo para selecionar persona no modo local.

## Obter acesso

Execute na raiz, em PowerShell como administrador, na mesma conta Windows da instalação:

```powershell
# Chave para acessar o portal e configurar a extensão SDLC no VS Code
.\sdlc\bootstrap.ps1 access

# Senha do usuário root do GitLab
.\sdlc\bootstrap.ps1 access -Service gitlab
```

Cada comando copia sua credencial para a área de transferência, sem imprimi-la. Cole no formulário correspondente. Não salve senhas ou tokens neste arquivo. No Forgejo, a conta técnica provisionada é sdlc-backlog; suas credenciais ficam no ambiente SDLC. A operação do backlog pelo usuário é feita pelo portal.

A extensão não tem URL própria: abra **SDLC: Conversar com os agentes** na paleta de comandos do VS Code.

## Endereços auxiliares

| Teste | URL | Resultado esperado |
| --- | --- | --- |
| Saúde do portal SDLC | [http://localhost:3100/health/ready](http://localhost:3100/health/ready) | HTTP 200 quando o portal estiver pronto. |
| Saúde do Open WebUI | [http://localhost:3000/health](http://localhost:3000/health) | HTTP 200 quando o WebUI estiver pronto. |
| Login GitLab | [http://localhost:3180/users/sign_in](http://localhost:3180/users/sign_in) | Formulário de login; HTTP 200 após inicialização. |
| Coleções Qdrant | [http://localhost:6333/collections](http://localhost:6333/collections) | Lista de coleções em JSON; exige o header api-key. Use cliente HTTP ou código para enviar a chave. |

Ollama, PostgreSQL e Runner são usados internamente e não têm interface web publicada na configuração padrão. A porta Ollama 11434 está desabilitada para acesso pelo Windows.

As portas do laboratório estão em [lab/config/lab.yaml](lab/config/lab.yaml). O portal usa a porta definida em [sdlc/config/installation.json](sdlc/config/installation.json); Forgejo usa portal + 1, GitLab portal + 80 e demo portal + 81. Se alterar essas configurações, atualize esta lista.

Veja também o [roteiro de teste do zero](cleanup-environment.md).
