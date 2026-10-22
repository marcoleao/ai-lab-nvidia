# Protótipo navegável da experiência SDLC

Protótipo independente para revisar a [proposta de UX de Sistemas](../../docs/proposta-ux-navegacao-sistemas-2026-10-22.md), com HTML, CSS e JavaScript e dados fictícios fixos. Não faz parte do portal em `sdlc/portal`.

**Acesso local:** http://localhost:3311/#/systems

**Escopo parcial, sem paridade aprovada:** consulte a [cobertura funcional](http://localhost:3311/#/coverage) e o [critério de preservação](PRESERVATION.md). Funções ausentes nesta simulação permanecem no produto e não estão autorizadas a ser removidas. Código e contratos do portal original são a referência funcional; este protótipo não deve ser usado como substituto funcional.

O portal existente continua em http://localhost:3310. Nenhum código, banco, configuração, imagem preparada ou serviço desse portal precisa ser alterado para acessar este protótipo. A imagem já disponível é reutilizada somente como runtime Node para servir os arquivos estáticos. O contêiner possui nome, rede e porta próprios, sem volumes, credenciais ou redes do SDLC real.

## O que explorar

1. Sistemas → Atendimento ao Cliente → Atendimento Digital → Consulta de solicitações → Consultar andamento da solicitação.
2. A situação atual e sua próxima ação ficam na mesma região. Use o breadcrumb para voltar e as seções locais para aprofundar.
3. Na História, escolha uma opção em **Explorar situação**. Há onze cenários: aprovação, fila, geração, impedimento, falha técnica, MR criado, perda de atualização da tela, correção automática, revisão de decisão, novo G1 e cancelamento.
4. **Revisar especificação** abre o documento; uma confirmação explícita permite aprovar a simulação. **Simular próximo evento** avança fila → geração → MR. O tempo não avança sozinho e não há processamento real.
5. Em **Responder impedimento**, envie uma orientação e prepare a decisão. A resposta é sempre hardcoded: PDF e imagens de até 10 MB. O resumo informa esse limite antes de confirmar. A confirmação abre uma nova revisão G1.
6. Na falha de validação, retome a correção técnica e avance ao resultado. O histórico preserva a recusa anterior. Reconexão da tela não cria nova execução.
7. A aba **Entrega** apresenta arquivos ilustrativos e o limite do resultado: MR em rascunho não conclui a História, testa ou implanta a aplicação.

**Reiniciar simulação** limpa apenas os estados guardados na `sessionStorage` deste protótipo. Rascunhos e escolhas persistem na mesma aba durante a navegação e recarga. Não são enviados a nenhum servidor. Todas as entidades são dados fictícios e não há criação, edição ou exclusão de itens reais.

Há também um [roteiro dentro do protótipo](http://localhost:3311/#/guide). A experiência foi revisada com agente de UX em desktop e largura de 390 px. Isso não substitui o aceite humano de navegação.

## Executar e parar

No ambiente atual, execute na raiz do repositório:

```powershell
wsl -d agentic-sdlc -u root --exec docker compose --project-directory /mnt/c/Users/marco/Documents/Git/ai-lab-nvidia/sdlc/prototypes/navigation-v1 up -d --pull never
wsl -d agentic-sdlc -u root --exec docker compose --project-directory /mnt/c/Users/marco/Documents/Git/ai-lab-nvidia/sdlc/prototypes/navigation-v1 down
```

O Compose usa a imagem local `sdlc-portal:prepared` já existente e não executa build, migração, API ou worker. A porta publicada fica restrita a `127.0.0.1:3311`. O sistema de arquivos do contêiner e os arquivos montados são somente leitura. O servidor aceita apenas GET/HEAD e serve apenas `public/`.

Também é possível usar qualquer instalação local de Node, sem instalar dependências:

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '3311'
node sdlc/prototypes/navigation-v1/scripts/static-server.mjs
```

Não abrir o HTML diretamente por `file://`: o protótipo usa módulos JavaScript e precisa de um servidor estático.

## Limites e verificação

- Sem `fetch`, WebSocket, APIs, LLM, GitLab, banco ou carregamento de fontes/assets externos no frontend. A política CSP define `connect-src 'none'`.
- Dados de negócio e respostas de conversa hardcoded. O histórico de exemplo e os horários também são fictícios.
- Os controles modificam somente a simulação no navegador. A fila não é real, a correção não gera código e o MR não existe fora do exemplo.
- Sete testes Playwright cobrem drill down até Tarefa, retorno/recarga, G1, processamento, impedimento, correção, histórico, comunicação, onze cenários e navegação por teclado/celular. Os testes verificam ausência de pedidos `/api`, carregamentos externos e erros JavaScript.
- Dois testes adicionais verificam identidade visual original e identificação das funções omitidas: nove testes do protótipo passaram. Isso não representa aceite de paridade funcional com o produto; veja `PRESERVATION.md`.
- Capturas e resultados de teste ficam em `.artifacts/`, ignorado pelo Git. Para rodar os testes, disponibilize `@playwright/test` e Chromium num ambiente descartável; `tests/playwright.config.mjs` aceita `PROTOTYPE_BASE_URL`, `SCREENSHOT_DIR` e `TEST_OUTPUT_DIR`. O script `scripts/run-browser-tests.mjs` é o orquestrador do runner descartável usado nesta revisão, com mounts `/source` e `/output`.

Nenhuma alteração deste protótipo retoma o backlog funcional pausado nem promove a nova interface para o portal atual.
