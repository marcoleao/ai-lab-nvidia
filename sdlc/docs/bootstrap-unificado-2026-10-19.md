# Bootstrap unificado e extensão independente

A extensão e seus scripts ficam em `vscode/`, ao lado de `lab/` e
`sdlc/`. O comando `vscode/bootstrap.ps1 install` gera o VSIX local e instala a
extensão. `package` somente empacota; `test` verifica os contratos. Os artefatos
ficam em `vscode/.state/`. O bootstrap do SDLC não instala a extensão.

`sdlc/bootstrap.ps1 prepare` prepara núcleo, GitLab, Runner e servidor da demo.
`up`, `down`, `restart`, `status`, `doctor`, `logs` e `test` abrangem os serviços
de ambos os projetos Compose. A operação usa as imagens locais preparadas.
`report` exporta os relatórios do núcleo e do GitLab separadamente.
`access -Service gitlab` copia a senha local do usuário root.
`gitlab.ps1` mantém somente os comandos de acesso e entrega de projetos.

## Verificações em 2026-10-19

- Onze testes da extensão, sete contratos do GitLab, sintaxe PowerShell/Bash e
  geração do VSIX passaram.
- Preparação e inicialização em volumes vazios, na distro WSL existente,
  registraram GitLab e Runner pelo bootstrap integrado. Não foi uma nova importação
  da distro nem reinstalação do Windows.
- Nesse ambiente temporário passaram os testes do núcleo, backlog e chat sintético,
  e o ciclo Issue → MR → pipeline → merge → deploy, com saída externa bloqueada.
- O teste de reinício identificou cache de IP no proxy. A correção usa o DNS interno
  do Docker com atualização periódica e recarrega a configuração em `up`.
- Após a correção, o reinício pelo bootstrap passou no ambiente permanente.
  A parada unificada também foi executada e confirmou ausência de contêineres ativos
  do núcleo e do GitLab, preservando os volumes.
- O teste de abertura da extensão no VS Code ficou impedido pela atualização
  em andamento do aplicativo. Os contratos e o pacote foram verificados.

Os ambientes temporários foram removidos. O GitHub continua hospedando o código
do SDLC; demos e seus repositórios continuam locais.
