# Aceite do núcleo e passagem de etapa

Registro elaborado pelo assistente em 2026-10-15, com base na declaração do responsável nesta conversa: “Ambiente validado, acessei o portal, agora vamos continuar”.

O responsável confirmou a validação do ambiente e o acesso ao portal instalado em `http://127.0.0.1:3100`. Esse aceite permite continuar a construção da plataforma. O laboratório, agentes, workers, backlog integrado e entrega de uma aplicação ainda não foram homologados.

## Evidências disponíveis

- Relatório automatizado exportado em `sdlc/.state/acceptance-report.json`: `automated_status=passed`, concluído em `2026-10-15T04:01:02.825524+00:00`.
- Pacote instalado: `2a8a2a220f30acb2bb7b65ab177460b5dea182e033f54aa778d4f172c34a78fb`.
- Verificações registradas: saúde, autenticação, restrições de leitor e agente, idempotência, aprovação por versão, consumidor e sessão/logout pelo proxy.
- Correção operacional no bootstrap Windows: sessão dedicada mantém a distro WSL ativa depois de `up`; `down` encerra a sessão. A correção fica no repositório Windows, fora da imagem preparada acima.

O relatório automático conserva `human_status=pending`: não foi reescrito para simular uma aprovação via portal. Este documento registra separadamente a declaração humana e sua origem. Não equivale a assinatura digital ou a evento autenticado na auditoria da API. Não há resultados individuais declarados pelo humano para todos os itens AC-01 a AC-13; o checklist completo, em especial recuperação/offline, continua separado.

## Próxima etapa: viabilidade da integração

O comando `./sdlc/bootstrap.ps1 readiness`, executado da raiz do repositório, coleta inventário local e grava `sdlc/.state/readiness-report.json`. Não instala componentes, inicia laboratório parado, altera portas ou executa inferência. As escritas são o relatório e o estado/lock administrativo do próprio bootstrap.

Fotografia em `2026-10-15T04:08:09Z`: RAM utilizável 31,46 GiB, disponível 17,01 GiB; disco da distro com 727,39 GiB livres; hipervisor presente e portal saudável. O laboratório estava parado; modelos não foram inventariados. O comando `Get-VM` não estava disponível, o que exige verificar o gerenciamento Hyper-V e não comprova ausência de suporte no hardware.

Antes de ativar workers, é necessário medir com ambos os ambientes ativos, comprovar a VM isolada e testar a rede privada autenticada e a inferência sob carga. O inventário mantém `worker_execution_authorized=false`, mesmo quando os recursos medidos parecem suficientes. A reserva inicial de 6 GiB para VM e margem de 4 GiB é hipótese de ensaio, não capacidade certificada.

Enquanto essa viabilidade é verificada, o próximo componente funcional previsto é o backlog Forgejo e seu fluxo de outcomes, épicos e histórias versionadas no portal. A aplicação de produto só começa após os contratos e gates da plataforma estarem operacionais.
