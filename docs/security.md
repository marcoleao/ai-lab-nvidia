# Segurança e remoção

Os containers são isolados operacionalmente do Windows por uma distro dedicada. GPU passthrough, WSL interop e acesso `/mnt/c` no WSL não formam uma fronteira para código malicioso. Não execute workloads não confiáveis sem uma política de sandbox adicional.

Secrets de 32 bytes são gerados pelo CSPRNG .NET. `.env` é ignorado no Git, tem ACL apenas usuário/SYSTEM e modo Linux 0600. Não coloque secrets em `lab.yaml`, notebooks versionados, versões ou argumentos CLI. O token Jupyter é passado pelo ambiente e escrito em config privada; log ERROR evita imprimir URL autenticada no startup. Bootstrap grava somente eventos próprios; não usa Start-Transcript nem `docker compose config` com conteúdo completo. `doctor` usa `config --quiet`.

Loopback por padrão; tráfego interno usa DNS Docker. Qdrant possui API key; WebUI autenticação e chave persistente; Jupyter token. A primeira conta WebUI é administrativa: configure-a imediatamente. LAN exige opt-in; firewall/TLS/proxy e restrição de usuários cabem ao operador. Não publicar Ollama sem um proxy autenticado.

`nuke` exige `NUKE` ou `--yes`. Confere nome, WSL2, BasePath e marcadores; recusa raízes, caminhos protegidos, diretório dentro do Git e junctions nos ancestrais. Nunca roda prune global, remove features Windows, driver ou outra distro. Não tente contornar uma recusa de propriedade sem inspecionar o registro e os arquivos. A remoção pode falhar por arquivos em uso; feche Explorer em `\\wsl$`, terminais e processos da distro e repita.

Rootfs é obtido exclusivamente de Canonical HTTPS e comparado à SHA256 fixada no Git. Se o arquivo remoto mudar, import é recusado até atualização deliberada. Uma SHA vazia consulta o checksum atual Canonical via HTTPS; a ferramenta não verifica assinatura GPG automaticamente. Para uma política mais estrita, audite a assinatura e use URL imutável. Tags de imagens fixadas podem ser mutáveis; pin por digest quando necessário.
