# Núcleo de controle — implementação inicial

API FastAPI com persistência SQLAlchemy: criação de projeto/execução, consulta, transições de referência, objetos versionados para aprovação, registro/revogação de aprovação e eventos paginados.

Comandos mutáveis exigem `Idempotency-Key`, inclusive criação de projeto. Alterações, eventos e outbox são gravados em uma transação. No PostgreSQL, lock por projeto serializa a cadeia de auditoria. Identidades, hashes de tokens e permissões ficam no banco; cada chamada consulta o estado vigente. Não há credenciais padrão nem servidor iniciado automaticamente.

## Validação realizada

Passaram 32 testes na suite que cobre PostgreSQL descartável, identidades, outbox, sessões humanas, CSRF, backlog Forgejo, normalização de backup SQLite/WAL e decisões que substituem aprovações anteriores. Um teste separado com Chromium real também passou para a interface e o planejamento. Dois testes específicos de migração usam SQLite temporário para verificar checksum e preservação de dados na atualização. O teste de navegador é opt-in e fica separado no CI.

Migrações SQL versionadas em `migrations/` têm hashes conferidos a cada aplicação. No PostgreSQL, advisory lock serializa a migração. `migrate(database_url)` aplica as pendentes em transação; versão desconhecida ou arquivo já aplicado com hash divergente bloqueia o processo. A API não aplica migrações automaticamente.

Novas rotas: `POST /v1/approval-objects`, `PUT /v1/approval-objects/{id}` e `GET /v1/approvals/{id}/validity`. O servidor calcula o hash do conteúdo/destino/política; decisão humana precisa corresponder à versão atual. A consulta de validade é informativa: um futuro executor precisa revalidar sob lock antes de produzir efeitos.

A suite de desenvolvimento usa Python 3.11 da imagem existente. O pacote instalado foi construído e ensaiado com Python 3.12, usando `requirements-runtime.lock` com hashes e imagens por digest. `requirements.txt` continua sendo a lista de dependências dos testes. Consulte o [roteiro do núcleo instalado](../../docs/aceitacao-do-ambiente.md).

## Identidades e permissões

`security.provision_identity` e `security.revoke_credential` são funções administrativas locais, fora da API. O operador que tem acesso direto ao banco é confiável; fornecer `operator_id` registra autoria declarada, sem autenticar esse operador. Provisionamento gera token aleatório, devolvido uma vez ao chamador; somente SHA256 é persistido. Nunca imprimir o resultado em logs. Eventos administrativos não contêm o token.

O criador de projeto torna-se manager. Managers humanos podem atribuir ou remover membros com `PUT/DELETE /v1/projects/{project_id}/members/{identity_id}`. Readers consultam; contributors também propõem alterações; approvers humanos decidem; managers acumulam essas funções e administram membros. Agentes não podem receber os papéis approver/manager. Alterar ou remover a própria associação é bloqueado para evitar perda acidental de administração.

Escritas revalidam credencial, sessão quando houver e permissão dentro da transação, antes de retornar inclusive comandos idempotentes anteriores. Revogação de token não apaga evidências nem invalida automaticamente decisões humanas passadas; revogar uma aprovação é operação distinta. Há [sessão e portal humano](web/README.md); expiração/rotação das chaves pessoais e interface administrativa de identidades continuam pendentes.

## Consumidor local de eventos

`dispatcher.process_one(engine)` processa no máximo uma mensagem, com `FOR UPDATE SKIP LOCKED`. A única ação atual é indexar um evento em `event_inbox`, no mesmo banco. Inbox e confirmação da outbox são transacionais; evento já indexado é deduplicado. Uma falha desfaz a indexação e registra a tentativa; após três falhas a mensagem fica em `failed`.

`GET /v1/projects/{project_id}/processing` mostra até 100 mensagens não entregues. Manager humano pode solicitar nova tentativa de uma mensagem falha em `POST /v1/projects/{project_id}/processing/{message_id}/retry`, com chave idempotente. Essa operação zera o orçamento e gera evento de auditoria.

O consumidor não garante ordem de entrega; a sequência do evento preserva sua ordem no projeto. Não há acesso HTTP, shell, Forgejo, modelos ou deploy nesse consumidor. Nenhum daemon é iniciado. Futuros efeitos externos precisarão de idempotência, leases e reconciliação próprios; não reutilizar a atomicidade local como garantia para esses efeitos.

Referência: [PostgreSQL sobre SKIP LOCKED](https://www.postgresql.org/docs/18/sql-select.html), mecanismo adequado para consumidores de filas; locks de linha não substituem a deduplicação.

## Limites antes de uso real

- Concorrência de comandos idempotentes foi testada em PostgreSQL; leases e workers continuam pendentes.
- Migrações são obrigatórias; a API não cria tabelas. O pacote instalado usa papéis restritos separados para API e consumidor, ensaiados contra operações proibidas.
- Transições são referências: não executam workers/deploy nem verificam aprovação de escopo/plano.
- Aprovação confere objeto/versionamento/hash/destino/política, mas ainda faltam contratos específicos de release, testes, aceite e backup; nenhum endpoint publica software.
- Identidades, associações e sessões humanas estão persistidas; interface administrativa de usuários e ciclo completo das chaves pessoais estão pendentes.
- Outbox possui consumidor local; integrações externas, leases e reconciliação continuam pendentes.
- Consulta retorna até 100 eventos; continuar por `after`. SSE pendente.
- Redaction abrangente e retenção precisam ser implementadas; não enviar dados sensíveis neste estágio.

O [backlog](../../docs/backlog.md) adiciona rotas de itens por projeto, histórico de versões e reconciliação. O consumidor da outbox continua apenas local; as gravações Forgejo são síncronas, recuperadas por marcador quando um efeito remoto sobrevive a uma transação local falha. O escopo tem contrato próprio e verificação da fonte antes da aprovação, mas não autoriza execução ou release.

Não expor em rede ou conectar agentes antes de completar esses contratos.
