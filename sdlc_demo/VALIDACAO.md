# Validação da demonstração — 02/11/2026

Entrega local e independente, sem publicação ou alteração do portal operacional. Todos os itens, eventos, conversas, critérios, artefatos e indicadores de `sdlc_demo` são fictícios. A revisão de UX examinou os contratos e componentes reais antes da implementação e conferiu capturas de desktop e celular.

| Rodada | Resultado | Cobertura |
| --- | --- | --- |
| Contratos do acervo e recursos locais | 9/9 aprovados | Determinismo, 284 itens e hierarquia válida, dez fases, cancelamento/acervo, conclusão somente com candidata confirmada em produção, propriedade das releases, revisões preservadas, recursos locais e sintaxe; sessões/mensagens únicas com autoria e fonte; 68 contextos com diálogo humano/IA; referências de propostas válidas e criação dos filhos posterior à dos pais |
| Edge headless por abertura direta `file://` | 20/20 aprovadas | 284 detalhes de itens e 14 releases, 5.465 links internos, dez assuntos do dashboard, navegação macro → micro, filtros, busca vazia, ordenação, paginação inferior, retorno à consulta, recarga, acervo e situação atual independente do histórico |
| Confirmação de promoções, incluída na rodada ampla | Aprovada | Cancelamento sem alteração; foco no diálogo e retorno com Escape; DEV → QA congela candidata/composição; HML/PROD preservam candidata/digest; Histórias concluem somente em PROD; reinício restaura todos os exemplos |
| Revisão visual e celular, incluída na rodada ampla | Aprovada em 1440 × 1000 e 390 × 844 | Marca, cores, shell e painéis do portal; ausência de overflow da página; navegação ativa e fase atual da História visível na faixa móvel |
| Rodada focal após refinamentos finais | 5/5 aprovadas | Assistente em três contextos e três assuntos; seis integrações; nove links do HELP com rótulos legíveis; sete abas do Sistema, seis da História e nove etapas consultáveis; preservação de filtros aplicados/rascunho/expansão ao ordenar e trocar abas; normalização da página 999 na URL; filtro de datas no fuso America/Sao_Paulo |
| Isolamento de rede e erros de navegador | Aprovado | Nenhum erro de página/console nas duas rodadas; CDP observou 20 requisições locais e zero remotas na rodada focal; HTML com `connect-src 'none'`; nenhuma chamada de API nos scripts |
| Evolução das conversas — 71 sessões / 516 mensagens | 9/9 verificações focais aprovadas | Assistente com Conversa/Proposta/Histórico, seleção de sessões e propostas ligadas aos itens; 24 mensagens do planejamento acessíveis em duas páginas sem duplicação; busca de mensagem posterior à primeira página e abertura da conversa correta; fonte original e recortes independentes; estado/gates preservados; três capturas desktop/celular; nenhuma faixa superior ou chamada remota |

A rodada focal cobre os refinamentos de navegação, paginação e datas; a rodada ampla anterior comprova o catálogo e as promoções. A evolução do Assistente e histórico possui rodada própria. Os nove testes de contrato foram executados sobre as fontes finais. Não se declara uma rodada ampla posterior aos refinamentos focais.

As conversas substituem mensagens soltas por descoberta, esclarecimentos, revisão de escopo, proposta e recibo separado de aplicação humana. Sistema/Projeto/Épico/História mantêm a fonte original; referências de criação permitem consultar a origem do planejamento sem copiar mensagens. As datas fictícias de criação respeitam a hierarquia; a transcrição mantém respostas próximas e concentra intervalos longos na revisão humana. O cache local usa o schema 2 para não recuperar o acervo anterior de conversas.

O caso de data adiciona exclusivamente à sessão isolada do navegador um evento em `2026-11-02T01:00:00Z`, verifica sua inclusão em **01/11**, e exclusão em **02/11**, no horário de São Paulo, removendo a fixture ao terminar. Os testes de promoção também alteram somente o acervo em memória/armazenamento do perfil descartável. O teste encerra o navegador que iniciou e remove seu perfil temporário.

## Reprodução

Na raiz do repositório:

```powershell
node --test sdlc_demo/tests/data.test.cjs
powershell -ExecutionPolicy Bypass -File sdlc_demo/tests/browser-smoke.ps1
```

Rodada focal:

```powershell
powershell -ExecutionPolicy Bypass -File sdlc_demo/tests/browser-smoke.ps1 -Filter 'consultation views|entity subjects|query state'
```

Rodada do Assistente e histórico de conversas:

```powershell
powershell -ExecutionPolicy Bypass -File sdlc_demo/tests/browser-smoke.ps1 -Filter 'conversation journey|consultation views|entity subjects|query state|reset restores'
```

Nesta estação, os contratos foram executados com Node 24.22.1 disponível no runtime Electron do VS Code, pois `node` não está no PATH. Não foram instalados pacotes. A execução de Edge no ambiente de validação precisou sair do sandbox para permitir o endpoint CDP local; o teste continuou usando perfil próprio e sem acessar o portal real.

Relatórios gerados localmente em `tests/artifacts/validation.json` e `validation-focal.json`, com capturas `desktop-dashboard.png`, `desktop-release-production.png` e `mobile-story-execution.png`. O diretório de artefatos é ignorado pelo Git e pode ser recriado pelos comandos acima.

A rodada conversacional gera `validation-conversation.json` e capturas `assistant-desktop.png`, `assistant-mobile.png` e `historico.png`. Após o ajuste final dos horários, os três casos específicos de conversas foram repetidos com `-Filter 'conversation journey'`; esse recibo substitui o anterior no arquivo, enquanto as demais seis verificações da rodada anterior permanecem evidência histórica. A repetição não representa nova verificação do catálogo integral.

## Limites

O teste não comprova execução de agentes, build, qualidade, aceite humano, implantação ou promoção no SDLC real. Os novos controles de promoção existem apenas nesta demonstração e apresentam validação fictícia aprovada para continuar o roteiro sem processamento. O armazenamento é local à aba e pode ser recusado por políticas do navegador; nesse caso o projeto continua funcionando em memória.

As séries históricas globais não são reconstruídas a partir do inventário do exemplo; recortes por Sistema sem série apresentam **Sem medição**. Nenhum KPI, meta ou SLO foi criado no produto. A validação de navegação cobre o Edge informado; não foi executada uma matriz de outros navegadores, tecnologias assistivas, impressão ou testes de carga. A revisão de teclado não equivale a uma auditoria integral de acessibilidade.

Adoção restrita ao projeto `sdlc_demo`. O backlog do portal real, incluindo QA/HML/PRD, não foi migrado ou concluído por esta entrega. Dados, aplicações produzidas, resultados de agentes, serviços e fontes operacionais permaneceram preservados.
