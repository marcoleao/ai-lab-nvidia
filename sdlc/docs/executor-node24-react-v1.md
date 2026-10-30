# Executor inicial de construção DEV — Node 24 / React

29/10/2026 · RA-11 · [Plano incremental](plano-incremental-releases-ambientes-2026-10-27.md#38-ra-11--construção-de-trabalho-e-novo-piloto).

O primeiro perfil é **node24-react-v1**, com uma unidade HTTP na raiz do repositório. O piloto escolhido pelo usuário é uma aplicação nova de venda de cursos on-line, Sistema CURSOS, Projeto CURSOS-VENDAS. A primeira jornada aprovada é catálogo → detalhes → pedido, **sem cobrança**. Cadastro, requisitos, gates e dados são novos; VIDLOC não é fonte do piloto. As histórias cadastradas permanecem em especificação. Este documento não afirma que a aplicação já foi codificada ou implantada.

## Fonte e autorização

O serviço de build é infraestrutura base da plataforma. Instalar esse serviço não provisiona destinos de aplicação. [Assistente, serviços e executores têm responsabilidades distintas](autonomia-assistente-executores-2026-10-29.md): o assistente deverá encaminhar ações suportadas do próprio SDLC; o executor as realizará com fontes e provas controladas. Hoje o build da História é acionado pelos controles do portal. Provisionamento/implantação DEV e seu encaminhamento ficam nas fatias RA-12a/b/c, sem afirmar que a conversa já os executa.

A História pode construir sem release. É necessário confirmar o merge da execução atual e preservar sua referência integrada. A prévia confere que o HEAD do destino DEV contém essa integração por ancestralidade, fixa o SHA observado, lê o contrato nesse mesmo SHA e confere o perfil preparado. **Esse destino é compartilhado:** a fonte pode conter outras alterações já integradas; não se anuncia isolamento do código de uma única História. A prévia não grava trabalho. Motivo, aceite, persona, versão da História, operação anterior e token de contexto autorizam a intenção durável. O worker revalida as fontes antes de enviar; mudança detectada impede o envio. O build sempre usa o SHA fixado, inclusive se a branch avançar depois do envio.

Recebimento, início, envio e artefato confirmado são fatos distintos. A confirmação guarda imagem por ID de conteúdo, digest SHA-256 e tamanho do arquivo Docker salvo. Não é pacote de release/candidata QA nem comprovação de testes, implantação, saúde ou Desenvolvimento Finalizado. A disponibilidade posterior do artefato precisa ser revalidada pelo implantador; o recibo preserva o fato histórico da construção.

## Perfil suportado

Contrato `.sdlc/execution.json`, `schemaVersion: 1`, uma unidade:

```json
{
  "id": "web", "path": ".",
  "runtime": {"kind": "node", "version": "24"},
  "build": {"entrypoint": "scripts/build.mjs"},
  "test": {"entrypoint": "scripts/test.mjs"},
  "artifact": {"dockerfile": "Dockerfile", "context": "."},
  "health": {"kind": "http", "path": "/health", "port": 8080, "status": 200},
  "migrations": {"mode": "none"}
}
```

O objeto acima é uma entrada de `units`, não o arquivo completo. Arquivos de build/teste, `server.mjs` e `package.json` precisam existir na fonte. O build produz `dist/app.js`; a presença desse arquivo é conferida antes de registrar o artefato. Execução dos testes pertence à RA-13.

Dockerfile reconhecido, com estas instruções e sem outras diretivas:

```dockerfile
FROM sdlc-node24-react:prepared
WORKDIR /app
COPY . .
RUN ["node","scripts/build.mjs"]
USER node
EXPOSE 8080
CMD ["node","server.mjs"]
```

O serviço interpreta esse **perfil controlado**. Não entrega o Dockerfile do repositório a um builder geral: executa a entrada Node em sandbox e empacota os arquivos regulares produzidos sobre a imagem de ferramentas fixada. Não aceita FROM externo, instruções extras, shell vindo do chat, instalação de dependências ou comandos de infraestrutura. Dependências reconhecidas, se declaradas, usam versões exatas: React/React DOM 19.3.1, scheduler 0.28.0, esbuild e seu binário Linux x64 0.28.2. Dependências novas exigem outra preparação/revisão de ferramenta. O alias é documental; cada pedido fixa o ID efetivo da imagem preparada.

## Isolamento e limites

API não recebe socket Docker. Conecta por socket Unix a um serviço local separado; acesso é limitado a UID 0/1000 e permissões do socket, dentro do modo de identidades declaradas do laboratório. O serviço possui privilégio Docker do host e é parte confiável da infraestrutura; isto não é uma garantia contra administrador do host nem uma VM por build.

O serviço consulta somente GET no GitLab gerenciado, com credencial dedicada que não entra no container de build. Baixa o arquivo do SHA inteiro, valida todos os membros antes de materializar o snapshot e recusa travessia, arquivos especiais, links, submódulos e caminhos de credenciais conhecidos. Até 16 MiB de arquivo compactado e conteúdo, 2.000 entradas, 2 MiB por arquivo de origem; excesso impede execução, sem truncamento anunciado como completo. O único bind mount da execução é o snapshot próprio, somente leitura.

Código executa como UID 1000, sem rede, capabilities ou privilégios adicionais; filesystem raiz somente leitura, workspace tmpfs de 128 MiB e `/tmp` de 64 MiB, 768 MiB de memória sem swap, uma CPU, 128 processos e 120 segundos. Saída arbitrária de stdout/stderr é descartada, sem buffer ilimitado nem publicação em auditoria/interface. Resultados técnicos usam códigos selecionados. [Semântica dos limites de memória/CPU Docker](https://docs.docker.com/engine/containers/resource_constraints/).

Empacotamento usa outro container que nunca é iniciado, com arquivos regulares validados. Até 4.000 entradas de saída, 16 MiB por arquivo, 128 MiB totais e arquivo de imagem de até 512 MiB. O arquivo fica em diretório privado por operação. Artefatos históricos são preservados; retenção/quotas globais e descarte administrativo serão capacidades próprias. A limpeza de containers confere os rótulos de propriedade e não remove recursos de outras aplicações.

## Recuperação e auditoria

RA-11b acrescenta o propósito fixo `application_preparation`: além da compilação, executa `scripts/test.mjs` em sandbox separado, sem rede, UID 1000, raiz somente leitura, 256 MiB, uma CPU, 64 processos e 30 segundos. Somente saída zero produz `technicalTestPassed:true`. A preparação pode então registrar seu status técnico externo no SHA/ref exatos do GitLab, preservando o pipeline obrigatório. O build comum da História mantém seu significado original; não aprova testes automaticamente. [Contrato da preparação e recuperação](preparacao-aplicacao-node24-react-v1.md).

O cliente HTTP envia `Content-Length` explícito no POST ao socket, conforme o parser limitado do serviço. `/health` conserva o contrato anterior; `/capabilities` anuncia separadamente a capacidade de verificação da preparação. Capacidade ausente impede iniciar esse propósito.

Identidade do pedido e digest de seus campos são duráveis no serviço antes de executar. Repetir a mesma referência recupera o recibo, sem novo build; reutilizar ID com outra fonte é recusado. API grava marcador de envio transacionalmente antes do comando externo. Resposta perdida ou lease expirada após envio exigem leitura do mesmo ID. Claim expirado antes do marcador é bloqueado sem enviar. Reinício do serviço preserva sucesso conhecido e marca trabalho interrompido como incerto, sem executar automaticamente outra vez. Recuperação de execução interrompida no próprio host e descarte de acompanhamento incerto permanecem limitados; não se anuncia uma nova execução segura pela simples ausência de resultado.

Recorder compartilhado registra intenção, início, despacho, resultado, observação, pausa, retomada e cancelamento; iniciador humano e executor são separados. Conteúdo de aplicação, contrato, motivo e saída não são duplicados na trilha pública. Fonte da intenção e prova conhecida são imutáveis; rollback de migration com dados novos é recusado. Inatividade pausa fila; reativação requer retomada explícita. Cancelamento deste comando é somente antes do envio e não remove artefatos.

## Preparação e validação reproduzíveis

No WSL `agentic-sdlc`, pasta `sdlc/portal`:

```text
python3 scripts/build-executor.py prepare --reuse-cached
python3 tests/build-executor.test.py
python3 scripts/validate-build-executor.py
python3 scripts/build-executor.py install
```

O primeiro comando reutiliza dependências conferidas da imagem de testes existente e Node 24.22.0 local, sem reinstalar a cada fatia. Para instalação sem esse cache, `prepare` sem a opção usa o Dockerfile versionado e consulta as dependências públicas fixadas; essa preparação fria depende de rede e não foi validada nesta entrega. O ID da imagem obtida é registrado; não se promete reprodução binária da imagem por reinstalação fria.

Instalação escreve serviço, estado e socket em `/opt/agentic-sdlc/portal/build-executor`, com trilha administrativa externa. `compose.build-executor.json` gerado é incorporado ao bootstrap do portal. Nenhuma aplicação é criada por esse instalador. O validador real usa fixtures próprias, prova compilação React e falha real em containers e remove somente suas imagens/containers; não consulta a base do portal nem modifica o piloto. Integração completa GitLab → build → implantação será validada na jornada real do piloto, depois de sua preparação técnica pelo fluxo normal.
