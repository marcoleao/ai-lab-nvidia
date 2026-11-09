# Diagnóstico de publicação e migração — F2c1

Atualização F2c2b: [preparação dos adaptadores](INGRESS.md) acrescenta `publication.ingress` opcional, identidades próprias e configurações privadas para entrada direta/túnel. O diagnóstico continua sem observar estado, credenciais ou serviços. Preparação não ativa ingresso, TLS público ou rotas de aplicações.

Atualização F2c2a: a [origem mTLS](ORIGIN-TLS.md) possui executor local, validação e rotação. O diagnóstico informa disponibilidade desse código sem observar runtime. Ingresso/TLS públicos, adaptadores direto/túnel e reconciliação de issuer/consumidores continuam pendentes. A origem só oferece `/readyz` autenticado; não aplica as rotas públicas projetadas neste relatório.

F2c1 acrescenta `publication` à CLI portátil e ao transporte Windows. Calcula candidatos de URL, requisitos de DNS/TLS, política de rotas e impacto de mudanças de configuração. **É uma consulta de configuração: não observa nem executa publicação, DNS, certificados, túnel, firewall, migração ou autenticação.** Pode ser usada sem domínio público.

F2b continua sendo o executor local disponível. O instalador ainda recusa `direct`/`tunnel` na preparação de acesso. F2c2 implementará adaptadores de ingresso/TLS e reconciliação; esta entrega não conclui F2c nem libera acesso externo.

## Consultar

No pacote nativo, WSL2/Windows Precision, Mac ARM64 ou GB10 Linux:

```sh
sh ./platform.sh publication
sh ./platform.sh publication --format json
sh ./platform.sh publication --component sdlc
```

Windows, depois de instalar a CLI na distro dedicada:

```powershell
.\platform.ps1 publication --format json
```

O transporte usa o operador Linux da instalação, preserva argumentos/resultado e não grava ocorrência administrativa. Caminhos encaminhados referem-se ao filesystem do WSL; para arquivos Windows, use `/mnt/c/...`. A consulta não prepara infraestrutura.

Sem escopo, o relatório inclui **todo o catálogo**, com candidatos públicos e exclusões privadas. `--component`/`--stack` usam o fechamento de dependências compartilhado e são mutuamente exclusivos. Contagens e escopo acompanham a saída. Componentes futuros não são apresentados como instalados.

## Guardar o domínio e comparar configurações

A seção atual de `environments/platform.json` continua válida:

```json
{"publication":{"mode":"local","base_domain":null,"public_urls":{}}}
```

Guardar `base_domain` mantendo `mode=local` mostra candidatos futuros sem mudar issuer ou acesso local. Nomes reservados, como `example.test` e `example.com`, são identificados como não públicos; não são resolvidos pela consulta.

Quando houver domínio, uma cópia candidata pode declarar `direct` ou `tunnel`, domínio e overrides por componente em `public_urls`. Origens devem ser HTTPS, sem credenciais, paths, queries ou fragmentos; duplicatas e publicação de serviços privados/administrativos são recusadas. A consulta não inventa alvo DNS, IP, certificado ou token. Entrada direta exige roteamento; túnel exige provedor e segurança até a origem. Ambos continuam bloqueados, com requisitos explícitos.

```sh
sh ./platform.sh publication \
  --config 'environments/candidate.json' \
  --previous-config 'environments/previous configuration.json' \
  --format json
```

Os arquivos precisam pertencer à mesma instalação e ao mesmo perfil efetivo; ambos passam pelo schema fechado. `--previous-config` é exclusivo de `publication`. Digests identificam as definições comparadas com catálogo/perfil correntes; não são recibos históricos do runtime.

Diferenças incluem modo, candidatos públicos, issuer OIDC, origens locais de identidade/cofre e callback local da UI OpenBao. Guardar domínio em modo local gera diferença de candidato sem migração do runtime. Ativar/desativar configuração externa ou mudar issuer/portas exige reconciliação; o executor atual não realiza essa migração. Nenhuma alteração é aplicada pelo comando.

`oidc` informa issuer/discovery e callbacks locais conhecidos do OpenBao, explicitando a necessidade de origem administrativa privada antes do acesso remoto. O callback CLI `http://localhost:8250/oidc/callback` retorna ao equipamento do operador. Redirects do IdP e do OpenBao precisam coincidir. [Contrato OIDC OpenBao](https://openbao.org/docs/auth/jwt/).

Trocar issuer afeta consumidores além do componente solicitado. `impacted_outside_scope` informa consumidores declarados fora do fechamento consultado. A lista depende do catálogo; não descobre integrações externas/desconhecidas. Novos consumidores precisam ser cadastrados.

## Rotas públicas e administração

O projeto do listener público Keycloak permite somente `/realms/platform`, `/realms/platform/*` e `/resources/*`, com negação por padrão. Administração, realm master, saúde e métricas ficam fora. A política é **projeto ainda não aplicado**, não uma regra ativa. Encaminhar toda a porta local F2b exporia também a administração; é obrigatório um listener público próprio. Configurar hostname administrativo não substitui restrições no proxy. [Hostname](https://www.keycloak.org/server/hostname) e [proxy](https://www.keycloak.org/server/reverseproxy).

As demais aplicações/APIs têm allowlist vazia até receberem contratos de rotas/autenticação/autorização. Uma porta no catálogo não comprova segurança. O Portal SDLC legado não é autorizado para publicação por essa consulta.

OpenBao permanece administrativo e exige caminho privado autenticado para acesso remoto, inclusive quando essa conectividade usa a internet. Banco, cofre, socket Docker, coletores e inferência bruta não recebem publicação direta automática.

## TLS, gates e estado

São exigidas evidências futuras de DNS/alvo, cadeia/SNI/renovação TLS, segurança da origem/headers de proxy, administração privada, remoção da conta bootstrap/MFA, recuperação do cofre, callbacks, login/permissões/logout/revogação em navegador, negação administrativa e acesso por cliente independente na internet. Backup não foi acrescentado como gate.

As redes F2a são internas. Automação pública do Caddy precisará de saída controlada, armazenamento persistente de certificados e estratégia ACME ou certificados fornecidos. HTTP-01/TLS-ALPN-01 dependem do ingresso correspondente; DNS-01 demanda integração/credenciais próprias. Não se deve liberar toda a saída dos executores para emitir TLS. [Requisitos e desafios do Caddy](https://caddyserver.com/docs/automatic-https).

`LOCAL_ONLY` e `BLOCKED` descrevem o relatório. `CONFIGURED_NOT_VERIFIED` significa apenas endereço bem formado. `NOT_OBSERVED`/`NOT_IMPLEMENTED` continuam bloqueios. `external_publication_ready`, `execution_supported`, `runtime_observed` e `installation_ready` permanecem falsos. Uma consulta SUCCEEDED com publicação BLOCKED significa que o cálculo terminou, sem autorização ou comprovação de deploy.

A reconciliação ordena acesso privado/recuperação, ingresso/DNS/TLS, drenagem e ajustes dos consumidores, allowlists, provas de SSO/negação, observação externa e ativação com evidência. Nenhum passo possui executor nesta entrega. Compensação de efeitos, renovação, migração de issuer e políticas de túnel pertencem à F2c2; não há promessa de rollback de dados/sessões.

## Auditoria e evidência

`PLATFORM_PUBLICATION_PLAN_COMPUTED` consta do [catálogo de consultas](command-catalog.json): effect read_only, persistência none_read_only e comparação/rollback inaplicáveis por ausência de mutação. O envelope compartilhado mantém correlação, autoria declarada sem atestação humana e digest. Não cria ledger, eventos, credenciais ou arquivos. Futuros efeitos exigirão catálogo próprio e recorder administrativo.

Testes isolados cobrem os três perfis, estabilidade/ausência de escrita, catálogo/escopo, candidatos locais, nomes reservados, políticas, entrada direta/túnel, domínio/portas/callbacks, impacto fora do escopo, vínculos anteriores e JSON/texto. O transporte Windows testa o comando e caminhos com espaços preservando o ledger. O comando/teste não consulta DNS/HTTPS público nem altera serviços, aplicações, resultados de agentes ou dados de negócio.
