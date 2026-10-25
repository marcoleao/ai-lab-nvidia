# Orientações para evolução do Portal SDLC

Ao trabalhar em telas, navegação, listas, pesquisas, histórico ou APIs de consulta de `sdlc/portal`, leia:

- [Padrões de experiência e navegação](sdlc/portal/docs/PADROES_DE_EXPERIENCIA.md).
- [Arquitetura e política de métricas](sdlc/portal/docs/ARCHITECTURE.md).

Use o contrato aplicável de escopo, filtros, ordenação, paginação, URL, estados da consulta, acessibilidade e rastreabilidade. Preserve a identidade visual e as decisões de domínio existentes. Envolva agentes com perfil de UX ao criar telas ou mudar a navegação, conforme a orientação do usuário.

Evolua os fluxos existentes gradualmente, usando componentes e contratos compartilhados. Identifique limites e lacunas; não apresente uma coleção truncada como completa. Mantenha a situação atual e os gates independentes da página de histórico consultada.

Registre mudanças transversais no documento central e atualize a adoção/backlog com a evidência correspondente. Não declare a migração de telas que ainda não foram adaptadas. Escolhas rotineiras cobertas pelo padrão podem seguir dentro do escopo autorizado, sem pedir nova confirmação.

As instruções do usuário têm precedência. Não altere aplicações produzidas pelo SDLC, dados de negócio ou resultados de agentes para demonstrar uma funcionalidade do portal. Dados simulados de validação ficam em testes isolados.

## Auditoria transversal

Ao criar ou alterar comandos, mutações, agentes, workers, integrações ou manutenção do SDLC, leia o contrato e a adoção em [Auditoria transversal](sdlc/docs/implementacao-auditoria-2026-10-24.md). Toda nova ação exige entrada explícita no catálogo, resultado/fase/decisão coerentes, autoria e correlação, alterações anteriores/novas ou inaplicabilidade justificada, projeção segura e testes de rollback/retentativa. Use o recorder compartilhado na transação; não insira diretamente em `HistoryEvent`. Preserve eventos legados sem inventar resultados. Operações administrativas usam trilha fora da base alterada; segredos, prompts e conteúdo de agentes permanecem nas fontes controladas. Registre a cobertura real e as limitações; não declare migração de fluxos não adaptados.
