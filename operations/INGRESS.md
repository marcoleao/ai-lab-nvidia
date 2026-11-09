# Preparação dos adaptadores de ingresso — F2c2b

Esta etapa materializa configurações privadas para **entrada direta com Caddy** e **túnel Cloudflare com ponte Caddy**. Inclui identidade de cliente própria para o mTLS até a origem e certificado separado para a ponte local. Os arquivos têm revisão imutável, hashes e recibo. Não instala/inicia conectores, não cria túnel/DNS, não emite certificado público e não muda firewall, roteador, issuer ou aplicações.

**Preparado não significa ativado.** Ambos os listeners candidatos usam `127.0.0.1`, só encaminham `/readyz` e negam os demais paths. O resultado mantém `external_publication_ready=false`, `sso_flow_qualified=false` e `installation_ready=false`. A implantação/ativação dos listeners/conector, armazenamento ACME, políticas de saída, regras públicas e qualificação são trabalho seguinte.

## Configurar sem depender de domínio agora

O arquivo atual `environments/platform.json` não muda: local, domínio nulo, sem parâmetros de ingresso. A ausência não impede a instalação local padrão, que termina na origem mTLS. `all` nativo e `-Through Origin` Windows não incluem preparação de ingresso implicitamente.

Use [ingress.example.json](../environments/ingress.example.json) como referência para a seção opcional abaixo; mantenha os demais campos de identidade/perfil da instalação:

```json
"publication": {
  "mode": "local",
  "base_domain": null,
  "public_urls": {},
  "ingress": {
    "revision": "edge-one",
    "hostname": null,
    "direct_port": 10443,
    "tunnel_port": 10444,
    "tunnel_id": null
  }
}
```

Não coloque tokens, chaves ou credenciais nesse JSON. O schema permanece fechado: só `publication.ingress` é opcional; seus campos são explícitos, incluindo valores nulos. Configurações anteriores continuam válidas. Revisão usa identificador minúsculo; portas precisam ser distintas, entre 1024–65535 e sem colisão com o catálogo/overrides. ID de túnel, quando disponível, é UUID minúsculo, não uma credencial.

Quando houver domínio, configure `hostname` ou `base_domain`; sem override o candidato será `gateway.<base_domain>`. Mantenha `mode=local` durante preparação. Domínios reservados/de teste não permitem materialização operacional. A checagem sintática não consulta DNS nem comprova propriedade. Sem domínio/parâmetros, a fase explícita retorna DEFERRED/WAITING, código 42, sem criar controles, material ou processos.

## Preparar nas três plataformas

No pacote nativo, após preparar runtime, redes e origem:

```sh
sh ./install.sh plan --phase ingress --config 'environments/platform.json'
sh ./install.sh install --phase ingress --config 'environments/platform.json'
```

Windows, com pacote atual, administrador e mesma conta da instalação:

```powershell
.\install.ps1 -Action Install -Through Ingress -Configuration .\environments\platform.json
```

O coordenador Windows encadeia as fases locais e prepara os arquivos, com preflight de capacidade antes dos efeitos de host. Domínio ausente conserva a fundação local e adia somente o ingresso. O padrão continua `Origin`.

Gerações antigas da origem podem não possuir as novas identidades. Nesse caso é retornado `PLATFORM_INGRESS_ORIGIN_REVISION_UPGRADE_REQUIRED`; como a chave de assinatura da CA não é persistida, faça uma rotação explícita antes:

```sh
sh ./install.sh install --phase origin --origin-revision ingress-one
```

No Windows, pode encadear com `-Through Ingress -OriginRevision ingress-one`. Reutilize essa revisão nas retentativas. A identidade `platform-ingress` e seu certificado/chave são distintos de `platform-installer`; a ponte usa SAN `ingress.localhost`. A preparação verifica cadeia, uso, validade e separação das identidades, recibo/geração/ID da origem, rede/recursos e TLS local. Uma rotação pendente precisa terminar antes de exportar configurações.

## Arquivos e responsabilidades

O conjunto fica em `<controle nativo>/ingress-bundles/<revision>/`, com permissões privadas. Linux/WSL usa `/var/lib/ai-platform-control/<installation_id>`; Mac usa `~/Library/Application Support/AIPlatform/control/<installation_id>`.

| Arquivo | Função |
| --- | --- |
| `bundle.json` | ID/hash, instalação/perfil/revisão, geração da origem, hashes de arquivos, ferramentas/requisitos e estados separados dos adaptadores. Marca CONFIGURATION_ONLY_NOT_ACTIVATED. |
| `Caddyfile.direct` | Candidato HTTPS público, bind local, ACME com HTTP-01 desabilitado e TLS-ALPN-01 condicionado ao futuro caminho 443. Proxy mTLS somente de `/readyz`. |
| `Caddyfile.tunnel` | Ponte HTTPS local com certificado fornecido, sem ACME e com proxy mTLS à origem. |
| `ca.pem` | Confiança explícita na CA da geração. Nenhuma instalação em trust store do host. |
| `bridge-server.pem` / `bridge-server-key.pem` | Certificado/chave exclusivos da ponte. |
| `ingress-client.pem` / `ingress-client-key.pem` | Identidade técnica do ingresso para a origem mTLS. Não são a credencial do instalador. |
| `cloudflared.json` | Gerado somente quando há `tunnel_id`; hostname exato, confiança CA/SNI/Host explícita, verificação TLS habilitada e catch-all 404. |

Não são exportadas chave de assinatura da CA, chave privada do servidor de origem ou credencial do instalador. A referência Caddy é a versão aprovada no manifesto de imagens; binário nativo gerenciado e versão do conector ainda não são instalados por esta fase. Os paths de certificado/configuração pressupõem diretório de trabalho no próprio conjunto; o executor futuro precisa fixar isso e fornecer armazenamento ACME persistente isolado.

O JSON do conector referencia credenciais em `../../ingress-credentials/<tunnel_id>.json`, fora da revisão imutável, sob o controle privado nativo. Essas credenciais e seu diretório não são criados nesta entrega. Não adicione arquivos ao conjunto nem copie credenciais para o JSON público. Gerar configuração com UUID não cria conta/túnel, não valida credenciais e não qualifica o conector.

## Caminhos de entrada e limites

Direto: exige domínio/alvo DNS, encaminhamento externo 443 até o listener escolhido, saída controlada para ACME, armazenamento persistente e prova de certificado/renovação. O listener gerado continua em loopback e não deve ser tratado como implantação pública. Não se libera a saída das redes de executores para resolver emissão. [HTTPS automático e desafios Caddy](https://caddyserver.com/docs/automatic-https).

Túnel: o modelo fornecido é Cloudflare localmente gerenciado, com credenciais externas ainda pendentes. A ponte Caddy mantém mTLS para a origem; `cloudflared` valida o TLS da ponte por CA e SNI, sem `noTLSVerify`. Essa separação decorre da configuração/transporte HTTP consultados do conector, que não apresentam campo de certificado cliente nesse caminho. É uma decisão de integração, não equivalência com Authenticated Origin Pulls. [Configuração do conector](https://github.com/cloudflare/cloudflared/blob/master/config/configuration.go), [transporte](https://github.com/cloudflare/cloudflared/blob/master/ingress/origin_service.go), [origens HTTPS](https://developers.cloudflare.com/tunnel/troubleshooting/https-origins/).

O Caddy usa `tls_client_auth`, trust pool e SNI explícitos para a origem. [Contrato de reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). Clientes humanos e aplicações continuam sem autorização derivada dessa identidade técnica. Portal SDLC, Keycloak, cofre, modelos e ferramentas não recebem rotas públicas por consequência desses arquivos.

## Retentativa, drift e auditoria

Repetir a mesma configuração/revisão/geração verifica e reutiliza o conjunto. Mudar domínio, portas, UUID ou geração de origem exige nova revisão. Arquivos alterados/extras, links e recibos inválidos bloqueiam adoção; não são sobrescritos. Rotação da origem exige preparar nova revisão de ingresso antes de uma futura reativação.

O journal `ingress-bundle.intent.json` e o recibo `ingress-prepared-bundle.json` ficam na raiz de dados nativa. A escrita usa staging privado e promoção por rename; falha entre promoção e recibo conserva intenção para retomar os mesmos bytes. Candidata divergente e conflito no recibo são recusados. Revisões anteriores são preservadas como configurações operacionais, sem backup de dados de negócio ou exclusão/prune automático.

`PLATFORM_INGRESS_BUNDLE_PREPARED` e `PLATFORM_INGRESS_ARTIFACTS_PREPARED` Windows usam o recorder compartilhado: pedido antes de efeitos, autoria/correlação/fontes, hashes e projeção segura. Falhas comprovadamente anteriores à escrita mantêm FAILED/COMPLETED com estado preservado. Efeitos/promocão sem confirmação mantêm UNKNOWN/OBSERVED e retomada por intenção; não há rollback inventado de serviços porque esta fase não os inicia. Chaves/PEM/conteúdo privado não entram em stdout ou ledger. Limites locais de integridade/administrador permanecem os mesmos.

Testes Go cobrem os três perfis, schemas antigos/novos fechados, identidades, ausência de domínio/efeitos, configurações restritas, privacidade, retentativa, drift, geração antiga e promoção interrompida. Coordenador Windows: 60 cenários. A suíte integral Go voltou a executar e passou, incluindo o caso TLS expirado antes bloqueado por Application Control; nenhuma política foi alterada. CI Linux AMD64/ARM64 foi estendida com parsing Caddy em container descartável sem rede/listener e limpeza própria confirmada (`PLATFORM_INGRESS_ISOLATED_VALIDATED`); execução remota ainda não comprovada. Nem Caddy real, conector, certificados públicos ou aplicações foram iniciados no ambiente humano nesta entrega.
