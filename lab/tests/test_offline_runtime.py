"""Explicit live acceptance: run from WSL after prepare/up, never from unit discovery."""
import subprocess


def main():
    probe = '''import socket
try:
    socket.create_connection(('1.1.1.1', 443), 3)
except OSError:
    print('OK: saída externa bloqueada')
else:
    raise RuntimeError('Saída externa disponível')
'''
    subprocess.run(['docker','exec','ai-local-lab-ai-dev-1','python','-c',probe], check=True)
    cache = '''from sentence_transformers import SentenceTransformer
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2', cache_folder='/app/backend/data/cache/embedding/models', local_files_only=True)
assert len(model.encode('teste offline')) == 384
import tiktoken
assert tiktoken.get_encoding('cl100k_base').encode('offline')
print('OK: embeddings e tokenizer com network=none')
'''
    image = subprocess.check_output(['docker','inspect','ai-local-lab-open-webui-1','--format','{{.Image}}'], text=True).strip()
    subprocess.run(['docker','run','--rm','--pull','never','--network','none',
        '-v','ai-local-lab_open_webui_data:/app/backend/data',
        '-e','HF_HUB_OFFLINE=1','-e','TIKTOKEN_CACHE_DIR=/app/backend/data/cache/tiktoken',
        image,'python','-c',cache], check=True)


if __name__ == '__main__':
    main()
