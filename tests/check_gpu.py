import json
import torch


def main():
    assert torch.cuda.is_available(), "[ERROR] CUDA unavailable"
    properties = torch.cuda.get_device_properties(0)
    a = torch.randn(2048, 2048, device="cuda")
    b = a @ a
    torch.cuda.synchronize()
    assert b.is_cuda and torch.isfinite(b).all().item()
    assert torch.cuda.memory_allocated() > 0
    print(json.dumps({
        "available": True, "name": torch.cuda.get_device_name(0),
        "vram_bytes": properties.total_memory, "torch": torch.__version__,
        "cuda": torch.version.cuda, "allocated_bytes": torch.cuda.memory_allocated(),
        "capability": torch.cuda.get_device_capability(0),
    }))


if __name__ == "__main__":
    main()
