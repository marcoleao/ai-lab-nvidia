# Portal humano local

Primeira interface do controle: sessão humana, projetos disponíveis, execuções, propostas, decisões, pendências e histórico. HTML/CSS/JavaScript próprios, sem CDN, fontes remotas ou telemetria. Conteúdo variável é inserido com `textContent`.

O portal é servido pela API em `/`, com recursos permitidos em `/assets/`. Não é hospedado externamente. Há [pacote de instalação e roteiro de aceitação](../../../docs/aceitacao-do-ambiente.md), com proxy de entrada loopback; a preparação do pacote não provisionou um ambiente permanente.

## Sessão

O humano inicia a sessão com a chave pessoal já provisionada pelo operador. O portal limpa o campo após o envio e não grava essa chave em localStorage ou cookies. O backend gera um identificador opaco, armazena seu hash e configura cookie HttpOnly/SameSite Strict/Secure. Validade absoluta de 30 minutos, com revogação no logout e consulta da credencial original a cada requisição.

Há cookie separado de CSRF, acessível ao JavaScript; seu hash é vinculado à sessão. Escritas por sessão exigem origem exata e cabeçalho CSRF válido. Login exige origem exata e possui limitação local de dez tentativas por minuto/origem de conexão. Esse limitador não é distribuído e reinicia com o processo; a implantação precisará definir controles persistentes adicionais.

HTTPS é o padrão. HTTP só pode ser habilitado explicitamente para uma origem loopback, como nos testes de navegador. Uma instalação futura deverá preparar TLS local ou apresentar essa escolha de desenvolvimento no plano. Não há suporte a acesso LAN.

## Interações implementadas

- Consultar projetos e visualizar até 100 execuções, propostas e decisões por projeto.
- Registrar execução, pausar/cancelar e preparar retomada conforme papel e estado. Isso altera o controle; ainda não há agentes executando trabalho.
- Aprovar ou solicitar revisão de uma proposta identificada por versão, hash, política e destino, com justificativa.
- Revogar uma decisão; uma nova decisão para o mesmo objeto/versão substitui a anterior no piloto, inclusive se for rejeição.
- Consultar pendências e solicitar nova tentativa de processamento falho como manager.
- Consultar o histórico com paginação por sequência e horários em America/Sao_Paulo.

Projetos e propostas devem ser cadastrados pela API nesta etapa. Sessões não oferecem ainda cadastro de usuários, recuperação de acesso ou troca de chave. Outras listas ainda precisam de paginação completa. Atualização manual pelo botão Atualizar; não há transmissão em tempo real.

## Verificação

Suite HTTP verifica cookie, CSRF, expiração, logout, replay de sessão encerrada, revogação da credencial, persistência da sessão após reabrir o serviço, isolamento por projeto e origem de login.

Teste Playwright em Chromium descartável verifica login, consulta, registro/cancelamento, aprovação/revogação, recarga, logout, conteúdo HTML exibido como texto, ausência de requisições externas e largura móvel. O teste usa HTTP loopback explicitamente habilitado; os atributos HTTPS/Secure são verificados separadamente por HTTP TestClient.

O servidor e o banco do teste são temporários dentro do container e encerrados ao finalizar. Imagem de teste e dependência Playwright usam a mesma versão. [Orientação oficial de testes Docker](https://playwright.dev/python/docs/docker).
