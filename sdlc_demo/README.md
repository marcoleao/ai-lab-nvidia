# Portal SDLC · Demonstração independente

Abra **[index.html](index.html)** no Edge, Chrome ou Firefox. Não é necessário instalar pacotes, iniciar servidor, acessar a internet ou executar o portal real. A pasta pode ser copiada para outra máquina mantendo `index.html` e `assets/` juntos.

O visual parte dos estilos do portal real: marca Dell Technologies, cores, menu global, hierarquia e abas. O acervo contém **6 Sistemas, 10 Projetos, 16 Épicos, 36 Histórias, 216 Tarefas e 14 releases**, além de conversas, auditoria, critérios de aceitação e indicadores fictícios. Inativos e arquivados aparecem ao abrir os filtros e marcar sua inclusão; o acervo permanece navegável.

O planejamento é apresentado em **71 conversas e 516 mensagens**, com perguntas e respostas contextualizadas nos 68 Sistemas, Projetos, Épicos e Histórias. O percurso principal mostra a origem do Sistema Aurora, a divisão do Projeto em Épicos e Histórias e o refinamento dos critérios da busca.

## Roteiro sugerido para o evento

1. Em **Visão geral**, percorra Inventário, Fluxo semanal, Retrabalho, Tempo em aberto, DORA, Releases, Merge Requests, Atividades, Assistente e Histórias.
2. Em **Assistente**, comece por **Aurora · Comércio digital** e acompanhe a descoberta do produto: pedido inicial, perguntas da IA, respostas de negócio, ajustes e proposta. Consulte **Proposta** para abrir os itens criados e **Histórico** para mudar de conversa. Depois selecione **Evolução do catálogo digital** e acompanhe o desdobramento em Épicos e Histórias.
3. Em **Sistemas**, abra **Aurora · Comércio digital → Evolução do catálogo digital → Descoberta de produtos → Buscar produtos por nome**. Consulte uma Tarefa e volte pela localização ou pelo link de retorno.
4. Na História, percorra **Tarefas, Execução, Especificação, Conversas, Auditoria e Configurações**. Em **Conversas**, abra o diálogo de refinamento ou a origem do planejamento, identificados pelo contexto original. A busca alcança perguntas e respostas de todas as páginas; os filtros permitem consultar somente o item ou incluir descendentes. A auditoria possui mais de uma página e permanece independente da situação atual.
5. Em **Releases**, abra **AUR-2026.11 · Catálogo · Busca e detalhes**. A persona inicial é **Release Manager**. Use **Promover DEV → QA**, revise o diálogo e confirme a simulação. Repita **QA → HML** e **HML → PROD**.
6. Observe a composição congelada em QA, a candidata e o digest preservados até PROD. As Histórias permanecem abertas em QA/HML e concluem somente na entrada simulada em produção.
7. Consulte os cenários de aceite DEV pendente, QA reprovado, candidata sucessora em teste, homologação pendente, resultado incerto em produção, composição vazia, cancelamento e acervo.
8. Em **HELP · Guia do SDLC**, use **Reiniciar demonstração** para repetir o roteiro. A ajuda também contém um roteiro com links para os exemplos.

## Comportamento e limites

- A navegação usa URLs com `#`, compatíveis com abertura direta por arquivo. Filtros aplicados, ordem, página e abas podem ser recuperados por recarga e pelo histórico do navegador. A paginação local usa 20 registros; não há corte oculto do acervo.
- O projeto apresenta consultas e exemplos preparados. As únicas alterações de processo oferecidas são as três promoções simuladas. Cancelar o diálogo não altera o cenário; confirmar não executa agentes, testes, build ou implantação.
- O Assistente apresenta diálogos registrados, com autoria humana/IA, perguntas de esclarecimento, revisões e propostas de criação. Os marcos de aplicação são registros separados das respostas da IA. A aba **Conversas** e o Assistente leem a mesma fonte; as sessões identificam origem, itens relacionados e resultado. Nenhuma mensagem é enviada a uma LLM.
- Em cada promoção do roteiro principal, a validação do destino aparece **ficticiamente aprovada**, sem espera, para permitir a continuação durante o evento. Esses botões não indicam disponibilidade das mesmas operações no portal real.
- As alterações ficam em memória e, quando permitido pelo navegador, em `sessionStorage` exclusivo desta demo. A recarga na mesma aba preserva a apresentação; se o armazenamento de arquivos locais estiver indisponível, a navegação continua funcionando em memória. Reiniciar restaura o acervo inicial. Não é necessário limpar o armazenamento do portal real.
- G1, Desenvolvimento Finalizado em DEV, revisão/segurança, validação QA, homologação HML e conclusão em produção são conceitos distintos. A candidata reprovada preserva sua revisão e artefato; a sucessora não herda o aceite anterior.
- **PROD** é o rótulo solicitado para a apresentação. O portal real usa **PRD** para produção.
- As séries semanais/DORA são exemplos históricos globais, separados do inventário atual. Não há série por Sistema: nesse recorte aparece **Sem medição**. Nenhuma meta de SLO é sugerida.
- Nenhum dado foi exportado da instalação, e não há chamadas a API, CDN, modelos ou serviços externos. A política do HTML bloqueia conexões de rede. Não há cadastro ou modificação de aplicações, resultados de agentes ou dados de negócio.

## Estrutura e validação

`assets/data.js` contém o acervo determinístico. `assets/app.js` implementa consultas, navegação e promoções locais. `assets/views.js` reúne dashboard, Assistente, Integrações e HELP. `assets/conversations.js` compartilha a transcrição e o histórico de conversas; `conversations.css` usa a apresentação de chat do portal como referência. `portal.css`, `navigation.css` e `dashboard.css` são cópias locais dos estilos do portal; `demo.css` complementa a apresentação offline.

Verificações dos dados e dependências locais, com Node.js disponível:

```powershell
node --test sdlc_demo/tests/data.test.cjs
```

Verificação por abertura direta em navegador no Windows, usando Edge instalado:

```powershell
powershell -ExecutionPolicy Bypass -File sdlc_demo/tests/browser-smoke.ps1
```

O teste de navegador usa um perfil temporário próprio, encerra seu processo e gera `tests/artifacts/validation.json` e capturas desktop/celular. Esse diretório e perfis temporários não são versionados. Veja [VALIDACAO.md](VALIDACAO.md) para a evidência e os limites desta entrega.
