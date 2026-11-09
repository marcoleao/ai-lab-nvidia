@{
    SchemaVersion = 1
    # Installation identity comes from platform.json, never from the public URL.
    DistroName = 'ai-platform'
    StorageRoot = '%LOCALAPPDATA%/AIPlatform/data'
    ControlRoot = '%LOCALAPPDATA%/AIPlatform/control'
    LinuxUser = 'aiplatform'
    MinimumFreeDiskGiB = 10 # Host preparation only; not capacity for all services/models.
    MinimumWslVersion = '0.67.6'
    RootfsUri = 'https://cloud-images.ubuntu.com/wsl/releases/24.04/20240423/ubuntu-noble-wsl-amd64-wsl.rootfs.tar.gz'
    RootfsSha256 = '8251e27ffff381a4af5f41dcb94d867de3e0d9774a9241908ab34555d99315ea'
}
