# Implantação DEV — RA-12b

A História publica uma construção confirmada sem depender de release. O pedido fixa execução, revisão, imagem, digest do arquivo, contrato e destino DEV do Sistema. Se faltar destino, cria ou acompanha a preparação pelo comando compartilhado da RA-12a. Uma única publicação pendente por ambiente impede disputa entre Histórias. A confirmação não conclui desenvolvimento nem História.

O executor confere o arquivo privado do build, tamanho, SHA-256 e rótulos da imagem. Executa a imagem local, sem download, como usuário 1000, sistema de arquivos somente leitura, rede interna do Sistema, sem capabilities, com limites de memória, CPU e processos. Não publica portas do contêiner. O gateway da plataforma usa o endereço privado conferido pelo Docker e expõe somente uma URL localhost estável por destino. Confirma HTTP 200 em `/health` antes de trocar o apontamento; candidata inválida é removida e a anterior permanece. A antiga é parada após sucesso e permanece retida para manutenção futura.

Intenção, despacho e resultado possuem auditoria transacional. Falha antes do despacho impede efeito. Resultado incerto exige observar o mesmo pedido; não dispara outra implantação. Recibo de sucesso é imutável e separado da disponibilidade atual. Retomar uma publicação pausada também pode retomar sua preparação vinculada ainda não enviada, conforme informado na confirmação. Cancelar antes do envio não desfaz infraestrutura já preparada.

Limites: perfil Node 24, uma unidade HTTP, sem migração ou volume de dados; saúde HTTP não substitui testes funcionais. Recuperação genérica de candidatos interrompidos, quota e retenção automatizada permanecem pendentes. O laboratório do piloto não recebe dados ou código sintéticos para demonstrar esta capacidade.

Validação reproduzível em `sdlc/portal`, WSL `agentic-sdlc`:

```text
python3 scripts/regression.py backend development-deployments.test.ts environment-targets.test.ts development-builds.test.ts
python3 scripts/regression.py browser development-deployment.spec.ts development-build.spec.ts
python3 tests/runtime-executor.test.py
python3 scripts/validate-development-deployment.py
```

O ensaio real constrói três imagens de fixtures isoladas, publica uma saudável, recusa uma com HTTP 503, troca por outra saudável na mesma URL e reconcilia perda de recibo. Confere propriedades e remove apenas seus próprios recursos. Não escreve na base operacional ou no repositório do piloto.
