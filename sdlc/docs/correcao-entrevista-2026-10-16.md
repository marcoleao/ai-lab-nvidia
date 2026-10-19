# Entrevista e publicação de propostas — versão 0.2

O teste humano identificou repetição de perguntas e ausência de avanço para o planejamento. A versão 0.1 exigia ao menos uma pergunta em toda resposta e enviava ao modelo somente resumo curto, perguntas recentes e mensagem atual. Respostas humanas podiam desaparecer do contexto por compressão do resumo. Também não havia publicação de backlog pelo chat.

## Mudanças

- O modelo recebe todas as respostas humanas e perguntas anteriores, além do resumo proposto. Correções humanas prevalecem sobre o resumo. Entrada excedente produz erro explícito; não há corte silencioso do histórico.
- A ordem das rodadas usa a sequência da auditoria, inclusive nas conversas anteriores. Ajustes regressivos do relógio WSL não fazem mais uma resposta antiga aparecer como a última. O último rascunho estruturado também entra no contexto de revisões posteriores.
- Respostas sem perguntas são válidas. O contrato permite até duas perguntas nas duas primeiras rodadas e nenhuma pergunta após esse limite; o analista deve indicar a geração da proposta. O botão de avanço está disponível antes desse limite.
- **Gerar proposta agora** solicita diretamente uma proposta estruturada: um outcome, um ou dois épicos e histórias com critérios, até sete itens. O servidor valida referências únicas, parentesco, critérios das histórias, medida do outcome e ausência de perguntas na proposta. Hipóteses e metas continuam sujeitas à revisão humana.
- **Publicar proposta no backlog** exige confirmação e usa a API existente de backlog/Forgejo, com a identidade humana que gerou a proposta. Cada item conserva referência ao turno, hash do resultado, histórico de versões e eventos existentes. O agente não recebe credencial de publicação.
- Publicação e aprovação permanecem separadas. O escopo é revisado/decidido pelo portal. Nenhuma publicação inicia código, testes ou deploy.

## Uso nas conversas existentes

Recarregue a janela do VS Code para carregar a versão 0.2. Abra a conversa existente e clique em **Gerar proposta agora**. Não é preciso responder a todas as perguntas antigas. Se houver uma rodada antiga pendente, cancele-a antes de solicitar outra; a reserva pode aguardar o prazo de recuperação.

Revise os itens e as hipóteses na conversa. Para ajustar o rascunho, envie a correção e gere outra proposta. Quando estiver adequado, clique em **Publicar proposta no backlog**, confirme e abra o portal para conferir os itens e decidir sobre o escopo.

Cada publicação acrescenta itens; não substitui o backlog existente. Em falha parcial, repita a publicação da **mesma proposta e identidade**. Chaves estáveis por turno e referência permitem recuperar efeitos já gravados sem duplicar itens. Itens publicados antes de uma falha permanecem visíveis; não existe transação distribuída única. Não gere outra proposta para retomar uma publicação interrompida.

Conversas têm contexto de 16.384 tokens e orçamento conjunto de entrada/schema de 12.000 bytes. Saída: 1.000 tokens na entrevista e 2.200 na proposta. O limite de contexto pode ser atingido antes das 100 rodadas; nesse caso, abra outra entrevista com os fatos que deseja preservar.

Aprovação por história, edição do backlog pela conversa e implementação automática continuam pendentes. Esta versão cobre a passagem da entrevista à proposta e sua publicação humana.

## Verificação

Regressão em container descartável: 40 testes da API/navegador passaram; dois testes de bloqueio exclusivos de PostgreSQL foram ignorados no ensaio SQLite. Inclui retenção literal de respostas mesmo com resumo incompleto, encerramento sem perguntas, proposta sem publicação implícita, rejeição de hierarquia inválida, normalização de pai vazio para nulo e botões/renderização segura no Chromium. Seis testes Node passaram, incluindo retomada da publicação após perda de resposta posterior ao commit e ausência de chamadas de aprovação/execução nesse fluxo.

Backup anterior à atualização: `sdlc-20261016T135931Z-13d20474`. O teste real de planejamento utiliza exclusivamente dados sintéticos em projeto identificado e registra seu resultado local em `sdlc/.state/chat-planning-acceptance.json`. Aceite humano permanece separado das verificações técnicas.

Resultado instalado: proposta real com cinco itens persistida; após a correção da ordenação, sua publicação foi retomada com sucesso no Forgejo e repetida sem duplicações. Cada item contém origem por turno/hash; o relatório registra `resumed_completed_real_turns=true`. A aceitação do SDLC instalado também passou. Os projetos de ensaio estão identificados como sintéticos e não representam aplicações de produto.

Extensão 0.2.0 instalada; VSIX SHA256 `D04EDE8008913AC59DC9EA2E7682EA937A5F0A5D9097ED748513189DB21EA039`. Backend final `agentic-sdlc/control:63ae516a41d3184baebee5529da366a0058fc4c121a610533f88f5937d1bf290`. A confirmação da abertura da extensão no perfil habitual depende da recarga da janela pelo usuário.

Backup final: `sdlc-20261016T141449Z-10c6cfd5`; restore-check passou em banco separado, incluindo contagens, cadeias de auditoria, hashes de arquivos e integridade SQLite do Forgejo.
