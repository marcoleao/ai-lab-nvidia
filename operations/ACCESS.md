# Identidade, segredos e borda local — F2b

F2b instala Keycloak com PostgreSQL dedicado, OpenBao com armazenamento Raft e Caddy. Usa as interfaces nativas; não cria outro portal de administração e não altera o Portal SDLC ou aplicações produzidas. **Código e testes isolados entregues; execução integral nos equipamentos e navegação SSO ainda não qualificadas.**

## Instalar e retomar

Windows, com pacote atual aprovado, na raiz do checkout:

```powershell
.\install.ps1                         # plano sem efeitos
.\install.ps1 -Action Install         # administrador, na mesma conta Windows
# Parar antes de identidade/cofre/borda:
.\install.ps1 -Action Install -Through Network
```

F2b é selecionada com `-Through Access`; o padrão mais recente é `-Through Origin`, acrescentando a [origem mTLS F2c2a](ORIGIN-TLS.md). O instalador encadeia base/CLI, host, runtime, redes e acesso local. Confere a capacidade da CLI antes de preparar driver/host. A prontidão F2b Windows exige observação dos endpoints pelo host Windows, além das verificações nativas no WSL. Não altera `.wslconfig`, hosts, certificados ou políticas Windows para contornar uma falha.

Mac/GB10, no pacote nativo extraído em diretório estável:

```sh
sh ./install.sh plan
sh ./install.sh install
# Somente F2b, depois da infraestrutura:
sh ./install.sh install --phase access
# Somente infraestrutura, sem os provedores de acesso:
sh ./install.sh install --phase infrastructure
```

`all` inclui infraestrutura, acesso e origem mTLS. `infrastructure` cobre host/runtime/redes; `host`, `runtime`, `network`, `access` e `origin` permitem recortes. Linux instala com sudo; Mac permanece usuário normal. `access` exige runtime e redes próprios já preparados e confere seus IDs/configuração antes de usar as redes. Retomadas usam a mesma instalação, perfil, pool e configuração.

Preparação conectada obtém somente imagens ausentes, por digest. Operação diária completa e preparação offline ainda não estão implementadas; `install` é uma ação administrativa explícita. `platform.ps1` e as consultas F0 continuam somente de leitura.

## Serviços e URLs

| Serviço | Acesso local padrão | Contrato |
| --- | --- | --- |
| Keycloak | `http://auth.localhost:8082` | Realm `platform`, OIDC e administração nativa em `/admin/platform/console/`. |
| OpenBao | `http://vault.localhost:8200/ui/` | Cofre técnico KV v2, login OIDC, políticas e auditoria nativa. Não é gerenciador de senhas pessoais. |
| Caddy | As duas origens acima | Proxy local, API administrativa desativada, sem publicar outros serviços. |
| PostgreSQL | Somente rede de dados | Instância exclusiva do Keycloak, sem porta publicada no host. Usuário de aplicação separado do administrador do banco. |

Portas podem ser definidas antes da primeira instalação no mapa `ports` de `environments/platform.json`, pelas chaves `identity` e `secret-store`. F2b exige portas distintas entre 1024 e 65535. Mudar portas/issuer de uma instalação existente exige migração específica, ainda não implementada.

Somente o Caddy publica portas, explicitamente em `127.0.0.1`. PostgreSQL, Keycloak e OpenBao não publicam portas próprias. O Caddy liga as redes edge/services; Keycloak usa services/data; banco usa data; OpenBao usa services. Executores não recebem conexão ou credencial automaticamente.

O nome canônico do IdP precisa funcionar tanto no navegador quanto no OpenBao. F2b usa `.localhost` no navegador e uma entrada de host apenas dentro do container OpenBao, apontando para o IP privado fixado do Caddy. As sondas do instalador conectam ao loopback, preservando o issuer canônico. Não há alteração do DNS/hosts do equipamento. Comportamento dos navegadores e encaminhamento da VM/WSL continuam sujeitos à qualificação física.

Esta fase usa HTTP restrito ao loopback para bootstrap local. Não instala CA, não solicita certificado de assinatura Windows e não declara transporte público seguro. `publication.base_domain` pode ser armazenado mantendo `mode=local`. `direct`/`tunnel` são recusados pela preparação F2b até a implementação/qualificação da publicação externa. Não há abertura automática de firewall, túnel ou porta pública.

## Identidade e permissões

O realm inicial contém os grupos `platform-operators`, `platform-viewers` e `platform-security-admins`. O usuário técnico inicial `platform-admin` pertence a operators/security-admins e administra somente o realm platform pela interface nativa. Novas pessoas, vínculos de grupo e mudanças de senha usam a interface do Keycloak; repetir o instalador não reimporta nem redefine um realm existente.

O cliente confidencial `openbao` usa Authorization Code, com redirect URIs explícitas. Password grant e service account desse cliente estão desabilitados. OpenBao associa os grupos OIDC às políticas correspondentes:

| Política | Capacidade inicial |
| --- | --- |
| `platform-viewer` | Lista metadados de caminhos; não lê nem escreve valores de segredos. |
| `platform-operator` | Opera segredos técnicos sob `platform/data/services/*` e metadados do mount. |
| `platform-security-admin` | Acrescenta administração dos recursos de identidade/políticas reservados da instalação. É papel privilegiado, não um perfil de usuário comum. |
| `platform-installer` | Identidade de máquina para os segredos técnicos e leitura das configurações necessárias à conferência. Não recebe política root. |

O instalador usa AppRole com credencial privada do equipamento e tokens de curta duração. Configura o KV v2, o provedor/role OIDC e grupos/aliases. A auditoria OpenBao é declarada no arquivo nativo e escreve em volume separado; criação de dispositivos por API permanece desabilitada, conforme o contrato da versão 2.7 ([configuração declarativa](https://openbao.org/docs/configuration/audit/)). Ausência do dispositivo esperado bloqueia o bootstrap, sem habilitar a API como reparo. Confere permissões de leitura/escrita e negação por avaliação de capacidades, cria tokens temporários de prova, revoga-os e observa a recusa posterior. Não cria dados fictícios de negócio para validar permissões.

O endpoint protegido `sys/audit` exige as capacidades `read` e `sudo` para consulta. Elas são concedidas somente nesse caminho ao instalador e ao administrador de segurança, sem capacidades de escrita ou regra curinga de auditoria. Remover essa capacidade, alterar o dispositivo ou perder sua observação bloqueia a verificação; não é interpretado como auditoria pronta.

Credenciais reais de banco/cliente OIDC são armazenadas no cofre. Retentativa compara o conteúdo antes de escrever, usa criação condicional e não gera versões repetidas. Divergência é preservada e recusada, sem sobrescrever uma rotação feita fora do fluxo. Configuração reservada de políticas/roles e artefatos também não é sobrescrita em caso de drift.

Esses grupos não concedem acesso a MCP, modelos ou aplicações por si mesmos. Governança de IA e adoção SSO pelas aplicações permanecem em suas camadas. O Portal legado não passa a ter identidade verificável por consequência da instalação do IdP e não é publicado por F2b.

## Bootstrap e recuperação

Credenciais nunca aparecem no resultado JSON, no ledger compartilhado, nos argumentos dos processos ou no Compose. O arquivo privado `access-seed.json`, na raiz de controle nativa, contém os valores iniciais, incluindo a senha inicial de `platform-admin`. No Linux fica em `/var/lib/ai-platform-control/<installation_id>`; no Mac, em `~/Library/Application Support/AIPlatform/control/<installation_id>`. No Windows essa raiz nativa fica na distro dedicada; o coordenador mantém seu ledger externo Windows separado. A leitura desse material exige a conta/elevação correspondente.

O seed é material de instalação, não uma réplica autoritativa de senhas humanas após mudanças na interface. Não o copie para o Git, para o inventário visual ou para canais compartilhados. A conta master temporária `bootstrap-admin` do Keycloak existe para o primeiro bootstrap; sua remoção/rotação e endurecimento do acesso são gates anteriores à publicação externa. F2b não declara essa conta apropriada para operação pública.

OpenBao é inicializado sem modo dev. O material Shamir de recuperação é gravado em `access-recovery.json`, fora do volume Raft. O token root existe somente durante o bootstrap: após configurar/conferir recursos, o instalador solicita sua revogação, observa a recusa e remove o valor do arquivo. Uma resposta perdida é reconciliada por observação. Retomadas usam AppRole; um cofre selado é deslacrado nessa preparação explícita.

O modelo inicial tem **um nó e recuperação local 1 de 1**, protegida pelas permissões da conta do host. Não oferece HA, separação física das chaves, HSM/KMS ou proteção contra comprometimento administrativo do equipamento. Não há serviço de auto-unseal autônomo no boot: após reinício, repetir a fase access executa a retomada controlada. Essa decisão e o armazenamento de credenciais precisam ser revistos antes de exposição externa. Não há backup de dados nesta etapa.

Se `/sys/init` foi efetivado mas a resposta/material local se perdeu, o instalador **não reinicializa nem apaga o cofre**. Retorna `PLATFORM_SECRET_STORE_RECOVERY_MATERIAL_MISSING`, preservando volumes e intenção. Efeitos remotos e arquivos locais não são uma transação distribuída; não há recuperação inventada para uma chave que não foi recebida/persistida.

## Estado, propriedade e falha

Volumes Docker nomeados transportam configuração e estado sem bind mounts do host. Isso permite o mesmo contrato no WSL, Mac/Colima e GB10. Helpers temporários usam imagem fixada, rede none e somente o volume alvo; não recebem socket Docker nem filesystem do host. Arquivos de configuração têm UID/modo próprios e hashes conferidos. Configuração modificada, links ou arquivos não previstos bloqueiam adoção. Uma cópia parcial compatível pode ser retomada sem apagar o volume.

Os sete volumes separam configuração do banco, dados do banco, configuração do IdP, configuração do cofre, Raft, auditoria do cofre e configuração da borda. Labels, identidade aleatória, intenção, IDs de containers, imagens, privilégios, redes, mounts e bind de loopback são conferidos. Nome coincidente não autoriza adoção. O Compose gerado fica sob `data/access`, sem valores de credenciais ou leitura implícita do `.env` do checkout.

Inicialização usa `--no-recreate` e imagens previamente verificadas. Uma falha tenta parar somente containers próprios que foram iniciados pela tentativa, preservando processos já ativos, volumes e dados. Compensação confirmada mantém FAILED/COMPLETED, com o estado resultante explícito; falha de confirmação mantém UNKNOWN/OBSERVED. Isso não é rollback de banco/realm/cofre. Nenhuma falha usa down com volumes, prune ou reset global.

Recibos distinguem `identity_ready`, `secret_store_ready`, `edge_ready` e `access_layer_ready`. Prontidão local exige APIs esperadas, issuer/callbacks, configuração/permissões, revogações e HTML das interfaces nativas. **`sso_flow_qualified`, `external_publication_ready`, `gpu_container_qualified` e `installation_ready` permanecem falsos.** Não comprova login completo em navegador, MFA, revogação de sessões OIDC de consumidores ou publicação pela internet.

As ações constam do catálogo nativo e Windows e usam recorder compartilhado, com pedido anterior aos efeitos, autoria observada, correlação, comparação por hashes e projeção sem conteúdo secreto. Logs nativos OpenBao usam HMAC, não log_raw. Diagnósticos privados não são a projeção pública. Ledger local não é WORM e não resiste a administrador/remover sufixo válido. [Contrato transversal](../sdlc/docs/implementacao-auditoria-2026-10-24.md).

## Versões e evidência

[Imagens aprovadas](internal/provision/access-images.json): Keycloak 26.8.1, PostgreSQL 17.11-bookworm, OpenBao 2.7.2 e Caddy 2.11.9-alpine. Manifestos e configurações oficiais AMD64/ARM64 foram consultados e fixados por digest. Nenhuma camada de imagem foi baixada ou executada nesta máquina durante a implementação. Pacotes e configurações não efetuam atualização de versão/migração automática de estado existente.

A conferência aceita o ID da configuração no armazenamento clássico e o ID do manifesto específico da arquitetura no armazenamento containerd, mantendo referência, digest e plataforma aprovados. Não aceita o índice multiarch como substituto. Essa diferença de representação está no [código do Docker/Moby](https://github.com/moby/moby/blob/master/daemon/containerd/image_inspect.go) e é coberta nas suítes isoladas de instalação e retentativa dos três perfis.

Suítes isoladas cobrem os três perfis, retentativa, permissões/negação/revogação, revogação root com resposta perdida, cofre selado, material perdido, drift de imagem/binding/política/segredo e compensação confirmada/incerta. O coordenador Windows tem 46 cenários, incluindo reachability do host e recusa de flags de qualificação indevidas.

A CI configura integração opt-in com Docker/Compose reais em runners Linux AMD64/ARM64 descartáveis (`PROVISION_ACCESS_INTEGRATION=1`): redes, quatro serviços, APIs, bootstrap, interfaces, repetição e limpeza de recursos próprios. Não qualifica o instalador de host nem GPU. A execução remota e a instalação nos três equipamentos ainda não foram comprovadas nesta entrega.

[F2c1](PUBLICATION.md) entrega diagnóstico de publicação, requisitos DNS/TLS e comparação de domínio/issuer/callbacks, somente de configuração. Adaptadores de ingresso/TLS, migração e endurecimento efetivo ficam na F2c2; `direct`/`tunnel` continuam bloqueados no instalador. Ferramentas, observabilidade e o Portal SDLC continuam com implantação independente nas próximas camadas.

Referências: [Keycloak em containers](https://www.keycloak.org/server/containers), [hostname](https://www.keycloak.org/server/hostname), [OIDC OpenBao](https://openbao.org/docs/auth/jwt/), [Raft](https://openbao.org/docs/configuration/storage/raft/), [Caddy](https://caddyserver.com/docs/) e [imagem oficial PostgreSQL](https://hub.docker.com/_/postgres).
