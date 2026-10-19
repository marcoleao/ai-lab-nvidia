"""Export a synthetic inference fixture; never reads user data or credentials."""
import json
import sys
from chat import request_for

if __name__ == '__main__':
    cases = {'video': 'Quero um software para organizar minha videolocadora de filmes em mídias físicas.', 'cars': 'Quero um software para minha loja que vende automóveis de estoque próprio e consignados.'}
    if len(sys.argv) != 2 or sys.argv[1] not in cases:
        raise SystemExit('Choose video or cars')
    print(json.dumps(request_for({'resumo_anterior': '', 'mensagem_atual': cases[sys.argv[1]]}), ensure_ascii=False))
