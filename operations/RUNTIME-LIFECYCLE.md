# Recuperação e ciclo de vida do runtime

Atualização F4b, 09/11/2026: suíte Go integral/vet e 88 cenários Windows passaram, resolvendo o reteste abaixo sem alterar política. Qualificação do engine/VM e CI real continuam pendentes. [Evidência atual](OBSERVABILITY-DIAGNOSTICS.md).

Atualização F3a/F4a: a regressão Go integral voltou a executar e passou, incluindo a retomada com journals separados; uma fixture precisou normalizar as opções antes de construir sua observação. Nenhuma política Windows foi modificada. A [observabilidade local](OBSERVABILITY.md) é uma camada opcional adicional de workloads que também precisa estar parada antes de desligar o runtime próprio. Qualificação real/CI remota continuam pendentes. O reteste final dos blueprints de observabilidade encontrou novo bloqueio Application Control; a evidência atual está em OBSERVABILITY.md.

Extensão de 08/11/2026 à [operação da fundação](OPERATIONS.md). `start`, `stop` e `restart` aceitam o escopo explícito `--component container-runtime`. Windows/WSL2 e GB10 controlam somente a unidade systemd Docker própria registrada pelo instalador; Mac controla somente a instância Colima/Lima própria já existente. Um engine configurado como `external` é observado, mas sua administração continua externa.

## Recuperar a fundação

No shell do pacote correspondente, com a mesma configuração da instalação:

```sh
sh ./platform.sh status
sh ./platform.sh start --component container-runtime
sh ./platform.sh doctor --component container-runtime --format json
sh ./platform.sh start --unseal
sh ./platform.sh doctor
```

No Windows, PowerShell como administrador, na mesma conta Windows da instalação:

```powershell
.\platform.ps1 status
.\platform.ps1 start --component container-runtime
.\platform.ps1 doctor --component container-runtime
.\platform.ps1 start --unseal
.\platform.ps1 doctor
```

Linux solicita sudo pelo launcher; Mac executa sem sudo. O transporte Windows preserva JSON e correlaciona o recorder Windows com o Linux. `status`/`doctor` não iniciam uma distro desligada. `start`/`restart` podem iniciar a distro própria existente, sob pedido previamente auditado no Windows; isso também permite que os serviços habilitados no boot da distro sejam iniciados pelo systemd. Não há instalação de WSL, recriação de distro ou alteração de Application Control na operação diária.

`start` sem esse componente continua limitado aos serviços. `all` também se refere aos cinco serviços, preservando o contrato anterior. `--unseal` pertence à manutenção dos serviços, não ao runtime; `logs --component container-runtime` não é suportado. Logs do engine/VM e coleta centralizada ficam para a observabilidade.

O retorno acrescenta `runtime` com modo, controlador, estado, propriedade confirmada, disponibilidade da API e hashes de configuração/instância de processo. `scope_ready` identifica a prontidão do runtime quando esse escopo é consultado/mantido; `foundation_processes_ready`/`foundation_apis_ready` continuam referentes à fundação inteira. `doctor --component container-runtime` retorna 0 quando a API do runtime está pronta e o diagnóstico administrativo não está bloqueado por ledger/manutenção pendente; isso pode coexistir com os serviços parados ou o cofre selado. `installation_ready` continua `false`.

## Parar e reiniciar

Pare primeiro os serviços e quaisquer outros workloads existentes no engine próprio:

```sh
sh ./platform.sh stop
sh ./platform.sh stop --component container-runtime
# Para reiniciar um runtime ocioso:
sh ./platform.sh restart --component container-runtime --request-id 0123456789abcdef0123456789abcdef
```

A ação exige API disponível, Swarm inativo e listagem completa dos containers. Somente estados `created` e `exited` permitem parar/reiniciar. Containers rodando, pausados, reiniciando, em remoção ou com estado não aceito impedem a ação. Inventário truncado, inválido ou indisponível também impede a parada. O bloqueio vale para **todos** os containers nesse engine, incluindo os que não pertencem aos cinco serviços. Não há drenagem, kill, down, prune, remoção ou parada implícita de workloads.

Há uma conferência antes do pedido nativo e outra imediatamente antes de parar. O lock coordena os comandos da plataforma; não bloqueia um cliente Docker externo. Assim, o inventário é uma observação pontual, não garantia de quiescência distribuída. Preserve a exclusividade operacional durante a manutenção. Parar o runtime preserva habilitação de boot Linux, configuração, VM e dados; não equivale a desinstalar ou desabilitar autoarranque. No Windows a distro permanece ligada.

## Propriedade, efeitos e falhas

| Verificação | Contrato |
| --- | --- |
| Instalação | Mesma conta/identidade, raízes privadas e lock compartilhados com instalação/manutenção. |
| Arquivos | Ferramentas instaladas verificadas, manifesto com conjunto exato de caminhos/hashes, preparo concluído e ausência de transação de configuração pendente. Não aplica/repara configuração. |
| Linux/WSL | Unidade esperada carregada da localização registrada, sem drop-ins, necessidade de daemon-reload ou unidade transitória. Estados instáveis/metadados inválidos são recusados. Não usa serviço Docker global, enable/disable ou daemon-reload. |
| Mac | Instância Lima com nome/diretório/arquitetura esperados, configuração e discos existentes e regulares. VM ausente exige o instalador; não há criação/reinstalação pela operação. Colima recebe perfil privado e `--save-config=false`. |
| Engine externo | `PLATFORM_RUNTIME_EXTERNAL_MANAGEMENT_REQUIRED`; nenhuma chamada start/stop/restart do controlador. |

A CLI não obtém artefatos, baixa imagens Docker, executa instaladores ou altera versões durante esta etapa. No Mac, `colima start` executa rotinas internas de retomada/provisionamento do fornecedor mesmo para uma VM existente. `--save-config=false` preserva o arquivo configurado, mas não torna essas rotinas somente leitura ou uma operação offline comprovada. A verificação de instância existente impede o caminho de criação de VM; ausência de tráfego/downloads internos e compatibilidade dos discos **ainda exigem qualificação real**. Não há promessa de restauração automática de VM danificada. Referências primárias: [retomada da VM Colima 0.10.3](https://github.com/abiosoft/colima/blob/v0.10.3/environment/vm/lima/lima.go), [partida da aplicação](https://github.com/abiosoft/colima/blob/v0.10.3/app/app.go) e [systemctl 255](https://github.com/systemd/systemd/blob/v255/man/systemctl.xml).

O engine pode retomar containers conforme as políticas de restart já gravadas, inclusive após uma queda anterior. Recuperar a API não qualifica a saúde dos serviços ou o desbloqueio do cofre. Execute o diagnóstico da fundação após recuperar o runtime.

Runtime usa `runtime-operation.intent.json`; serviços conservam `operation.intent.json`. Ambos compartilham lock, recibos `operation-completed/<request-id>.json` e `operation.last.json`, vinculados à configuração confirmada. Se um serviço ficou com manutenção pendente e o engine caiu, `start --component container-runtime` pode recuperá-lo sem sobrescrever o journal dos serviços. Use um request ID diferente daquele pedido. Stop/restart do runtime permanecem bloqueados enquanto houver manutenção de serviços pendente; manutenção de serviços aguarda conclusão de um journal de runtime pendente. O resultado distingue `pending_runtime_maintenance` de `pending_maintenance`; conclua primeiro a recuperação do runtime. Repetir a mesma ação/ID retoma transições e não repete um restart confirmado. Pedido concluído com estado divergente é recusado. Falha de commit após partida é retomada sem nova parada/partida.

Em falha, tenta restaurar apenas o flag anterior de execução do runtime. Compensação confirmada mantém `FAILED/COMPLETED`; compensação incerta mantém `UNKNOWN/OBSERVED` e o journal. A compensação também respeita propriedade e ausência de workloads: não força parada se surgirem containers ativos. Repetir a mesma ação/ID conclui primeiro a compensação pendente. Escritas, sessões, efeitos de boot, mudanças internas do fornecedor ou políticas de restart não são desfeitos. Não há rollback de discos, backup ou reset.

O catálogo nativo acrescenta `PLATFORM_RUNTIME_STARTED`, `PLATFORM_RUNTIME_STOPPED`, `PLATFORM_RUNTIME_RESTARTED` e `PLATFORM_RUNTIME_STATE_RESTORED`, com comparação por hashes de estado/configuração/instância. Windows acrescenta `PLATFORM_WINDOWS_RUNTIME_STARTED`, `PLATFORM_WINDOWS_RUNTIME_STOPPED` e `PLATFORM_WINDOWS_RUNTIME_RESTARTED`. Pedidos precedem efeitos, com autoria observada, correlação de tentativa/manutenção e recorder externo aos dados. Metadados selecionados, sem saída bruta, segredos ou conteúdo de agentes no ledger/resultado; detalhes de falha ficam no controle privado. [Contrato transversal](../sdlc/docs/implementacao-auditoria-2026-10-24.md).

## Evidência e limites

Os testes focados do adaptador passaram nos três perfis durante a implementação, cobrindo observação sem escrita, partida/parada, replay, resposta perdida, propriedade, workloads, compensação confirmada/incerta, commit interrompido, auditoria corrompida e engine externo preservado. A tentativa de regressão integral Go foi bloqueada pelo Application Control no executável temporário `provision.test.exe`; os ajustes finais, incluindo os cenários adicionais de recuperação com manutenção de serviços pendente, exigem execução em ambiente permitido/CI. A política foi preservada. `go vet`, compilação de código/testes para os três destinos, 81 cenários Windows, launcher e pacotes/checksums constituem a verificação local final disponível.

O workflow existente executa esses testes com provedores isolados em Windows/macOS/Linux. Não existe nesta entrega integração systemd/VM real nem comprovação remota da CI. Instalação do host, desligamento/reinício físico, boot no Mac/WSL/GB10, GPU e recuperação da VM ainda não foram qualificados. Nenhum serviço do ambiente humano foi iniciado, parado ou alterado. Publicação, observabilidade, ferramentas, modelos, agentes e aplicações seguem seus próprios itens do backlog.
