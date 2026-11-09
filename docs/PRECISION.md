# Entrega ativa: Precision Windows/WSL2

Decisão de 09/11/2026: concluir a plataforma na Precision. macOS M3 Max e Dell GB10 ficam no backlog; os perfis e adaptadores existentes são preservados, sem exigir sua qualificação para cada entrega Precision. A política executável está em [release-policy.json](../operations/release-policy.json).

## Instalação da fundação

A distribuição `precision-setup.zip` reúne o bootstrap Windows, a CLI Linux AMD64, configuração de referência, checksums e três relatórios aprovados do mesmo commit/run/fontes. Não exige checkout Git, Go ou Python no equipamento de operação. Internet é necessária para os pré-requisitos e imagens; o ZIP não é uma instalação offline dos produtos.

O canal permanente é [Releases](https://github.com/marcoleao/ai-lab-nvidia/releases). Use uma release `precision-<commit>` com os cinco arquivos publicados e compare o hash do ZIP com `precision-release.json`, obtido nessa mesma release. O hash detecta alteração em relação à origem escolhida; não é assinatura independente. Enquanto a primeira execução da nova pipeline não terminar, não há uma release Precision qualificada por esse fluxo.

Extraia o ZIP numa pasta estável, local e sem links de diretório, por exemplo `C:\AIPlatform\setup`. Na pasta extraída:

```powershell
# Plano, sem provisionar o host:
.\install.ps1 -Action Plan
# Instalação: PowerShell como administrador, na mesma conta Windows:
.\install.ps1 -Action Install
```

O padrão agora é `-Through Hub`: WSL2/base → CLI → S.O./GPU → runtime → redes → identidade/cofre/borda → origem mTLS → observabilidade → Homepage. O instalador prepara os componentes ausentes; não exige instalar WSL manualmente. Saída 3010 pede reinício do Windows e repetição do mesmo comando/conta. Retentativas verificam propriedade e estado, preservando recursos existentes. Sem elevação ou diante de restrições de política, o diagnóstico orienta a correção; não desativa Application Control.

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
| Distribuição | ZIP com instalador/CLI/provas, gate de três relatórios, verificação do ZIP real em Windows e publicação permanente condicionada a esses gates | Executar a pipeline nova e conferir os arquivos publicados; instalar pelo ZIP na Precision |
| Host e operação | WSL2/distro dedicada, pré-requisitos, driver ausente via provedor Windows, runtime e auditoria; retomada após reinício em testes isolados | Instalação real pelo instalador, reinício e retomada; validar GPU em container, disco, memória e operação após boot |
| Rede e acesso | Segmentação, Keycloak/OpenBao/Caddy, origem mTLS e configuração dos dois caminhos de ingresso; integração Docker AMD64 comprovada na entrega anterior | SSO integrado, permissões/contas de uso, rotação operacional e ativação pública direta/túnel com aceite externo |
| Ferramentas | Cofre, identidade, Grafana e Homepage preparados separadamente do Portal | Extrair/provisionar GitLab e Runner do legado; Sonar e registro de imagens; configuração, diagnóstico e inclusão das interfaces nativas no hub |
| Observabilidade | Prometheus/Loki/Collector/Grafana; seis sinais HTTP/JVM, dashboard e alertas versionados | Coleta de host/GPU, logs e traces dos serviços/aplicações, retenção e alertas de operação |
| Modelos e governança | Catálogo/contratos arquiteturais; Ollama e consumidores ainda no legado | APIs de inferência com autenticação, quotas e catálogo; gateway de modelos e MCP; políticas por identidade/capacidade, negações e auditoria correlacionada |
| Agentes e replay | Execução SDLC existente ainda ligada ao legado | Runtime separado, consumo das APIs governadas, rastreabilidade de execução, simulação/replay e ferramentas nativas de inspeção |
| Aplicações | Portal SDLC existente como primeira aplicação | Instalação independente sobre os contratos comuns, migração explícita de configuração, acesso/SSO, telemetria e regressão/aceite próprios |

A sequência de implementação é distribuição/host → integração de acesso e middleware → observabilidade → APIs/governança de IA e MCP → agentes/replay → Portal independente. Cada bloco precisa de instalação, `status`/`doctor`, manutenção, retentativa, auditoria e interface nativa quando disponível. A disponibilidade de uma interface não substitui saúde ou aceite funcional.

`installation_ready=false` continua correto: a fundação validada na CI não comprova a Precision instalada nem a plataforma completa. Registrar commit/run/hash, recursos próprios observados e resultados reais de cada aceite, sem alterar dados de negócio ou resultados de agentes para produzir evidência. Backup e roteiro de demonstração permanecem fora desta etapa.

## Evidência de entrega

A [validação da fundação](VALIDACAO_DA_FUNDACAO.md) mantém a prova histórica de seis relatórios/ três arquiteturas. A política atual exige Linux AMD64, bootstrap Windows e Docker AMD64; a publicação exige também o ZIP real aprovado num job Windows. Candidatos e recibos da tentativa ficam nos artefatos da CI. Somente a release final com os cinco arquivos é o canal de instalação permanente.
