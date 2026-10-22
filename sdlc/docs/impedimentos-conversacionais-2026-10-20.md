# Impedimentos resolvidos dentro do SDLC

Um impedimento de implementação passa a colocar a execução em **WAITING INPUT**. O agente preserva o motivo, pergunta ao usuário e pode apresentar alternativas. A história continua com a decisão humana pendente; o agente de desenvolvimento externo não cria código, escolhe biblioteca ou altera o resultado do projeto.

Na consulta da História, **Conversar sobre impedimento** abre o diálogo vinculado à execução. Falhas antigas de especificação/codificação também podem iniciar essa conversa. Se o motivo detalhado antigo foi descartado pela versão anterior, a ferramenta reconhece a lacuna e pede esclarecimento; não inventa um diagnóstico retrospectivo.

As mensagens ficam em `ExecutionMessage`, com autoria, sequência e estado. `discussionVersion` impede sobrescrever decisões concorrentes. Pedidos com confirmação HTTP perdida recuperam o mesmo resultado por chave de idempotência, persona e corpo, inclusive quando a execução já mudou de etapa.

O agente distingue perguntas e alternativas de uma escolha expressa pelo usuário. A proposta de decisão aparece para revisão. **Confirmar decisão e revisar especificação** registra a escolha e as capacidades autorizadas. Depois, a especificação é gerada novamente com a decisão no contexto e a História retorna a SPECIFICATION. Um **novo G1** é obrigatório antes da geração de código. Conversar ou confirmar o encaminhamento não publica código nem dispensa G1.

## Dependências e limites técnicos

A proibição fixa de qualquer alteração de dependência foi substituída por autorização explícita do usuário, registrada por execução. Quando necessária, a interface apresenta a autorização. Após confirmação e novo G1, o mesmo controle é verificado tanto na validação do patch quanto na publicação GitLab.

Nesta entrega, a capacidade permite alterar os manifestos `package.json`, `requirements.txt` e `pyproject.toml`. Ler manifests existentes faz parte do contexto do repositório. Isso não instala pacotes nem executa scripts: o executor isolado continua pendente. Arquivos ocultos, CI, credenciais reais, infraestrutura, lockfiles e alterações fora do conjunto de caminhos suportados continuam limitados pela plataforma. A conversa explica capacidades disponíveis e limitações; não pode prometer uma liberação que o backend não suporta.

Não há biblioteca, framework ou solução de negócio predefinida para superar impedimentos. Os prompts descrevem o protocolo de conversa, capacidades e decisões registradas, não uma implementação específica do projeto.

## Validação

Trinta e sete testes TypeScript passaram em PostgreSQL descartável. Incluem: impedimento persistido, pergunta sem autorização implícita, decisão incompleta bloqueada, autorização de dependência obrigatória, idempotência da mensagem/decisão, reespecificação, dois G1 distintos e publicação somente após a nova aprovação. Os testes GitLab destrutivos da entrega anterior não foram repetidos nesta mudança.

Dois testes Chromium passaram: execução assistida e discussão. Foram cobertos papéis de leitura, histórico, autorização explícita, confirmação perdida após mudança de etapa, preservação da mesma chave/corpo e novo G1. A revisão visual com agente UX foi aprovada em 1440 e 390 pixels; há sobreposição menor do launcher existente sobre texto introdutório no celular, sem cobrir as ações de decisão.

O modelo local `qwen3:14b` foi exercitado em uma discussão técnica descartável. O impedimento inicial foi fixture; as duas respostas do diálogo foram inferência real. A pergunta inicial não virou decisão; a escolha posterior gerou uma proposta revisável. Após confirmação do harness de teste, a execução voltou a `queued/specification`, com seis mensagens persistidas, autorização registrada e zero publicações. O ensaio levou aproximadamente 24 segundos. Nenhuma conversa ou decisão foi semeada no ambiente humano.
