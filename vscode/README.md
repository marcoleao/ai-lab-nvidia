# SDLC Local — Agentes

Execute o bootstrap da extensão em PowerShell como administrador, na mesma conta Windows usada para instalar. Sem elevação, ele interrompe com orientação ao usuário.

## Experiência de negócio — versão 0.3

A tela acompanha três passos: **Sua ideia → Seu plano → Sua decisão**. Comece com **Começar minha ideia**, dê um nome e explique seu problema. A conversa inicial é criada automaticamente. A qualquer momento, use **Preparar meu plano**.

O plano usa “resultado esperado”, “frentes de trabalho”, “entregas” e “como saber que está pronto”. Para mudar o rascunho, escreva em **O que você gostaria de ajustar?** e use **Pedir ajuste**: o analista gera a nova versão diretamente. Quando fizer sentido, use **Enviar para revisão** e confirme. Isso acrescenta os itens ao planejamento; não aprova nem inicia a construção. Depois do envio, **Revisar e decidir** abre o portal já na ideia selecionada e na seção de decisões. O portal pode solicitar seu acesso pessoal.

Envios parciais mostram **Concluir envio**. A contagem é conferida nos registros do servidor e permanece correta ao reabrir a conversa. Depois de enviar, ajustes no planejamento existente são feitos pelo portal; não se cria outra cópia silenciosamente. O histórico anterior, a seleção de ideias e os detalhes técnicos ficam em seções recolhidas.

A configuração de acesso ainda exige uma chave pessoal fornecida pelo responsável do ambiente; ela não foi automatizada nem enfraquecida. A aprovação continua no portal existente, cuja experiência ainda não foi redesenhada por completo. A construção automática do software continua pendente.

Na versão 0.2.1, a geração de propostas utiliza uma árvore de outcome → épicos → histórias. O servidor cria identificadores e vínculos; o modelo não os inventa. As mensagens de validação identificam os campos envolvidos sem expor o texto privado. Rodadas pendentes antigas conservam o formato original: cancele-as e solicite uma nova proposta para usar o formato corrigido.

Chat de descoberta e planos no VS Code para os modelos do laboratório local. **Preparar meu plano** encerra a entrevista e **Enviar para revisão** encaminha os itens ao planejamento no Forgejo. A aprovação continua no portal. Codificação automática e aprovação por história ainda são entregas posteriores.

## Instalação local

Esta extensão tem instalação independente de lab/ e sdlc/. Na raiz do repositório:

```powershell
.\vscode\bootstrap.ps1 install
```

O pacote VSIX é gerado em `vscode/.state/packages/`, com SHA256. Utiliza o Node incorporado ao VS Code; não instala Node/npm no Windows e não acessa Marketplace. Recarregue a janela do VS Code depois da instalação se a extensão não aparecer.

Abra o ícone **SDLC Local** na barra lateral ou use `Ctrl+Shift+P` → **SDLC: Conversar com os agentes**. Em **Conectar ao meu ambiente**, cole sua chave pessoal. O administrador pode obtê-la com `./sdlc/bootstrap.ps1 access`. A chave fica no SecretStorage do VS Code e não é enviada ao modelo ou à Webview.

Escolha uma ideia existente ou use **Começar minha ideia**. Exemplos: “Quero organizar as locações de filmes físicos” ou “Quero acompanhar as vendas de veículos do meu estoque”. Responda somente às lacunas úteis e confira o entendimento do analista. O contrato limita perguntas às duas primeiras rodadas, até duas perguntas por rodada. Você pode clicar em **Preparar meu plano** antes desse limite: hipóteses e metas não confirmadas devem aparecer como propostas. O plano contém um primeiro incremento pequeno, com até sete itens. Para alterar o rascunho antes do envio, descreva o ajuste e use **Pedir ajuste**.

Cada envio acrescenta itens; não substitui nem edita automaticamente o planejamento existente. Em caso de falha parcial, use **Concluir envio** na mesma conversa, com a mesma identidade e plano, para retomar sem duplicação. Não gere outro plano como forma de repetir um envio interrompido. O backend mantém idempotência por item, hierarquia, versões, auditoria e origem da conversa/hash no texto de cada item. O envio não é uma transação única: itens já gravados permanecem visíveis durante uma interrupção. Depois de enviar, use **Revisar e decidir**. Nenhum envio inicia código ou deploy.

Fechar/reabrir a janela não apaga conversas. Se uma consulta foi interrompida, **Tentar novamente** respeita a reserva vigente e o orçamento de três tentativas. **Interromper espera** registra o cancelamento; a reserva pode permanecer até 210 segundos para não sobrepor uma chamada cujo término não foi comprovado. Não há inferência autônoma em segundo plano quando o cliente é encerrado.

## Requisitos e limites

- VS Code Windows 1.100 ou superior, workspace confiável, WSL e ambientes lab/SDLC já preparados. Compatibilidade verificada nesta workstation com VS Code 1.141.2.
- Controle em `http://127.0.0.1:3100`, modelo `qwen3:14b` já instalado e serviço Ollama ativo no laboratório. O chat não baixa modelos.
- Uma reserva de inferência no SDLC por vez. Isso não impede outros clientes externos ao SDLC de utilizarem o laboratório.
- Contexto de 16.384 tokens, resposta limitada a 1.000 tokens na entrevista e 2.200 na proposta, com prazo total de 180 segundos. Entrada e schema têm orçamento conjunto de 12.000 bytes; excesso gera erro explícito, sem truncar respostas silenciosamente. Conversas antigas continuam consultáveis. Rodadas antigas pendentes conservam seu prompt original; cancele-as para solicitar uma nova rodada com a correção.
- 100 conversas por projeto, 100 rodadas por conversa e mensagens de até 2.000 caracteres. O contexto inclui todas as respostas humanas e as perguntas anteriores, além do resumo proposto. O orçamento de contexto pode ser alcançado antes do limite de rodadas; nesse caso, abra outra entrevista com os fatos que deseja preservar. Nenhum resumo substitui a aprovação humana.
- Use dados sintéticos. Detecção de formatos conhecidos de credenciais é parcial e não substitui cuidado com os dados enviados. Mensagens e respostas são privadas aos membros autorizados do projeto e entram no backup cifrado do SDLC.

O transporte executa somente um script fixo, validando marcadores e o container Ollama, e encaminha JSON por stdin. Usa HTTP dentro do próprio container; não publica portas nem depende dos endereços das bridges Docker, que podem coincidir entre distros. Não aceita ferramentas, comandos de shell ou caminhos fornecidos pelo modelo.

Os registros de modelo/digest são informados pelo cliente local confiável e conferidos antes/depois da chamada, sem atestação criptográfica independente. Eventos registram solicitante, hashes, tentativas e resultado; não fingem que o modelo é um humano aprovador. Esta versão não dá ao agente credenciais de backlog, Git ou deploy.

As conversas pertencem ao SDLC, não ao perfil efêmero da extensão. Desinstalar a extensão ou remover sua chave não apaga o histórico. Destruir o ambiente SDLC exige backup/restauração para preservá-lo.

Comandos adicionais: `.\vscode\bootstrap.ps1 package` gera somente o VSIX; `.\vscode\bootstrap.ps1 test` executa os contratos locais. Nenhum desses comandos instala ou inicia o SDLC.
