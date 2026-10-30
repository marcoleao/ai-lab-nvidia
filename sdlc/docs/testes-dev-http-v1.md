# Execução de testes DEV — RA-13

O portal executa casos HTTP versionados contra a implantação DEV confirmada da História. O pedido fixa execução, build, imagem, arquivo, implantação e digest da suíte. Não usa a disponibilidade HTTP como aprovação funcional. QA, HML e PRD continuam ambientes do ciclo de release.

A suíte fica em `tests/dev-http.json`, na fonte original preservada pelo executor do build. O perfil `dev-http-v1` não aceita caminho de arquivo, URL de destino, shell ou comando escolhido pelo modelo. O executor confere a proveniência do artefato, a instância ativa e a suíte antes do envio. Preparação, publicação e testes usam o mesmo lock do destino; o domínio impede publicação ou novo ciclo enquanto houver testes pendentes.

Formato do arquivo:

```json
{
  "schemaVersion": 1,
  "scope": "acceptance",
  "cases": [
    {
      "id": "catalogo",
      "name": "Consultar cursos disponíveis",
      "method": "GET",
      "path": "/api/courses",
      "status": 200,
      "contains": "courses",
      "criterionIndices": [0]
    }
  ]
}
```

`criterionIndices` referencia os critérios funcionais aprovados da História, a partir de zero. O escopo `acceptance` exige cobertura de todos os critérios atuais e recusa índices externos. O escopo `technical` permite verificar a estrutura e disponibilidade; seu sucesso mantém a Tarefa Teste em andamento. O starter v2 inclui uma suíte técnica explícita; o agente de codificação recebe instruções para manter os casos funcionais pelo fluxo normal de código e G1. Preparações v1 e seus nove arquivos permanecem históricas; a v2 tem dez arquivos. Nenhuma aplicação produzida é reescrita para demonstrar esta capacidade.

O contrato admite até 20 casos e arquivo de 64 KB. Métodos: GET, HEAD, POST, PUT, PATCH e DELETE. `body` opcional é objeto JSON de até 8 KB; `contains` compara literalmente até 256 caracteres. Caminho é relativo, sem destino externo, travessia ou controles; não segue redirects. Cada resposta é limitada a 2 MB e cada requisição a dois segundos, dentro do limite total de 45 segundos. O alvo é o IP privado da instância Docker conferida. Não há payload livre no pedido da API, cabeçalhos de credenciais, autenticação dinâmica, navegador, captura de variáveis ou scripts arbitrários neste primeiro perfil. O `test.entrypoint` do contrato Node continua a verificação local da construção/preparação; a suíte HTTP DEV tem política e evidência próprias.

Casos que escrevem aparecem na confirmação com nome, método e rota. A autorização executa a suíte fixada; seu corpo permanece na fonte controlada e não é anunciado como conteúdo revisado pelo painel. Os casos devem usar dados próprios de teste. A validação desta implementação escreve somente em fixtures isoladas, nunca em dados do piloto. Não há rollback automático de dados de aplicação, portanto resultado incerto não autoriza repetir requisições mutantes.

`DevelopmentTest` preserva intenção, autoria, checkpoints, escopo e prova. A prova contém nomes e índices daquela versão, status esperado/observado, resultado, código e duração por caso; não armazena corpos HTTP. Uma reprovação funcional é diferente de falha do executor sem casos. Recibo concluído é imutável. Consulta separa evidência histórica e versão atualmente ativa; trocar implantação ou ciclo invalida sua aplicabilidade sem apagar resultados.

O serviço atualiza somente a Tarefa Teste planejada, mantendo identidade, descrição, plano e outras Tarefas. Aprovação da suíte completa de aceitação pode levá-la a `done`; reprovação mantém seu status `doing` e sua situação operacional `blocked`. Resultado técnico permanece `doing`. A História fica em `testing`, aberta. Desenvolvimento Finalizado exige a próxima decisão do plano, RA-14. Solicitar correção apenas abre o comando existente de novo ciclo, que exige revisão/G1 antes de nova codificação. Evidência antiga continua consultável.

Falha do recorder antes do despacho impede efeito; falha após efeito preserva o checkpoint e exige observação do mesmo ID. Replay usa corpo, persona e chave originais. Pausa, retomada e cancelamento antes do envio seguem lifecycle e auditoria compartilhados. Reinício ou perda real de prova não inventa um resultado nem reexecuta casos. Recuperação administrativa genérica de prova irrecuperável e retenção continuam capacidades pendentes.

Reprodução no WSL `agentic-sdlc`, em `sdlc/portal`:

```text
python3 scripts/regression.py backend development-tests.test.ts development-deployments.test.ts development-cycle.test.ts application-preparations.test.ts
python3 scripts/regression.py browser development-test.spec.ts
python3 tests/dev-test-executor.test.py
python3 tests/runtime-executor.test.py
python3 scripts/validate-development-test.py
```

O último comando constrói e implanta fixtures reais, executa POST e GET, demonstra reprovação funcional com `/health` saudável, preserva replay, recusa implantação substituída e valida cliente Node por socket Unix. Confere e remove apenas seus próprios contêineres, redes e imagens. Não acessa a base operacional, repositório do piloto ou resultados de agentes. A regressão consolidada inclui os dois contratos Python de runtime; cenários de navegador permanecem catalogados com IDs e artefatos por rodada. São validações direcionadas, distintas da regressão completa final em ambiente limpo.
