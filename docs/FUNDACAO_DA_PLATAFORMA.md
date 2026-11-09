# Fundação da plataforma local de IA e engenharia de software

Data: 07/11/2026.

**Escopo ativo revisto em 09/11/2026:** concluir na Precision Windows/WSL2. macOS M3 Max e Dell GB10 ficam no backlog, com código/perfis preservados. O [guia Precision](PRECISION.md) define instalação, critérios de aceite e sequência restante. A política de release passa a exigir três relatórios Precision e a verificação do ZIP real em Windows; os seis relatórios e três destinos citados abaixo são a evidência histórica da entrega anterior. O instalador Windows padrão agora inclui observabilidade e hub (`-Through Hub`). A [release Precision](https://github.com/marcoleao/ai-lab-nvidia/releases/tag/precision-f7190400c5623d937b6a409a7c94c4550859f08a) foi publicada após os seis jobs da entrega aprovados no run 42660370192; instalação física e plataforma completa permanecem pendentes.

Status em 09/11/2026: F0 parcial, F1a–F1d, F2a/F2b, F2c1/F2c2a/F2c2b, operação dos serviços/runtime e núcleo F3a/F4a implementados em código; F4b acrescenta prova dos sinais HTTP/JVM. F8a implementa o hub Homepage nativo, com três links locais e manutenção própria, separado do Portal SDLC. Testes nativos passaram na CI em Linux AMD64/ARM64 e macOS ARM64; 95 cenários Windows, testes dos provedores GPU e dez contratos Python passaram sem executar Go no Windows ou mudar Application Control. A [execução final](VALIDACAO_DA_FUNDACAO.md) passou nos nove jobs da fundação, incluindo integrações Docker AMD64/ARM64 e publicação dos três pacotes após os seis relatórios vinculados. Qualificação WSL/equipamentos, navegador, SSO e publicação externa permanecem pendentes. Autoarranque, demais ferramentas/coleta/IA/agentes/aplicações continuam no backlog. Não se declara implantação no ambiente humano ou instalação completa.

Validação de desenvolvimento: [comandos e evidências](VALIDACAO_DA_FUNDACAO.md). Checks estáticos, bootstrap Windows e execução nativa ficam separados; a política ativa exige os três relatórios Precision aprovados do mesmo código. A publicação anterior no branch de CI foi autorizada e executada. A evidência identifica commit, run, fontes, escopo e limitações; os registros históricos abaixo não substituem esse estado atual.

## 1. Escopo confirmado

- Evoluir o projeto para uma plataforma provisionada e configurada como código, com infraestrutura, ferramentas, serviços de IA, runtime agêntico e aplicações separados.
- Incluir Aplicações como camada explícita da fundação, começando pelo Portal SDLC. Cada aplicação consome os serviços compartilhados e mantém identidade, configuração, dados e ciclo de vida próprios.
- Atender Windows Precision com NVIDIA, macOS M3 Max com 128 GB e Dell GB10 por perfis explícitos. Suporte só é declarado para a combinação efetivamente validada.
- Não exigir certificado próprio de assinatura de código Windows. A operação comum no Windows usa ferramentas Linux dentro do WSL2; shell portátil fornece a mesma entrada no Mac e no GB10.
- Incluir os pré-requisitos no instalador da solução. No Windows, ele provisiona WSL2 e uma distro dedicada, com retomada após reinício; o usuário não precisa preparar manualmente esse ambiente. A implementação e os testes do instalador não incluem provisionar o host por comandos avulsos nesta sessão.
- Preparar acesso externo pela internet, com identidade, autorização e publicação configuráveis. O domínio público ainda não existe; sua ausência não impede a instalação local.
- Disponibilizar modelos por APIs governadas e ferramentas por contratos de capacidades, incluindo MCP.
- Entregar observabilidade, dashboards e operação visual aproveitando as interfaces nativas das ferramentas.
- Autorizar o descarte dos dados atuais do LAB durante a reorganização, sem gerar backup nesta etapa. Nenhuma exclusão é executada por este documento; os recursos-alvo precisam ser identificados antes de qualquer limpeza. Essa autorização não amplia automaticamente o escopo para aplicações produzidas, dados de negócio ou outros ambientes.
- Tratar backup em capítulo posterior. Backup e restore-check não são gates novos desta fundação.
- Manter roteiro de demonstração, apresentação comercial e novos cenários de negócio fora do escopo atual.

## 2. Limites das camadas

| Camada | Responsabilidade e limite |
| --- | --- |
| Host / S.O. | Pré-requisitos, virtualização, drivers, relógio, disco e adaptadores específicos do equipamento. O instalador inclui a preparação de WSL2 e da distro dedicada no Windows. |
| Acessos | Identidades humanas e técnicas, autenticação, autorização, certificados e referências de segredos. |
| Redes e borda | Segmentação, DNS, endpoints internos/públicos, TLS, proxy ou túnel, firewall e políticas de entrada/saída. |
| Plataforma | Runtime de containers, armazenamento persistente, inventário, capacidade e operação compartilhada. |
| Middleware | Instalação e ciclo de vida das ferramentas compartilhadas, com estado e proprietário explícitos. |
| Observabilidade | Coletores, instrumentação, transporte, consultas, dashboards, retenção e alertas. |
| Serviços de IA | Runtimes de inferência, pesos, catálogo, APIs, limites e qualificação de modelos por tarefa/equipamento. |
| Runtime agêntico | Identidade de execução, capacidades, executores isolados e adapters para modelos, ferramentas e simulação. |
| Aplicações | Aplicações mantidas sobre a plataforma, começando pelo Portal SDLC: interface, API, workers de domínio, regras de negócio, dados e ciclo de vida próprios. |

Infraestrutura não depende de arquivos ou ciclos de vida internos do SDLC. Consumidores recebem contratos de serviço por configuração, sem descobrir endereços por nomes fixos de containers ou caminhos de outra camada.

A instalação da ferramenta pertence ao middleware; seus dashboards, regras e pipelines de coleta pertencem à observabilidade. A configuração de acesso pertence à camada de acessos. Cada recurso tem um responsável único.

O Portal SDLC é a primeira aplicação da plataforma. Seu domínio conserva aprovações, gates, filas/intenções duráveis e auditoria do processo; o runtime agêntico fornece capacidades de execução compartilhadas. Separar API e workers em processos não transfere as regras do SDLC para o runtime genérico.

Estrutura-alvo, ainda não criada/migrada:

```text
infra/{host,access,network,runtime}/
middleware/
observability/
ai/
agentic/
apps/{sdlc,vscode}/
governance/ai/
environments/{precision-windows,macos-m3-max,dell-gb10}/
operations/
docs/
```

## 3. Componentes da fundação

As escolhas abaixo são recomendações técnicas, não uma declaração de ferramentas instaladas. Fixar versões, licenças, imagens e dependências por perfil antes da adoção. Dimensionar a combinação completa de serviços; instalação bem-sucedida de componentes isolados não comprova capacidade conjunta.

| Capacidade necessária | Base recomendada | Condição de adoção |
| --- | --- | --- |
| Provisionamento local | Configuração declarativa, Compose modular e adaptadores idempotentes por S.O. | Plano, dependências, propriedade dos recursos, retomada e operação com artefatos preparados. OpenTofu apenas onde houver provider adequado. |
| Identidade | Provedor OIDC, candidato Keycloak | Autenticação humana e técnica, revogação e permissões verificadas em cada serviço. SSO depende do suporte da versão/edição da ferramenta. |
| Publicação | Proxy de borda, candidato Caddy; túnel configurável conforme conectividade | URLs canônicas, certificados, proxies confiáveis, callbacks e políticas distintas para aplicações e administração. |
| Segredos | OpenBao técnico, preparação local F2b implementada | KV v2, AppRole, OIDC, grupos/políticas e auditoria nativa. Bootstrap privado sem dependência circular; recuperação local 1 de 1 e endurecimento/publicação ainda a qualificar. Gestão de senhas humanas é um requisito separado. |
| Código e entrega | GitLab e Runner, presentes na implementação atual | Ciclo de vida separado do Portal, URL pública/interna declaradas e credenciais limitadas. Inventariar vínculos legados antes de remover qualquer ferramenta existente. |
| Qualidade | SonarQube, edição/imagens a qualificar | Integração real ao pipeline, critérios explícitos e evidência por revisão. Não substituir gates atuais sem adoção registrada. |
| Artefatos | Registry OCI e armazenamento de artefatos, preferindo capacidades já existentes | Referências por digest, preparação offline e separação entre artefato de ferramenta e aplicação produzida. |
| Gateway de IA e MCP | agentgateway OSS standalone | Identidade verificável, modelos permitidos e autorização por servidor/ferramenta. Validar compatibilidade com o relay atual antes de substituí-lo. |
| Métricas e logs | OpenTelemetry Collector, Prometheus, Loki e Grafana | Pipelines, fontes, retenção, capacidade e controle de acesso configurados como código. Exporters adicionais somente conforme necessidade e suporte. |
| Traces de IA | Langfuse self-hosted | Instrumentação de runtime/gateway, correlação e conteúdo sensível controlado na origem. Orçar suas dependências e validar a edição adotada. |
| Entrada visual | Homepage configurado | Catálogo de serviços, estados e links. Não recebe credenciais administrativas para executar ações nas ferramentas. |
| Aplicações | Portal SDLC como primeira aplicação | Implantação e configuração próprias; UI, API, workers de domínio e dados identificados; integração com identidade, ferramentas, IA e observabilidade pelos contratos da plataforma. |
| Simulação/replay | Kitaru como candidato em piloto isolado | Adaptador do runtime, interceptação de ferramentas, isolamento e falha fechada para chamadas sem gravação ou fixture correspondente. |

Portainer é opcional para manutenção especializada. Seu eventual uso precisa respeitar a propriedade dos recursos e a fonte de configuração no Git; não deve criar uma segunda autoridade de instalação ou atualização. A edição CE não comprova RBAC granular de somente leitura.

Um backend geral adicional de traces só será incorporado se a cobertura necessária não for atendida pelo destino qualificado. Evitar duplicar armazenamento e ingestão sem demanda comprovada.

## 4. Contratos compartilhados

### Configuração e publicação

Cada instalação declara perfil, serviços habilitados, dependências, limites, armazenamento, endpoints internos, URLs públicas e referências de credenciais. Pesos, bancos, segredos, artefatos gerados e evidências privadas permanecem fora do código versionado.

Contrato de publicação implementado para validação e planejamento em [environments/platform.json](../environments/platform.json), ainda sem executor de publicação:

```json
{"publication":{"mode":"local","base_domain":null,"public_urls":{}}}
```

Domínio ausente significa publicação externa pendente, sem exposição automática. A alteração posterior de URL gera um plano de reconciliação de DNS, TLS, proxy, origens, callbacks, issuer/audience, GitLab e links. Identidades de instalação e serviço não dependem do domínio.

[F2c1](../operations/PUBLICATION.md) implementa `publication` como consulta sem efeitos, com candidatos armazenados também no modo local, requisitos DNS/TLS, exclusões privadas, política projetada de rotas e comparação via `--previous-config`. Distingue endereço configurado de runtime observado, informa mudanças de issuer/callbacks locais conhecidos e consumidores declarados fora do escopo. Não inventa contratos de consumidores, alvos DNS, certificados ou prova externa. O instalador continua bloqueando preparação externa até F2c2.

Resolução de nomes e confiança dos certificados devem funcionar no host, WSL/VM, containers e clientes externos conforme o caminho de acesso. O primeiro provisionamento usa fontes e artefatos independentes dos serviços ainda não criados, evitando dependência circular de GitLab, registry, identidade ou cofre.

Interfaces web e APIs autorizadas entram por HTTPS; administração e serviços privilegiados recebem caminho de rede autenticado próprio. Entrada externa, downloads de preparação e saída dos executores são políticas independentes.

### Perfis e capacidade

| Perfil | Estratégia-alvo | Evidência necessária |
| --- | --- | --- |
| Precision Windows/NVIDIA | Host Windows, WSL2 e inferência CUDA | Host e WSL medidos separadamente; driver/GPU e memória sob carga qualificados. |
| macOS M3 Max | Inferência nativa Metal e serviços compatíveis em VM/containers ARM64 | Host e VM medidos separadamente; orçamento da memória unificada inclui S.O., modelos e ferramentas. |
| Dell GB10 | Linux ARM64 e stack NVIDIA compatível com o sistema do fabricante | Imagens e bibliotecas qualificadas para ARM64/Blackwell; campos de telemetria comprovados no equipamento. |

Não aplicar automaticamente o orçamento atual de 32 GiB/16 GiB aos demais perfis. Emulação não equivale à qualificação nativa. A prontidão diferencia modelo instalado, inferência funcional e agente qualificado para a tarefa.

### Operação

Uma entrada operacional comum coordena módulos independentes: plano, preparação, configuração, início/parada, estado, diagnóstico, logs e atualização. A CLI e as interfaces visuais consomem os mesmos contratos.

O ponto de entrada comum é `sh ./platform.sh ...`, com shell portátil e núcleo Go: Linux AMD64 no WSL2, macOS ARM64 e Linux ARM64. Go é dependência de build; a operação usa pacotes preparados, sem `.exe` Windows próprio/certificado. [install.ps1](../install.ps1) implementa F1a/F1b (WSL2/base e CLI) e encadeia [F1c/F1d](../operations/HOST-RUNTIME.md) (S.O./GPU e runtime). Mac/GB10 usam [install.sh](../install.sh). Windows Update prepara somente driver NVIDIA ausente; Ubuntu recebe pré-requisitos/segurança de userland, preservando kernel/firmware/driver do fabricante. Runtime automático preserva/consome engine Linux existente; caso contrário cria engine próprio. [platform.ps1](../platform.ps1) mantém consultas pela mesma conta Windows, como usuário Linux sem elevação. `validate`, `inventory` e `plan` continuam sem rede/escrita; `setup --action install` é preparação administrativa explícita com recorder/lock próprios. F2a acrescenta redes privadas, DNS e provas de isolamento após o runtime, com preservação de recursos existentes. F2b acrescenta provedores locais de identidade/cofre/borda. Publicação, demais camadas e qualificação física continuam pendentes; os instaladores legados mantêm seus caminhos atuais.

Preservar preparação explícita com internet e inicialização com artefatos locais, sem downloads implícitos. Mudanças privilegiadas de configuração são fases identificadas; inicialização diária não deve refazer conexões e instalar executores silenciosamente.

Exigir exclusão mútua de manutenção, drenagem de trabalhos ativos, checkpoints, autoria/correlação e retomada por componente. Diagnóstico informa causa, dependência, última etapa concluída e próximo passo; não apaga volumes nem repara silenciosamente. Atualizações precisam declarar validação, compatibilidade de estado e compensação possível, sem prometer rollback universal de dados.

### Aplicações e primeiro produto: Portal SDLC

Cada aplicação declara identidade e proprietário, versão/artefato, perfil e ambiente de implantação, dependências, configuração, endpoints internos/públicos, permissões, referências de segredos, dados/migrations, verificações de saúde e instrumentação. O inventário e a operação comum usam esse contrato sem impor um banco ou modelo de negócio único.

O Portal SDLC é a primeira adoção desse contrato, com frontend, API e workers do domínio identificados e operáveis separadamente. Consome identidade, modelos, runtime agêntico, GitLab, qualidade e artefatos por interfaces configuráveis; conserva a propriedade de suas decisões, dados, migrations e auditoria de domínio. Seu provisionamento não se torna responsável por instalar ou manter os serviços compartilhados.

A camada permite incorporar outras aplicações futuramente sem acoplar sua instalação ao Portal SDLC. `apps/` reúne aplicações mantidas neste repositório. Aplicações produzidas pelo SDLC continuam em seus repositórios GitLab, artefatos e ambientes próprios, fora deste código; a reorganização não as move nem altera seus dados ou resultados. O catálogo identifica origem, proprietário, instalação e ambiente de cada aplicação consultada.

Saúde técnica de frontend/API/worker e disponibilidade de dependências não aprovam funcionalidade, gate ou release. O hub e os dashboards exibem projeções operacionais; decisões de negócio permanecem na aplicação responsável. Na adoção do Portal, preservar os contratos de experiência, métricas e auditoria já existentes, sem declarar telas migradas antecipadamente.

### Governança de IA e ferramentas

- Catálogo de modelos: revisão/digest, licença, quantização, backend, capacidades, limites e qualificação por perfil/tarefa.
- Catálogo de agentes: versão, identidade técnica verificável, modelos permitidos, capacidades, orçamento, aprovações e referências/versionamento dos templates de prompt e do compilador de contexto, com conteúdo em fonte controlada.
- Catálogo MCP: versão/schema, servidores e ferramentas aprovados, recursos/ambientes permitidos e credenciais por integração.
- Permissão por agente, execução, usuário responsável, ferramenta, operação, recurso e ambiente. O modelo é uma restrição adicional confirmada pelo runtime; texto do prompt ou cabeçalho livre não concede privilégios.
- Gateway verifica identidade/acesso; executor/provider revalida argumentos, recurso, aprovação e idempotência antes do efeito. Filtrar a lista de ferramentas não substitui autorização na chamada.
- Credenciais das ferramentas ficam nos adapters/cofre; impedir caminhos de rede, filesystem ou stdio que contornem as políticas. Acesso a modelo não concede acesso automático a MCP.
- Alteração de modelo ou fallback depende de política explícita. Não perder recusas, limites e formato estruturado do relay existente durante a adoção do gateway.

Gates e decisões de negócio permanecem no SDLC. Separar API e workers em processos exige preservar leases, coordenação e o recorder compartilhado; esta fundação não exige trocar o banco ou adotar um broker.

### Auditoria, traces e replay

Auditoria registra fatos duráveis de autoria, autorização, tentativa, efeito confirmado ou incerteza. Segue o [contrato transversal](../sdlc/docs/implementacao-auditoria-2026-10-24.md), com catálogo explícito e recorder transacional; manutenção usa trilha externa à base alterada. Não inserir diretamente em `HistoryEvent`.

Traces e logs técnicos usam correlação comum: instalação, serviço, agente, execução, tentativa, operação, trace e span. Amostragem ou indisponibilidade de telemetria não elimina auditoria nem aprova gates. Prompts, respostas e argumentos sensíveis ficam nas fontes controladas; a projeção compartilhada guarda metadados seguros e referências.

IDs de execução, operação e trace não se tornam labels ilimitados de métricas. Limitar cardinalidade, volume de captura e retenção conforme o orçamento de cada perfil.

Simulação/replay é uma capacidade técnica da fundação, independente de roteiro comercial. Distinguir inspeção de registro, replay com respostas gravadas e experimento com nova inferência. Exigir versões/entradas identificadas, referências dos prompts e do compilador de contexto, fixtures permitidas, workers/estado descartáveis, credenciais próprias e isolamento de efeitos reais. Chamada desconhecida falha sem recorrer automaticamente à ferramenta real. Resultado de ensaio não concede aprovação de negócio à aplicação ou release.

## 5. Dashboards e operação visual

Usar interfaces nativas de Grafana, Langfuse, gateway, GitLab e SonarQube. Homepage organiza o acesso; o Portal SDLC preserva seu domínio. Links contextuais levam ao recurso, execução e período corretos. Componentes novos no Portal seguem os [padrões de experiência](../sdlc/portal/docs/PADROES_DE_EXPERIENCIA.md) e a [arquitetura/métricas](../sdlc/portal/docs/ARCHITECTURE.md), com revisão UX e adoção registrada na implementação correspondente.

| Dashboard | Conteúdo mínimo | Fonte e limite |
| --- | --- | --- |
| Inventário e dependências | Serviços habilitados, versão desejada/observada, disponibilidade interna/externa, última verificação | Inventário + health checks. Configurado não significa instalado; instalado não significa saudável. |
| Host, virtualização e capacidade | CPU, memória, disco, swap, VM/WSL, runtime e pressão de recursos | Coletores por perfil. Não confundir host com VM nem somar memória compartilhada duas vezes. |
| Inferência | Modelo carregado, filas, erros, duração, concorrência, tokens e consumo disponível | Runtime/gateway instrumentados. Campo ausente não vira zero; atribuição por chamada precisa de fonte própria. |
| Execução agêntica | Trabalhos ativos, fila/espera, tentativas, falhas e duração por agente/versão | Runtime instrumentado; fonte/política vigente identificadas. |
| Acessos e políticas | Autenticação, recusas, operações autorizadas, decisões e versão da política | IdP + gateway + auditoria correlacionada; sem segredos ou conteúdo privado. |
| Ferramentas e entrega | Saúde GitLab/Runner/qualidade, pipeline e artefatos por referência | APIs/instrumentação reais. Métricas SDLC mantêm o contrato atual, sem novos KPIs ou gates implícitos. |
| Aplicações | Catálogo, versão/ambiente, saúde de UI/API/workers, dependências e acesso aos logs/traces; Portal SDLC como primeira aplicação | Manifestos de implantação e observações reais por aplicação. Saúde técnica separada de aceite funcional e de gates de negócio. |
| Saúde da observabilidade | Coleta, filas/exportação, descarte de eventos, falhas de ingestão e retenção | Autotelemetria dos coletores/backends; identificar ausência ou atraso de medição. |
| Simulação/replay | Cenário, versões, modo, efeitos bloqueados e avaliação | Registros reais do ensaio isolado; não preencher com execuções fictícias. |

Cada painel identifica fonte, escopo, unidade, período e atualização. Mostrar explicitamente ausência, não aplicabilidade, coleta não suportada, falha e dado desatualizado. Validar as métricas GPU disponíveis em cada equipamento; não assumir DCGM, NVML ou telemetria Metal equivalentes. Dashboards e alertas são versionados e provisionados, com destinatários/canais configuráveis. Definir limiares operacionais com base no perfil; não inventar SLOs ou metas de negócio.

## 6. Backlog e critérios de prontidão

A primeira parte de F0 está implementada no núcleo de consultas; o restante continua pendente conforme a evidência abaixo. A sequência permite validar cada módulo antes de ampliar a combinação.

| Etapa | Entrega | Evidência para concluir |
| --- | --- | --- |
| F0 — contratos e inventário | Limites, catálogos de serviços/aplicações, Portal SDLC como primeira aplicação, perfis, dados-alvo do LAB e escolhas de ferramentas/edições | Inventário revisado; dependências, recursos, capacidade, versões, propriedade dos dados e lacunas explícitos. Nenhuma limpeza global. |
| F1 — base provisionável | Instalador com preparação de pré-requisitos, adaptadores de host/rede/runtime, configuração e armazenamento; no Windows, WSL2 e distro dedicada incluídos | Instalação desde host sem WSL/distro da solução, sem preparação manual; repetição idempotente, retomada após reinício/falha e conflitos de propriedade exercitados; recursos externos preservados. |
| F1c — pré-requisitos S.O./GPU | Adaptadores Windows, Ubuntu e macOS; atualização controlada de userland e probes NVIDIA/Metal | Código e testes isolados entregues. Validar no hardware, reinício, driver ausente e políticas Windows; não equivale a host integralmente atualizado. |
| F1d — runtime | Docker/Compose fixados, engine próprio/externo Linux e Colima/Lima privados Mac; recursos/auditoria/compensação | Código e pacotes entregues. Qualificar serviços reais, VM, coexistência e computação GPU. Rede/saída/publicação dos serviços pertencem à camada seguinte. |
| F2a — redes privadas | Três bridges internas e perímetro `edge` para bindings locais; CIDRs/nomes/propriedade, DNS e sondas de isolamento/rota | Integração Docker AMD64/ARM64 executada com negações entre redes e rotas observadas. Perímetro com gateway e sem masquerade não equivale a bloqueio de egress; portas continuam em loopback. Rede antiga divergente exige migração explícita. Qualificar equipamentos; não libera internet/publicação. |
| F2b — acesso local | Keycloak/PostgreSQL, OpenBao/Raft e Caddy; configuração/segredos por volumes nomeados, políticas e bootstrap auditado | Serviços reais e bootstrap executados em CI AMD64/ARM64; qualificar navegação SSO e equipamentos. Root OpenBao revogado e auditoria declarativa verificada. Recuperação local não é HA/HSM. |
| F2c — publicação | TLS, ingresso, domínio/URLs, reconciliação de issuer/callbacks e endurecimento | Parcial: F2c1 entrega diagnóstico; [F2c2a](../operations/ORIGIN-TLS.md) implementa origem mTLS local, rotação/retomada/compensação, sem proxy de aplicações. Caminhos direto/túnel continuam configuráveis, com adaptadores públicos, migração e qualificação pendentes. `external_publication_ready=false`; conta bootstrap e recuperação local exigem endurecimento antes de expor. |
| F2 — identidade e borda | IdP, segredos, endpoints e publicação configurável | Acesso autorizado/negado e revogação verificados; URLs reconciliáveis. Verificação pela internet permanece pendente até configurar a publicação. |
| Operação da fundação | Status/doctor, start/stop/restart e captura privada de logs dos cinco serviços preparados | Provedores isolados dos três perfis cobrem a orquestração; CI real cobre os adaptadores de borda e logs privados. Instalação, reinício dos equipamentos e demais combinações permanecem pendentes. |
| Ciclo do runtime próprio | Escopo explícito container-runtime para Docker systemd Linux/WSL e VM Colima própria existente | Regressão Go nativa aprovada em Linux/macOS. Engine/VM e boot reais ainda a qualificar; parada com workloads ativos é recusada e engine externo preservado. Offline Colima não comprovado. |
| F3 — ferramentas | GitLab/Runner, qualidade e artefatos independentes do SDLC | Saúde, integração, referências de artefato e inicialização sem downloads implícitos comprovadas. |
| F4 — observabilidade | Coleta, backends, dashboards, links e alertas operacionais | Séries/logs/traces reais correlacionados; ausência e atraso visíveis; alertas exercitados em isolamento. |
| F4b — diagnóstico dos sinais | Seis fontes HTTP/JVM, tempo da amostra e prontidão independente dos backends | Seis fontes HTTP/JVM observadas em CI Docker AMD64/ARM64; ausência/atraso/duplicidade e projeção segura cobertos por testes isolados. Idade no Prometheus não atesta instante na origem; sem host/GPU/apps ou ingestão de logs/traces. |
| F3a/F4a — primeiro núcleo local | Grafana/Prometheus/Loki/Collector em projeto próprio; blueprints de middleware e observabilidade separados, dashboard nativo, HTTP/JVM e regras locais | Quatro produtos e validadores reais, dashboard/datasources e sinais HTTP/JVM passaram na integração AMD64/ARM64. Host/GPU/apps, ingestão de logs/traces, alertas externos, SSO e equipamentos permanecem pendentes. |
| F5 — IA governada | API de inferência, catálogo e gateway MCP | Modelo permitido/negado, ferramenta permitida/negada e restrição de recurso/ambiente exercitados; limites e formatos atuais preservados. |
| F6 — runtime agêntico | Capacidades de execução e executores compartilhados com ciclo de vida independente | Identidade/capacidades, isolamento e recuperação sem duplicar efeitos comprovados; coordenação e regras de negócio continuam nas aplicações. |
| F7 — aplicações | Portal SDLC como primeira aplicação: contrato de implantação, identidade, UI/API/workers e instrumentação | Instalação/atualização próprias; API e workers separados gradualmente; leases, gates e auditoria preservados; saúde e dependências observáveis; publicação segura validada quando configurada. |
| F8 — operação visual e replay | Hub configurado, acesso às UIs nativas e piloto de simulação | Aplicações e serviços identificados; links/correlação corretos; ações administrativas com autoridade única; replay isolado sem efeitos externos. |
| F8a — hub local | Homepage nativo, configuração por código, três links de acesso e operação diária independente do Portal | 95 cenários Windows, regressão Go nativa e integração Docker AMD64/ARM64 com HTTP e três links. Navegador/equipamentos e SSO/publicação pendentes. Não declara implantação do Portal, inventário de todos os serviços ou replay. |
| F9 — qualificação por equipamento | Instalação, reinício, falha/retomada, operação local e publicação em cada perfil | Evidência separada Windows, macOS e GB10; declarar somente os componentes/combinações testados. |

F2–F7 podem evoluir em paralelo após seus pré-requisitos. A fundação inclui a primeira aplicação integrada aos serviços qualificados. É entregue por capacidades verificadas; disponibilizar containers ou desenhar dashboards vazios não conclui essas etapas. A operação visual precisa cobrir os fluxos realmente implementados, com lacunas administrativas explícitas.

## 7. Adoção atual e referências

| Área | Evidência atual | Limite preservado |
| --- | --- | --- |
| LAB e SDLC locais | [LAB](../lab/README.md), [SDLC](../sdlc/README.md), [instalação até DEV](../sdlc/docs/instalacao-manual-ate-dev-2026-10-31.md) | São implementações existentes específicas; não comprovam a arquitetura-alvo completa nem os três perfis. |
| Camada de aplicações | [Portal SDLC](../sdlc/portal/README.md), contrato e etapa F7 desta proposta | O Portal é a primeira aplicação prevista para a camada. A implementação existente ainda não foi migrada para a estrutura-alvo nem qualificada nesse contrato. |
| Publicação do Portal | [app.ts](../sdlc/portal/apps/api/src/app.ts), [Compose](../sdlc/portal/compose.yaml) | A fundação atual exige modo demo e usa persona declarada pelo cliente. Identidade/autorização verificáveis são pré-requisito da publicação externa. |
| Fonte de modelos | [configuração atual](../lab/config/lab.yaml), [relay](../sdlc/portal/scripts/llm-relay.py) | Ainda há dependência de configuração interna do LAB e contrato específico do relay. |
| Qualificação automatizada | [CI](../.github/workflows/validate.yaml) | [Matriz e evidência atual](VALIDACAO_DA_FUNDACAO.md): testes nativos Linux AMD64/ARM64 e macOS ARM64, bootstrap Windows e integração Docker AMD64/ARM64. A liberação exige seis relatórios do mesmo código; hardware, instalação de host e regressão da aplicação têm escopos próprios. |
| F0 — consultas comuns | [CLI Go](../operations/README.md), [catálogo](../operations/catalog.json), [configuração](../environments/platform.json), perfis e testes isolados | Validação estrita, inventário declarativo e plano de dependências implementados. Estado do runtime continua não observado; qualificação do cofre, inventário real e adoção das demais ferramentas/recursos do descarte ainda pendentes. |
| F1a — WSL2/base Linux | [Bootstrap Windows](../install.ps1), [perfil de host](../environments/windows.psd1), [catálogo de ações](../operations/bootstrap/actions.psd1), [recorder](../operations/audit/WindowsRecorder.psm1) e [testes](../tests/platform-installer.tests.ps1) | Dezoito cenários isolados passaram: preparação, reinício, retentativa, propriedade, checksum, resposta perdida, auditoria e falha/escrita atômica de checkpoint. Configuração AWK testada separadamente. Não houve provisionamento real; execução integral do script Linux/políticas Windows permanece pendente. |
| F1b — entrega/ativação da CLI | [Contrato](../operations/CLI-INSTALLATION.md), [módulo de arquivos](../operations/bootstrap/core-release.sh), [coordenador](../operations/bootstrap/core.ps1), [teste de releases](../tests/platform-core-release.tests.sh), transporte Windows e pacote comum | Instalação, retentativa e rollback da release com binário nativo passaram em runners Linux/macOS descartáveis. Bootstrap Windows passou sem Go nativo. Não equivale a provisionar os equipamentos ou validar Application Control no hardware. |
| F1c — S.O./GPU | [Contrato](../operations/HOST-RUNTIME.md), adaptadores Windows/Ubuntu/macOS, suíte Go, [driver Windows](../tests/platform-windows-gpu.tests.ps1) e [seletor de segurança](../tests/platform-security-updates.tests.py) | Testes isolados dos três perfis, driver ausente/preservado, reinício e seis casos Python passaram. Não houve mudança de S.O./driver real. Kernel/firmware e atualizações Windows/macOS permanecem externos; GPU compute não qualificada. |
| F1d — runtime | [Coordenador nativo](../operations/internal/provision/engine.go), [manifesto](../operations/internal/provision/assets.json), entrada shell e encadeamento Windows | 36 cenários Windows, suíte Go/vet, engine externo preservado, conflito de propriedade/rede e compensação confirmada/incerta testados; três builds/pacotes. Layout dos arquivos oficiais Docker/Lima conferido sem execução. Hardware/serviços reais pendentes. |
| F2a — redes privadas | [Contrato](../operations/NETWORK.md), [adaptador](../operations/internal/provision/network.go), [sondas](../operations/internal/provision/network_probes.go), [imagem fixada](../operations/internal/provision/network-images.json) e [integração opt-in](../operations/internal/provision/network_integration_test.go) | CI real AMD64/ARM64 com DNS, doze negações, três redes sem rota padrão e perímetro edge com gateway. Propriedade, drift, colisão e compensação conservam seus contratos; nenhum recurso humano foi criado/removido. |
| F2b — identidade/cofre/borda locais | [Contrato](../operations/ACCESS.md), [spec/Compose](../operations/internal/provision/access_spec.go), [runtime](../operations/internal/provision/access_runtime.go), [bootstrap/API](../operations/internal/provision/access_http.go), [imagens](../operations/internal/provision/access-images.json) e [CI opt-in](../operations/internal/provision/access_integration_test.go) | Serviços reais e bootstrap em CI AMD64/ARM64, incluindo auditoria declarativa OpenBao, leitura protegida, permissões, AppRole e revogação root observada. HTTP das UIs não qualifica navegação SSO ou hardware. |
| Adoção declarativa da preparação | [Catálogo](../operations/catalog.json) e consultas Go | Treze componentes (host/runtime/redes/identidade/cofre/borda/origem TLS/ingresso, quatro ferramentas de observabilidade e Homepage) usam `foundation_preparation`, com qualificação pendente. Ordem runtime → redes → provedores/origem → demais ferramentas; Metal nativo permanece host. Consultas F0 não observam estado real, publicam ou executam o plano. |
| Restante de F1 | [Limites operacionais](../operations/HOST-RUNTIME.md) | Qualificação integral, conectividade/segmentação dos serviços, operação diária, upgrade de runtime, migração de modo e desinstalação pendentes. Quatro estados parciais não equivalem a `installation_ready`; `gpu_container_qualified=false`. |
| CI da CLI | [workflow](../.github/workflows/validate.yaml), jobs `platform-cli` e `platform-cli-build` | Matriz do núcleo Windows/macOS/Linux, launcher e pacotes Linux AMD64/macOS ARM64/Linux ARM64 configurados; resultado remoto ainda não executado nesta entrega. Compilação não qualifica hardware, GPU ou instalação. |
| Entrada shell / WSL2 | [platform.sh](../platform.sh), [testes isolados](../tests/platform-launcher.tests.sh) e diagnóstico Windows | Roteamento dos três destinos, argumentos, exit code e modo de pacote testados com backends isolados; Git Bash não é tratado como WSL. A política `VerifiedAndReputableDesktop` foi identificada por leitura e preservada. Execução do núcleo dentro do WSL2 permanece pendente. |
| Verificação local da CLI | Suíte Go incluindo vínculo de identidade, `go vet`, builds/pacotes Linux AMD64/macOS ARM64/Linux ARM64 | Nesta continuação a suíte Go passou; o reteste final dos blueprints encontrou novo bloqueio Application Control. Vet e compilação não substituem a execução final pendente na CI; nenhuma política foi alterada. Execução WSL/GPU/equipamentos continua pendente e a operação mantém Linux no Windows. |
| Diagnóstico de publicação | [Consulta F2c1](../operations/internal/platform/publication.go) e [contrato](../operations/PUBLICATION.md) | Catálogo/escopo completos, domínio ausente/local/reservado, origem futura normalizada, requisitos DNS/TLS, rotas projetadas e mudanças de modo/issuer/portas/callbacks; consumidores fora do escopo e vínculo da configuração anterior. Somente leitura, sem DNS/HTTPS ou prontidão externa; transporte Windows preserva ledger/argumentos. |
| Origem mTLS | [Executor/material/provas](../operations/internal/provision/origin.go) e [operação](../operations/ORIGIN-TLS.md) | CI real AMD64/ARM64 com Caddy, origem mTLS e rotação, além dos testes isolados dos três perfis. Não encaminha aplicações, publica na internet ou instala confiança no host. |
| Preparação de ingresso | [Executor F2c2b](../operations/internal/provision/ingress.go) e [contrato](../operations/INGRESS.md) | Configurações direto/túnel adaptadas pelo Caddy real e limpeza própria confirmada em CI AMD64/ARM64. Sem ativar listeners públicos, emitir certificado público ou encaminhar aplicações. |
| Operação da fundação | [Executor/consultas](../operations/internal/provision/operations.go) e [contrato operacional](../operations/OPERATIONS.md) | Orquestração completa coberta por provedores isolados. CI real exercita stop/start/restart e exportação privada/idempotente de logs da borda; não declara operação real de todos os serviços ou qualificação integral do host. |
| Operação do runtime | [Adaptador](../operations/internal/provision/operations_runtime.go), [journal/recorder](../operations/internal/provision/operations_runtime_lifecycle.go) e [contrato](../operations/RUNTIME-LIFECYCLE.md) | Regressão Go executada nativamente em Linux/macOS, com provedores isolados para Docker systemd/Colima, journals e proteção de workloads. Instalação/boot de engine próprio, VM real e offline Colima permanecem pendentes. |
| Observabilidade local | [Contrato](../operations/OBSERVABILITY.md), [middleware](../operations/blueprints/middleware/observability.json), [coleta/dashboard](../operations/blueprints/observability) e [coordenador](../operations/internal/provision/observability_runtime.go) | CI real AMD64/ARM64 com quatro backends, validadores nativos, dashboard/datasources, seis fontes HTTP/JVM e limpeza própria confirmada. Loki preparado não significa ingestão de logs; SSO, host/GPU, aplicações e equipamentos permanecem pendentes. |
| Esta entrega | Código F0/F1/F2, F3a/F4a, operação dos serviços/runtime, documentação, testes isolados e pacotes | Nenhum driver, pacote de S.O., WSL/distro, container ou rede do ambiente humano instalado, iniciado, movido, apagado ou publicado; nenhum backup criado. Aprovação de testes não significa prontidão da instalação completa. |
| Diagnóstico F4b — 09/11/2026 | [Contrato](../operations/OBSERVABILITY-DIAGNOSTICS.md), [prova](../operations/internal/provision/observability_signals.go), [testes](../operations/internal/provision/observability_signals_test.go) e transporte Windows | Suíte Go integral/vet e 88 cenários Windows passaram sem mudar política. Seis fontes por IDs conhecidos, sem conteúdo livre; consulta não escreve controles/ledger/dados. Núcleo e fontes conservam prontidão separada. CI real/hardware/SSO/publicação pendentes; blueprints/volumes instalados não são alterados. |
| Hub F8a — 09/11/2026 | [Contrato](../operations/HUB.md), [blueprint](../operations/blueprints/middleware/homepage.json), [configuração nativa](../operations/blueprints/hub/settings.json), [coordenador](../operations/internal/provision/hub_runtime.go) e [testes](../operations/internal/provision/hub_test.go) | Homepage 2.7.0 AMD64/ARM64; identidade/configuração próprias, um volume selado, loopback, sem credenciais/socket/widgets. 95 cenários Windows passaram; Go compilado/vet, com execução bloqueada por Application Control. CI real preparada, sem execução comprovada. Preserva digest da observabilidade; não migra Portal/negócio, publica ou qualifica o hardware. |

Referências técnicas consultadas para a recomendação; confirmar novamente e fixar versões antes de implementar:

- [Compose: serviços, redes e volumes](https://docs.docker.com/compose/intro/compose-application-model/).
- [Caddy e HTTPS](https://caddyserver.com/docs/automatic-https); [Keycloak e aplicações](https://www.keycloak.org/securing-apps/overview).
- [agentgateway: autorização MCP](https://agentgateway.dev/docs/standalone/latest/documentation/configuration/security/mcp-authz/) e [virtual keys](https://agentgateway.dev/docs/standalone/latest/documentation/llm/cost-controls/virtual-keys/).
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/configuration/), [Prometheus](https://prometheus.io/docs/introduction/overview/), [Loki](https://grafana.com/docs/loki/latest/get-started/overview/) e [Grafana Canvas](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/canvas/).
- [Langfuse: observabilidade](https://langfuse.com/docs/observability/overview) e [limites de edição](https://langfuse.com/self-hosting/license-key). Audit logs e RBAC por projeto exigem Enterprise; a auditoria da plataforma continua independente.
- [Homepage](https://gethomepage.dev/) e [UI do agentgateway](https://agentgateway.dev/docs/standalone/latest/documentation/setup/ui/launch-ui/). Escrita administrativa na UI precisa respeitar a fonte de configuração e a trilha de manutenção.
- [Kitaru: tool policies](https://docs.zenml.io/kitaru/guides/tool-policies) e [adapters próprios](https://docs.zenml.io/kitaru/adapters/custom). Sem política adequada, replay pode executar ferramentas reais; importar traces não implementa interceptação.
- [NVIDIA: limitações do WSL](https://docs.nvidia.com/cuda/wsl-user-guide/), [Ollama: Metal](https://docs.ollama.com/gpu) e [Dell GB10](https://www.dell.com/en-us/shop/laptop-computers/spd/dellpromaxwithgb10fcm1253).
