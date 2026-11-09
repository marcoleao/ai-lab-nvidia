# Preparação do host e runtime — F1c/F1d

Para operação posterior à preparação, use o [ciclo de vida explícito do runtime próprio](RUNTIME-LIFECYCLE.md). Ele mantém engine/VM existentes sem chamar o instalador, com propriedade, auditoria e guardas de workloads. Qualificação real e regressão Go final em ambiente permitido/CI permanecem pendentes conforme esse contrato.

F1c prepara os pré-requisitos do S.O. e verifica acesso à GPU. F1d prepara Docker/Compose e verifica o engine. Windows encadeia WSL2, CLI, host e runtime; macOS e GB10 usam shell com o mesmo coordenador Go. **Código implementado e testado em isolamento; instalação integral nos equipamentos ainda não qualificada.**

## Executar pelo instalador

Use o pacote nativo com SHA-256 aprovado, conforme [CLI-INSTALLATION.md](CLI-INSTALLATION.md). Não é necessário Go no equipamento.

No Windows, na raiz do checkout:

```powershell
# Plano: não baixa, grava controles ou inicia distros.
.\install.ps1
# Execução: administrador, na mesma conta Windows da instalação.
.\install.ps1 -Action Install
# Recortes opcionais:
.\install.ps1 -Action Install -Through Base  # WSL/base Linux + CLI
.\install.ps1 -Action Install -Through Host  # inclui S.O./GPU
```

Este documento cobre F1c/F1d. O padrão é `-Through Origin`, incluindo [redes F2a](NETWORK.md), [acesso local F2b](ACCESS.md) e [origem mTLS F2c2a](ORIGIN-TLS.md); `-Through Runtime` limita ao escopo anterior. `-HostOnly` conserva WSL/base Linux, sem CLI. Código 3010 pede reinício do Windows e repetição do mesmo comando/conta. Não há reinício automático do Windows. Quando o Linux pede reinício, encerra somente a distro própria e verifica novamente; sem `wsl --shutdown`.

No Mac ou GB10, extraia o pacote nativo em diretório estável e execute:

```sh
sh ./install.sh plan
sh ./install.sh install
# Fases separadas:
sh ./install.sh install --phase host
sh ./install.sh install --phase runtime
```

`--phase all` inclui F2a/F2b. `infrastructure` limita a host/runtime/redes. A fase `network` verifica comunicação/isolamento; `access` acrescenta os provedores locais após a preparação da infraestrutura.

O perfil é selecionado pelo sistema/arquitetura: `macos-m3-max` ou `dell-gb10`. O núcleo verifica S.O., arquitetura e distribuição; Linux AMD64 genérico não é aceito como Precision/WSL. Linux solicita elevação por `sudo` na instalação; Mac executa como usuário normal. O plano não solicita elevação. `--config <arquivo>` seleciona configuração e `--installation-id <id>` confere identidade. Repita os mesmos caminhos, identidade e opções para retomar.

Na distro Windows preparada, `sh /opt/ai-platform/core/platform.sh setup --action plan` consulta o plano nativo. A preparação Windows passa por `install.ps1` para coordenar driver, reinícios e recibos externos. `platform.ps1` permanece limitado a `validate`, `inventory` e `plan`, como usuário Linux sem elevação.

## Escopo por equipamento

| Perfil | S.O./GPU — F1c | Runtime — F1d |
| --- | --- | --- |
| Precision Windows/NVIDIA | Preserva driver instalado. Se ausente, usa Windows Update somente para driver Display NVIDIA compatível com o hardware, com checkpoint de reinício. No Ubuntu 24.04/WSL verifica `nvidia-smi` e prepara userland. | Docker próprio no Linux ou consumo de engine existente; CDI no modo próprio. Não instala driver de vídeo Linux no WSL. |
| macOS ARM64 | Verifica macOS 14+, virtualização Apple e suporte Metal observado. Atualizações do S.O./Metal continuam gerenciadas pela Apple. | Docker CLI/Compose, Colima e Lima fixados; VM ARM64 VZ/virtiofs e perfil privados. Inferência Metal permanece no host. |
| Dell GB10 | Exige Ubuntu 24.04 ARM64 e driver NVIDIA do fabricante funcional. Preserva kernel, firmware, CUDA e driver. Prepara userland Ubuntu. | Consome por padrão o engine no socket padrão quando presente; alternativamente cria runtime próprio. Não reconfigura daemon/toolkit do fabricante no modo externo. |

No Ubuntu, instala dependências nomeadas e atualizações confiáveis de `noble-security`. O seletor recusa remoções, dependências não confiáveis/de outra origem e alterações em kernel, firmware, NVIDIA/CUDA ou pacotes do fabricante. Não executa `dist-upgrade`, atualização geral de todos os repositórios ou downgrade automático. Índices APT e pacotes mudam nessa fase explícita. Isso **não declara o host inteiro atualizado**: Windows/macOS, kernel e firmware têm gestão própria. Rootfs importado continua sujeito à atualização e à qualificação física.

## Propriedade e configuração

`--runtime-mode auto` é o padrão. No Linux, um socket Docker padrão presente é consumido como **external**; sem ele, cria engine **owned**. O modo escolhido é persistido e não muda automaticamente nas retentativas. Migração de modo ainda não implementada. Mac usa somente **owned**.

Modo externo consulta engine e declaração de runtime NVIDIA/CDI. Não altera `daemon.json`, serviço systemd, toolkit, contextos, containers ou redes existentes. Engine indisponível ou sem declaração GPU interrompe a fase; não é corrigido silenciosamente.

Linux próprio usa binários estáticos, dados/socket próprios, unidade `ai-platform-docker-<id derivado>.service` e containerd gerenciado pelo Docker. Socket Unix restrito a root, sem API TCP, inclusão no grupo Docker ou alteração no daemon padrão. A unidade espera notificação de prontidão antes de `docker info`. A [coexistência de múltiplos daemons é experimental no Docker](https://docs.docker.com/reference/cli/dockerd/#run-multiple-daemons); o modo automático prefere preservar o engine existente. Coexistência explícita precisa de qualificação física.

O runtime próprio não cria ponte padrão nem modifica iptables/encaminhamento/masquerade. Pool privado padrão `10.248.0.0/16`, com recusa de rotas conflitantes na configuração inicial. Redes dos serviços, saída dos containers, portas, TLS e publicação ficam na camada seguinte. **F1d isoladamente não fornece conectividade externa aos containers nem publica serviços na internet.** Modo externo conserva a rede já administrada no engine.

Mac usa 16 GiB de RAM, 4 CPUs e disco de 80 GiB. Não ativa contexto Docker global, altera `~/.ssh/config`, encaminha agente SSH, monta a home inteira ou habilita Kubernetes/Rosetta. Monta somente o workspace da instalação. Não reduz disco existente.

| Shell/CLI | Windows | Uso |
| --- | --- | --- |
| `--runtime-mode auto|owned|external` | `-RuntimeMode` | Propriedade do engine; external somente Linux. |
| `--runtime-pool 10.248.0.0/16` | `-RuntimePool` | Pool privado; não migra redes existentes. |
| `--memory-gib 16 --cpus 4 --disk-gib 80` | `-RuntimeMemoryGiB`, `-RuntimeCPUs`, `-RuntimeDiskGiB` | Recursos da VM Mac; não alteram `.wslconfig`. |
| `--control-root` / `--data-root` | Padrões no encadeamento Windows | Raízes distintas, sem sobreposição; não mudar após instalar para tentar adotar recursos. |

[Manifesto incorporado](internal/provision/assets.json): Docker 29.9.3, Compose 5.7.0, Colima 0.10.3, Lima 2.3.0 e chave do repositório NVIDIA. Downloads HTTPS com SHA-256 e extração limitada por tipo/tamanho/caminho. Se `nvidia-ctk` estiver ausente no modo próprio Linux, instala somente base/tooling NVIDIA 1.20.1-1 pelo repositório assinado. Preserva toolkit existente.

Instalação conectada baixa artefatos ausentes e permite que Colima obtenha sua imagem aprovada. Operação diária não deve chamar `install`; preparação offline completa permanece pendente. Manifesto diferente não substitui ferramentas já publicadas: upgrade de runtime exige implementação própria. Hash verifica integridade frente à referência aprovada, sem assinatura independente.

## Estado, auditoria e retomada

| Local | Conteúdo |
| --- | --- |
| Windows: raiz em `environments/windows.psd1`, separada da distro | Ledger/checkpoints WSL, CLI, driver; recibos das fases Linux. |
| Linux: `/var/lib/ai-platform-control/<installation_id>` | Lock exclusivo, ledger `admin.jsonl`, recibos e diagnósticos privados. |
| Linux: `/var/lib/ai-platform/<installation_id>` | Ferramentas, cliente, CDI, manifesto e dados do runtime próprio. |
| Mac: `~/Library/Application Support/AIPlatform/{control,data}/<installation_id>` | Controles separados dos dados, pertencentes ao usuário instalador. |

Marcadores vinculam instalação/perfil; dados ficam vinculados à raiz de controle para impedir dois locks independentes. Links e recursos estrangeiros são recusados. Nome de unidade/perfil coincidente não autoriza adoção. Repetir verifica artefatos/estado; configuração saudável inalterada não reinicia engine. Edição externa de configuração gera conflito e é preservada.

O [recorder nativo compartilhado](internal/provision/audit.go) registra catálogo explícito, pedido antes dos efeitos, UID observado, correlação, decisão inaplicável e hashes de código/definição/artefatos/comparação. Windows preserva SID e a mesma correlação. Iniciador humano não é inferido. Saídas brutas permanecem privadas, fora da projeção do ledger. Ledger inválido bloqueia efeitos e não é truncado. A trilha local não é WORM nem protege contra administrador/remoção de sufixo válido.

Falha de configuração tenta restaurar somente arquivos próprios compatíveis com hashes esperados e estado anterior do serviço/perfil. Restauração confirmada resulta em `FAILED/COMPLETED`; restauração/efeito incertos ficam `UNKNOWN/OBSERVED`. Edição concorrente bloqueia compensação. Journal contém hashes; compensação ordinária usa bytes em memória. Não há backup de dados, downgrade, remoção de volumes, prune ou desinstalação automática. Após queda, pode ser necessário repetir a mesma configuração para reconciliar intenção pendente.

Saídas distinguem `linux_base_ready`, `cli_ready`, `host_prerequisites_ready` e `container_runtime_ready`. **`gpu_container_qualified` e `installation_ready` permanecem `false`.** `nvidia-smi`, Metal, CDI declarado e `docker info` não comprovam computação GPU em container, inferência ou carga conjunta. Nenhuma imagem de teste é puxada/executada nessa fase. Ferramentas, observabilidade, APIs de modelos, aplicações e publicação dependem das próximas entregas.

## Evidência desta implementação

- Suíte Go com provedores isolados nos três perfis: plano sem efeitos, retentativa, hashes, lock, propriedade, engine externo preservado, conflito de rede e compensação confirmada/incerta com edição concorrente.
- 36 cenários do coordenador Windows e suíte NVIDIA/Windows Update, sem hardware, COM, WSL ou atualizações reais.
- Seis testes Python do seletor de atualizações, sem APT real.
- Shell: roteamento, argumentos e elevação simulada nos três destinos, pacote fechado, configuração e releases descartáveis. Extração dos três arquivos Docker e do Lima oficiais para conferir layout, sem executar seus binários.
- `go vet`, builds/pacotes Linux AMD64, Linux ARM64 e macOS ARM64. Matriz nativa configurada na CI; resultado remoto ainda não comprovado.

Nenhum driver, WSL, distro, serviço, pacote de S.O. ou runtime real instalado nesta implementação. Qualificação ponta a ponta com reinício, políticas Windows, containers/GPU, VM e coexistência no GB10 permanece pendente nos equipamentos.

Referências: [NVIDIA/WSL](https://docs.nvidia.com/cuda/wsl-user-guide/), [NVIDIA CDI](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/cdi-support.html), [runtime GB10/Spark](https://docs.nvidia.com/dgx/dgx-spark/nvidia-container-runtime-for-docker.html), [Colima](https://colima.run/docs/installation/) e [prontidão systemd Docker](https://github.com/moby/moby/blob/master/contrib/init/systemd/docker.service).
