# Preservação funcional e visual do SDLC

## Referência e limite deste protótipo

O produto implementado em `sdlc/portal`, seus componentes, contratos de API, estados, regras e testes são a referência funcional. O protótipo é uma exploração **parcial** da apresentação e navegação. Seus dados fixos, simulador e `sessionStorage` não são uma arquitetura de substituição para o produto.

O primeiro recorte omitiu ações existentes e trocou a identidade visual. A auditoria identificou a diferença e a representação continua incompleta. O protótipo não está aprovado para substituir a interface atual. Os testes de navegação simulada não demonstram paridade funcional.

## Correções nesta revisão

- Marca Dell Technologies / Portal SDLC, Segoe UI / Arial e tokens do portal original: azul `#0076ce`, navy `#012169`, texto `#202b3a`, texto secundário `#536476`, borda `#dce3ea`, fundo `#f4f6f8`, sucesso `#246b36` e foco `#df9200`.
- Retirada da marca visual inventada e do perfil fictício nominal. A persona continua explicitamente simulada; o seletor completo de permissões ainda não foi representado.
- [Matriz navegável de cobertura](http://localhost:3311/#/coverage), com 39 capacidades/contratos existentes e um grupo de backlog futuro, mapeados a partir do código original.
- Visão Geral do protótipo declara preservação do dashboard atual. Seus contadores simplificados foram retirados para não parecer uma proposta de descarte de indicadores e filtros já entregues.

A matriz em `public/coverage.mjs` distingue: jornada simulada, representação parcial, ainda não representada, manter original fora deste redesenho, contrato a preservar e backlog não implementado. As referências apontam para componentes de `sdlc/portal/apps/web/app`, exceto os caminhos explícitos da API e pacotes. Os destinos são **propostas**, não fluxos já implementados.

## Funcionalidades cujo desaparecimento não é autorizado

Além das jornadas de História já simuladas, preservar criação/edição/arquivamento em todos os níveis, aprovação de Projeto/Épico, ciclo do Projeto e reabertura, ações de Tarefa, gestão/vínculo/provisionamento de repositórios, escopo de componentes, ambientes, integrações e histórico com autoria. Preservar os dois modos de planejamento: conclusão da entrevista com criação pela assistente; e geração, revisão e aplicação de propostas. Não acrescentar aprovações obrigatórias nem remover confirmações existentes por inferência de layout.

Preservar seleção de persona e permissões, capacidades explícitas para dependências, G1 e novo G1 depois de mudança de decisão. Retomada técnica conserva escolhas e autorizações. Retomada de publicação reconcilia artefatos existentes; não deve regenerar código ou duplicar MR. O resultado MR continua em CODING, sem inventar testes, revisão, segurança, homologação ou deploy já realizados.

Dashboard, quatro semanas, retrabalho, idade e filtros combinados continuam no produto. Projeto depende do Sistema; usuário significa participação. A revisão de Sistemas não autoriza trocar esse dashboard por um resumo.

## Critério para uma implementação futura

1. **Cobertura:** cada função existente tem um destino explícito e uma jornada verificável. “Ainda não representada” é pendência, nunca autorização de remoção.
2. **Revisão navegável:** validar a localização e o acesso às funções omitidas, mesmo com dados simulados, antes de considerar o protótipo uma representação completa da proposta.
3. **Migração incremental:** aplicar a apresentação por tela, reaproveitando serviços, contratos e comportamentos do produto. Não transportar o mecanismo hardcoded para o backend, substituir banco ou reescrever o domínio a partir das fixtures. Mudanças de contrato necessárias devem ser identificadas e avaliadas separadamente.
4. **Permissões e concorrência:** verificar ações sem persona, leitura e papéis autorizados; operação pendente fica ligada à persona original. Em conflito de versão, preservar o rascunho nos fluxos que já o fazem e pedir revisão do contexto. Não alegar persistência universal de rascunho que o produto atual ainda não oferece.
5. **Idempotência:** confirmar resultado incerto com mesma chave, corpo, versão e persona; verificar efeito único em criação, planejamento, mensagens, G1, decisões, retry e MR.
6. **Dados e efeitos:** confirmar hierarquia, estados, associação ao Sistema, arquivos e links preservados. Arquivar continua incluindo descendentes e preservando repositórios. Conversas de Sistema/Projeto e de execução de História não se misturam.
7. **Regressão funcional:** os testes originais e jornadas de cada função precisam passar usando a nova apresentação integrada. Testar também erro, recuperação, fechamento/retorno à página e restrição de cancelamento durante publicação. Verde nos testes do protótipo não substitui essa etapa.
8. **Aceite:** revisar identidade, navegação e cobertura com o usuário antes de promover a mudança ao portal. O backlog funcional permanece pausado durante esta revisão.

Não há nesta revisão alteração de código, dados, configuração ou serviços do portal original. Apenas o protótipo independente e sua documentação foram corrigidos.

## Evidências da correção

Nove testes de navegador passaram: as sete jornadas simuladas anteriores, comparação dos tokens de cor/fonte/marca com a identidade original e indicação explícita das lacunas na página de cobertura. Capturas de desktop e celular foram revisadas. A verificação da imagem preparada do portal original continuou válida e sua API retornou `ready`.

Esses resultados comprovam o recorte testado do protótipo, **não** os critérios de paridade e migração descritos acima. As capacidades marcadas como parciais ou ainda não representadas continuam pendentes de revisão navegável.
