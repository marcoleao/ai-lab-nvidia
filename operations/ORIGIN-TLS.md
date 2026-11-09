# Origem TLS com autenticação mútua — F2c2a

O executor prepara um Caddy separado em `https://gateway.localhost:9443`, com TLS 1.3, certificado de servidor verificado por CA própria da instalação e certificado de cliente obrigatório. Publica somente no loopback, na rede edge interna. `/readyz` devolve apenas a geração de transporte; todos os outros paths são negados. Não encaminha aplicações, Keycloak, OpenBao ou APIs.

Esta é a fundação comum para **entrada direta e túnel**, ambos mantidos configuráveis. Não instala um túnel, não abre roteador/firewall e não emite certificados públicos. Também não muda domínio, issuer, callbacks ou o acesso local F2b. Entrada pública, TLS público, proteção administrativa, adoção pelos consumidores e qualificação pela internet continuam etapas seguintes da F2c2.

## Instalação e retomada

Windows, com o pacote atual preparado/aprovado:

```powershell
.\install.ps1                              # plano sem efeitos
.\install.ps1 -Action Install               # administrador, mesma conta Windows
.\install.ps1 -Action Install -Through Access # parar antes da origem TLS
```

O padrão passa a ser `-Through Origin`. O coordenador verifica a capacidade da CLI antes de preparar driver/host e encadeia base, host, runtime, redes, acesso e origem TLS. A comprovação TLS ocorre no Linux/WSL. `windows_origin_tls_qualified=false` mantém explícita a ausência de prova do encaminhamento e de clientes TLS no host Windows; não instala confiança ou chaves no Windows para contornar esse limite.

Mac/GB10, no pacote nativo:

```sh
sh ./install.sh plan
sh ./install.sh install
# Somente a origem, após runtime e redes próprios:
sh ./install.sh install --phase origin
```

`all` inclui a origem. `access` continua somente F2b; `infrastructure` continua host/runtime/redes. A fase origin pode consumir runtime/redes já preparados sem depender do cofre/IdP, evitando um ciclo de bootstrap. Imagem Caddy usa os digests AMD64/ARM64 já aprovados; configuração e material são locais. Helpers BusyBox reutilizam o contrato de volumes, com journal `origin.helper.json` separado do acesso F2b.

`publication.mode` permanece `local`. O domínio pode continuar nulo; o hostname privado `gateway.localhost` não é o domínio público futuro. A porta pode ser configurada antes da primeira preparação em `ports.origin-tls` de `environments/platform.json`, sem conflito com as demais portas. Trocar porta de uma geração existente exige migração específica e é recusado. Consultas F0 não leem chaves, escrevem ou comprovam runtime.

## Certificados e confiança

O instalador gera CA e chaves ECDSA P-256, com folhas de servidor e cliente distintas e usos correspondentes. Servidor de origem usa SAN `gateway.localhost`; gerações atuais acrescentam servidor de ponte `ingress.localhost` e cliente técnico `platform-ingress`, separados do cliente `platform-installer`. CA dura um ano; folhas duram 90 dias. A chave de assinatura da CA não é persistida: novas credenciais exigem nova geração. A autoridade local não é um certificado de assinatura de código Windows e não exige aquisição de certificado/serviço corporativo.

`origin-material.json`, no controle nativo privado, contém CA pública, certificados e chaves de servidor/cliente. `origin-pending-material.json` guarda uma candidata enquanto a troca não termina. Linux usa `/var/lib/ai-platform-control/<installation_id>`; Mac usa `~/Library/Application Support/AIPlatform/control/<installation_id>`. No Windows, essa raiz fica na distro dedicada, separada do ledger Windows. Permissões e exclusão mútua são as mesmas do provisionador. Nenhum material entra no Git, nos argumentos dos processos, no resultado JSON ou no ledger.

O volume do Caddy recebe somente configuração, CA pública, certificado e chave do servidor; não recebe chave de cliente nem chave de assinatura da CA. O instalador confia apenas na CA dessa geração para a sonda, sem alterar trust stores do host/navegador, proxy global ou verificação TLS. Um navegador normal sem certificado de cliente não consegue abrir essa origem. A futura integração de túnel/proxy receberá uma identidade própria; o cliente técnico do instalador não é uma identidade humana ou de aplicação.

[F2c2b](INGRESS.md) prepara configurações dos caminhos direto/túnel e exporta somente os certificados/chaves da ponte/cliente de ingresso. Gerações antigas sem essas identidades continuam válidas para a origem, mas exigem rotação explícita antes de preparar ingresso. Nenhum listener/conector é ativado por essa preparação.

O Caddy lê certificados fornecidos e usa `require_and_verify` com trust pool própria. Automação ACME está desabilitada para essa origem, que não tem saída externa. [Certificados e autenticação de cliente no Caddy](https://caddyserver.com/docs/caddyfile/directives/tls).

## Rotação idempotente

Antes de completar 90 dias, escolha um identificador novo de revisão e repita o mesmo identificador nas retentativas:

```sh
sh ./install.sh install --phase origin --origin-revision rotation-one
```

```powershell
.\install.ps1 -Action Install -Through Origin -OriginRevision rotation-one
```

Revisões usam letras minúsculas, números e hífens, começando por letra. Sem revisão explícita, a instalação reutiliza a atual ou retoma a candidata pendente. A revisão inicial é `initial`. Uma revisão nova cria CA, folhas, volume e container de outra geração. A mesma revisão não gera novas chaves em cada execução. Revisões aposentadas são recusadas; uma candidata pendente não pode ser substituída silenciosamente por outra revisão.

A troca usa a mesma porta e pode ter uma breve indisponibilidade: para o processo anterior, prepara/inicia a candidata, verifica TLS, geração, paths negados, recusa de cliente sem certificado e recusa da credencial anterior. Só então confirma recurso/material ativo. Não há serviço de renovação automática ou alerta de expiração nesta entrega; pertencem à operação/observabilidade posterior. Certificado expirado ou com menos de 24 horas restantes bloqueia prontidão até rotação explícita. O resultado inclui `origin_certificate_not_after` em UTC e `origin_certificate_sha256` do DER público, sem PEM/chaves.

Repetir a preparação sem trocar a revisão comprova o mesmo material. Em caso de CA expirada, uma revisão nova gera outra CA. Aposentadoria de geração impede uso do cliente antigo na origem atual, sem prometer revogação universal por CRL/OCSP ou apagamento de todos os exemplares de certificados.

## Propriedade, falha e recuperação

`origin.resources.json` e `origin.intent.json`, na raiz de dados nativa, vinculam geração, revisão, configuração, volume e IDs. Labels, imagem/digest/plataforma, usuário não root, privilégios, rede única, mount somente leitura e publicação `127.0.0.1` são conferidos. Nome coincidente não autoriza adoção. Configuração do volume é verificada por hashes com o primitive compartilhado. Não há mounts do host/socket ou configuração pública de administração.

Uma resposta perdida em create/start é reconciliada por inspeção. Falha de startup/prova tenta parar apenas a candidata iniciada pela tentativa e restaurar o estado de execução anterior. Compensação confirmada mantém FAILED/COMPLETED com o estado resultante observado; sem confirmação, UNKNOWN/OBSERVED. Recursos/configurações candidatos e gerações aposentadas são preservados, sem prune, remoção automática de volumes ou rollback de dados. Não são backup de dados de negócio.

Recursos e arquivos não são uma transação distribuída. Perda de confirmação durante a promoção preserva intenção/material para retomar a mesma geração. Não edite os controles para forçar adoção. Uma falha na escrita do ledger impede efeitos seguintes. Se a restauração não puder ser confirmada, o instalador conserva a incerteza; reinvocar a mesma revisão observa/reconcilia antes de criar outra.

| Código/situação | Tratamento |
| --- | --- |
| `PLATFORM_ORIGIN_CERTIFICATE_RENEWAL_REQUIRED` ou certificado expirado | Rodar a fase origin com revisão nova; planejar a rotação antes dos 90 dias. |
| `PLATFORM_ORIGIN_PENDING_REVISION` | Retomar a revisão pendente; não substituir uma troca sem conclusão. |
| `PLATFORM_ORIGIN_RETIRED_REVISION` | Usar a atual ou um identificador novo, sem reativar revisão aposentada. |
| `PLATFORM_ORIGIN_PORT_UNAVAILABLE` | Identificar o processo que usa a porta; não o encerrar ou mudar firewall automaticamente. |
| `PLATFORM_ORIGIN_PORT_MIGRATION_REQUIRED` | Preservar a porta original; migração de porta ainda não possui executor. |
| Propriedade, conteúdo, recurso ausente ou binding divergente | Preservar controles/recursos e investigar a divergência. Não há reparo destrutivo nem comando de adoção forçada. |

## Auditoria e evidência

Catálogo/recorder nativo registra `PLATFORM_ORIGIN_IMAGE_PREPARED`, `PLATFORM_ORIGIN_TLS_MATERIAL_PREPARED`, `PLATFORM_ORIGIN_TLS_SERVICE_PREPARED` e `PLATFORM_ORIGIN_TLS_COMPENSATED`. Windows registra `PLATFORM_ORIGIN_LAYER_PREPARED`. Pedido precede efeitos; autoria/correlação/fontes, comparação por hashes e resultado seguem o contrato compartilhado. A trilha fica fora dos dados alterados, com os limites locais existentes de integridade, sem WORM/proteção contra administrador.

Testes isolados cobrem os três perfis, plano sem efeitos, retentativa/rotação/revisão aposentada, perda de resposta, falha de promoção, compensação confirmada/incerta, drift e expiração. Sondas TLS reais em servidor efêmero confirmam allow/deny, política permissiva recusada e cliente de outra geração negado. São fixtures sem dados de negócio, sem Caddy/containers reais do ambiente humano. O coordenador Windows tem 53 cenários, incluindo flags e metadados inválidos.

A integração Docker Linux AMD64/ARM64 da CI foi estendida para Caddy real, repetição, rotação e limpeza confirmada de recursos aleatórios próprios. `PLATFORM_ORIGIN_ISOLATED_TEST_REMOVED` existe só para esse cleanup isolado, sem desinstalador público. Execução remota e qualificação física não foram comprovadas nesta entrega.

Limite da verificação final: a execução anterior dos testes de transporte/rotação passou; um caso adicional de cliente antigo já expirado revelou a necessidade de reconhecer o alerta TLS explícito `expired certificate`, além de CA/certificado recusados. O tratamento foi corrigido conforme a implementação TLS padrão. A nova execução desse caso foi bloqueada pelo Application Control ao iniciar o executável temporário de teste Go Windows. Não havia distro WSL em execução e nenhuma foi iniciada. Análise estática e compilação continuam disponíveis; a última suíte Go integral exige reteste em ambiente permitido/CI. Não foi alterada política Windows nem usado executável Windows próprio na distribuição.

Atualização da verificação em F2c2b: a suíte Go integral voltou a executar e passou, incluindo o certificado antigo expirado. O bloqueio acima registra a ocorrência da entrega anterior; não está mais pendente nesta revisão. Nenhuma política foi alterada para obter esse resultado. O coordenador Windows agora cobre 60 cenários, incluindo preparação/adiamento dos artefatos de ingresso.

`origin_tls_ready` comprova somente o transporte local observado pelo adaptador. `external_publication_ready`, `sso_flow_qualified`, `windows_origin_tls_qualified` e `installation_ready` continuam falsos. Não houve provisão de serviços no ambiente humano, backup, alteração de aplicações, resultados de agentes ou dados de negócio.
