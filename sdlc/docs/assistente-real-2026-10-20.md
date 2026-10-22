# Assistente local com conversa persistida

Continuação: [planos estruturados revisáveis e aplicação confirmada](planos-revisaveis-2026-10-20.md) implementados. As referências abaixo à aplicação indisponível registram o estado anterior; agora Admin/Product Owner pode revisar e confirmar a criação de itens no Projeto.

A prévia de perguntas fixas foi substituída por conversa real com o modelo local. O painel lateral continua desenhado e revisado por agente de UX, com diálogo acessível e adaptação para celular.

## Uso

Abra um Sistema ou Projeto, selecione Admin, Product Owner ou Arquiteto e abra **Assistente IA · IA LOCAL**. Descreva seu próprio objetivo ou responda ao analista. O modelo pode entrevistar e propor um plano em texto. Não existe criação, aprovação, edição de backlog, execução ou deploy por conversa nesta entrega. Aplicar o plano continua indisponível até haver revisão estruturada e operações auditadas.

Sistemas e Projetos têm conversas distintas. Épicos, Histórias e Tarefas usam a conversa do Projeto ancestral. A visão geral pede que o usuário escolha um contexto; não cria um Sistema ou Projeto automaticamente. A conversa é compartilhada entre as personas do modo local e identifica o autor de cada mensagem. Papéis de leitura consultam, mas não enviam ou cancelam rodadas.

Fechar o painel não cancela a geração. Fechar/reabrir ou recarregar recupera os turnos persistidos. O painel mostra os últimos 50; o banco preserva o histórico completo. O modelo recebe um recorte recente, com tamanho limitado, e um snapshot do contexto de planejamento no momento do envio. Mudanças posteriores no contexto não reescrevem mensagens nem respostas anteriores.

## Processamento e falhas

`ChatSession` pertence a um Sistema/Projeto; `ChatTurn` registra mensagem, resposta, autor, modelo, sequência, snapshot e estado. A migração é aditiva, não cria conversas ou itens de exemplo. Envio é transacional, idempotente e exige a versão atual da sessão. Uma sessão só aceita uma rodada pendente por vez. Recebimento, resposta, falha e cancelamento têm eventos no histórico do contexto, sem registrar credenciais.

O worker usa claims transacionais e leases de 150 segundos; a consulta ao modelo tem timeout de 120 segundos. Rodadas RUNNING abandonadas são marcadas FAILED ao expirar, preservando a mensagem para reenvio explícito. Não há regeneração automática que possa duplicar custo ou produzir outra resposta após um reinício. Erros não recebem texto substituto.

Cancelar registra CANCELLED imediatamente e descarta qualquer resposta tardia. O motor local pode continuar a geração até terminar ou expirar; o slot permanece reservado nesse intervalo. A API não promete interrupção instantânea da GPU. Uma nova mensagem pode aguardar na fila. Erros/falhas permitem recuperar o texto no rascunho, revisar e enviar novamente. Quando apenas a confirmação HTTP se perde, **Confirmar envio** repete a mesma chave e conteúdo, sem duplicar a mensagem ou a geração.

O worker faz parte do processo da API e consulta a fila a cada cinco segundos. Esta entrega não equivale ao executor isolado, SSE ou à máquina de execução de pipeline. O relay continua limitando uma inferência simultânea. O dimensionamento atual prevê uma réplica da API; a fila tem lease no banco, enquanto a validação técnica isolada mantém também controle local e o bloqueio do relay.

## Evidências

Build de produção e TypeScript passaram. Vinte e sete contratos passaram em PostgreSQL descartável, incluindo persistência, contexto ancestral, idempotência, autorização, concorrência, falha, cancelamento e descarte de saída tardia, expiração e leitura após reinício. Dois testes Chromium passaram: conversa e hierarquia. O teste de interface usa respostas controladas exclusivamente no navegador de teste; verifica perda de confirmação, recarga, cancelamento, papel de leitura, Escape/foco e dimensões 1440/390 px. Isso não é apresentado como inferência real.

Separadamente, a fila real foi exercitada com `qwen3:14b` usando um banco descartável: estado SUCCEEDED, resposta real em 35957 ms, perguntando pelo objetivo principal, sem escolher domínio ou criar itens. A pergunta técnica não foi gravada no planejamento humano. A conta do modelo não recebeu ferramentas ou credenciais GitLab. Revisão visual UX aprovada nas duas dimensões; teclado virtual e respostas extensas não foram aceitos apenas pelas capturas.

A migração foi aplicada à prévia após backup em `/opt/agentic-sdlc/portal/backups/before-assistant-20261020T183328Z.dump`, na distro SDLC. Foram comparados integralmente antes/depois os seis itens, dois repositórios, seis ambientes e 24 eventos existentes, sem alterações. Zero conversas foram semeadas no ambiente humano. Consultas GET confirmaram conversa vazia/configurada nos três contextos atuais, sem gravar sessões. Runtime passa a iniciar Prisma/API/Next diretamente com Node, evitando tentativa de instalação automática de dependências pelo gerenciador de pacotes durante o uso.

## Próxima etapa

### Correção de continuidade da conversa

Após o relato de falha na segunda mensagem, a leitura da sessão confirmou uma resposta bem-sucedida e duas falhas por saída vazia/incompleta. O controle textual `/no_think` não impedia raciocínio interno no Ollama 0.40.4 com `qwen3:14b`: a reprodução técnica ainda consumiu 430–544 tokens por resposta, incluindo raciocínio. O campo `think:false` também não resolveu nesse endpoint. O provedor passou a enviar `reasoning_effort:'none'`, validado e encaminhado pelo relay. A documentação de compatibilidade do Ollama descreve esse controle: https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx.

Cinco testes do provedor e um teste do relay passaram, incluindo histórico com três interações e rejeição de configuração que habilite raciocínio. Build de produção/TypeScript passou. Três interações reais pelo provedor e relay corrigidos concluíram em aproximadamente 1,1 / 1,7 / 2,2 segundos, sem banco conectado e sem gerar itens de demonstração. A reprodução direta confirmou zero tokens de raciocínio nas três respostas. Respostas truncadas continuam sendo rejeitadas.

A correção foi aplicada ao portal 3310. A sessão e as três mensagens existentes foram preservadas; não houve reenvio automático. Para retomar, recuperar a mensagem que falhou no rascunho e reenviar explicitamente.

Transformar propostas em versões estruturadas de Épicos, Histórias e Tarefas, com revisão humana, vínculo de repositórios, controle de contexto desatualizado e aplicação transacional/idempotente. Aprovações de planejamento e gates continuam explícitos e independentes; nenhuma mensagem aprova ou executa trabalho.
