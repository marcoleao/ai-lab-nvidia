# Privilégios e driver NVIDIA no Windows

Os bootstraps de lab/, sdlc/ e vscode/ exigem PowerShell executado como administrador. A verificação ocorre antes de criar estado ou provisionar componentes. Sem elevação, interrompem com uma mensagem para abrir PowerShell com **Executar como administrador**, na mesma conta Windows, e repetir o comando. Não trocam de conta nem abrem outra sessão automaticamente.

## Driver ausente

Durante lab prepare, o bootstrap identifica GPUs NVIDIA PCI de vídeo e seus drivers registrados no Windows. Se todas já têm driver NVIDIA, preserva a instalação sem consultar o Windows Update.

Se o driver estiver ausente, o Windows Update Agent procura drivers aplicáveis. O bootstrap seleciona somente classe Display, fabricante NVIDIA e ID de hardware correspondente à GPU. Entre candidatos, prefere a data mais recente. O Windows gerencia validação, download e instalação dos pacotes. Não instala atualizações gerais, áudio, drivers de outra GPU ou NVIDIA App.

A consulta respeita o serviço e as políticas de Windows Update do equipamento. Internet é necessária nessa preparação. Se o serviço estiver bloqueado ou não oferecer um pacote correspondente, o bootstrap informa o problema e interrompe. Nesse caso, corrija o acesso ao Windows Update ou instale o pacote oficial Dell/NVIDIA do equipamento e repita prepare. Não há garantia de versão específica disponível no catálogo.

Após instalar, verifica nvidia-smi e continua as verificações. Se houver reinicialização necessária, encerra com código **3010**, sem reiniciar automaticamente. Reinicie e repita o prepare administrativo na mesma conta. Downloads ou instalações parciais interrompem o provisionamento com erro.

Um driver existente com falha não é substituído automaticamente. Se nvidia-smi estiver ausente ou falhar, a mensagem orienta reiniciar/reparar o driver. Up, doctor e operação desconectada não instalam/atualizam drivers. O driver é do Windows; nenhum driver NVIDIA Linux é instalado no WSL.

## Limpeza e testes

Cleanup preserva o driver, inclusive se instalado pelo bootstrap, pois ele é compartilhado com Windows e outros aplicativos.

Foram testados com mocks: rejeição de sessão sem elevação, preservação de driver existente, ausência de GPU, diagnóstico sem rede, correspondência de hardware, ausência de pacote aplicável, falhas de download/instalação e retorno de reinicialização. Na workstation real, a detecção preservou a RTX 5000 Ada Laptop com driver 597.16, sem buscar atualizações. Não foi executada instalação real de driver nesta alteração.

```powershell
.\tests\host-prerequisites.tests.ps1
```

Referências: [propriedades dos drivers Windows Update](https://learn.microsoft.com/en-us/windows/win32/wua_sdk/iwindowsdriverupdate-properties) e [protocolo de busca, download e instalação](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/aa387102(v=vs.85)).
