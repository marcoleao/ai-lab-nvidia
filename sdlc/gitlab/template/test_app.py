import unittest
from app import render


class DemoTest(unittest.TestCase):
    def test_page_has_language_and_delivery_message(self):
        page = render()
        self.assertIn('lang="pt-BR"', page)
        self.assertIn('Entrega local pelo SDLC', page)
        self.assertIn('Merge Request', page)


if __name__ == '__main__':
    unittest.main()
