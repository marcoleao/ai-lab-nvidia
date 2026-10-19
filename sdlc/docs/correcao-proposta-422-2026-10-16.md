# Propostas: correção do HTTP 422 — versão 0.2.1

O erro foi reproduzido na rodada real, sem publicação de itens. O modelo gerou `parent_ref=proposal` para um outcome e um épico, mas não existia item com essa referência. A validação de hierarquia recusou corretamente a resposta. A extensão descartava os detalhes de validação e apresentava apenas HTTP 422, classificando a falha como transporte.

## Correção

O novo prompt `analyst-planning-tree-v3` pede uma árvore: um outcome, um ou dois épicos e uma ou duas histórias por épico. Não pede identificadores nem referências aos pais. O servidor cria os identificadores e os vínculos por posição estrutural e aplica a validação de conteúdo existente. O formato persistido e publicado continua sendo a lista canônica de propostas com hierarquia, hashes e auditoria.

As mensagens HTTP 422 agora indicam campos e motivos conhecidos, sem copiar texto privado, `input` ou `ctx` dos erros Pydantic. A falha de resposta do modelo é classificada como `invalid_response`. A publicação continua exigindo ação humana separada.

Conversas e propostas anteriores permanecem legíveis. Rodadas antigas conservam o prompt original, portanto retomar uma rodada antiga não troca seu schema. Para usar o novo formato, cancele a rodada falhada e solicite outra proposta na mesma conversa. O operador iniciou essa recuperação na conversa afetada, sem criar projeto, publicar itens ou aprovar escopo. Cancelar preserva a rodada anterior na auditoria.

## Verificação e pacote

- 41 testes da API/Chromium passaram em banco SQLite descartável, com dois testes de bloqueio exclusivos de PostgreSQL ignorados nesse ensaio. Inclui transformação de árvore em vínculos válidos, recusa de pai fornecido pelo modelo, recusa de épico sem histórias e regressão da conversa.
- Sete testes Node da extensão passaram, incluindo diagnóstico sem exposição de entrada privada.
- Backup antes da atualização: `sdlc-20261016T143710Z-9b6f6ae3`.
- Backend instalado: `agentic-sdlc/control:6f5fb07aa843148c47d4fd385c20c2839ea9e889de6030a17b31dea5a111baa8`.
- Extensão 0.2.1 instalada; VSIX SHA256 `A5CC0C4AC1A39FA1B7D089C0D49E2351F628AE541C2C4DC6F7D0E18DD997DAF7`.

Após a instalação, recarregue a janela do VS Code e abra a conversa. Aceite humano da proposta permanece pendente.

A recuperação real concluiu: sete itens de rascunho registrados na mesma conversa, com referências criadas pelo servidor. Nenhum item foi publicado e nenhuma decisão de aprovação foi registrada pela recuperação. A cópia privada temporária usada no diagnóstico foi removida do workspace após a investigação.

A aceitação automatizada instalada passou e o portal voltou ao estado `ready` após o backup final cifrado `sdlc-20261016T144007Z-ca5c701f`.
