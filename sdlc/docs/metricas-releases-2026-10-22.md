# Métricas de releases no dashboard

O usuário aprovou todas as sugestões: quantidade por etapa, tempo em composição e ciclos de retrabalho por rejeição. Elas integram a Visão Geral, sob os mesmos filtros de participação, Sistema e Projeto.

## Definições e fontes

| Indicador | Definição | Fonte e disponibilidade |
|---|---|---|
| Quantidade por etapa e total | Contagem de releases existentes em DRAFT, QA, HML, PRODUCTION e REJECTED, uma vez por release, no instante da consulta | `Release.stage`, excluindo Sistemas arquivados do estoque atual. DRAFT vazio é contado. Não comprova execução de QA ou implantação |
| Idade em composição | Horas corridas entre `Release.createdAt` e a consulta, somente para releases ainda em DRAFT | Mediana, maior idade, número de amostras e faixas de idade. Inclui espera e fins de semana; sem amostras resulta em indisponível |
| Criações semanais | Quantidade de releases criadas em cada uma das quatro semanas | `Release.createdAt`, preservando o histórico de Sistemas posteriormente arquivados; não é uma série histórica de ocupação das etapas |
| Duração da composição concluída | Intervalo entre abertura da composição e seu fechamento com identidade/manifesto de candidata | Sem medição até integrar os eventos reais de abertura e fechamento; não confundir com a idade dos DRAFTs abertos |
| Ciclos após rejeição | Nova composição necessária devido à rejeição de uma candidata | Categorias de origem QA e homologação; sem medição até integrar rejeição e criação da nova composição |

As quatro semanas são as mesmas do dashboard: segunda-feira a segunda-feira, fuso `America/Sao_Paulo`, intervalos `[início, fim)` e semana atual parcial. Registros com criação posterior ao instante da consulta não entram no cálculo. Faixas de idade: menos de 7 dias; 7 a menos de 15; 15 a menos de 30; 30 ou mais. Cada dia tem 24 horas. Medianas não são somadas entre semanas.

Zero é uma contagem observada sem registros. Ausência de integração ou de amostras não vira zero. Alterar, retirar ou transferir Histórias em um DRAFT não constitui, por si só, rejeição ou retrabalho.

## Recorte e participação

- Sistema restringe as releases que pertencem a ele.
- Projeto restringe releases com pelo menos uma História atualmente associada ao Projeto. A mesma release conta uma vez mesmo contendo várias Histórias desse Projeto; um rascunho vazio fica fora desse recorte.
- Usuário significa autoria, ação humana explicitamente correlacionada à release ou participação humana em uma História atualmente associada. Ações genéricas no Sistema ou no Projeto não incluem todas as releases.
- Os filtros se cruzam na entidade release. Participação na release não equivale a responsabilidade nominal pelo Projeto.
- As criações históricas usam o recorte de associação/participação atual; não reconstroem a composição que existia em cada semana. A nota é exibida no dashboard.

Os dados são consultados dentro da mesma transação de leitura consistente dos demais indicadores. A seção não realiza uma busca separada sem filtros e desaparece durante a mudança de recorte, evitando exibir números do filtro anterior.

## Instrumentação exigida na retomada do pipeline

Ao implementar os fluxos de candidata e rejeição, registrar eventos duráveis e correlacionados na mesma transação da transição local. A coleta de duração exige composição/candidata, instante de abertura e instante de fechamento. Fechamento parcial precisa identificar cada composição fechada, sem atribuir uma duração de conclusão ao DRAFT que permaneceu aberto.

Cada ciclo de rejeição deverá ter identidade própria, origem QA/HML, candidata rejeitada, nova composição e instante de abertura do retrabalho. Contar uma vez por ciclo, deduplicando retries de transporte, replays de idempotência, múltiplos achados e mensagens da mesma decisão. Nova rejeição de outra candidata pode abrir outro ciclo. Atribuir o ciclo à semana de abertura; conservar as decisões e pacotes anteriores.

A ausência desses fluxos na versão atual é apresentada explicitamente. Não há botão para fabricar medições, transições de etapa ou dados de demonstração. Metas e limites não foram inventados.

## Validação

Typecheck e build de produção passaram. No ambiente isolado, passaram 48 testes de regras/cálculos e 21 jornadas de navegador, incluindo sete testes novos das métricas e quatro jornadas novas. A validação cobre dados persistidos, release vazia, ausência de amostras, filtros combinados, semanas e apresentação em desktop e celular. Dezesseis testes opcionais de integração não foram executados nesta rodada.

A revisão de User Experience não identificou bloqueios. Os testes criaram dados somente no banco descartável; o preview humano foi consultado apenas para verificar a publicação.

Publicado no portal local em `http://localhost:3310/#dashboard-releases`. A imagem preparada corresponde ao código validado. A verificação posterior confirmou HTTP 200, API saudável, GitLab e IA disponíveis e as mesmas contagens de itens, histórico, repositórios, conversas, execuções e releases registradas antes da atualização.
