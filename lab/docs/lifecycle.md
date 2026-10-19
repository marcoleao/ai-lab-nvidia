# Ciclo de vida

| Ação | Containers/rede | Dados/caches | Internet |
| --- | --- | --- | --- |
| prepare | Prepara imagens e inicia Ollama | Preenche caches/manifesto | Necessária para preparação |
| up | Inicia e valida imagens locais | Preserva e exige preparação válida | Não necessária |
| down | Remove containers/rede | Preserva volumes/modelos/imagens | Não necessária |
| restart | Reinicia e valida | Preserva | Não necessária |
| reset / destroy | Remove containers/rede/volumes de aplicação | Invalida manifesto; preserva modelos por padrão | Novo prepare necessário |
| nuke | Elimina a distro própria | Elimina dados/modelos/imagens | Nova criação exige prepare |

Reset/destroy removem também caches de embeddings/tokenizer. Não reiniciam a stack; execute prepare all e up all. preserve_models: false permite remover também modelos, após conferir propriedade.

--ephemeral, update e rebuild são recusados. Alterações de artefatos exigem preparação explícita com internet.

Nuke exige NUKE e valida os marcadores de propriedade. Preserva outras distros, Windows, driver NVIDIA e fontes. Não há backup automático; ambientes/demos são descartáveis. A CI pública não executa cenários destrutivos.

Para testar retomada sem apagar dados: down, up all, doctor e test. O ensaio nuke → prepare → up exige uma máquina/janela descartável.
