# Estabilização da regressão do Portal para a Precision

## Diagnóstico

O [run 42660370192](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42660370192), commit `f7190400c5623d937b6a409a7c94c4550859f08a`, aprovou os seis jobs da fundação Precision, mas a regressão do Portal falhou: 18 testes backend em quatro arquivos e um caso de navegador entre 686, sem casos ignorados no navegador.

- Os testes de rollback vazio de build, implantação e destino revertiam somente migrations de outubro. As tabelas posteriores de aceite manual e testes IA ainda referenciavam a implantação. A reversão falhava e deixava tabelas/funções de testes já removidas, causando os erros 500 de consulta e a ausência dos tokens nos testes seguintes.
- As fixtures de trabalho ainda forneciam uma única resposta de review sem contraexemplo. O contrato atual exige conferência posterior e achados completos; a resposta incompleta falhava antes de produzir o impedimento esperado. A fixture de discussão também tentava confirmar uma autorização sem preparar a proposta e identificar pacote, razão e impacto.
- No menu móvel do Assistente, o foco inicial era agendado para um frame posterior. Ele podia sobrescrever a escolha de HELP feita pelo teclado e ativar Assistente. A correção sincroniza o foco logo após `showModal()`, preservando destinos, aparência e fechamento/retorno existentes. Revisão de UX feita conforme AGENTS.md.

## Alteração e cobertura

O helper `tests/migration-cycle.ts` é exclusivo de testes, exige a base `portal_test`, resolve todas as migrations/rollbacks antes de escrever e executa reversão das dependências e reaplicação numa única transação. Falha restaura o schema inicial; não usa CASCADE para contornar dependências. As migrations de produção permanecem intactas. A suíte adicional verifica recusa de outra base antes de escrita, falha injetada de reaplicação com schema/permissões preservados e retentativa bem-sucedida.

As fixtures passam a respeitar os contratos atuais: duas respostas de review com contraexemplo, recusa explícita de confirmação prematura e preparação de proposta com justificativa da dependência. Mantêm testes de recorder falho, lease antigo, repetição, reconciliação sem novo envio e preservação das tarefas. As respostas simuladas pertencem apenas aos testes isolados; não alteram resultados de agentes, aplicações produzidas ou dados humanos.

O workflow separa backend e navegador. `portal-backend` executa todos os arquivos registrados pelo runner isolado e publica seu relatório mesmo em falha. O navegador só inicia após esse job aprovado, com outro PostgreSQL descartável e build atual. Conserva todos os casos do catálogo, sem repetição implícita, filtros ou reaproveitamento de serviços. O comando local `regression:ci` continua disponível para a execução integral existente.

A correção visual não cria tela, muda destino, altera gates ou adiciona métricas. O caso HELP por teclado/API offline e os casos existentes do menu móvel verificam foco, Escape, fechamento, navegação e preservação de rascunho. A cobertura é restrita a essa correção de foco; não declara migração de outras telas.

## Evidência e limites

[Run 42683170276](https://github.com/marcoleao/ai-lab-nvidia/actions/runs/42683170276), commit `3883b1a8527f638179f8c916d1a7d64e87022392`: execução concluída com sucesso. Backend aprovado com 1.092 testes em 95 arquivos, zero falhas. Os quatro casos ignorados são integrações reais opt-in: dois de GitLab/modelo, um de merge e um de qualidade. As suítes antes falhas passaram: build 16/16, implantação 12/12, destino 10/10 e atividades 15/15; os dois novos contratos de ciclo de migrations também passaram. Os resultados foram conferidos no artefato real `portal-backend-regression-1` (13702749491).

Navegador: 686 casos aprovados, zero ignorados, zero falhas e zero casos instáveis, cobrindo todo o catálogo. Artefato `portal-browser-regression-1` (13705527868), `scope=all-catalogued` e `sourceStable=true`. Fingerprint de runtime `a2ba59d106e7ff2a53290c34f89ccca381881f11d44057b00ca1042ecd3d9cd6`; testes `51624992e56ad315022bcdb20f273aa4a60b39e9ae9c34a3fe8f468801d2000a`. Inclui HELP por teclado com APIs offline e a preservação dos contratos existentes do menu móvel. Não houve alteração de nomes/casos do catálogo para obter aprovação.

O equipamento não foi provisionado. A release da fundação permanece a publicada no commit anterior; a aprovação da fundação não concede aceite ao Portal. Instalação independente do Portal sobre a nova infraestrutura, SSO, telemetria, inferência real e publicação externa continuam pendentes.
