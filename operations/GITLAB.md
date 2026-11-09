# GitLab como ferramenta da fundação

A fase explícita `gitlab` prepara GitLab CE 19.5.3-ce.0 na Precision Windows/WSL2. Usa a interface nativa, volumes próprios e manutenção comum da plataforma. O Portal SDLC e o Runner continuam consumidores independentes. macOS/GB10 ficam no backlog.

No ZIP que contém esta fase, executar como administrador Windows:

```powershell
.\install.ps1 -Action Install -Through Gitlab
.\platform.ps1 doctor --component gitlab --format json
.\platform.ps1 stop --component gitlab --format json
.\platform.ps1 start --component gitlab --format json
.\platform.ps1 restart --component gitlab --format json
.\platform.ps1 logs --component gitlab --format json
```

O coordenador prepara WSL/base, CLI, host, runtime, redes, acessos, origem mTLS e observabilidade antes do GitLab; prepara o Homepage depois. O padrão `-Through Hub` permanece. No Linux da solução, `sh ./install.sh install --phase gitlab` prepara somente esta fase e exige runtime, redes e acessos existentes. `plan` apenas consulta o plano. Portas vêm de `ports.gitlab` na configuração; o padrão é 3180, com validação de colisões.

A URL local é `http://git.localhost:3180`. O servidor permanece na rede interna `services`; um proxy Caddy próprio liga `services` ao perímetro e publica somente `127.0.0.1`. Não publica portas SSH, PostgreSQL ou Redis. DNS externo, TLS público, SSO, grupos/permissões, SMTP, registro de imagens e execução de pipelines ainda exigem fases próprias. Modo público é recusado com preparação adiada; `gitlab_ready` comprova readiness interno e página de login, sem conceder `installation_ready`, SSO ou publicação.

As imagens de GitLab e Caddy estão fixadas por digest; o catálogo AMD64 do GitLab registra índice, manifesto e configuração verificados no registry. O pacote Omnibus reúne Rails, Gitaly, PostgreSQL e Redis. Sua inicialização exige root dentro do container e filesystem gravável, conforme o [modelo oficial de instalação Docker](https://docs.gitlab.com/install/docker/installation/). A exceção é restrita ao servidor GitLab: capacidades enumeradas no spec, sem modo privilegiado, socket Docker, bind de host, devices ou namespace PID do host. O proxy roda como UID 1000, com imagem somente leitura. O orçamento inicial do servidor é 8 GiB, quatro CPUs, 2.048 processos e 256 MiB de memória compartilhada; a capacidade efetiva da Precision ainda precisa de aceite.

O usuário inicial é `root`. Sua senha é entregue exclusivamente em `gitlab-seed.json`, privado na raiz de controle Linux, e no volume selado de bootstrap; não entra no ambiente do container, recibos, status ou hub. A configuração usa uma referência ao arquivo, seguindo a [configuração do Omnibus](https://docs.gitlab.com/install/docker/configuration/). Após o primeiro acesso, administração de usuários, política de cadastro e rotação da credencial devem ser tratadas antes da exposição externa. Não há criação automática de projetos, contas, tokens ou Runners.

Configuração, dados e logs têm volumes persistentes separados, com labels e marcador de propriedade. Containers, imagens, portas, redes, mounts, comando, ambiente e capacidades são conferidos antes de operar. Recursos legados/divergentes não são adotados. A retentativa conserva senha, volumes e IDs; falha de inicialização para apenas processos iniciados pela tentativa e preserva dados. Compensação não confirmada mantém resultado `UNKNOWN`. Não há backup, restauração, atualização de versão, remoção operacional ou importação de repositórios nesta fase.

Quando preparado antes do Homepage, o GitLab recebe um link para sua interface nativa. Um Homepage já preparado com outro spec exige migração explícita, ainda pendente; a instalação recusa a divergência em vez de reescrever sua configuração.

Auditoria administrativa usa catálogo e recorder compartilhados, fora dos volumes alterados: preparação de credencial, imagens, serviços e compensação. Operações diárias reutilizam o journal comum. Segredos e logs brutos ficam em fontes privadas. A limpeza catalogada `PLATFORM_GITLAB_ISOLATED_TEST_REMOVED` existe somente nos testes descartáveis da CI e valida propriedade antes de remover recursos.

Validação: testes isolados cobrem retentativa, compensação confirmada/incerta, portas ocupadas, drift, projeção sem segredos e operação conjunta servidor/proxy. O gate Docker passa a exigir `TestGitlabWithRealDocker`, além de redes/acessos; sua aprovação precisa constar no relatório do mesmo commit/run do pacote. Esses testes não qualificam a instalação Windows real ou integração do Portal.
