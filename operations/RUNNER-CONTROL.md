# Controle do GitLab Runner

A fase `runner-control` prepara o controle do Runner na Precision Windows/WSL2. O registro permanece **pausado**, e `runner_execution_ready` permanece **false**. Esta entrega não provisiona o executor dedicado nem executa pipelines. macOS/GB10 ficam no backlog.

O controle é uma ferramenta independente do Portal SDLC e do GitLab legado. Sua interface administrativa é a página nativa **Admin > CI/CD > Runners** do novo GitLab. A CLI retorna `runner_admin_endpoint`, sem criar outra interface ou alterar o Homepage existente.

Na distribuição que contém esta fase, numa instalação nova, usar PowerShell como administrador:

```powershell
.\install.ps1 -Action Install -Through RunnerControl
.\platform.ps1 doctor --component gitlab-runner --format json
.\platform.ps1 stop --component gitlab-runner --format json
.\platform.ps1 start --component gitlab-runner --format json
.\platform.ps1 restart --component gitlab-runner --format json
.\platform.ps1 logs --component gitlab-runner --format json
```

O coordenador prepara as dependências até GitLab, o controle do Runner e depois o Homepage. O padrão continua `-Through Hub`. No Linux da solução, `sh ./install.sh install --phase runner-control` exige runtime, redes, acessos e o novo GitLab preparados. `plan` não cria registros, credenciais ou controles administrativos. Publicação direta/túnel e outros perfis retornam preparação adiada nesta fase.

O registro usa uma identidade aleatória persistida antes da chamada externa. Um adaptador da versão fixada do GitLab chama seu serviço nativo de criação de Runner numa transação da base CI, com lock por identidade. Não cria PAT administrativo. O registro é de instância, pausado, protegido, sem jobs sem tag, com tag exclusiva e timeout máximo de 900 segundos. Esse escopo serve ao controle em quarentena; não concede capacidade de executar projetos. Ativação futura deve definir o escopo dos projetos e a autoridade correspondente.

ID e token ficam em `ci-runner-identity.json`, privado na raiz de controle Linux, fora dos volumes alterados e do snapshot de distribuição. O token é entregue ao Runner por volume selado, somente leitura; não entra em variáveis, argumentos de processo, Compose, status ou recibos. `.runner_system_id` é estável. Resposta perdida é reconciliada pela identidade; a retentativa recupera o mesmo registro/token. Mudanças de ID, token ou política são recusadas, sem sobrescrever decisões externas.

O container oficial `alpine-v19.5.0` está fixado por manifesto/configuração AMD64. Roda como UID 1000, filesystem somente leitura, capacidades removidas, `no-new-privileges`, sem portas publicadas, binds de host, socket Docker, devices ou namespace PID do host. Tem 256 MiB, meia CPU, 64 processos e áreas temporárias limitadas. Conecta somente à rede `services` para falar com GitLab.

A configuração seleciona executor Docker com um socket Unix inexistente num diretório não montado. Não fornece daemon, imagem de job válida, executor shell ou volume de workspace. Assim, uma alteração isolada de pausa na interface não concede execução no host. Ela torna o diagnóstico inconsistente e exige investigação; não autoriza a CLI a reativar ou reconfigurar silenciosamente o registro.

O [modelo oficial de segurança do Runner](https://docs.gitlab.com/runner/security/) descreve os riscos do executor shell e de containers privilegiados. O [Runner em container](https://docs.gitlab.com/runner/install/docker/) controla o daemon ao qual recebe acesso. Por isso, a próxima fase deve provisionar um executor dedicado, separado do daemon que mantém a fundação. O [modo rootless](https://docs.docker.com/engine/security/rootless/) é uma opção para reduzir privilégios, sujeito a qualificação no ambiente de execução.

O contrato da futura ativação exige: daemon próprio e identidade não administrativa; API privada autenticada; isolamento de filesystem/PID por job; nenhum socket ou diretório de controle da fundação nos jobs; rede e saída autorizadas; imagens, serviços e recursos limitados; política de projeto/referência explícita; limpeza confirmada e logs correlacionados. O instalador não aceita um endereço arbitrário como prova de isolamento. Ainda não existe comando de ativação ou executor instalado nesta fase.

`doctor` consulta somente o estado local e os campos do registro, por adaptador de leitura. Não executa `gitlab-runner verify`, que usa POST e pode registrar metadados de manager. A preparação explícita executa esse verificador dentro da ação auditada de serviço. O resultado `REGISTERED_PAUSED_EXECUTOR_PENDING`, `control_ready=true`, `execution_ready=false` e `executor_state=NOT_PROVISIONED` indica o limite desta etapa. Falha de leitura não vira confirmação de pausa ou de autenticação. `status` mostra observação de processos e não promete saúde remota.

As novas ações estão no catálogo e usam o recorder compartilhado: identidade, registro, imagem, serviço e compensação. O adaptador fixa comparações por digest sem projetar tokens. Metadados de heartbeat ficam nas fontes nativas do GitLab; não criam produtores de domínio ou HistoryEvent do Portal. Falha de startup para apenas processos iniciados pela tentativa e conserva o registro pausado, token e configuração para retomar. Compensação incerta permanece `UNKNOWN/OBSERVED`. Não há rollback de dados de negócio, backup ou remoção operacional.

Os testes isolados cobrem política divergente, socket/capacidade/PID/comando/ambiente adulterados, resposta perdida, retentativa, compensação confirmada/incerta, manutenção e consulta sem escrita. A integração obrigatória `TestGitlabWithRealDocker/RunnerControl` reutiliza somente o GitLab descartável da CI, verifica dois ciclos, ID/token/container estáveis e autenticação real. Limpeza catalogada remove apenas o controle próprio; o registro pausado desaparece com a base GitLab descartável removida pelo teste pai. Não usa repositórios, resultados de agentes ou instalações humanas.
