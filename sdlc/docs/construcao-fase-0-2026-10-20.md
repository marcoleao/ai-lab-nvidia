# Construção — Fase 0 (20/10/2026)

SDLC-01 e SDLC-02 implementados no código, com testes automatizados e aceite em instalação Compose descartável. Nenhuma atualização ou limpeza foi aplicada aos serviços permanentes.

## Mudanças

- `runtime.initialize()` executa migrações/permissões e `initialize_access()`. A configuração cria apenas as três identidades de acesso; não cria projetos, propostas, execuções, mensagens ou falhas artificiais. Não depende de `clean-start.json`.
- Inicializações seguintes verificam a correspondência das credenciais com o banco e preservam trabalho humano e arquivos antigos. Credencial revogada continua revogada. Banco com identidades mas sem arquivo de acesso interrompe o bootstrap em vez de gerar substitutos silenciosamente.
- O comando `gitlab.ps1 demo` e seu equivalente Python foram removidos. `publish` exige diretório explícito do usuário; não existe mais argumento padrão apontando para aplicação pronta.
- A aplicação de exemplo foi movida para `tests/fixtures/gitlab`. Somente preparação de instalação temporária identificada copia essa fixture; o pacote preparado do ambiente permanente não carrega uma aplicação pronta para publicar. Arquivos antigos no runtime não são apagados automaticamente.
- `bootstrap.ps1 test` recusa o alvo permanente. O runtime Linux recusa testes sintéticos antes de verificar/invocar serviços quando o alvo não é descartável. O aceite Python exige variáveis e marcador correspondentes; o aceite GitLab verifica raiz temporária, projeto Compose e propriedade antes de criar qualquer recurso.
- `doctor` continua sendo o diagnóstico operacional sem criação de dados de negócio. `report` apenas exporta relatórios já existentes; mensagens não recomendam mais executar testes sintéticos no alvo instalado.

## Como executar a aceitação completa isolada

Dentro da distro SDLC, como root, a partir de uma cópia revisada do código:

```bash
bash /caminho/do/repositorio/sdlc/scripts/linux/test-install-package.sh
```

O script gera `/tmp/sdlc-package-<uuid>` e projetos Compose exclusivos, prepara e inicia a instalação, cria o marcador de teste, executa aceite, revogação/rotação, reinício e restauração de backup. Remove seus próprios recursos no encerramento. A preparação exige internet e recursos para outra instância do GitLab; não executar durante a apresentação nem tratar como diagnóstico de leitura. O script não faz nova importação de WSL ou reinstalação de Windows.

Os relatórios desse ensaio pertencem à instalação temporária e são eliminados pela limpeza. Não são exportados pelo `bootstrap.ps1 report` do ambiente humano. Guardas evitam seleção acidental do alvo errado; não substituem o controle administrativo de quem possui acesso root/Docker.

## Evidências desta entrega

- **44 testes Python passaram**, incluindo instalação vazia sem marcador, repetição do bootstrap, preservação do projeto humano, credencial revogada e estado de acesso inconsistente. Quatro testes específicos de PostgreSQL/navegador foram ignorados pelas condições da suíte.
- **18 contratos GitLab/rede passaram**, incluindo recusa de aceitação no alvo permanente antes de publicação/API, publicação sem workspace recusada e preparação permanente sem fixture.
- Contratos PowerShell de configuração/governança e sintaxe passaram por `sdlc/tests/validate.ps1`.
- Sintaxe Bash dos dois scripts alterados passou. O novo `runtime.sh /opt/agentic-sdlc test` foi executado contra o alvo permanente e recusado pela guarda antes de qualquer chamada Docker ou escrita.
- Testes Python executados em container descartável da imagem já instalada, com código montado somente leitura e SQLite em `/tmp`. Sem volumes, tokens ou banco da instalação. `pytest` foi obtido apenas para o filesystem temporário desse container.
- **Ensaio completo `test-install-package.sh` passou**, com preparação, inicialização em volumes novos, aceite API/backlog/chat, MR/pipeline/merge/deploy local, bloqueio de saída externa, restrições dos papéis PostgreSQL, revogação/rotação de acesso, reinício e repetição do ciclo de entrega, backup cifrado, restauração com comparação de contagens/cadeias de auditoria e integridade Forgejo, rejeição de backup adulterado e encerramento/limpeza dos recursos temporários.
- Antes de executar os cenários sintéticos, uma consulta somente leitura no PostgreSQL temporário confirmou **0 projetos, 0 execuções, 0 propostas, 0 eventos de negócio e 3 identidades**.
- Ambiente do ensaio: `/tmp/sdlc-package-357b74d5-d868-488d-8353-7ac1522a18c3`, portas 3198/3199 e 3278/3279, projetos Compose próprios. Fingerprint do pacote: `be6833ddbe7d962b5f1e3eb2a8d1a9ee60b0fc52933f866715278c201da6f009`. O script terminou com código 0 e removeu a instalação temporária.

Limites: não foram executados upgrade do ambiente permanente, navegador, reinstalação de Windows/reimportação de WSL ou aceitação offline integral. O ensaio usou a distro WSL existente com volumes novos e cenários sintéticos isolados, sem LLM real. O novo portal, agentes de execução e deploy QA/HML/PRD continuam no backlog. Esta entrega modifica as ferramentas de instalação; o ambiente permanente só receberá a mudança após preparação/atualização posterior.
