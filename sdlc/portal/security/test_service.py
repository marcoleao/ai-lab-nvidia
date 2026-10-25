import unittest
import service

class ScannerTests(unittest.TestCase):
    def test_safe_code(self):
        result=service.scan({'files':[{'path':'app.js','content':'export const answer = 42;'}]})
        self.assertEqual(result['findings'],[])
        self.assertIn('app.js',result['scannedFiles'])
    def test_vulnerability_cannot_be_suppressed(self):
        result=service.scan({'files':[{'path':'app.js','content':'eval(userInput); // nosemgrep'}]})
        self.assertTrue(result['findings'])
        self.assertEqual(result['findings'][0]['path'],'app.js')
    def test_parse_error_is_not_approval(self):
        with self.assertRaises(ValueError):service.scan({'files':[{'path':'broken.py','content':'def broken(:\n'}]})
    def test_hidden_text_secrets_are_scanned(self):
        result=service.scan({'files':[{'path':'app.js','content':'const n = 1;'}, {'path':'.config/settings.json','content':'{"key":"-----BEGIN PRIVATE KEY-----"}'}]})
        self.assertTrue(any(f['path']=='.config/settings.json' for f in result['findings']))
    def test_traversal_is_rejected(self):
        with self.assertRaises(ValueError):service.scan({'files':[{'path':'../app.js','content':'const n=1;'}]})

unittest.main()
