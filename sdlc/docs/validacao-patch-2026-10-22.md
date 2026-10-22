# Correção técnica de patches

O erro legado `Patch contém caminho não permitido ou duplicado.` misturava causas distintas e não registrava os caminhos recusados. O patch rejeitado não era persistido, portanto não é possível reconstruir com certeza qual arquivo motivou aquela ocorrência. A política também bloqueava qualquer nome contendo `config` ou `lock`, recusando arquivos comuns de aplicação.

A validação agora permite configurações comuns de aplicação e identifica caminho inseguro, duplicação, arquivo protegido, extensão não suportada e limite de tamanho separadamente. Caminhos absolutos, travessia, segmentos ocultos, CI, infraestrutura, ambientes e lockfiles continuam protegidos. Alterar manifestos de dependências continua exigindo autorização explícita do usuário.

O agente recebe a mesma política aplicada pelo backend e o diagnóstico com caminho, código e motivo. Uma saída recusada por validação técnica pode passar por duas correções automáticas, mantendo especificação, decisões, G1 e capacidades concedidas. Se as duas correções falharem, o processamento para e apresenta os motivos. Não há publicação de patch inválido nem conversa obrigatória para corrigir a formatação produzida pelo agente.

**Retomar correção técnica** permite ao usuário retomar uma falha técnica, incluindo o erro legado, sem repetir decisões ou G1 quando o contexto aprovado continua válido. A solicitação é idempotente e verifica versão e contexto. A atualização do ambiente não aciona essa retomada. Mudanças de escopo e novas autorizações continuam no fluxo de conversa, confirmação e revisão G1.

## Validação

- 38 testes automatizados passaram em PostgreSQL descartável; dois testes opcionais de GitLab ao vivo não foram executados nesta rodada.
- Três testes Chromium passaram: conversa, execução e retomada técnica, incluindo perda da confirmação HTTP e preservação da chave idempotente.
- A compilação TypeScript e a compilação de produção do Next.js passaram.
- Ambiente atualizado em `http://localhost:3310`, com backup anterior e igualdade integral dos registros antes e depois da atualização. A execução humana permaneceu `waiting_input/generation`, com conversa versão 18, autorização de dependências preservada e retomada técnica disponível. Nenhum Merge Request foi criado pela atualização.

Os testes verificam o mecanismo da plataforma com respostas controladas. Não demonstram que uma nova geração do modelo produzirá uma implementação correta. Nenhum código do projeto do usuário foi ajustado, nenhuma decisão foi tomada por ele e nenhuma execução humana foi retomada durante a validação. O fluxo disponível ainda termina em Merge Request em rascunho; isso não equivale a implantação.
