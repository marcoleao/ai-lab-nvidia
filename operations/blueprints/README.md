# Blueprints nativos por responsabilidade

`middleware/` define instalação, imagem/produto, usuário, recursos e estado das ferramentas. `observability/` define o que coletar, fontes, retenção, regras e dashboard nativo Grafana. O coordenador em `internal/provision` aplica esses contratos, sem depender do Portal SDLC.

Arquivos JSON destinados aos leitores YAML dos produtos usam o subconjunto JSON de YAML. Configurações de datasource/provider são materializadas com extensão `.yaml`; não precisam de uma biblioteca YAML adicional no instalador. Prometheus, Loki e Collector validam sua própria configuração antes do startup. Os arquivos são embutidos no binário, identificados por hash no recorder e transportados por volumes nomeados selados; não são arquivos privados gerados nem backups.

Não colocar segredos ou dados simulados nesses blueprints. Ausência de coleta deve permanecer explícita. Atualizar política/especificação de uma instalação existente exige fluxo de migração próprio; alterar o arquivo não autoriza sobrescrever volumes já publicados.
