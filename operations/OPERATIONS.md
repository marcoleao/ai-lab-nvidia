# Operação e diagnóstico da fundação

Atualização F8a: [Homepage](HUB.md) acrescenta `--component homepage`, com estado próprio em `hub.service`. Quando preparado, `all` inicia o hub depois da observabilidade e para primeiro. O hub só oferece links para as UIs nativas; não executa ações administrativas nelas. `doctor --component homepage` conserva escopo independente da saúde dos destinos.

Atualização F4b, 09/11/2026: [diagnóstico dos sinais](OBSERVABILITY-DIAGNOSTICS.md) acrescenta seis fontes HTTP/JVM, com presença, idade e saúde separadas da disponibilidade do Grafana. `doctor --component telemetry` e o escopo `all` consideram essa cobertura quando a camada foi preparada. `status` não consulta métricas; sinais não observados permanecem explícitos.

Atualização F3a/F4a: [observabilidade local](OBSERVABILITY.md) acrescenta `metrics`, `logs`, `telemetry` e `grafana` à operação quando preparados. `all` mantém esses quatro depois dos cinco serviços básicos; `observability.services` fornece uma coleção separada, com estado/saúde/cobertura próprios. As demais ferramentas, modelos, agentes e aplicações continuam fora da manutenção implementada.

Implementação inicial de 08/11/2026: uma entrada para consultar e manter os cinco serviços básicos já provisionados: `identity-db` (PostgreSQL), `identity` (Keycloak), `secret-store` (OpenBao), `edge` (Caddy de acesso local) e `origin-tls` (Caddy mTLS). A extensão de observabilidade acrescenta quatro componentes opcionais. Demais ferramentas, modelos, agentes e aplicações continuam fora destes comandos. O Portal SDLC permanece separado.

Esta entrega contém código, testes isolados e pacotes. Não comprova instalação no hardware, recuperação após reinício, SSO em navegador ou acesso pela internet. `installation_ready` continua `false`.

Extensão posterior: [recuperação do runtime](RUNTIME-LIFECYCLE.md) por `--component container-runtime`, com escopo, guardas e evidência próprios. O padrão dos comandos desta página continua sendo os cinco serviços; a extensão acrescenta observação do controlador/API e manutenção explícita do engine/VM próprio existente.

## Entradas nas três plataformas

Após a [instalação](README.md), use o pacote correspondente. Não há compilação ou download na operação diária. No Linux, o launcher solicita `sudo` para observar metadados privados e acessar o engine. No Mac, execute com a mesma conta da instalação, sem `sudo`. No Windows, a lógica comum executa em Linux no WSL2, sem executável Windows próprio ou alteração de Application Control.

No Mac/GB10 ou dentro da distro dedicada WSL2:

```sh
sh ./platform.sh status
sh ./platform.sh doctor --format json
sh ./platform.sh stop
sh ./platform.sh start
sh ./platform.sh start --unseal
sh ./platform.sh restart --component edge --request-id 0123456789abcdef0123456789abcdef
sh ./platform.sh logs --component identity --tail 200
```

No Windows, a partir do checkout atualizado, PowerShell como administrador **na mesma conta da instalação**:

```powershell
.\platform.ps1 status
.\platform.ps1 doctor
.\platform.ps1 stop
.\platform.ps1 start --unseal
.\platform.ps1 restart --component edge --request-id 0123456789abcdef0123456789abcdef
.\platform.ps1 logs --component identity --tail 200
```

O transporte Windows retorna JSON. `-Configuration` e `-WindowsProfile` selecionam os mesmos arquivos usados pelo instalador. O pacote Linux instalado também precisa conter os novos comandos; atualizar somente o checkout Windows não atualiza essa CLI. A entrega da CLI continua pelo [instalador verificado](CLI-INSTALLATION.md).

No shell, `--config` e `--profile` selecionam a configuração correspondente. O perfil é inferido do host quando omitido. Preserve instalação, conta, portas, modo de runtime, pool e raízes usados na preparação. A entrada instalada `/opt/ai-platform/core/platform.sh` fixa perfil/identidade e aponta para a release ativa. Um pacote extraído usa sua configuração; diferenças de propriedade/especificação são recusadas.

`status`, `doctor`, `logs` e `stop` não iniciam uma distro WSL parada. Retornam `PLATFORM_WSL_DISTRO_STOPPED`, com serviços `NOT_OBSERVED`. `start`/`restart` autorizam iniciar **somente a distro própria existente**; não instalam WSL ou recriam a distro. O código consulta a lista de distros em execução antes de chamar a distro, conforme os [comandos oficiais WSL](https://learn.microsoft.com/en-us/windows/wsl/basic-commands).

## Contrato dos comandos

| Comando | Comportamento | Limite |
| --- | --- | --- |
| `status` | Observa runtime, redes e identidade/configuração dos cinco containers. Mostra estado, ID, início, exit code e OOM, quando observados. | Não verifica todas as APIs; `SUCCEEDED` indica consulta concluída. |
| `doctor` | Acrescenta discovery/issuer Keycloak, saúde/selagem do OpenBao, prova mTLS/validade da origem, integridade estrutural do ledger e referências de ingresso. | Testes locais; não qualifica navegador, usuário final, GPU ou internet. |
| `start` | Inicia somente containers próprios já registrados, em ordem de dependência. `--unseal` solicita deslacrar o cofre com a recuperação existente. | Não cria serviços, reinstala produtos ou reinicializa o cofre. |
| `stop` | Para o escopo em ordem inversa, preservando containers, volumes e configurações. | Não desliga Docker, Colima, WSL ou outros serviços da máquina. |
| `restart` | Para e inicia o escopo. Em `all`, conclui a parada inversa antes da partida na ordem normal. | Não atualiza imagens ou configurações. Um novo pedido é um novo reinício. |
| `logs` | Captura privada e limitada de **um componente**, com recibo e hash. | Não imprime conteúdo no terminal e não declara histórico completo. |

`--component` aceita `all` (padrão), `identity-db`, `identity`, `secret-store`, `edge`, `origin-tls`, `metrics`, `logs`, `telemetry`, `grafana` e `homepage`; `container-runtime` tem contrato próprio. Define o alvo da manutenção/captura; consultas e respostas preservam os cinco serviços básicos e a coleção separada `observability.services`. `logs` exige um componente específico. O escopo `all` ignora componentes ainda não preparados; um recurso registrado desaparecido ou divergente bloqueia a ação. Parar/reiniciar só o banco exige que `identity` esteja parado; iniciar só `identity` exige banco rodando. Deslacrar somente `secret-store` exige a borda em execução.

A ordem normal é banco → identidade → cofre → borda → origem TLS. Partida de processo não garante prontidão da API: o resultado distingue `foundation_processes_ready` de `foundation_apis_ready`. Após `start`/`restart`, saúde pendente é informada; `doctor` permite repetir o diagnóstico. Falha de API não provoca reinicialização/compensação automática de dados. Sem a origem preparada, os serviços locais podem ser operados, mas a fundação completa continua não pronta.

O engine precisa estar disponível para manter os containers. Se estiver parado, a [extensão de runtime](RUNTIME-LIFECYCLE.md) oferece `start --component container-runtime`, separadamente da partida dos serviços. Runtime indisponível produz `NOT_OBSERVED` para os containers, sem afirmar que não existem. Automação autônoma após reinício e qualificação nos três equipamentos continuam no backlog. A consulta F0 `inventory` continua sendo inventário declarado; ela não observa runtime.

## Interpretação e retomada

| Estado/resultado | Significado e próximo passo |
| --- | --- |
| `NOT_PREPARED` | Preparação ainda não registrada. Usar o instalador da solução para a fase correspondente. |
| `NOT_OBSERVED` / runtime `UNAVAILABLE` | Engine/distro indisponível. Restaurar o runtime existente antes de manter os containers. |
| `STOPPED` | Container próprio parado. `start` pode iniciá-lo. |
| `SEALED` | Cofre inicializado, mas selado. `start --unseal` é a ação explícita; a chave não vai ao terminal/argumentos. |
| `MISSING` / `CONFLICT` | ID, proprietário, configuração ou arquivo de controle divergiu. Preservar a evidência e investigar; não adotar/recriar pelo nome. |
| `TRANSITION` / `UNKNOWN` | Estado não estável ou não confirmado. Consultar novamente e examinar diagnóstico privado. |
| `DEFERRED/WAITING`, código 42 | Outra manutenção detém o lock. Repetir após sua conclusão. |
| Manutenção pendente | Repetir **o mesmo comando, componente, request ID e opção `--unseal`**, informados no resultado. Comando diferente é recusado. Logs continuam disponíveis para diagnóstico. |

`status` retorna 0 quando consegue calcular a observação, mesmo com componentes indisponíveis. `doctor` retorna 2 quando a fundação não está saudável, há conflito ou manutenção pendente; retorna 0 somente para suas verificações locais. Falhas/rejeições administrativas retornam 1. `SUCCEEDED/COMPLETED` não equivale a instalação completa ou publicação. Nos erros, `reason_code` e `operation_id` identificam o diagnóstico, sem imprimir o erro bruto do provedor.

Cada tentativa tem `operation_id`. `--request-id` identifica a manutenção lógica, com 32 caracteres hexadecimais ou um UUID aceito pelo contrato. Reutilizar o ID concluído verifica os IDs/estados e retorna `NO_CHANGE`; não repete um restart. Isso também vale depois de outros pedidos. Pedido concluído com estado atual divergente é recusado. Sem `--request-id`, uma nova ação concluída recebe novo ID. Para uma falha pendente, o journal permite retomar sem fornecer o ID, desde que comando/escopo/unseal coincidam.

O journal registra a intenção antes de cada parada/partida. Uma retomada após partida confirmada não repete a parada do restart. Se ocorrer falha durante os processos, tenta restaurar os flags anteriores de execução. Compensação confirmada retorna `FAILED/COMPLETED`; compensação incerta mantém `UNKNOWN/OBSERVED` e o journal. Repetir conclui primeiro essa compensação, conservando o resultado da tentativa falha; uma nova tentativa será necessária para executar a ação novamente. Sessões, escritas e efeitos de um reinício **não são desfeitos**.

Controle nativo: `operation.intent.json`, recibos `operation-completed/<request-id>.json` e `operation.last.json` ficam na raiz de dados operacional protegida; auditoria e diagnósticos ficam na raiz de controle externa. Arquivos, Docker e ledger não formam uma transação distribuída. Não se promete exatamente uma execução em qualquer falha externa; estados/IDs são reobservados antes da retomada. Não remova journals ou recibos para forçar uma ação.

## Logs e privacidade

`--tail` aceita 1 a 5000 linhas (padrão 200); a captura tem limite de **262144 bytes**, incluindo a saída capturada do provedor. Usa [Docker logs](https://docs.docker.com/reference/cli/docker/container/logs/) com timestamps, sem `--follow` ou `--details`. O driver de logging e a retenção existentes limitam a disponibilidade. `truncated=true` identifica corte por bytes; mesmo sem corte, uma janela por tail não representa histórico completo.

Os arquivos `exports/<request-id>.log`, `.json` e, enquanto pendente, `.intent.json` ficam **no controle nativo privado**, com permissão 0600. No Linux: `/var/lib/ai-platform-control/<id>`; no Mac: `~/Library/Application Support/AIPlatform/control/<id>`. No Windows, esses arquivos ficam dentro da distro dedicada, não em uma pasta pública Windows. O retorno/ledger contém apenas componente, ID, caminho relativo, hash, tamanho e limites. O conteúdo pode conter informações sensíveis e deve permanecer nessa fonte controlada.

Repetir o ID da captura verifica o hash e reutiliza o arquivo; para atualizar a janela, use outro ID. Se a captura foi persistida e houve interrupção antes do recibo, o mesmo pedido conclui a gravação sem buscar novos logs. Alteração de conteúdo ou parâmetros é recusada. Retenção/prune/exportação redigida e envio a backends de observabilidade permanecem pendentes; não há backup nesta etapa.

## Auditoria e evidência

O [catálogo operacional nativo](internal/provision/operations_model.go) é separado do [catálogo F0](command-catalog.json). `PLATFORM_RUNTIME_STATUS_READ` e `PLATFORM_RUNTIME_DIAGNOSED` têm efeito read_only, comparação/rollback inaplicáveis e nenhuma persistência administrativa. Consultas não criam raízes, locks ou entradas no ledger; sondas HTTP/TLS podem gerar os logs normais dos serviços consultados.

O [recorder nativo](internal/provision/audit.go) registra `PLATFORM_SERVICES_STARTED`, `PLATFORM_SERVICES_STOPPED`, `PLATFORM_SERVICES_RESTARTED`, `PLATFORM_SERVICE_STATE_RESTORED`, `PLATFORM_SECRET_STORE_UNSEALED` e `PLATFORM_PRIVATE_LOGS_EXPORTED`. Pedido precede efeitos, com autoria OS observada, correlação da tentativa/manutenção e comparações de hashes dos estados/recibos; não há prompts, conteúdo de logs, tokens ou chaves na projeção. Comparação de unseal cobre inicialização/selagem; não o valor da chave. No Windows, quatro ações correspondentes em [actions.psd1](bootstrap/actions.psd1) e o recorder externo ligam o SID Windows à mesma tentativa Linux antes da chamada que pode iniciar WSL/alterar serviços.

Auditoria indisponível/corrompida impede novos efeitos. `doctor` verifica estrutura, sequência e encadeamento, sem reparar o arquivo. Ledger local não oferece WORM, assinatura independente ou detecção de remoção de sufixo válido por administrador. Não grava `HistoryEvent` nem amplia adoção do SDLC. [Contrato transversal](../sdlc/docs/implementacao-auditoria-2026-10-24.md).

Evidência local: suíte Go integral e vet; provedores isolados nos três perfis para consulta sem escrita, ordem de manutenção, unseal sem reinicialização, idempotência, resposta perdida, retomada de commit, compensação confirmada/incerta, propriedade, ledger corrompido, engine indisponível e captura privada/truncada/adulterada; 75 cenários Windows; launcher POSIX e pacotes dos três destinos. Nenhum serviço do ambiente humano foi iniciado ou alterado.

CI Docker Linux AMD64/ARM64 foi estendida para parada/partida/restart do adaptador da borda e captura/replay de logs, apenas em recursos descartáveis da integração existente. Isso não exercita instalação de host/WSL nem todas as pré-condições de `RunOperation`. Execução remota, qualificação física, autoarranque do runtime, demais camadas e ativação pública ainda não foram comprovados.
