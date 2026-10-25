# Navegação do dashboard

A Visão Geral passa a exibir um assunto por vez: Inventário, Fluxo semanal, Retrabalho, Tempo em aberto, DORA e Releases. Inventário é a abertura padrão. A seleção aparece em destaque na navegação local, que continua disponível durante a rolagem. No celular, as seis opções se organizam em duas colunas.

Os filtros são compartilhados. O recorte aplicado permanece visível e os campos podem ser abertos por “Filtrar indicadores”. Trocar de assunto usa a mesma consulta e mantém o recorte; aplicar outro filtro consulta novamente e oculta os resultados anteriores durante o carregamento. Projeto continua dependente do Sistema escolhido.

Releases possui três subvisões: Etapas atuais, Tempo em composição e Comparação semanal. Somente a subvisão escolhida é apresentada. A metodologia completa fica sob demanda em “Como interpretar”, mantendo os motivos de indisponibilidade próximos aos indicadores relevantes.

Os links existentes `#dashboard-inventory`, `#dashboard-flow`, `#dashboard-rework`, `#dashboard-aging`, `#dashboard-dora` e `#dashboard-releases` continuam válidos. `releaseView=composition` ou `releaseView=weekly` seleciona uma subvisão de Releases; sem esse parâmetro, abre Etapas atuais. Recarga e Voltar/Avançar preservam a localização e os filtros na URL.

Esta alteração reorganiza a apresentação. Não altera fórmulas, fontes, coleta ou disponibilidade das métricas. Todos os totais, status, tabelas, explicações e controles anteriores permanecem acessíveis. A revisão de User Experience orientou a navegação por assunto, sem altura fixa ou rolagem vertical dentro dos painéis.

## Validação

Typecheck e build de produção passaram. As 22 jornadas de navegador passaram no ambiente descartável, incluindo filtros combinados, recuperação de erros, dados persistidos, teclado, exclusividade do assunto/subvisão, links diretos, recarga, Voltar/Avançar e ausência de novas consultas ao navegar entre assuntos. A revisão visual de UX em desktop e celular foi aprovada.

Publicado em `http://localhost:3310`. A conferência somente de leitura no portal confirmou uma única consulta durante a navegação, títulos visíveis sob a barra de navegação e ausência de transbordamento horizontal em 1440 e 390 pixels. API, GitLab e IA continuam disponíveis. As contagens de dados anteriores à publicação foram preservadas e a imagem preparada corresponde ao código validado.
