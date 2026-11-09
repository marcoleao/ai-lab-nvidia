# Entrega ativa: Precision Windows/WSL2

Decisão de 09/11/2026: concluir a plataforma na Precision. macOS M3 Max e Dell GB10 ficam no backlog; os perfis e adaptadores existentes são preservados, sem exigir sua qualificação para cada entrega Precision. A política executável está em [release-policy.json](../operations/release-policy.json).

## Instalação da fundação

A fase explícita `-Through Gitlab` acrescenta o SCM independente antes do Homepage. [Contrato, comandos e limites](../operations/GITLAB.md). Runner, SSO e exposição pública não fazem parte dessa preparação. 292 testes Go, 102 cenários Windows e três integrações Docker foram aprovados no [run 42695824751](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42695824751). A instalação na Precision ainda está pendente.

A distribuição `precision-setup.zip` reúne o bootstrap Windows, a CLI Linux AMD64, configuração de referência, checksums e três relatórios aprovados do mesmo commit/run/fontes. Não exige checkout Git, Go ou Python no equipamento de operação. Internet é necessária para os pré-requisitos e imagens; o ZIP não é uma instalação offline dos produtos.

O canal permanente é [Releases](https://github.com/marcoleao/ai-lab-nvidia/releases). Use a [release Precision com GitLab](https://github.com/marcoleao/ai-lab-nvidia/releases/tag/precision-98abb9a84f3c714bac7b411b34335e45c955966a), publicada em 09/11/2026. Compare o hash do ZIP com `precision-release.json`, obtido nessa mesma release de cinco arquivos. ZIP público reconferido: SHA-256 `1bea240e5ce70c34eb8b919176436c71026b4f28872353613b627825cc30fcb2`. O hash detecta alteração em relação à origem escolhida; não é assinatura independente.

Extraia o ZIP numa pasta estável, local e sem links de diretório, por exemplo `C:\AIPlatform\setup`. Na pasta extraída:

```powershell
# Plano, sem provisionar o host:
.\install.ps1 -Action Plan
# Instalação: PowerShell como administrador, na mesma conta Windows:
.\install.ps1 -Action Install
```

O padrão agora é `-Through Hub`: WSL2/base → CLI → S.O./GPU → runtime → redes → identidade/cofre/borda → origem mTLS → observabilidade → Homepage. O instalador prepara os componentes ausentes; não exige instalar WSL manualmente. Saída 3010 pede reinício do Windows e repetição do mesmo comando/conta. Retentativas verificam propriedade e estado, preservando recursos existentes. Sem elevação ou diante de restrições de política, o diagnóstico orienta a correção; não desativa Application Control.

Para incluir GitLab numa instalação nova, execute `.\install.ps1 -Action Install -Through Gitlab`: o GitLab entra antes do Homepage. A URL padrão é http://git.localhost:3180, com porta configurável. O plano do ZIP público com `-Action Plan -Through Gitlab` passou localmente como leitura: pacote verificado, WSL disponível, distro da solução ausente e elevação necessária para instalar; nenhum serviço foi provisionado. Homepage já preparado com três links exige migração explícita, ainda pendente.

O pacote é verificado antes das mudanças do host: scripts, TAR, recibo e relatórios precisam corresponder à identidade da release. Configuração não é código: `environments/platform.json` e `environments/windows.psd1` permanecem editáveis e passam pela validação normal do instalador/CLI. Defina identidade, armazenamento e nome da distro antes da primeira instalação; não altere essas referências para adotar recursos de outra instalação. Sem domínio público, mantenha `base_domain: null`. Entrada direta e túnel continuam configuráveis; o instalador ainda não ativa acesso público.

Ao concluir as fases implementadas, o hub é `http://home.localhost:3300`, com links para Keycloak, OpenBao e Grafana. As portas podem ser configuradas. A CLI opera no Linux do WSL2; não há executável Windows próprio. Credenciais e recuperação ficam nas fontes privadas registradas pelo instalador, nunca no ZIP público.

```powershell
.\platform.ps1 status --format json
.\platform.ps1 doctor --format json
.\platform.ps1 doctor --component telemetry --format json
```

Consulte [operação e diagnóstico](../operations/OPERATIONS.md) para privilégios e escopos. O instalador não remove o LAB nem migra suas ferramentas. Não execute os bootstraps legados junto com a nova instalação para completar camadas ausentes; conflitos de portas e propriedade devem ser resolvidos explicitamente.

## Critérios para concluir a Precision

| Bloco | Implementação/evidência disponível | Aceite ainda necessário |
| --- | --- | --- |
| Distribuição | Seis jobs Precision aprovados na CI, três relatórios vinculados, ZIP real verificado em Windows, release permanente com cinco arquivos e download público reconferido localmente | Instalar pelo ZIP na Precision |
| Host e operação | Pré-requisitos, distro dedicada, driver ausente, runtime e auditoria implementados; plano real da Precision aprovado, WSL disponível, distro da solução ausente e elevação necessária para instalar | Instalação real pelo instalador, reinício e retomada; validar GPU em container, disco, memória e operação após boot |
| Rede e acesso | Segmentação, Keycloak/OpenBao/Caddy, origem mTLS e configuração dos dois caminhos de ingresso; integração Docker AMD64 comprovada na entrega anterior | SSO integrado, permissões/contas de uso, rotação operacional e ativação pública direta/túnel com aceite externo |
| Ferramentas | Cofre, identidade, Grafana e Homepage preparados separadamente do Portal; GitLab SCM independente validado em Docker AMD64 | Runner com executor separado, Sonar e registro de imagens; migração do Homepage existente e integrações/SSO dos produtos |
| Observabilidade | Prometheus/Loki/Collector/Grafana; seis sinais HTTP/JVM, dashboard e alertas versionados | Coleta de host/GPU, logs e traces dos serviços/aplicações, retenção e alertas de operação |
| Modelos e governança | Catálogo/contratos arquiteturais; Ollama e consumidores ainda no legado | APIs de inferência com autenticação, quotas e catálogo; gateway de modelos e MCP; políticas por identidade/capacidade, negações e auditoria correlacionada |
| Agentes e replay | Execução SDLC existente ainda ligada ao legado | Runtime separado, consumo das APIs governadas, rastreabilidade de execução, simulação/replay e ferramentas nativas de inspeção |
| Aplicações | Portal SDLC existente como primeira aplicação; regressão corrigida e aprovada com 1.092 testes backend e 686 de navegador | Instalação independente sobre os contratos comuns, migração explícita de configuração, acesso/SSO, telemetria e aceite próprios |

A sequência de implementação é distribuição/host → integração de acesso e middleware → observabilidade → APIs/governança de IA e MCP → agentes/replay → Portal independente. Cada bloco precisa de instalação, `status`/`doctor`, manutenção, retentativa, auditoria e interface nativa quando disponível. A disponibilidade de uma interface não substitui saúde ou aceite funcional.

`installation_ready=false` continua correto: a fundação validada na CI não comprova a Precision instalada nem a plataforma completa. Registrar commit/run/hash, recursos próprios observados e resultados reais de cada aceite, sem alterar dados de negócio ou resultados de agentes para produzir evidência. Backup e roteiro de demonstração permanecem fora desta etapa.

## Evidência de entrega

A [validação da fundação](VALIDACAO_DA_FUNDACAO.md) mantém a prova histórica de seis relatórios/ três arquiteturas. A política atual exige Linux AMD64, bootstrap Windows e Docker AMD64; a publicação exige também o ZIP real aprovado num job Windows. Candidatos e recibos da tentativa ficam nos artefatos da CI. Somente a release final com os cinco arquivos é o canal de instalação permanente.

[Run da distribuição corrigida 42686896308](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42686896308), commit `6a65810b36b65c63b03d5cdcbdc538b807658f2a`: seis jobs Precision aprovados. Fonte SHA-256 `f5dc7f8a90a0f730ad2c6e9b598c3920d8046f6a7424604dbce2f31a794b4d62`; ZIP público SHA-256 `1eacf48aa9242aa8e944a1073c0cfa893c5410f9d467168feb66dbd63611aeaa`. O download foi reconferido e seu `-Action Plan` executado nesta Precision: SUCCEEDED/COMPLETED, `read_only`, pacote verificado, WSL disponível, distro da solução ausente e necessidade de administrador. Não houve provisionamento. A primeira distribuição `f7190400` fica como evidência histórica: seu plano com caminhos omitidos falhava antes da consulta; prefira a release corrigida.

A [regressão completa do Portal](../sdlc/docs/precision-regressao-portal-2026-11-09.md) passou no [run 42683170276](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42683170276), commit `3883b1a8527f638179f8c916d1a7d64e87022392`: 1.092 testes backend e 686 de navegador, sem falhas; quatro integrações reais opt-in ficaram fora. Os commits posteriores da distribuição alteram somente os entrypoints Windows e seu teste, preservando integralmente os fontes do Portal aprovados nessa execução. Essa prova não substitui instalar e integrar o Portal à fundação nova no equipamento.
