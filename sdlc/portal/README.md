# Portal SDLC — fundação

Prévia local separada do portal legado: hierarquia, status, aprovação de planejamento, tarefas, arquivamento e histórico básico. A instalação inicia vazia. Não executa pipeline, agentes, build ou deploy.

Na raiz do repositório, em PowerShell administrativo na conta da instalação:

```powershell
.\sdlc\portal\bootstrap.ps1 prepare
.\sdlc\portal\bootstrap.ps1 up
.\sdlc\portal\bootstrap.ps1 doctor
```

Abrir **http://localhost:3310**. Selecione explicitamente uma persona para atuar. `prepare` precisa de internet; `up` não constrói nem baixa e recusa fontes/imagens alteradas após a preparação. A distro SDLC deve estar instalada; o comando não instala outra distro ou altera o laboratório. O novo banco tem volume próprio. `down` preserva esse volume.

```powershell
.\sdlc\portal\bootstrap.ps1 status
.\sdlc\portal\bootstrap.ps1 logs
.\sdlc\portal\bootstrap.ps1 down
```

Configuração opcional: copie `.env.example` para `.env` **neste diretório**. GitLab exige URL alcançável de dentro do container e token com permissão para criar os grupos/projetos gerenciados. `localhost` dentro do container não é o Windows ou outro container. O bootstrap não lê tokens antigos automaticamente. Tokens não vão ao navegador. Sem configuração, o usuário pode planejar e a integração fica visivelmente pendente. Nunca use a seleção de persona como autenticação corporativa; este modo é somente local.

Operação equivalente no Linux/WSL, após preparar a imagem:

```bash
python3 scripts/prepared.py verify
docker compose up -d --pull never --no-build
docker compose down
```

Para desenvolvimento com Node 24 e pnpm 12.14.0, configure `DATABASE_URL` para seu PostgreSQL próprio, `DEMO_MODE=true`, `PORTAL_ORIGIN=http://localhost:3000` e `API_BASE_URL=http://127.0.0.1:4100`. Instale por `pnpm install --frozen-lockfile`, aplique `pnpm db:generate && pnpm db:setup` e execute `pnpm dev`. Não aponte para o banco legado.

## Testes

Unitários/integração usam exclusivamente `TEST_DATABASE_URL` terminando em `/portal_test`, com schema preparado em instalação descartável. `pnpm test` cobre estado vazio, hierarquia, papéis, idempotência concorrente, aprovações, status, versão, arquivamento, histórico imutável e adapters. `pnpm build` valida TypeScript e produção web. `pnpm test:e2e` usa Chromium local contra serviços de teste e confirma o modo de banco antes de criar dados. Capturas vão para `test-results/screenshots` ou `SCREENSHOT_DIR`. Não executar esses testes na prévia humana.

O ensaio real do GitLab está em `scripts/test-gitlab-provider.sh`: exige contêiner de build isolado com código/dependências, cria seu próprio GitLab temporário, verifica reuso, contrato neutro e main protegida, e limpa os volumes. Exige recursos/internet na preparação; não usar durante a apresentação.

Veja [decisões](docs/DECISIONS.md), [arquitetura](docs/ARCHITECTURE.md), [roteiro humano](docs/DEMO_GUIDE.md) e [revisão UX](../docs/ux-fundacao-2026-10-20.md). Migração do legado, recuperação do banco novo e pipeline completo continuam no plano.
