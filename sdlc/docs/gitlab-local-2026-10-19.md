# Entrega do GitLab local — 2026-10-19

Instalado em `/opt/agentic-sdlc/gitlab-demo` na distro WSL `agentic-sdlc`.
O repositório do SDLC permanece no GitHub, sem alteração de remotos.
As demos são privadas, locais, descartáveis e sem rotina de backup.

## Verificação executada

- Seis testes de contratos: seleção explícita do projeto, pipeline obrigatório,
  correspondência do SHA e publicação de arquivos sem metadados Git/secrets conhecidos.
- Teste da página gerada com a biblioteca padrão do Python.
- Aceite real: Issue → branch/commit → MR → teste/build → merge → Issue fechada
  → pipeline de main → deploy → conteúdo servido por HTTP local.
- Rede de execução marcada `internal`; tentativa de conexão externa pelo Runner bloqueada.
- GitLab e aplicação responderam HTTP 200 pelo Windows após o comando `up` terminar.
- Sessão WSL oculta mantém os serviços ativos; não depende de terminal aberto.
- Validação existente de configuração e governança do SDLC passou.

O relatório do aceite técnico está em
`/opt/agentic-sdlc/gitlab-demo/acceptance.json`. Ele registra um teste automatizado
de infraestrutura, sem representar uma aprovação humana de produto.

Uma segunda demo ficou com MR aberto, pipeline aprovado e estado `mergeable`:
<http://127.0.0.1:3180/sdlc-demo-bot/demo-20261019-130459-acbf/-/merge_requests/1>.
A aplicação do aceite está em <http://127.0.0.1:3181>.

## Limite da integração

O portal mantém o backlog Forgejo existente. O GitLab recebe projetos por
`.\sdlc\gitlab.ps1 publish -Directory /opt/agentic-sdlc/workspaces/<nome>`; os agentes de geração
de aplicações ainda não estão conectados automaticamente a esse comando.
O Runner oferece Bash, Git e Python. O roteiro usa revisão operacional e deploy
manual; aprovação obrigatória por outro revisor não é imposta pela edição CE.

Operação e comandos: [manual do GitLab local](../gitlab/README.md).
