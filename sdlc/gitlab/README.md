# GitLab local para demonstrações

O código do SDLC continua no GitHub. Repositórios das demos, Issues, Merge Requests,
pipelines, artefatos e aplicação publicada ficam somente no WSL `agentic-sdlc`.
O Forgejo continua atendendo o backlog existente do portal; não há migração automática
entre ele e as Issues de execução no GitLab. Os agentes de geração de aplicações ainda
não estão conectados a este fluxo: o comando `demo` entrega um exemplo executável.

## Preparar e iniciar

Execute na raiz do repositório. O bootstrap instala o núcleo, GitLab e Runner juntos:

```powershell
.\sdlc\bootstrap.ps1 prepare
.\sdlc\bootstrap.ps1 up
.\sdlc\bootstrap.ps1 access -Service gitlab
```

`prepare` usa internet para obter as imagens oficiais e instalar Python no Runner.
Usa os digests oficiais fixados em `images.json`, grava `images.env` e exporta `images.tar` em
`/opt/agentic-sdlc/gitlab-demo`. `up` usa apenas imagens locais, sem build ou pull.
O primeiro início pode levar vários minutos. Reserve até 8 GiB para GitLab,
1 GiB para Runner e espaço para imagens, além dos recursos do laboratório.
`up` mantém uma sessão WSL oculta para impedir que a distro seja encerrada após
o comando terminar e verifica os dois endereços pelo Windows. `down` encerra
a sessão única do SDLC após parar o núcleo, GitLab e Runner.

GitLab: <http://127.0.0.1:3180>, usuário `root`; `access` copia a senha para o
clipboard. Aplicação: <http://127.0.0.1:3181>. As portas são publicadas só no loopback.
Os commits e MRs são criados por `sdlc-demo-bot`; use `root` para revisar na interface.

## Demonstrar o ciclo completo

```powershell
.\sdlc\gitlab.ps1 demo
.\sdlc\gitlab.ps1 verify
# Após revisar o diff, os testes e registrar comentários no GitLab:
.\sdlc\gitlab.ps1 merge -Project demo-NOME-EXIBIDO
```

`demo` cria um projeto privado, uma Issue, branch, commit com código/teste/pipeline e
um MR que fecha a Issue. O Runner executa testes e build no pipeline do MR.
`verify` falha enquanto o pipeline não passar. Revise e comente pela interface web;
novos commits na branch atualizam o MR e disparam novamente o pipeline.
O merge também pode ser feito pela interface do GitLab.

Para entregar código gerado pelo SDLC, gere o projeto em `/opt/agentic-sdlc/workspaces/<nome>/`, na distro do SDLC,
incluindo seu `.gitlab-ci.yml`, e use:

```powershell
.\sdlc\gitlab.ps1 publish -Directory /opt/agentic-sdlc/workspaces/minha-demo
```

Esse comando abre o mesmo ciclo em um novo projeto privado local, preservando a
estrutura dos arquivos. Limita a entrega a 100 arquivos/10 MiB e exclui `.git`,
`.env`, `.secrets`, caches e dependências instaladas. Revise os arquivos antes de
publicar; outros nomes de arquivos podem conter credenciais. O Runner preparado
oferece Bash, Git e Python; outras ferramentas exigem preparação prévia da imagem.

Após o merge, acompanhe o pipeline de `main` e execute o job manual `deploy`.
Ele publica o HTML no volume local servido na porta 3181. O job é manual para
manter a decisão de publicar visível. A versão CE não impõe aprovação obrigatória
de outro revisor: a revisão humana neste roteiro é uma etapa operacional.

O comando `merge` exige o nome da última demo e envia o SHA ao GitLab para impedir
merge se a branch mudar entre consulta e integração. Ele exige pipeline bem-sucedido.
Não há push para GitHub nem rotina de backup. `down` para os serviços e preserva
os volumes para a próxima apresentação; execute `demo` para criar outro projeto.

## Isolamento e limites

GitLab, Runner e servidor da aplicação compartilham uma rede Docker `internal`.
Um proxy Nginx liga essa rede ao acesso HTTP pelo loopback; somente o proxy
participa da rede de entrada. Ele não monta código, secrets ou volumes de trabalho.
Gravatar, cadastro público e verificação de versões são desativados, e a interface
oferece somente Git por HTTP local.
O Runner usa executor shell **dentro de seu próprio contêiner**, sem socket Docker,
sem modo privilegiado e sem montar o repositório do SDLC ou diretórios do host.
Somente código de demos confiáveis deve ser executado nesse Runner compartilhado.
Os builds compartilham seu contêiner e o volume de publicação; não são isolamento
entre usuários ou projetos hostis. Não use imagens, includes, pacotes ou downloads
externos nos pipelines off-line; o modelo usa somente a biblioteca padrão do Python.

Os projetos residem nos volumes do GitLab; os checkouts do Runner ficam no volume
`builds`. Nenhum código de demo é adicionado ao repositório GitHub do SDLC.
A página de publicação é compartilhada: o último deploy executado fica visível.

```powershell
.\sdlc\bootstrap.ps1 status
.\sdlc\bootstrap.ps1 logs
.\sdlc\bootstrap.ps1 down
```

O token administrativo local expira em 300 dias. Secrets ficam em `.secrets` com
permissões restritas no Linux. Para renovar, remova somente o arquivo de token
local e execute `up` (isso cria outro token; revogue o anterior pelo GitLab).
O token do bot também expira em 300 dias e pode ser renovado da mesma forma,
removendo somente `.secrets/bot_token` e executando `up`.

## Aceite técnico

```powershell
.\sdlc\bootstrap.ps1 test
```

Além do aceite do núcleo, cria uma demo descartável e verifica pipeline do MR, merge, fechamento da Issue,
pipeline de main, acionamento do deploy manual e conteúdo HTTP publicado. Também
testa que o Runner não consegue abrir conexão externa por IP. O resultado fica
em `/opt/agentic-sdlc/gitlab-demo/acceptance.json`. Esse teste integra e publica
seu próprio exemplo automaticamente; não registra aprovação humana.

Referências oficiais: [GitLab Docker](https://docs.gitlab.com/install/docker/installation/),
[instalação off-line](https://docs.gitlab.com/topics/offline/quick_start_guide/).
