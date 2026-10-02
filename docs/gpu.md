# GPU e compatibilidade

O driver NVIDIA Windows fornece a interface CUDA em WSL. `nvidia-smi` do Windows é validado sem instalação/substituição automática. Dentro do WSL utiliza-se `/usr/lib/wsl/lib/nvidia-smi`; não instale `nvidia-driver` ou metapacotes CUDA que tragam drivers Linux.

Container Toolkit usa o repositório NVIDIA stable e `nvidia-ctk runtime configure --runtime=docker`. O daemon só reinicia quando sua configuração muda. Teste CUDA: `docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi`, executado exclusivamente na distro.

Imagem de desenvolvimento: `pytorch/pytorch:2.7.1-cuda12.6-cudnn9-runtime`, Python 3.11, uv 0.8.22, venv com system site packages. O build verifica torch 2.7.1. `check_gpu.py` exige CUDA, imprime GPU/memória/versões e multiplica matrizes alocadas na GPU, sincronizando o dispositivo. O teste Ollama exige resposta e `size_vram > 0` em `/api/ps`, impedindo fallback silencioso só para CPU. A combinação alvo é Ada (capability 8.9); a disponibilidade real depende do driver Windows e é obrigatoriamente testada em runtime.

`gpu_validation: false` desabilita apenas consulta extra de telemetria/modelo/VRAM; verificações essenciais continuam obrigatórias por requisito de isolamento/funcionalidade. Não há modo CPU silencioso.

Modelo 27B/30B quantizado cabe dependendo de contexto, quantização e concorrência. Nunca assuma que quatro modelos carregados cabem em 32 GB; o Compose define um carregado e paralelismo um. Imagem CUDA de teste prova acesso à GPU, mas não substitui operação real com PyTorch e inferência.

Fontes: [NVIDIA CUDA on WSL](https://docs.nvidia.com/cuda/wsl-user-guide/index.html), [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), [PyTorch versões](https://pytorch.org/get-started/previous-versions/).
