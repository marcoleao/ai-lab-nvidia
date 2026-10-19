# Planejamento versionado com Forgejo

O portal permite criar projetos de planejamento e propor outcomes, épicos e histórias. A aplicação de produto e os agentes permanecem em etapas posteriores. A interação humana ocorre em `http://127.0.0.1:3100`, sem editar código, SQL ou issues diretamente.

## Uso e aceitação humana

1. Entre com a chave humana existente. Abra **Criar projeto de planejamento** e informe um nome para o ensaio.
2. Em **Planejamento**, publique um outcome com descrição e meta mensurável, por exemplo: “Cinco cenários de solicitação concluídos pelo humano com histórico correto”.
3. Publique um épico vinculado ao outcome e uma história vinculada ao épico. Informe critérios observáveis, um por linha.
4. Em **Revisar propostas**, confira o **Escopo do planejamento**, os textos e as versões. Informe justificativa e aprove. A decisão aparece com validade para a versão atual.
5. Na história, use **Propor nova versão**, altere um critério e publique. A aprovação anterior deve perder validade. **Consultar versões** conserva os dois textos, sem sobrescrever o primeiro.
6. Use **Conferir fonte do backlog**. Revise e aprove o novo escopo. Nenhuma dessas decisões inicia agente, build ou deploy.
7. Entre como leitor no projeto de demonstração ao qual ele já tem acesso: publicação, edição e reconciliação não devem estar disponíveis. A suíte automatizada também verifica recusas pela API.
8. Reinicie o ambiente e confira a permanência do planejamento e das decisões. Registre resultado e pacote instalado; os testes automáticos não preenchem esse aceite por você.

O responsável administrador pode criar projetos; o criador recebe o papel manager. Contributors propõem itens, readers consultam, approvers humanos decidem e managers também reconciliam. Agentes com papel contributor podem propor, mas não aprovar. A atribuição de membros ainda utiliza a API administrativa existente; não há nova tela de gestão de usuários.

## Fonte canônica e snapshots

Forgejo 15.0.10, variante rootless, é fixado por digest em `locks/images.env`. Cada projeto recebe um repositório privado próprio, criado sob a conta de integração `sdlc-backlog`, sem privilégios de administrador. O serviço utiliza SQLite e arquivos Git no ext4 da distro SDLC; o banco de controle permanece em PostgreSQL.

Cada versão de item gera uma nova issue com marcador determinístico e contrato JSON `backlog-v1`. O ID, chave OUT/EP/US, pai, descrição, meta, critérios e versão ficam no contrato. O controle preserva snapshots e hashes em `work_items` e `work_item_versions`. A API não sobrescreve issues de versões antigas. Essa é a primeira implementação do contrato do piloto: utiliza uma issue por versão e reconciliação solicitada pelo humano; labels, webhooks, importação automática e reconciliação periódica ainda não estão implementados.

Se a gravação no Forgejo concluir e a resposta ou transação local falhar, repetir **o mesmo comando com a mesma Idempotency-Key** recupera a issue pelo marcador. A busca inclui issues fechadas e paginação, recusa marcadores duplicados e conteúdo divergente. O portal conserva em `sessionStorage` apenas a chave de reenvio e um hash da requisição durante uma falha, sem persistir chaves de acesso ou o texto do planejamento nesse armazenamento. A retomada permanece na mesma aba; uma nova aba não compartilha esse estado. Um envio malsucedido pode deixar uma proposta no Forgejo sem snapshot local até a reconciliação por reenvio; não há transação distribuída ou exclusão automática de órfãos.

O escopo é um objeto de aprovação gerado pelo servidor, com referências a todas as versões atuais e seus hashes. Cada criação, revisão ou mudança de estado da fonte atualiza o escopo e sua versão, invalidando decisões anteriores. A API genérica de objetos não permite criar ou alterar objetos com o destino reservado `backlog-scope`.

A aprovação exige uma árvore completa: outcome com meta, pelo menos um épico por outcome e pelo menos uma história com critérios por épico. Antes de aprovar, e ao consultar a validade de uma aprovação, a API confere o conteúdo das issues atuais. Fonte indisponível, item removido/fechado ou conteúdo alterado bloqueia autorização. Rejeitar e revogar continuam possíveis sem disponibilidade do Forgejo.

Uma alteração externa não é importada silenciosamente. A reconciliação marca divergência e atualiza a versão do escopo; uma nova proposta revisada pelo portal cria outra versão da issue e preserva o snapshot anterior. O histórico local não pretende comprovar todos os estados transitórios de uma issue editada e revertida entre verificações. A consulta de validade é uma fotografia: um executor futuro deverá conferir novamente todos os gates antes de qualquer efeito.

## Operação e atualização

A atualização do núcleo anterior utiliza backup antes da preparação:

```powershell
# Na raiz do repositório; operações feitas separadamente, verificando cada resultado.
.\sdlc\bootstrap.ps1 backup
.\sdlc\bootstrap.ps1 prepare
.\sdlc\bootstrap.ps1 up
.\sdlc\bootstrap.ps1 test
.\sdlc\bootstrap.ps1 report
```

`prepare` inclui a imagem Forgejo no acervo offline; `up` aplica a migração aditiva `0006_backlog`, preserva identidades e cria a credencial da integração local. A configuração efetiva do Forgejo tem checksum no manifesto e é montada somente para leitura. Nenhum serviço do laboratório é alterado.

O Forgejo não possui rede externa: permanece apenas na rede Docker interna. O proxy publica sua interface em `127.0.0.1:3101`; essa porta é para diagnóstico técnico autenticado. Não é necessário entrar nela para planejar pelo portal. Não há conta humana padrão no Forgejo. Cadastro público, SSH, Git HTTP, Actions, pacotes, e-mail e OAuth estão desabilitados nesta etapa. Não há runner nem socket Docker montado no controle ou Forgejo.

O token permite `write:user`, `write:repository` e `write:issue` apenas para a conta de integração, sem escopos de administração. O escopo `write:user` é exigido pelo endpoint de criação de repositórios `/user/repos`; não concede administração da instância. O token não é entregue ao navegador e não deve ser copiado para agentes.

Os backups agora pausam os escritores dos dois sistemas, incluem banco/configuração/arquivos do Forgejo e segredos da integração no arquivo cifrado. A chave de cifragem continua separada. `restore-check` verifica PostgreSQL em banco temporário e, para Forgejo, hashes dos arquivos, integridade SQLite e contagens em cópia privada. Não inicia uma segunda instância Forgejo nem substitui o ambiente ativo; recuperação operacional completa continua pendente. O orçamento de plaintext do backup permanece 256 MiB.

Limites do primeiro fluxo: 100 itens por projeto, 20 critérios por item, 500 caracteres por critério, busca de até 5.000 issues por publicação e prazos limitados para consultas da fonte. Tipo e pai de um item são imutáveis. Arquivamento, dependências entre histórias, comparação visual lado a lado e filtros por labels ficam para evolução; não há exclusão de histórico pela interface.

## Evidências técnicas

- Testes PostgreSQL: hierarquia, isolamento entre projetos, permissões, auditoria, versões, aprovação obsoleta, falha após commit remoto, reenvio sem duplicação e fonte externa alterada/indisponível.
- Chromium: formulários dos três níveis, decisão humana, nova versão, invalidação do aceite, reconciliação, conteúdo HTML exibido como texto, sessão/logout e viewport móvel.
- Ensaio descartável de instalação: utiliza o Forgejo real e verifica conta não administrativa, repositórios privados, issues, edição externa sintética, reinício, backup e restore-check. O resultado final de cada execução deve ser conferido no console.

Referências oficiais consultadas: [imagem e instalação Docker](https://forgejo.org/docs/v15.0/admin/installation/docker/), [escopos de tokens](https://forgejo.org/docs/v15.0/user/authentication/token-scope/) e [CLI](https://forgejo.org/docs/v15.0/admin/command-line/).
