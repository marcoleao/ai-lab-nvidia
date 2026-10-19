# Chat do SDLC no Visual Studio Code

Estado: a versão 0.2 acrescenta encerramento explícito da entrevista e publicação humana de propostas no backlog; consulte a [correção e roteiro de uso](correcao-entrevista-2026-10-16.md). C1 foi instalado em 2026-10-16; o [registro inicial](entrega-chat-2026-10-16.md) preserva as evidências daquela versão. Aprovação por história, edição conversacional e execução de código de produto continuam pendentes.

## Experiência pretendida

O responsável abre **SDLC — Conversar com os agentes** na barra lateral do VS Code e descreve a necessidade em linguagem de negócio. A conversa permanece vinculada ao projeto, pode ser retomada e mostra propostas, perguntas pendentes, decisões e andamento das entregas. Código não é necessário para conduzir o trabalho.

Exemplo: “Quero um software para minha videolocadora”. O analista começa perguntando se a operação envolve mídias físicas, conteúdo digital ou ambos; quem atende e quem aluga; e qual problema precisa melhorar primeiro. Em seguida investiga catálogo/exemplares, disponibilidade, reservas, retirada, devolução, cobranças e exceções conforme as respostas. Não pressupõe funcionalidades, regras ou integrações aprovadas.

Para venda de automóveis, a entrevista muda para estoque próprio/consignado, cadastro do veículo, negociação, proposta, responsabilidades e etapas de conclusão. O agente deve adaptar suas perguntas às respostas, distinguir fatos informados de hipóteses e confirmar o entendimento. Adotar um perfil de domínio não comprova conhecimento especializado; regras específicas da empresa e informações que não puder verificar precisam de validação humana.

Cada rodada traz poucas perguntas pertinentes, de preferência duas a quatro, com possibilidade de responder livremente, adiar ou corrigir. O analista apresenta periodicamente o que entendeu, as decisões em aberto e a próxima proposta concreta. Não encerra a descoberta com um checklist genérico ou inventa respostas em nome do responsável.

## Responsabilidades e sequência

| Papel | Responsabilidade | Momento de intervenção humana |
| --- | --- | --- |
| Analista de produto e domínio | Entrevistar, esclarecer processo/exceções e propor outcome mensurável | Confirmar entendimento, restrições e resultado desejado |
| Analista de produto e domínio | Decompor o resultado em épicos e histórias com critérios observáveis | Revisar, aprovar ou solicitar ajustes por item |
| Arquiteto | Propor abordagem técnica, isolamento, dados, testes e dependências | Aprovar plano e política antes da primeira implementação; revisar mudanças relevantes |
| Desenvolvedor | Implementar a versão autorizada de uma história em branch/checkout isolado | Responder dúvidas, acompanhar, pausar ou cancelar |
| Qualidade e segurança | Criar cenários, executar verificações e apresentar evidências | Decidir sobre exceções e realizar aceitação funcional |
| Executor de entrega | Construir e promover o artefato autorizado | Aprovar release/destino/migrações conforme política |

São responsabilidades e permissões distintas, que podem utilizar o mesmo modelo local em momentos diferentes. Não será carregado um modelo para cada domínio nem executado um grupo de inferências em paralelo no primeiro fluxo.

Fluxo esperado: pedido → entrevista → confirmação do outcome → épicos → histórias e critérios → plano técnico/política aprovados → aprovação de uma história → agendamento da implementação → testes/evidências → aceitação humana → publicação autorizada.

“História aprovada” solicita automaticamente a implementação quando suas precondições estiverem satisfeitas. O humano não precisa comandar cada edição de arquivo. Aprovar uma história não aprova automaticamente deploy, alterações destrutivas de banco, novas dependências externas ou mudanças de política.

## Interface recomendada

Uma extensão própria e pequena, inicialmente em `vscode/`, com painel de chat em Webview e recursos visuais empacotados localmente. O painel se comunica com o controle do SDLC; o portal continua disponível para visão geral, auditoria e aceitação. Não haverá backlog ou histórico oficial separado dentro da extensão.

O primeiro painel deve oferecer: novo projeto/conversa, retomada do histórico, envio de resposta, perguntas pendentes, cartões de outcome/épico/história, revisão de diferenças, aprovar/solicitar revisão, acompanhamento e pausa/cancelamento. Credenciais ficam no armazenamento de segredos do VS Code, fora do histórico e dos prompts. As decisões usam ações tipadas e autenticadas, vinculadas a ID/versão/hash; uma resposta ambígua como “pode seguir” não autoriza qualquer efeito.

A Webview utiliza CSP, renderização de texto seguro, mensagens validadas e acesso mínimo a recursos locais. A extensão pode ser empacotada em VSIX e instalada localmente; o fluxo não deve depender de uma conta de provedor externo ou de serviços de inferência na nuvem.

Referências oficiais: [Webview API](https://code.visualstudio.com/api/extension-guides/webview) e [SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage). A implementação deverá fixar e testar a versão mínima do VS Code e o pacote de distribuição.

## Integração com modelos locais

A inferência utiliza os modelos existentes no laboratório. Antes de escolher qual atende melhor a entrevista e a codificação, medir disponibilidade, capacidade de contexto, latência e aderência aos contratos na workstation. Um nome de modelo na configuração não comprova que o modelo esteja instalado ou adequado.

O endpoint HTTP entre serviços permanece nulo na configuração geral. Ollama continua sem publicação de porta no pacote do laboratório. Em C1, o transporte WSL executa uma requisição HTTP fixa no loopback dentro do container Ollama, com JSON por stdin e verificação de propriedade. O ensaio confirmou conflito de rotas para endereços de bridge entre distros; por isso o transporte não usa esses endereços.

Alternativa inicial a avaliar: transporte local com comandos WSL fixos para encaminhar somente operações de inferência ao Ollama do laboratório, sem expor o daemon na LAN. Outro desenho possível é um gateway privado autenticado. A escolha depende do teste de conectividade e deve preservar a separação dos ambientes. Nenhum caminho deve fornecer ao modelo shell arbitrário, socket Docker, chave humana ou credenciais administrativas.

Preparação pode baixar dependências e empacotar a extensão. A execução normal deve funcionar sem internet, sem telemetria de terceiros e sem busca externa. Conhecimento que dependa de informação externa ausente deve aparecer como questão pendente.

## Persistência e aplicação de políticas

O controle deverá manter conversas e mensagens por projeto, versões dos resumos de descoberta, hipóteses, decisões, referências às propostas e registros de inferência. Cada chamada registra modelo/digest disponível, versão do prompt, parâmetros, hashes de entrada/saída, duração e resultado. Não se depende do raciocínio interno do modelo como evidência.

Mensagens são dados não confiáveis. O modelo propõe saídas estruturadas; o servidor valida tipo, tamanho, hierarquia e permissões antes de criar ou revisar itens no adaptador Forgejo. A publicação de propostas deve ser atribuída a uma identidade de agente distinta da identidade humana que decide. O modelo não recebe ferramentas de aprovação.

A conversa completa é privada, persistida no SDLC e incluída no backup. Segredos identificáveis devem ser recusados ou redigidos antes da inferência; a interface orienta a não inserir credenciais ou dados pessoais reais no piloto. Política de retenção/descarte e limites de armazenamento precisam ser explícitos. Eventos de auditoria devem referenciar conteúdo privado por identificador/hash quando registrar o texto integral expuser informação desnecessária.

Inferências e trabalhos terão comandos idempotentes, prazo, orçamento de tentativas, cancelamento e recuperação após reinício. Fechar o VS Code não deve perder o planejamento; se o transporte depender de um cliente ativo, a execução fica aguardando a retomada desse cliente, com estado explícito, em vez de simular processamento em segundo plano.

Uma inferência por vez e um trabalho pesado por vez permanecem os limites iniciais. Limites de contexto devem impedir truncamento silencioso: resumo versionado, hipóteses e referências ao backlog precisam preservar as decisões relevantes. Resposta inválida, timeout ou orçamento esgotado gera estado visível e intervenção, sem ferramenta genérica de execução como alternativa.

## Aprovação por história

O controle atual aprova um snapshot do escopo completo. A experiência solicitada acrescenta autorização individual de implementação, que ainda precisa ser implementada. Não basta trocar o nome do botão de aprovação existente.

A autorização de uma história deve referenciar sua versão/hash, a linhagem aprovada de outcome/épico, critérios, plano técnico, política e destino de execução. Alterar qualquer referência pertinente invalida a autorização e bloqueia novos comandos. Mudança em uma história não deve autorizar outra história nem reutilizar uma decisão de uma versão anterior.

Dependências aprovadas e capacidade do worker são precondições determinísticas. Histórico já concluído é preservado. O efeito de mudanças em outras partes do backlog precisa de análise de impacto explícita; não se presume que alterar uma história invalide ou preserve automaticamente toda execução em andamento. A aprovação global existente continua com sua semântica atual até que essa evolução seja implementada e testada.

## Codificação e entrega

O worker deverá editar somente um checkout isolado do projeto, registrar alterações por história e executar ferramentas enumeradas. É necessário preparar o fluxo Git: no Forgejo atual, Git HTTP e SSH estão desabilitados e não há runner. Antes de codificar, definir branch, autenticação privada, workspace e armazenamento no GitLab local, com workspaces internos ao SDLC e fora deste repositório, sem abrir serviços na LAN implicitamente.

A VM de execução ainda não foi validada. O diagnóstico anterior também não confirmou gerenciamento Hyper-V disponível. A implementação automática de código permanece bloqueada até demonstrar isolamento, recursos e conectividade. O serviço de controle e a extensão não substituem esse worker executando comandos gerados pelo modelo no Windows ou na distro do controle.

Para uma história, a entrega mínima inclui branch/commit, cenários vinculados aos critérios, testes automatizados, resultado de segurança, migrações quando aplicáveis e demonstração para aceitação. Um arquivo gerado, uma resposta de chat ou um commit não significam história aceita. Correções preservam versões e evidências, com limite de ciclos.

## Entregas verificáveis

| Entrega | Resultado | Aceitação necessária |
| --- | --- | --- |
| C1 — chat e entrevista | Extensão local, autenticação, inferência real no laboratório, histórico retomável e perguntas adaptadas ao negócio | Ensaiar videolocadora e automóveis com perguntas diferentes, sem acesso externo; reiniciar e retomar; modelo indisponível com erro visível |
| C2 — planejamento conversacional | Propostas estruturadas, publicação Forgejo, versões e decisões no chat | Conferir cadeia conversa → outcome → épico → história; leitor/agente não aprovam; reenvio não duplica; revisão invalida autorização pertinente |
| C3 — implementação por história | Fila, autorização individual, worker isolado, Git e ferramentas restritas | Aprovar história agenda o trabalho; versão obsoleta/revogada bloqueia; pausa/reinício não duplicam efeitos; nenhum acesso indevido ao host |
| C4 — entrega completa | Testes, segurança, banco, homologação, aceite e publicação | Critérios do piloto cumpridos com evidências e aprovação humana, inclusive recuperação e operação offline |

Primeira entrega recomendada: C1, seguida de C2. A verificação da VM e do fluxo Git pode avançar enquanto a interface e a entrevista são construídas. C3 só habilita execução após essas precondições, e C4 conclui o ciclo de desenvolvimento solicitado.
