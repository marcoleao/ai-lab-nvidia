# Integrações — primeira entrega operacional

Continuação: [conexão de inferência local implementada e validada](inferencia-local-2026-10-20.md). As pendências de rede/provider descritas nesta primeira entrega foram parcialmente atendidas; a assistente de conversa e o worker persistente continuam pendentes.

## GitLab conectado

O portal da porta 3310 está conectado ao GitLab já instalado em 3180. Somente a API participa também da rede externa existente `sdlc-demo_core`. O frontend e o PostgreSQL não foram conectados a essa rede. O GitLab não foi reinstalado ou reconfigurado.

A integração reutiliza a conta técnica local sem privilégios administrativos. A credencial é montada somente na API a partir de arquivo fora do repositório, em `/opt/agentic-sdlc/portal/secrets/gitlab_token`. Não aparece no navegador, nos documentos ou no override Compose. O arquivo tem leitura para o usuário do contêiner; seu diretório no host é restrito a root. O adapter continua aceitando token por variável para instalações que já o usam, mas recusa configurar as duas fontes simultaneamente.

O configurador `sdlc/portal/scripts/connect-gitlab.py`, executado dentro da distro `agentic-sdlc` como root, valida a credencial existente e a rede antes de gravar `.prepared/compose.integrations.json`. Essa configuração é específica da instalação e fica ignorada pelo Git. `sdlc/portal/bootstrap.ps1 up/down/status/logs` incorpora o override quando presente. Para reinstalar esta conexão local, execute o configurador e depois `bootstrap.ps1 up`; o configurador não cria grupos/repositórios nem reenvia jobs automaticamente.

Os jobs pendentes dos itens criados pelo usuário foram retomados pela API, com persona Admin, idempotência e versão esperada. Provisionados:

- Sistema Video Locadora: grupo `sdlc/vl`.
- Catálogo de Filmes VHS: repositório privado `sdlc/vl/vlctfilmes`.
- Cadastro de Clientes: repositório privado `sdlc/vl/vlcdclientes`.

Os dois repositórios têm exatamente um commit de contrato neutro, main protegida sem push direto/force push e zero pipelines, conferidos por consultas reais à API GitLab. Não há código de domínio gerado, build ou deploy. Épicos, Histórias, Tarefas, status e aprovações existentes foram preservados. Novos Sistemas/Projetos passam pelo mesmo job persistente; falhas continuam visíveis e podem ser retomadas pela interface.

## Validação

Build de produção e TypeScript passaram. Cinco testes isolados passaram: quatro contratos do adapter e um de fontes de credencial, incluindo arquivo vazio/inacessível e configuração ambígua. O runner foi executado sem rede e sem banco humano. A API do portal informa GitLab READY e conexão autenticada. A fonte corresponde à imagem preparada. Nenhum segredo foi incluído na imagem.

## Próximas integrações

O Ollama está ativo no laboratório `ai-local-lab`, com catálogo consultado contendo `qwen3:14b`, `qwen3-coder:30b`, `gpt-oss:20b` e `gemma3:27b`. O serviço não publica a porta 11434 no host e não é acessível por localhost na distro SDLC. Não foram alterados modelos, portas, containers ou perfis do laboratório; não houve inferência ou download nesta entrega.

A próxima etapa de SDLC-09/13 é estabelecer um canal restrito entre os ambientes e validar catálogo/protocolo/modelo efetivamente acessíveis pela API. Depois entram provider local e entrevista real, com timeout, cancelamento e respostas estruturadas. A assistente continua explicitamente como prévia de interface até esse fluxo ser implementado. Não há substituição por respostas prontas.

Registry e executor permanecem NOT CONFIGURED. A conectividade GitLab não comprova disponibilidade de Registry OCI, isolamento de execução ou prontidão para deploy. Esses aceites continuam separados.
