# Recuperação de ambiente descartável

As demos não exigem backup. O repositório contém definições; os dados, modelos e imagens ficam nas distros. Para recriar o laboratório, remova somente o ambiente gerenciado com nuke e execute prepare all (com internet), seguido de up all.

Nuke apaga dados locais, inclusive notebooks/workspaces. Não é necessário executá-lo para retomar download interrompido: repita prepare all. Reset/destroy também eliminam caches de aplicação e exigem nova preparação antes de up.

Se precisar preservar excepcionalmente um dado, exporte-o antes da remoção. Isso é uma escolha do operador, não uma etapa obrigatória nem um backup automático.

Perda de lab/.env com distro viva: recupere /opt/ai-local-lab/.env da própria distro para lab/.env, mantendo ACL e ignorado pelo Git. Gerar outra chave WebUI pode invalidar sessões/dados cifrados.

Falha parcial de nuke: repita com o marcador externo preservado. Se identidade/marcadores estiverem inconsistentes, inspecione manualmente nome/BasePath; não copie marcadores de outra distro ou execute remoções globais.
