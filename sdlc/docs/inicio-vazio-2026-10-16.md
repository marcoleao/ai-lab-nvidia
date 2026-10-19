# Início vazio para o teste humano

Em 2026-10-16, o responsável solicitou apagar todos os dados anteriores do SDLC. Foram removidos projetos, conversas, propostas, decisões, versões, eventos, filas, sessões, identidades extras de teste, repositórios/arquivos do Forgejo, logs dos containers anteriores, relatórios, transcrições, prévias e perfis temporários de teste. Os backups locais do runtime e as cópias locais de teste também foram incluídos na limpeza. Não foi criado um backup com os dados apagados.

Permaneceram a instalação, o código e a documentação técnica, os pacotes da extensão, a configuração de rede, os segredos de instalação e as três identidades/chaves de acesso instaladas. O laboratório de IA não foi modificado. O token interno do Forgejo foi recriado com sua conta de integração vazia.

O marcador privado `state/clean-start.json` desativa a carga automática da demonstração. A inicialização valida o acesso existente e não cria nem apaga projetos humanos futuros. Esse comportamento passou em teste descartável, incluindo reinicialização antes e depois da criação de uma ideia humana.

Verificação final somente por leitura: todas as 16 tabelas de dados operacionais estavam vazias; três identidades e credenciais instaladas permaneceram; reserva de inferência livre; Forgejo sem repositórios; portal `ready`. Uma inicialização explícita adicional não recriou exemplos. O workspace manteve em `.state` apenas `target.json`, `operation.lock` e os pacotes de instalação da extensão.

Para iniciar, recarregue a janela do VS Code e use **Começar minha ideia**. A chave pessoal continua válida. O portal poderá pedir novo login porque as sessões anteriores foram apagadas.

Não execute a aceitação sintética no ambiente reservado ao teste humano. Use `doctor` e consultas de leitura para conferir saúde; ensaios que criam registros devem usar uma instalação descartável separada.
