# Entrega do planejamento versionado

Data: 2026-10-15. Estado: atualização instalada e verificada tecnicamente; aceite humano do novo fluxo pendente.

O núcleo validado pelo responsável foi atualizado na distro `agentic-sdlc`. Portal, PostgreSQL, consumidor e Forgejo ficaram saudáveis no `doctor`, com acesso pelo Windows. Identidades e registros anteriores foram preservados pela migração aditiva; o teste instalado utilizou as credenciais existentes. A operação humana continua em `http://127.0.0.1:3100`.

Pacote instalado: `28dd72679145dbee2c9bb59582aa1fd5bb1d56938aa111f64409f6940057ec0e`. O relatório exportado em `.state/acceptance-report.json` registra teste automático aprovado em `2026-10-15T04:32:48.172074+00:00`, mantendo o aceite humano pendente.

## Evidências concluídas

- 32 testes passando com PostgreSQL descartável, incluindo recuperação de publicação após perda de resposta, preservação de versões, restrições de papéis, auditoria e snapshot SQLite com WAL pendente. Um teste de navegador fica separado nessa suíte.
- Um teste Chromium passou para sessão, formulários de outcome/épico/história, decisão de escopo, revisão de critérios, invalidação da aprovação, reconciliação, ausência de execução de HTML fornecido pelo usuário e viewport móvel.
- Ensaio completo em Compose temporário passou com Forgejo real, conta não administrativa, repositórios privados, versões, alteração externa sintética bloqueada, reinício, backup cifrado, restauração em cópias e rejeição de arquivo adulterado. Os recursos desse ensaio foram removidos pelo próprio script.
- O teste instalado passou com o pacote definitivo. Os projetos criados por essa verificação são explicitamente sintéticos; não representam a aplicação de produto.
- Backup anterior à atualização: `sdlc-20261015T043043Z-c3b0538e`. Seu `restore-check` passou com a versão nova.
- Backup incluindo Forgejo: `sdlc-20261015T043314Z-6ef38eed`. Seu `restore-check` confirmou contagens e cadeia de auditoria PostgreSQL, hashes dos arquivos e integridade SQLite do Forgejo.

Nenhuma restauração substituiu dados ativos. O acervo de imagens fixadas inclui Forgejo. As operações de teste e atualização utilizaram somente Docker da distro SDLC; laboratório, modelos e configurações globais de rede/WSL não foram alterados.

## Próxima interação humana

Atualize o portal e siga os passos de [aceitação do planejamento](backlog.md). Use um projeto de teste, crie os três níveis, aprove o escopo, revise um critério e confirme a perda de validade da decisão anterior. O nome do projeto de planejamento não cria diretório de aplicação em `projects/`.

Agentes, inferência, workers isolados, pipelines de aplicações e deploy de produto continuam pendentes. Importação automática, webhooks e reconciliação periódica de backlog também continuam fora deste primeiro fluxo. A próxima etapa depende da avaliação humana desta entrega e da viabilidade de isolamento/rede já identificada no inventário.
