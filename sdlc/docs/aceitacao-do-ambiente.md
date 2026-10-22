# Instalação e aceitação do núcleo local

Atualização de 2026-10-19: `bootstrap.ps1 prepare/up` também prepara e inicia
GitLab, Runner e publicação local de demos. Os comandos de operação e teste
incluem esses serviços. Acesso GitLab: `bootstrap.ps1 access -Service gitlab`;
portas 3180 (GitLab) e 3181 (aplicação), somente loopback.
Consulte o [manual integrado](../gitlab/README.md).
A extensão tem instalação independente em `../../vscode/bootstrap.ps1 install`.
As seções históricas abaixo descrevem o aceite original do núcleo.

Data: 2026-10-15. Escopo: núcleo de controle e portal. A aplicação de produto não é criada por este procedimento.

## O que será instalado

Uma distro WSL2 exclusiva `agentic-sdlc`, em `%LOCALAPPDATA%\agentic-sdlc\distro`, com Docker Engine e Compose. Dentro dela: PostgreSQL, inicializador de schema/usuários, portal/API, consumidor local e proxy de entrada. Dados e código implantado ficam em `/opt/agentic-sdlc`, no ext4. O laboratório e seus modelos não são alterados.

O comando `up` mantém uma sessão WSL dedicada em segundo plano, sem janela, para impedir que o WSL encerre a distro após o término do instalador. `down` para os serviços e encerra essa sessão. Após reiniciar o Windows ou executar `wsl --shutdown`, execute `up` novamente. No teste humano, confirme que o portal continua acessível pelo menos um minuto depois que `up` termina.

O proxy publica **somente `http://127.0.0.1:3100`**. HTTP loopback é uma escolha explícita desta aceitação local; não instala certificados nem abre acesso LAN. A biblioteca continua exigindo HTTPS por padrão, mas o pacote habilita o modo local de aceitação. API, consumidor e banco usam somente a rede interna. O proxy conecta essa rede a uma bridge de entrada, com upstream fixo para o portal; não é um proxy de navegação. Operação após a preparação não depende de internet.

Imagens Python/PostgreSQL/Nginx estão fixadas por digest em `locks/images.env`; dependências Python têm versões e hashes em `services/control/requirements-runtime.lock`. O manifesto de preparação identifica a fonte e a imagem criada. API e consumidor usam papéis de banco distintos; a API não pode alterar atributos administrativos de identidade ou editar eventos de auditoria. O inicializador privilegiado executa apenas migrações e preparação administrativa.

O pacote atual acrescenta Forgejo e o [roteiro de aceitação do backlog](backlog.md). Este checklist continua cobrindo o núcleo inicial. Agentes, inferência, workers que executam código, pipeline de aplicações e deploy de produto permanecem em etapas posteriores. A workstation precisa manter folga de memória para Windows e laboratório; os limites de container não substituem medição real do host.

## Antes de executar

Execute da raiz do repositório, em PowerShell na mesma conta Windows que usa o laboratório:

```powershell
.\sdlc\bootstrap.ps1 plan
.\sdlc\bootstrap.ps1 validate
```

Revise `config/installation.json`, o plano mostrado e este roteiro. WSL2 precisa estar disponível. A preparação baixa o rootfs oficial, verifica SHA256, importa apenas a distro própria e instala pacotes Linux. Não instala Python, Node ou Docker Desktop no Windows; não muda driver NVIDIA, `.wslconfig`, distro padrão, confiança de certificados ou Windows Firewall. Há reinício apenas da distro SDLC para ativar systemd.

## 1. Preparar e subir

Após aprovar o plano:

```powershell
.\sdlc\bootstrap.ps1 prepare
.\sdlc\bootstrap.ps1 up
.\sdlc\bootstrap.ps1 doctor
.\sdlc\bootstrap.ps1 status
```

`prepare` usa internet para pacotes/imagens e construção. Gera secrets e um arquivo de imagens para uso local offline. Pode levar alguns minutos. `up` usa as imagens já preparadas, inicializa dados e aguarda saúde dos serviços. Falhas preservam as etapas; nunca corrigir falha usando `wsl --unregister` ou apagando volumes sem backup e inspeção.

Esperado: db, portal, consumer e entry ativos; initialize concluído com exit code 0. O portal deve responder no Windows. Para diagnóstico:

```powershell
.\sdlc\bootstrap.ps1 logs
```

O fluxo de importação de uma distro nova é validado por checks estáticos e guardas; sua execução completa no Windows será parte desta aceitação. O ensaio automatizado do pacote usa recursos Docker temporários, sem criar a distro definitiva.

O ensaio do pacote em 2026-10-15 passou por construção Python 3.12 com hashes, inicialização, login/logout pelo proxy, acesso loopback pelo host Linux e pelo Windows, papéis restritos no PostgreSQL, revogação/rotação, reinício, backup cifrado e restore-check. Backup adulterado foi rejeitado e a área temporária foi removida. A rede interna foi inspecionada. Desconexão física da internet e instalação da distro definitiva continuam como verificações de aceitação humana.

## 2. Entrar e criar seu projeto

```powershell
.\sdlc\bootstrap.ps1 access
```

Isso copia a chave pessoal do responsável para a área de transferência, sem imprimi-la. Abra `http://127.0.0.1:3100` e cole no campo de acesso. A chave não fica no Git. A sessão dura 30 minutos. Para limpar o clipboard depois de colar: `Set-Clipboard -Value ''`.

Instalações novas iniciam vazias. Crie a ideia/projeto pelo fluxo humano existente; o novo portal completo está em construção. Não há propostas, execução demonstrativa ou falha intencional pré-carregadas. Reiniciar ou repetir `up` preserva o trabalho criado pelo usuário. Instalações antigas não têm seus dados apagados por essa alteração.

## 3. Roteiro humano

| ID | Ação | Esperado | Resultado |
| --- | --- | --- | --- |
| AC-01 | Entrar com chave do responsável | Instalação nova sem projetos; criar a própria ideia pelo fluxo humano | Pendente |
| AC-02 | Revisar conteúdo, destino e versão de uma proposta; informar justificativa e aprovar | Decisão registrada e válida para aquela versão | Pendente |
| AC-03 | Solicitar revisão da mesma proposta | Decisão anterior substituída; não mantém autorização válida | Pendente |
| AC-04 | Aprovar outra proposta e revogar a decisão | Estado revogado e validade negativa | Pendente |
| AC-05 | Consultar a execução criada pelo usuário, se houver | Estados e versões preservados no histórico | Pendente |
| AC-06 | Registrar uma nova execução e cancelá-la | Cancelamento persistido; nenhum agente é disparado | Pendente |
| AC-07 | Conferir processamento dos eventos criados pelo usuário | Nenhuma falha artificial semeada | Pendente |
| AC-08 | Sair e tentar atualizar uma aba autenticada antiga | Sessão encerrada não acessa dados | Pendente |
| AC-09 | Entrar como leitor e tentar ações de escrita | Ações não oferecidas; API também bloqueia | Pendente |
| AC-10 | Revogar chave do leitor enquanto está conectado | Próxima atualização exige nova autenticação | Pendente |
| AC-11 | Reiniciar serviços e conferir decisões/execuções | Dados e histórico preservados | Pendente |
| AC-12 | Sem internet, repetir login, consultas e doctor | Núcleo continua funcional sem criar dados sintéticos | Pendente |
| AC-13 | Gerar backup e executar restore-check | Contagens e cadeia de auditoria conferidas em banco separado | Pendente |

Para AC-09, saia do responsável e obtenha a chave do leitor:

```powershell
.\sdlc\bootstrap.ps1 access -Identity reader
```

Para AC-10, com o leitor conectado:

```powershell
.\sdlc\bootstrap.ps1 revoke-access -Identity reader
```

Atualize o portal; o acesso deve ser bloqueado. Para permitir repetir o roteiro, rotacione a chave:

```powershell
.\sdlc\bootstrap.ps1 rotate-access -Identity reader
.\sdlc\bootstrap.ps1 access -Identity reader
```

São operações administrativas locais, registradas como `local-operator`; não representam login humano pelo portal. `rotate-access` também pode recuperar a chave do responsável. A gestão completa de usuários ainda não possui tela.

Para AC-11:

```powershell
.\sdlc\bootstrap.ps1 restart
.\sdlc\bootstrap.ps1 doctor
```

Para AC-12, desconecte internet depois da preparação; não desative o WSL nem o adaptador virtual necessário ao acesso local. Rode `up`/`doctor` sem executar `prepare`. A aceitação offline aqui cobre o núcleo, não a construção futura de projetos.

## 4. Verificação instalada e aceitação isolada

```powershell
.\sdlc\bootstrap.ps1 doctor
```

`doctor` verifica a saúde sem criar projetos. `test` recusa o ambiente permanente. Testes de autenticação, papéis, idempotência, aprovações e entrega sintética ficam exclusivamente no ensaio descartável `sdlc/scripts/linux/test-install-package.sh`; veja [execução e limites](construcao-fase-0-2026-10-20.md). Não execute esse ensaio durante a apresentação: ele prepara uma instalação adicional e pode consumir recursos e internet.

Relatórios antigos podem ser exportados por `report`; a data e o fingerprint identificam o pacote avaliado, não validam automaticamente uma atualização. O ensaio descartável elimina seus relatórios ao limpar os recursos. Passar no teste automatizado não aprova a experiência humana ou o SDLC completo.

## 5. Backup e restauração de teste

```powershell
.\sdlc\bootstrap.ps1 backup
# Substitua pelo ID informado pelo comando anterior:
.\sdlc\bootstrap.ps1 restore-check -BackupId sdlc-AAAAMMDDTHHMMSSZ-xxxxxxxx
.\sdlc\bootstrap.ps1 export-backup -BackupId sdlc-AAAAMMDDTHHMMSSZ-xxxxxxxx
.\sdlc\bootstrap.ps1 backup-key
```

O backup pausa portal/consumidor, exporta banco e estado privado, cifra com Fernet e retoma os serviços. O limite inicial de plaintext é 256 MiB: suficiente para dados sintéticos, não para grandes workloads. A chave de cifragem não entra no backup. `backup-key` a copia para o clipboard para guarda separada e local, fora da workstation quando houver mídia disponível.

`restore-check` decifra em área privada, restaura em banco temporário, compara contagens e verifica os hashes da auditoria. Remove esse banco e a área temporária após o teste. Não substitui o banco ativo. A exportação grava apenas o arquivo cifrado em `sdlc/backups/`, ignorado pelo Git. Copie arquivo e chave para destinos separados; armazenamento no mesmo SSD não protege contra perda física.

O pacote ainda não automatiza uma restauração destrutiva do ambiente ativo ou recuperação completa após perda da workstation. A restauração validada nesta fase é em destino isolado; recuperação operacional completa precisa de procedimento próprio antes de guardar dados importantes.

## 6. Parar e continuar depois

```powershell
.\sdlc\bootstrap.ps1 down
.\sdlc\bootstrap.ps1 up
```

`down` remove os containers/rede do núcleo e preserva volumes, estado, chaves e backups. Não há comando de exclusão da distro neste pacote. Alterações de código exigem nova preparação; `up` não baixa pacotes nem reconstrói a imagem.

## Registro de aceite

Copie a tabela para um registro local de avaliação e preencha observado, resultado, data e evidências. Registre o `package_sha256` do relatório automático. Não inclua chaves ou cookies em screenshots/logs. Uma decisão humana sobre o núcleo deve listar pendências aceitas e deixar claro que agentes, inferência e ciclo de entrega completo não foram avaliados.

Critério de aprovação: AC-01 a AC-13 satisfatórios para o escopo, sem bloqueio de acesso contornado, persistência confirmada e restore-check aprovado. Qualquer desvio fica registrado antes de avançar para o projeto da aplicação.
