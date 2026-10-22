"""Demo sem dependências externas, publicada como HTML estático."""
from pathlib import Path


def render():
    return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Demo SDLC</title><h1>Entrega local pelo SDLC</h1><p>Issue → Merge Request → testes → merge → publicação off-line.</p></html>'


if __name__ == '__main__':
    Path('public').mkdir(exist_ok=True)
    Path('public/index.html').write_text(render(), encoding='utf-8')
