# Redes privadas — F2a

F2a acrescenta ao instalador quatro redes Docker privadas, compartilháveis pelos módulos futuros por contrato explícito. O código não depende do LAB ou do Portal SDLC. Redes isoladas, identidade, segredos e publicação são etapas distintas: **F2a não conclui F2 nem publica ferramentas na internet**.

## Executar e retomar

Windows, no checkout, com pacote atual aprovado:

```powershell
# Plano sem efeitos; não inicia WSL ou consulta o engine.
.\install.ps1
# Somente até as redes; administrador, na mesma conta Windows.
.\install.ps1 -Action Install -Through Network
# Recorte anterior, sem criação/testes de redes:
.\install.ps1 -Action Install -Through Runtime
```

O recorte `-Through Network` inclui WSL/base, CLI, host, runtime e redes. O padrão agora é `-Through Access`, acrescentando [identidade/cofre/borda F2b](ACCESS.md). O coordenador confere a capacidade da CLI antes do driver. Falha de rede preserva prontidão confirmada do host/runtime e mantém `network_layer_ready=false`.

Mac/GB10, no pacote nativo extraído:

```sh
sh ./install.sh plan
sh ./install.sh install
# Somente redes, após a preparação do runtime:
sh ./install.sh plan --phase network
sh ./install.sh install --phase network
```

`--phase infrastructure` inclui host/runtime/redes; `all` acrescenta F2b. `network` exige recibo anterior do runtime e nova observação do engine/Compose. Windows pode usar essa fase pela entrada Linux instalada, mas o encadeamento normal é `install.ps1`. Shell/Linux solicita sudo; Mac permanece usuário normal. Consultas F0 continuam somente de leitura.

O pool é configurável: `-RuntimePool` no Windows ou `--runtime-pool` no shell. Use os mesmos parâmetros nas retentativas. O padrão é `10.248.0.0/16`; não é necessário ter domínio público.

## Topologia e fronteiras

| Papel | Subnet no pool padrão | Contrato inicial |
| --- | --- | --- |
| `edge` | `10.248.0.0/24` | Base privada para a futura borda; nenhum proxy, porta ou túnel criado nesta etapa. |
| `services` | `10.248.1.0/24` | Comunicação explícita entre serviços compartilhados. |
| `data` | `10.248.2.0/24` | Backend privado de dados; autenticação do banco/cofre continua obrigatória. |
| `executors` | `10.248.3.0/24` | Base dos futuros executores; acesso a modelos/ferramentas dependerá dos gateways e políticas próprios. |

Os nomes são `ai-platform-<hash da instalação>-<papel>`. O resultado do plano/instalador traz os nomes e CIDRs em `networks`. O inventário declarativo ordena host → runtime → redes → serviços. Inferência Metal nativa depende do host, sem exigir a VM Docker.

Cada rede usa bridge IPv4 interna, sem masquerade e sem IPv6. DNS funciona entre containers ligados à mesma rede. Publicações futuras sem endereço explícito recebem o padrão `127.0.0.1`; isso não impede um administrador de declarar outro endereço. F2a não publica portas, modifica hosts/DNS do equipamento, abre firewall, altera daemon, reinicia serviços, conecta aplicações ou migra redes existentes. O Docker conserva a responsabilidade pelas operações normais do driver. A CLI não edita nem limpa regras globais do host.

Pools menores são divididos em quatro subnets; por exemplo, `/24` gera quatro `/26`. A sub-rede não pode sobrepor outras redes do engine, rotas do host Docker ou, no Mac, rotas do host macOS. Rotas das próprias bridges são reconhecidas pelo CIDR e interface. No Mac, a CLI consulta as rotas dentro da VM Colima e no host, incluindo VPNs. Não tenta corrigir uma colisão escolhendo endereços silenciosamente.

Essas redes não são uma política completa de autorização ou isolamento de tenants. Containers na mesma rede podem se comunicar; containers autorizados em várias redes atravessam fronteiras por sua própria aplicação. A F2a não fornece ACL por agente, saída para internet, identidade de usuário, TLS, proteção contra administrador/host comprometido ou políticas de acesso ao MCP. A composição de futuras ferramentas precisa declarar as redes e manter privilégios limitados; autenticação e autorização permanecem nos serviços/gateways.

## Verificação antes de declarar prontidão

A instalação conectada prepara uma imagem oficial BusyBox 1.37.0-musl, fixada por digest específico Linux AMD64/ARM64 no [manifesto](internal/provision/network-images.json). O índice e os manifests foram consultados no registry oficial; tags mutáveis e imagens de arquitetura diferente não são aceitas. Nenhuma imagem é baixada no plano. O pull ocorre apenas na instalação explícita e o cache é preservado.

Depois da criação/reconciliação, o instalador executa containers temporários próprios:

1. Inicia um canário HTTP por rede, sem publicar porta, montar diretórios do host ou receber credenciais.
2. Verifica quatro caminhos permitidos por DNS, com resposta contendo identificador aleatório da tentativa.
3. Verifica os doze caminhos entre redes diferentes por IP observado; todos devem falhar. Erros do Docker/execução não contam como bloqueio comprovado.
4. Confere ausência de rota padrão IPv4 em cada rede.
5. Repete os quatro caminhos permitidos para evitar qualificar um destino que morreu durante a prova.
6. Confirma a remoção dos canários/clientes próprios antes de concluir.

As sondas usam filesystem somente de leitura, usuário 65534, capabilities removidas, `no-new-privileges`, limites de CPU/memória/PIDs e tmpfs pequeno. Nunca usam rede host, socket Docker dentro do container, mounts de aplicação ou serviços humanos como alvo. Testam conectividade TCP/HTTP e rota padrão; não constituem teste completo de segurança ou prova de indisponibilidade de todo acesso ao host.

`network_layer_ready=true` exige todas essas verificações naquela tentativa. Não é monitoramento contínuo. `installation_ready` e `gpu_container_qualified` continuam falsos. A configuração do engine F1d é preservada: se o isolamento não funcionar no ambiente real, o instalador recusa prontidão e informa a causa, sem habilitar encaminhamento/firewall global como reparo automático.

## Propriedade, falha e manutenção

Marcadores e lock continuam os de F1. `network.owner`, `network.resources.json`, `network.intent.json` e `network.probes.json` ficam na raiz de dados da instalação, protegida; ledger/diagnósticos ficam na raiz de controle separada. Esses arquivos identificam propriedade, IDs, digests e recursos temporários; não são backups de bancos ou aplicações.

Nome coincidente não autoriza adoção. IDs confirmados, intenção pendente, identidade aleatória, instalação, perfil, papel, subnet e opções precisam concordar. Retentativa verifica o estado real e reconcilia uma resposta perdida sem duplicar a rede. Journal de sondas permite limpar apenas containers próprios interrompidos. Nome/labels/configuração estrangeiros bloqueiam a operação.

Falha remove somente redes candidatas próprias e vazias; redes previamente confirmadas e endpoints existentes são preservados. Não há desconexão forçada, `prune`, migração de CIDR, remoção de dados ou reset do Docker. Endpoint inesperado ou limpeza não confirmada conserva `UNKNOWN/OBSERVED` e a intenção para diagnóstico/retentativa. Compensação comprovada mantém `FAILED/COMPLETED`, com digest do estado efetivamente restaurado. Mudança de pool/ID/opções numa instalação existente exige migração própria, ainda não implementada.

| Código/condição | Próximo passo |
| --- | --- |
| `PLATFORM_RUNTIME_PREPARATION_REQUIRED` | Executar o instalador completo ou a fase runtime antes de redes. |
| `PLATFORM_NETWORK_SUBNET_CONFLICT` / `PLATFORM_NETWORK_ROUTE_CONFLICT` | Rever pool/VPN/rotas antes da criação; não apagar rede alheia para continuar. |
| `PLATFORM_NETWORK_OWNERSHIP_OR_CONFIGURATION_CONFLICT` / `PLATFORM_NETWORK_UNCLAIMED_RESOURCE` | Conferir identidade, manifesto e rede observada; não tentar adotá-la só pelo nome. |
| `PLATFORM_NETWORK_ALLOWED_PATH_FAILED` / `PLATFORM_NETWORK_ISOLATION_FAILED` / `PLATFORM_NETWORK_EGRESS_ROUTE_PRESENT` | Consultar diagnóstico privado e configuração efetiva do driver/engine; prontidão permanece recusada. |
| `PLATFORM_NETWORK_ROLLBACK_CONFLICT` / `PLATFORM_NETWORK_PROBE_OWNERSHIP_CONFLICT` | Inspecionar o recurso preservado. Remover somente o impedimento identificado e repetir; sem limpeza global. |

As novas ações usam o recorder compartilhado: imagem de prova, preparação de redes e compensação. Pedidos são persistidos antes dos efeitos; autoria observada, correlação, hashes e decisão inaplicável seguem a [auditoria transversal](../sdlc/docs/implementacao-auditoria-2026-10-24.md). Saídas brutas permanecem privadas. Auditoria inválida impede novos efeitos. O ledger local conserva os limites de F1: não é WORM nem protege contra administrador.

## Evidência e próximos módulos

Passaram testes Go isolados nos três perfis, `go vet`, 40 cenários do coordenador Windows e testes do launcher. Cobrem plano sem efeitos, criação, retentativa, perda de resposta, imagem/arquitetura, DNS/provas, conflito de rede/rota/propriedade, preservação de endpoints e compensação confirmada/incerta.

O [workflow](../.github/workflows/validate.yaml) configura também integração com Docker real em runners Linux AMD64/ARM64 descartáveis: imagem fixada, quatro redes, DNS, doze negações, rota padrão, repetição e limpeza própria. Esse teste é opt-in (`PROVISION_NETWORK_INTEGRATION=1`) e não foi executado nesta máquina. CI remota e qualificação Windows/WSL, Mac/VM e GB10 permanecem pendentes. Nenhum recurso real do ambiente humano foi criado/removido durante esta implementação.

[F2b](ACCESS.md) acrescenta identidade, bootstrap de segredos e borda local. Publicação externa depende de domínio/URLs, TLS, caminho de entrada e endurecimento em F2c. `publication` permanece configurável; ausência de domínio mantém a publicação pendente.

Referências: [bridges e DNS Docker](https://docs.docker.com/engine/network/drivers/bridge/), [regras do driver](https://docs.docker.com/engine/network/firewall-iptables/), [imagem oficial BusyBox](https://hub.docker.com/_/busybox) e [fontes da imagem](https://github.com/docker-library/busybox).
