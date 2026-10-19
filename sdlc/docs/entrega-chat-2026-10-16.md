# Chat local no VS Code — entrega C1

Instalado nesta workstation em 2026-10-16. Aceite técnico automatizado concluído; aceite humano da experiência permanece pendente.

## Como experimentar

1. Recarregue a janela do VS Code com **Developer: Reload Window**.
2. Abra **SDLC: Conversar com os agentes** pela paleta `Ctrl+Shift+P`, ou o ícone **SDLC Local** na barra lateral.
3. Na raiz deste repositório, execute `./sdlc/bootstrap.ps1 access`. A chave humana é copiada para a área de transferência; cole-a em **Configurar acesso**. Não envie a chave no chat.
4. Escolha/crie um projeto de planejamento e abra uma entrevista.
5. Envie: “Quero criar um software para uma videolocadora”. Confira se as perguntas se adaptam ao domínio, responda e revise o resumo proposto.
6. Reabra a conversa e confira o histórico. Experimente outra entrevista sobre venda de automóveis. Use dados fictícios.

Esta versão entrega entrevista, perguntas, resumo proposto, histórico persistente e cancelamento. Publicar outcomes/épicos/histórias pela conversa, aprovar histórias pelo chat e executar sua implementação pertencem aos incrementos C2–C4. Aprovação humana de requisitos não é inferida do resumo.

O laboratório precisa estar ativo para inferência. O backend SDLC permanece separado e os dados das conversas ficam no PostgreSQL do SDLC. A chave de acesso da extensão fica no SecretStorage do VS Code.

## Evidências

- Extensão `ai-local.sdlc-chat` 0.1.0 instalada por VSIX local; SHA256 `E349AC868CE4DD3F4F445E55C6679FC746F7C337E49BACFAF1D3F8334C088825`.
- Pacote de controle final: `agentic-sdlc/control:c2d726ffeb508da59e11e6deac9ca544df3186883c973d12457c70e504b510a1`.
- Modelo real `qwen3:14b`; digest `bdbd181c33f2ed1b31c972991882db3cf4d192569092138a7d29e973cd9debe8`.
- Três rodadas reais persistidas: duas de videolocadora e uma de automóveis. O relatório local privado está em `sdlc/.state/chat-live-acceptance.json`, com `status=passed` e `restart_persistence=passed`.
- Aceitação instalada passou: autenticação, papéis, decisões humanas, versões obsoletas, idempotência, consumidor, Forgejo e protocolo de chat. O teste de protocolo utiliza resposta sintética explicitamente identificada; a inferência real acima é uma verificação separada.
- Cinco testes Node da extensão passaram; contrato de configuração PowerShell e regressão de alocação de sub-redes passaram. Na implementação C1 também passaram 37 testes da API e dois testes Chromium; a aceitação instalada foi repetida no pacote final.
- A ativação em host real VS Code 1.141.2 passou no ensaio anterior da mesma extensão. A repetição de 2026-10-16 foi bloqueada pelo atualizador do próprio VS Code (`Code is currently being updated`), antes de carregar a extensão. A instalação do VSIX concluiu com sucesso; confirme a abertura no perfil habitual após a atualização/reabertura.
- Backup anterior à atualização: `sdlc-20261016T132157Z-6f902cf8`. Backup final com conversas: `sdlc-20261016T132958Z-6a96c1a3`; restore-check passou em banco temporário, conferindo contagens, cadeias de auditoria e snapshot Forgejo.

## Convivência de rede no WSL

Havia dois conflitos: alocação coincidente de bridges e reinicialização das regras Docker pelo outro daemon. O SDLC agora reserva um par livre de sub-redes /24 no intervalo 10.240.0.0/16, registrado no estado local. Nesta instalação: core `10.240.0.0/24`, front `10.240.1.0/24`.

O runtime instala uma cadeia própria em `DOCKER-USER`, aceitando somente encaminhamento dentro de cada bridge SDLC e bloqueando encaminhamento dessas bridges para outras interfaces e vice-versa. Não altera configurações do laboratório nem publica portas na LAN. `down` remove a cadeia própria. O ponto de extensão segue a [documentação oficial Docker](https://docs.docker.com/engine/network/firewall-iptables/).

Verificações realizadas: reinício do Docker do laboratório com portal SDLC ainda acessível; reinício SDLC com histórico preservado; tentativa do container de desenvolvimento do laboratório de alcançar o PostgreSQL SDLC bloqueada. Essas verificações não equivalem a isolamento por VM nem a uma avaliação completa de segurança. Limpeza manual das regras de firewall exige reexecutar `up`; outros clientes do laboratório continuam fora da reserva de inferência do SDLC.

Foi criada também uma salvaguarda emergencial cifrada somente do dump lógico durante a recuperação de rede: `network-recovery-20261016T132132Z.dump.fernet`. Ela não é um arquivo de backup completo compatível com `restore-check`; prefira os backups completos acima.
