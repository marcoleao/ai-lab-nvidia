# Reexecução dos testes de interface do catálogo de joias

O [roteiro detalhado v2](assets/avaliacao-modelos-lab-2026-10-30/roteiro-ui-joias-v2.json) registra os 28 casos `UI-JOI-C01` a `UI-JOI-C28`, com preparação, dependências, passos e resultados esperados concretos. Ele substitui os passos genéricos da [matriz original](assets/joias-jornada-ui-2026-10-30/casos-e-resultado.json), sem alterar seus resultados históricos da primeira tentativa, bloqueada antes de DEV. Cada nova execução produz outro recibo, com todos os casos, tentativas e limitações. [Primeira rodada depois da publicação DEV](assets/avaliacao-modelos-lab-2026-10-30/aceitacao-ui-dev-rodada-1.json).

## Preparação e isolamento

1. Usar um contexto de navegador novo, exclusivo da execução, sem importar cookies ou armazenamento do navegador humano. Não limpar ou escrever diretamente no localStorage para preparar cenários.
2. Abrir o Portal, escolher Ana pela interface, navegar ao Sistema JOIASC, Projeto CATLOG e História. Em Execução → DEV, conferir o artefato publicado e abrir a aplicação pelo link do portal. Registrar commit, imagem, URL, data e versão do roteiro antes de começar.
3. Interagir somente com campos, botões, links, confirmações e navegação. Proibidos: API direta, SQL, fixtures no backend, alteração de DOM/estado React, escrita de armazenamento e edição manual da aplicação. Ler rótulos, foco, validade nativa e dimensões do DOM é observação da interface.
4. Criar os dados de cada cenário pela própria UI. Dados sugeridos: categoria Anéis; coleção Aurora; joia `J-QA-001`, Anel de Pérolas, Prata, Pérola, preço 199,90; segunda joia `J-QA-002`, Brinco Zero, preço zero. Em execuções que reaproveitem um contexto, usar outro prefixo e registrar o conjunto inicial; não supor uma base vazia.
5. Para a foto, usar uma imagem que o navegador realmente abra. A rodada inicial utilizou o SVG público do GitLab local, com carregamento observado. Não substituir uma foto recusada por ausência de foto e declarar o caso completo aprovado.

## Evidência por caso

Registrar ID, objetivo, passos efetivamente executados, resultado esperado/observado, situação, hora e captura. Cada tentativa deve ter nome próprio de artefato; não reutilizar o mesmo nome ao repetir um caso. Distinguir reprovação do produto, bloqueio por pré-condição e erro da automação. Uma falha de seletor não prova defeito da aplicação. A correção do seletor exige nova execução, mantendo o registro anterior.

A gravação e o journal da rodada interativa ficam em `sdlc/portal/test-results/user-journeys/joias-dev-retest-20261030`, fora do Git. O journal registra ações e respostas de interface; o encerramento do contexto consolida os vídeos. O recibo resumido e as evidências selecionadas ficam em `sdlc/docs/assets`. Não copiar prompts, tokens ou conteúdo privado de serviços para os recibos públicos.

O cenário completo exercita criação, validação, consulta, edição, cancelamento, arquivamento, reativação, classificações, persistência, teclado e largura móvel de 390 pixels. Dependências entre passos precisam ficar explícitas. Caso impedido não recebe aprovação por inspeção de código, helper existente, Code Review ou HTTP saudável.

## Critério de fechamento

Repetir os casos afetados após cada correção publicada pelos agentes; ao integrar o conjunto, repetir os 28 em contexto limpo. Conferir que o artefato publicado não mudou durante a execução. Se mudar, separar os resultados por versão e repetir o que depender da versão final. A ausência de erros JavaScript na abertura é apenas o primeiro caso.

O roteiro/journal torna a execução reaplicável por uma pessoa ou agente de navegador. Os 28 casos desta aplicação piloto ainda não constituem uma suíte Playwright independente; a suíte automatizada do Portal SDLC não deve ser apresentada como regressão funcional do catálogo. Essa distinção é obrigatória nos relatórios.

## Imagem local reproduzível em HTTP e HTTPS

O servidor opt-in `lab/tests/serve_ui_photo.py` entrega somente o arquivo versionado `lab/tests/fixtures/ui-jewel.svg`, em loopback. Não acessa a aplicação, banco ou armazenamento do navegador. No WSL do SDLC, preparar um certificado exclusivo de teste em `sdlc/portal/.prepared/ui-photo-fixture/{cert.pem,key.pem}`; manter a chave privada com modo 600 e fora do Git. Executar `python3 lab/tests/serve_ui_photo.py --owner <identificador-alfanumérico-exclusivo>`. A preparação do certificado é separada do servidor.

As URLs padrão são `http://127.0.0.1:8049/jewel.svg` e `https://127.0.0.1:8449/jewel.svg`. Abrir cada uma no navegador e conferir a imagem antes de usá-la no formulário. Para o certificado local autoassinado, usar um contexto de teste separado com `ignoreHTTPSErrors: true`; isso permite testar a aceitação da URL HTTPS no catálogo, mas não comprova confiança TLS. Não alterar o contexto ou as credenciais de uma pessoa.

O arquivo privado `ready.json` identifica owner, PID e URLs. Não sobrescrever uma instância existente. Para encerrar, conferir owner, PID e linha de comando do processo e enviar SIGTERM somente à instância própria; aguardar a remoção de `ready.json`. Subida, falha e encerramento usam `PORTAL_REGRESSION_ENVIRONMENT` no ledger externo do controlador. Recibos funcionais continuam baseados exclusivamente na interação com a UI; a disponibilidade desta imagem não aprova nenhum caso do catálogo.
