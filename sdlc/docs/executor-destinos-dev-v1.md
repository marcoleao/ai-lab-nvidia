# Destinos DEV controlados — perfil inicial

30/10/2026 · RA-12a · Perfil `node24-http-v1`.

O destino pertence ao Sistema, por sua referência DEV no repositório único. A preparação cria uma rede Docker interna com identidade estável derivada da referência de ambiente e rótulos de instalação, Sistema, repositório, unidade e digest da configuração. Não inicia aplicação ou comprova implantação. A configuração inicial admite o contrato HTTP Node 24/React de uma unidade na raiz, sem migração de banco.

A pessoa confere o contexto na aba Ambientes do Sistema e confirma a preparação com motivo, persona e versão. O comando grava uma intenção antes de enviar ao executor. Fonte do contrato, repositório, ambiente e configuração são preservados. O worker revalida o contexto, registra o despacho e somente então chama o serviço local por socket Unix. A API não recebe socket Docker.

O serviço confiável possui privilégio Docker no host. Aceita apenas referências validadas do perfil e comandos fixos. Não recebe shell, caminhos de host, URL de provedor ou segredos do modelo. Recursos incompatíveis ou sem rótulos de propriedade não são adotados ou sobrescritos. Nome, ID, driver, isolamento interno e rótulos são conferidos antes de confirmar o destino.

Intenção e prova são duráveis. Repetição do mesmo ID recupera o recibo; outra fonte no mesmo ID é recusada. Reinício deixa execução interrompida incerta e não cria recursos automaticamente. Consulta do mesmo pedido pode reconhecer um efeito próprio já concluído. Ausência de resultado não autoriza reenvio. Retomada de fila pausada e cancelamento antes do envio têm confirmação própria; falha do recorder antes do despacho impede a operação. Prova histórica permanece separada da observação atual.

`EnvironmentOperation` preserva intenção/checkpoints/autoria; `EnvironmentTarget` é a fonte imutável do destino confirmado. Preparação não muda `Environment.liveStatus`, versão ativa, URL ou digest de aplicação. Implantações e testes têm fontes próprias nas fatias seguintes. Não cria ou conclui Histórias, releases ou resultados de agentes.

Comandos reproduzíveis no WSL `agentic-sdlc`, em `sdlc/portal`:

```text
python3 tests/runtime-executor.test.py
python3 scripts/regression.py backend environment-targets.test.ts environments.test.ts lifecycle-contract.test.ts audit-guard.test.ts audit.test.ts
python3 scripts/regression.py browser environment-target-preparation.spec.ts system-environments.spec.ts
python3 scripts/validate-runtime-executor.py
python3 scripts/runtime-executor.py install
```

O ensaio real usa serviço/socket, cliente Node e redes temporárias de propriedade exclusiva. Não acessa a base operacional nem prepara o destino do piloto. Remove apenas recursos com identidade conferida e registra sua operação no ledger de regressão. Instalação administrativa prepara o serviço da plataforma e o mount restrito; não cria destinos por Sistema. O bootstrap incorpora `compose.runtime-executor.json` quando disponível.

Limites: primeira unidade/perfil HTTP, sem banco/migrações, sem adoção de infraestrutura externa, quota global ou recuperação administrativa genérica de pedidos incertos. A saúde do serviço não é a saúde de uma aplicação. Retenção e remoção administrativa de destinos são capacidades próprias; não há remoção automática ao arquivar Sistema. Mantêm-se os indicadores existentes e as decisões de domínio do plano.
