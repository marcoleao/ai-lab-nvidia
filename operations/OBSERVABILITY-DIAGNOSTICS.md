# Diagnóstico dos sinais de observabilidade — F4b

Implementação de 09/11/2026. O `doctor` verifica a chegada das cinco sondas HTTP e da métrica JVM heap da identidade, separadamente da disponibilidade dos backends. Reutiliza a API nativa Grafana/Prometheus; não cria interface no Portal, serviço, porta, receptor, segredo ou coleta adicional.

No pacote nativo, Mac/GB10 ou distro dedicada WSL2:

```sh
sh ./platform.sh doctor --component telemetry --format json
sh ./platform.sh doctor --component grafana
```

No Windows, mesma conta da instalação, PowerShell como administrador:

```powershell
.\platform.ps1 doctor --component telemetry
```

O checkout Windows e a CLI instalada precisam estar atualizados. O transporte conserva a lista permitida de campos e descarta detalhes desconhecidos do provedor. Distro desligada continua sem ser iniciada por consultas. Pacotes atualizados não instalam serviços automaticamente.

## Estados e escopos

Quando a observabilidade foi preparada, `observability.signals` descreve seis fontes esperadas: `http-identity`, `http-secret-store`, `http-grafana`, `http-logs`, `http-metrics` e `identity-jvm`. A lista inclui fontes ausentes; uma coleção parcial não é apresentada como completa.

| Campo/estado | Interpretação |
| --- | --- |
| `api_ready` / `CORE_READY` | Banco Grafana, fontes, dashboard e dois jobs de scrape disponíveis. Não afirma saúde dos endpoints monitorados. |
| `signals_ready` | `true` quando as cinco sondas têm resposta 2xx recente e a métrica JVM foi observada recentemente. Não é gate do SDLC nem prontidão do host/instalação completa. |
| `HEALTHY` / `UNHEALTHY` | Sonda HTTP recente com valor 1/0 de classe 2xx. Somente nesses estados `healthy` contém booleano. |
| `OBSERVED` | JVM heap com amostra recente. `healthy=null`: presença não avalia pressão de memória ou capacidade. |
| `MISSING` | A fonte esperada não apareceu na consulta de valor ou de timestamp. |
| `STALE` | Timestamp da amostra ultrapassa 120 segundos. Um valor histórico saudável não concede saúde atual. |
| `INVALID` | Fonte/instalação divergente, duplicidade, valor inesperado ou timestamp inválido/futuro além da tolerância de 5 segundos. |
| `UNAVAILABLE` | Falha da consulta, resposta inválida/parcial, warning ou valor não finito. Não converte erro em sucesso ou zero. |
| `NOT_OBSERVED` | `status` não consultou métricas, ou o núcleo não estava disponível para a prova. |

`sampled_at` e `age_seconds` aparecem quando a amostra passou pela verificação temporal; dados atrasados/inválidos não recebem saúde projetada. `signals_ready=null` significa que essa prova não foi realizada. A disponibilidade do núcleo pode coexistir com sinais degradados, por exemplo cofre selado respondendo 503.

`doctor --component telemetry` retorna código **2** quando não confirma os seis sinais; `doctor` com escopo `all` também considera essa prova se a camada estiver preparada. `doctor --component grafana`, `metrics` ou `logs` preserva seu diagnóstico de disponibilidade do núcleo, mesmo com fonte degradada. `scope_ready`, `api_ready`, `signals_ready` e `foundation_apis_ready` têm escopos distintos. Consulta concluída continua `SUCCEEDED/COMPLETED`, inclusive quando aponta degradação; o exit code distingue a prontidão técnica. Instalação, qualificação e decisões de negócio permanecem independentes.

## Prova, privacidade e limites

As consultas usam instalação/perfil e instante de avaliação fixos. A idade vem do **valor de `timestamp(métrica)`**, não do timestamp de avaliação no envelope da resposta. Para JVM, usa o menor timestamp dos pools heap ainda presentes, evitando que um pool novo oculte outro atrasado. Isso não comprova a presença de pools já removidos ou um inventário completo da JVM. Para os jobs do núcleo, valores e timestamps precisam ter exatamente um resultado por job; duplicidade, instalação diferente e amostras antigas são recusadas.

Esta é a idade da amostra armazenada no Prometheus. O exporter atual mantém métricas em cache por até 45 segundos e não fornece uma atestação independente do instante da coleta na origem. Batch, scrape e relógios acrescentam atraso; o diagnóstico não mede disponibilidade histórica, filas, perda de eventos ou retenção. Veja as semânticas oficiais de [timestamp](https://prometheus.io/docs/prometheus/latest/querying/functions/#timestamp) e [instant vectors](https://prometheus.io/docs/prometheus/latest/querying/basics/#instant-vector-selectors).

Respostas têm limite de 1 MiB e vetores de até 64 elementos. A projeção só contém IDs de fontes conhecidos, estados, códigos e metadados temporais; não exporta labels, URLs retornadas, queries, pools, mensagens do produto, logs ou conteúdo de agentes. Credenciais privadas usam o transporte local existente. Nenhuma entrada de domínio ou `HistoryEvent` é gravada.

O catálogo existente `PLATFORM_RUNTIME_DIAGNOSED` permanece `read_only`/`none_read_only`; comparação anterior/nova e rollback são inaplicáveis porque não há mutação. Retentativa repete a observação, sem reiniciar serviços, reparar ledger, criar controles ou capturar dados privados. O teste compara o conteúdo de controle/dados antes e depois das consultas. As próprias ferramentas podem registrar o acesso HTTP em seus logs normais.

Esta etapa não altera blueprints ou volumes selados: não exige migração de configuração da observabilidade já preparada. Não instala pipeline de logs/traces, métricas de host/GPU/aplicações, SSO ou publicação externa. A UI operacional continua no Grafana nativo.

## Evidência

Testes isolados cobrem os três perfis, seis fontes, saúde e ausência, amostras antigas com envelope de avaliação atual, relógio futuro, duplicidade, NaN, warnings, resposta de erro, escopo de instalação e projeção sem conteúdo do provedor. Incluem consulta sem escrita e independência entre backend disponível e fonte degradada. O transporte Windows preserva estado/tipos e exclui campos privados. A suíte integral Go e os checks de compilação são reportados na documentação central com seu resultado efetivo.

A integração Docker opt-in da CI passou a exigir a chegada real dos seis sinais HTTP/JVM após preparar os produtos. O código de verificação não representa execução remota comprovada. Serviços desta máquina, hardware, navegador, SSO e internet não foram usados para qualificar esta etapa.
