# Instalação de LAB e SDLC do zero e teste manual até DEV

Data: 31/10/2026. A instalação completa tem **duas etapas explícitas**: [`lab/bootstrap.ps1`](../../lab/bootstrap.ps1) prepara o LAB de modelos; depois [`sdlc/install.ps1`](../install.ps1) prepara o SDLC. O segundo não instala o LAB. Este roteiro corrige a premissa anterior de LAB já existente e substitui a montagem manual dos conectores/executores do SDLC. Não depende de scripts privados de `.prepared`.

**Situação:** caminho de instalação consolidado no código e verificado por contratos leves. Por orientação do usuário e limitação de recursos, esta entrega não recriou o ambiente, não executou regressão completa, instalação real ou inferência. O aceite de instalação limpa e da jornada fica para o teste manual.

## Pré-requisitos e ambiente limpo

- Windows compatível, GPU NVIDIA, virtualização habilitada, Git e PowerShell como administrador, na mesma conta Windows usada na instalação. O bootstrap do LAB verifica/prepara WSL e driver ausente conforme o [contrato de pré-requisitos](../../lab/docs/windows-prerequisites.md). As distros próprias são **`ai-local-lab`** e **`agentic-sdlc`**; o bootstrap prepara Docker e utilitários, sem exigir Node/Python/Docker Desktop instalados manualmente no Windows.
- Internet durante `prepare`, para rootfs, imagens e dependências declaradas. `up` utiliza as imagens preparadas, sem build/pull implícito.
- O LAB será preparado primeiro, com as definições atuais de `lab/config/lab.yaml`, `models.yaml` e `versions.env`, sem troca de modelos. O SDLC usa **`qwen3.5:9b`** para conversa/planejamento e **`qwen3:14b`** para código/UI. O instalador SDLC apenas consulta o catálogo; quem baixa os pesos numa instalação nova é o `prepare` do LAB.
- Este instalador completo atende o perfil local padrão: núcleo em 3100, GitLab em 3180 e Portal SDLC em **3310**. Outra porta do núcleo é recusada explicitamente, pois os executores existentes ainda usam esse endereço GitLab.
- Código corrente completo, incluindo os arquivos novos desta entrega, deve estar na cópia usada no teste. Um clone de commit anterior não inclui o instalador.

**Reexecutar `prepare`/`up` preserva dados e volumes existentes. Não produz um ambiente vazio.** Para comprovar ambos do zero, LAB e SDLC precisam começar sem as respectivas distros/dados/volumes/configurações anteriores. Reutilizar o LAB é outra modalidade de teste, que não comprova sua instalação limpa. Antes de remover instalações existentes, preserve seus backups/exportações e credenciais de recuperação; este procedimento não inclui exclusão automática nem adoção de distro de outro proprietário. Copiar o repositório em outra pasta, sozinho, também não limpa as instalações WSL.

## Comandos

Para limpar LAB e SDLC existentes antes do teste do zero, siga primeiro a [sequência de limpeza com prévia e proteção de caminhos](limpeza-antes-teste-manual-2026-10-31.md). Ela também remove o estado local `.prepared` do Portal, evitando reutilizar sobreposições da instalação anterior. A remoção inclui modelos, bancos e repositórios das duas distros; preserve os backups desejados fora do projeto.

Na raiz do repositório, em PowerShell administrativo:

```powershell
# 1. LAB mínimo do zero: infraestrutura GPU/WSL, Ollama e dois modelos.
.\lab\bootstrap.ps1 prepare sdlc

# 2. Inicia/valida o LAB antes de conectar o SDLC.
.\lab\bootstrap.ps1 up sdlc
.\lab\bootstrap.ps1 doctor

# 3. Preparação sequencial de toda a infraestrutura do SDLC e suas ferramentas.
.\sdlc\install.ps1 prepare

# 4. Inicia núcleo/GitLab/Portal, conecta serviços e instala os executores.
.\sdlc\install.ps1 up

# 5. Confere o SDLC sem executar inferência ou casos de negócio.
.\sdlc\install.ps1 doctor
```

Execute uma linha por vez e confira o resultado antes da seguinte. Se a preparação do Windows/driver/WSL solicitar reboot (código 3010), reinicie e repita o `prepare` do LAB, na mesma conta administrativa, antes de continuar. Driver existente válido é preservado. Não execute preparação e teste de modelos em paralelo com a jornada SDLC.

**Recursos e downloads:** o novo perfil `sdlc` prepara somente a imagem Ollama e os dois modelos existentes selecionados em `lab/config/sdlc-profile.json`. Não prepara imagens Python/PyTorch/CUDA de diagnóstico, WebUI, Qdrant, Jupyter, embeddings ou o container Qwen Code do LAB; a ferramenta Qwen Code/Chromium é preparada no SDLC. A lista geral `models.yaml` e os pesos extras já instalados são preservados. Os perfis gerais continuam preparando seu conjunto completo. `up sdlc` inclui doctor/smoke com inferência e prova de VRAM, usando Python padrão do host; o doctor do SDLC só consulta prontidão. [Contrato do perfil mínimo](../../lab/docs/sdlc-profile.md).

O `prepare` de **`sdlc/install.ps1`** compila/prepara somente os componentes do SDLC, inclusive Qwen Code e Chromium. O `up` seleciona no SDLC os modelos já declarados acima; uma configuração existente com seleção diferente é recusada para não ser trocada silenciosamente. Não é necessário executar qualificações adicionais de modelos ou scripts privados.

| Componente necessário a DEV | Preparação/configuração versionada |
| --- | --- |
| LAB: driver ausente/WSL, distro GPU, Docker/Toolkit, Ollama, dois modelos e manifesto por perfil | `lab/bootstrap.ps1 prepare sdlc/up sdlc`, scripts e configurações versionados em `lab/` |
| Distro SDLC, Docker, Compose, núcleo, PostgreSQL, Forgejo, GitLab e Runner | `sdlc/bootstrap.ps1 prepare/up` e instaladores Linux existentes |
| Portal/API, PostgreSQL próprio, migrations e scanner | `portal/bootstrap.ps1 prepare/up` |
| Conta runtime restrita e segredo externo | `portal/scripts/runtime-role.py`, chamado pelo bootstrap do Portal |
| Conta de integração GitLab, grupo SDLC e conta dedicada de merge | Inicialização GitLab e `portal/scripts/connect-gitlab.py` |
| Relay autenticado para os modelos locais | `portal/scripts/connect-llm.py` |
| Construção de trabalho Node 24/React e artefatos locais | `portal/scripts/build-executor.py prepare/install` |
| Destinos, implantação e Teste em DEV | `portal/scripts/runtime-executor.py install`; o teste usa o mesmo runtime |
| Qwen Code/SDK, compilador e Chromium isolado | `portal/scripts/coding-executor.py prepare/install`, Dockerfiles e locks versionados |
| Diagnóstico de fonte/imagens/modelos/unidades/integrações | `portal/scripts/installation-check.py` |

`prepare` e `up` param na primeira falha. Não execute a etapa seguinte se a anterior falhar. Componentes já preparados permanecem disponíveis; após resolver o motivo, repita o mesmo comando. Não há rollback global nem exclusão de dados para esconder preparação parcial. Configuração de executores/conexões exige filas e leases sem trabalho em andamento; aguarde os agentes antes de repetir `up`.

O `doctor` confere as seis integrações necessárias: **gitlab, llm, coding, executor, runtime e security**. Serviços systemd, sobreposições Compose, conta dedicada de merge e fontes instaladas também são verificados. Ele não inicia serviços, repara redes, gera respostas do modelo, cria Sistemas ou publica aplicação. Registro OCI externo não é requisito do perfil DEV atual, que conserva artefatos localmente; seu `not_configured` não deve reprovar este diagnóstico. Isso não implementa o pacote QA ou os ambientes posteriores.

Se houver `[PENDENTE]`, corrija o componente indicado. Imagem ausente pede `prepare`; modelo ausente pede disponibilizar o modelo já acordado no LAB; serviço inativo deve ser consultado em seus logs. O instalador não contorna propriedade, identidade, versão ou trabalhos em andamento. `up` aplica migrations; backup e política de atualização de instalação com dados continuam necessários.

## Jornada manual de aceite

Abra **http://localhost:3310**. O endereço 3100 é o núcleo anterior, não a interface desta jornada. Faça a sequência sem preencher a base diretamente, editar o código gerado ou substituir resultado de agente:

1. Cadastre um Sistema novo e confirme que o repositório único foi criado/associado automaticamente.
2. Crie um Projeto e converse com o Assistente sobre uma capacidade pequena, com uma operação e resultado observável. Revise a proposta antes de aplicá-la. Confirme que Épico/História/Tarefas foram criados e que os nomes são **Teste em DEV** e **Teste em QA**.
3. Pelo fluxo do Sistema/Assistente, prepare e revise o contrato de execução e a estrutura técnica da aplicação. Publicação de proposta, liberação de Draft e integração são decisões distintas; confirme as fontes no portal.
4. Na História, revise requisitos e plano técnico; prepare e aprove o **Gateway de Especificação** com destino/base explícitos. Observe a execução dos agentes, revisão de código e segurança. Não avance enquanto houver impedimento não resolvido.
5. Solicite e acompanhe o Merge Request até integração confirmada. Confira que essa integração, sozinha, não conclui a História.
6. Construa a versão de trabalho e prepare o destino DEV do Sistema pelos controles/Assistente. Confirme a publicação e abra a URL da aplicação mostrada no portal.
7. Exercite o comportamento pela interface da aplicação, incluindo persistência após recarga e entradas inválidas pertinentes. Registre aprovado/reprovado, passos, resultado esperado/obtido e evidência por caso.
8. Execute **Teste em DEV** e aprove **Desenvolvimento Finalizado** com pessoa autorizada e evidências da mesma revisão. A História permanece aberta até produção.
9. Como Elisa/Release Manager ou Admin, crie release OPEN em DEV e associe a História. No detalhe, consulte **Conferência para QA**: a fonte salva precisa corresponder à aprovação. O resultado de desenvolvimento não libera pacote ou promoção QA nesta versão.
10. Repita uma consulta/recarga e confira que contexto, rascunhos e evidências permanecem. Quando houver impedimento, registre quão clara foi a próxima ação, de 1 a 5, e o ponto em que precisou sair do caminho esperado.

Instalação pronta não comprova sucesso dos agentes ou aceitação funcional. QA/HML/PRD e a regressão completa continuam com seus próprios testes/entregas. Para economizar recursos, execute esta jornada sem regressão completa ou qualificação de modelos concorrentes.

## Registro e verificações desta entrega

Contratos locais: `sdlc/tests/install.tests.ps1` e `portal/tests/installation-check.test.py`. Cobrem ausência de pré-requisito antes de mutação, interrupção após falha, retomada no mesmo diretório, seis capacidades obrigatórias, registro opcional, preservação da seleção instalada, lease ativo e consulta sem configuração/inferência. Integram CI; os contratos Python também integram o suporte da regressão completa.

- [x] Fontes necessárias à instalação verificadas no repositório.
- [x] Caminho público do LAB do zero revisado e incluído no roteiro; modelos existentes mantidos nas definições.
- [x] Perfil mínimo `sdlc` implementado; preparação, manifesto e diagnóstico dispensam os componentes opcionais do LAB.
- [x] Contratos leves Python e PowerShell aprovados.
- [ ] Instalação real de LAB e SDLC a partir de estado limpo — teste manual do usuário.
- [ ] Jornada completa do novo Sistema até DEV e aprovação da revisão.
- [ ] Regressão completa limpa sobre a fonte consolidada.

As execuções antigas permanecem evidências de suas respectivas fontes. Esta entrega não declara que a instalação limpa ou a regressão atual já passaram.

**Correção de escopo do LAB:** o roteiro anterior pressupunha LAB existente. Após esclarecimento do usuário, foi incluída sua preparação do zero, antes do SDLC. A revisão confirmou os caminhos públicos de driver/WSL, Docker/Toolkit, rede/memória/cache declarados, imagens, modelos, Qwen Code e manifesto offline. Contratos Windows de host e validação estática do LAB passaram, incluindo fechamento do lock de 149 pacotes. Não houve alteração de fonte/configuração/modelos do LAB, criação de ambiente, download de pesos ou inferência nesta conferência. A disponibilidade efetiva dos downloads e a instalação limpa continuam para o teste manual. [Recibo complementar](assets/instalacao-manual-ate-dev-2026-10-31/lab-from-zero-review.json).

**Perfil mínimo implementado após a revisão acima:** use agora `prepare sdlc`/`up sdlc` no LAB. Essa entrega modifica o bootstrap para selecionar só Ollama e os dois modelos atuais; não muda a declaração geral, versões, memória ou algoritmos. O recibo anterior de revisão do LAB continua histórico. Contratos novos e existentes passaram com recursos simulados; criação de ambiente e inferência real continuam para o teste manual. [Contrato, troca de perfil e limites](../../lab/docs/sdlc-profile.md).
