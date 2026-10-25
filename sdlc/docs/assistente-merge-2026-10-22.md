# Assistente de merge

## Solicitação e decisões confirmadas

O usuário solicitou duas opções junto ao Merge Request da História: acessar o GitLab para revisão e integração humana, ou solicitar a integração ao assistente do SDLC. O MR existente deve ser reutilizado; não criar outro MR para representar a mesma entrega.

A identidade inicialmente solicitada foi `ai-agent-for-merge`. O GitLab instalado reserva o prefixo `ai-`; após a recusa no cadastro real, o usuário aprovou o login **`sdlc-agent-for-merge`**, com nome exibido “Assistente de merge SDLC”. A conta é criada no bootstrap do laboratório, sem privilégios administrativos. A credencial é exclusiva dessa identidade, separada da conta de provisionamento/codificação e mantida somente no backend. Não utilizar senha de login no navegador nem expor token ao modelo.

O laboratório utiliza a imagem GitLab CE. Os papéis padrão que permitem merge também concedem outras capacidades. O usuário **autorizou explicitamente o papel mais amplo**, com as operações realizadas pelo SDLC limitadas à consulta e ao merge. A implementação usa Maintainer (40) herdado do grupo gerenciado `sdlc`. Restrições no código do SDLC não reduzem as permissões nativas da conta no GitLab; em particular, não se deve afirmar que a conta é incapaz de editar código por outros endpoints nativos. A API específica do agente não expõe esses endpoints nem disponibiliza seu token ao modelo ou navegador.

Referências: [papéis](https://docs.gitlab.com/user/permissions/), [proteções de branches](https://docs.gitlab.com/user/project/repository/branches/protected/), [papéis personalizados — Ultimate](https://docs.gitlab.com/user/custom_roles/), [API de merge](https://docs.gitlab.com/api/merge_requests/#merge-a-merge-request).

## Contrato da implementação

1. Escopo de consulta herdado do grupo gerenciado `sdlc`, cobrindo seus repositórios existentes e novos. Não conceder administração global nem presumir acesso aos demais projetos privados do GitLab.
2. O provisionamento verifica a identidade existente e suas permissões antes do reuso. Colisão de nome ou privilégios incompatíveis exige revisão explícita; não reaproveitar silenciosamente outra conta. Preparação/reinício não duplicam contas ou tokens.
3. A interface mantém o link direto do GitLab e apresenta a ação do assistente no mesmo contexto da situação da História, junto ao breadcrumb. Antes do envio, identificar repositório, MR, branch de destino e commit exato.
4. A solicitação registra o usuário solicitante, execução, repositório, MR e commit esperado em uma operação persistente idempotente. A decisão do agente e o resultado externo são separados da solicitação humana. Timeout exige reconciliação antes de nova tentativa.
5. O worker usa uma integração específica para a identidade de merge. Não recebe credencial de administração/provisionamento como fallback. A operação externa usa argumentos estruturados e o SHA esperado, impedindo integrar um commit posterior à autorização.
6. Revalidar identidade, escopo, estado do MR, branch de origem/destino, commit, proteções, conflitos e verificações obrigatórias antes de integrar. Draft, falha de pipeline, verificações pendentes ou MR alterado bloqueiam a operação com motivo visível. Não retirar Draft, alterar proteção, forçar push ou contornar aprovação para obter sucesso.
7. Conflitos que exijam alterar código retornam ao fluxo de codificação e conversa da ferramenta. A conta de merge não recebe a tarefa de editar arquivos ou publicar patches. Após mudança de código, obter novamente as evidências e autorizações correspondentes.
8. Reconhecer também o merge realizado diretamente no GitLab: registrar a origem e o autor reais, sem atribuir a ação ao assistente. Merge não comprova Code Review, testes, segurança, criação de pacote, implantação ou conclusão da História.
9. Testar em GitLab e bancos descartáveis: permissões concedidas e recusadas, herança para novos projetos, SHA divergente, conflito, Draft, pipeline pendente/falho, concorrência, resposta perdida, reuso e merge humano. Não integrar a História OMDB existente durante os testes da plataforma.

## Instrumentação proposta

O usuário aprovou todas as sugestões: solicitações, conclusões por origem humana/assistente, bloqueios por categoria, falhas e duração nas quatro semanas. A seção **Merge Requests** do dashboard usa os filtros globais e as mesmas semanas de São Paulo. A comparação semanal e os bloqueios ficam em subvisões separadas.

`MERGE_REQUESTED` conta decisões humanas de solicitar o assistente; reenvios idempotentes e `MERGE_RECONCILIATION_REQUESTED` não são novas solicitações. `MERGE_COMPLETED` registra autoria observada no GitLab, distinguindo assistente e outro usuário. Solicitações de integração iniciadas diretamente no GitLab não possuem uma fonte integrada e aparecem como **Sem medição**; sua ausência não é convertida em zero. A coleta observa somente MRs publicados pelo SDLC, sem importar retrospectivamente intenções ou evidências inexistentes.

Bloqueios são classificados como Draft, pipeline, conflito, revisão alterada, MR encerrado, discussões, verificações e acesso/escopo/configuração. Uma ocorrência pode ter várias categorias, contadas uma vez em cada categoria. Falhas de transporte ficam separadas de bloqueios de política. A duração mede da solicitação original ao horário real de merge, em segundos, com mediana e amostras somente para conclusões do assistente. Não somar medianas semanais; usar as amostras do período. Eventos entram na semana de observação pelo SDLC, que pode diferir do horário externo do merge.

## Estado

Implementação adicionada: migração aditiva `202610220010_merge_operations`, operação persistida por execução, captura de MRs já publicados e novos, worker com lease e reconciliação, endpoint específico com persona/versão/SHA/idempotência, interface de confirmação e métricas.

O cadastro/reuso da identidade entra em `sdlc/gitlab/manage.py up`. Para atualizar uma instalação existente sem reiniciar seus outros serviços, `python3 sdlc/gitlab/manage.py configure-merge` cria/reconcilia somente a identidade e a associação ao grupo. O comando usa a configuração da instalação selecionada, não recebe token na linha de comando e não realiza merges. Em seguida, `sdlc/portal/scripts/connect-gitlab.py` monta a credencial exclusiva no backend, mantendo o override separado de LLM.

O adapter aceita somente MRs do mesmo projeto gerenciado, branches e commit persistidos. Um pipeline aprovado precisa corresponder ao mesmo SHA. Draft, conflitos ou ausência de evidências não são corrigidos pelo agente de merge. A remoção do Draft e a configuração/execução dos controles continuam nas suas próprias etapas; o botão não conclui Code Review, segurança ou testes. A integração é uma ação determinística do assistente: não há inferência fingida para decidir permissões ou fabricar aprovação.

Validação: build/typecheck, 61 testes gerais e seis contratos PostgreSQL do worker passaram; o ensaio real em GitLab descartável comprovou herança de acesso para projeto novo, ausência de administração global, bloqueio de Draft/CI, merge pelo login dedicado e proteção preservada. O reuso da identidade/credencial foi verificado sem criar nova conta. As 24 jornadas de navegador foram exercitadas, com a nova jornada corrigida e aprovada após ajustar a asserção ao papel acessível do link de situação. A revisão visual de UX em desktop e celular não identificou bloqueios. Fixtures e merge de teste ficaram somente no ambiente descartável.

Publicado no portal local `http://localhost:3310`. Conta dedicada configurada também no laboratório existente e credencial montada somente no backend. A migração preservou as contagens anteriores: 29 itens, 129 eventos de histórico, dois repositórios, uma sessão, oito turnos, uma execução, uma release e uma associação de História. Backup anterior em `.prepared/portal-before-merge-assistant-20261022.dump`; imagem anterior preservada como `sdlc-portal:before-merge-assistant-20261022`.

A conferência de navegador na História OMDB e no dashboard usou somente consultas e abertura/cancelamento local da confirmação, com zero requisições POST, em 1440 e 390 pixels. Na consulta atual, o MR OMDB continua sem solicitação de merge e o GitLab exige pipeline aprovado para o mesmo commit (`ci_must_pass`). Esse bloqueio aparece na interface. Não foi integrado código da aplicação humana durante o desenvolvimento da plataforma. GitLab e LLM continuam disponíveis; registry e executor permanecem nas etapas pendentes do backlog.
