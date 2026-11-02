"""Lossless source fingerprint without traversing excluded generated trees."""
import hashlib,importlib.util,json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('prepared_fingerprint',Path(__file__).parents[1]/'scripts/prepared.py')
prepared=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepared)
EXCLUDED={'.prepared','node_modules','.next','generated','test-results','playwright-report','docs','__pycache__'}

def legacy(root):
 records=[]
 for path in sorted(root.rglob('*')):
  if EXCLUDED.intersection(path.relative_to(root).parts):continue
  if path.is_symlink():raise RuntimeError('symlink')
  if not path.is_file() or path.name in {'.env','README.md'} or path.name.endswith('.tsbuildinfo'):continue
  records.append([path.relative_to(root).as_posix(),hashlib.sha256(path.read_bytes()).hexdigest()])
 return hashlib.sha256(json.dumps(records,separators=(',',':')).encode()).hexdigest()

class PreparedFingerprintTests(unittest.TestCase):
 def test_exact_legacy_digest_with_nested_paths_and_ordering(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(prepared,'ROOT',Path(directory)):
   root=Path(directory)
   for name in ['a/z.js','a.js','a-0','a/á.txt','Z.js','empty','.env','README.md','x.tsbuildinfo','docs/private','nested/node_modules/large']:
    path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(name)
   self.assertEqual(prepared.fingerprint(),legacy(root));first=prepared.fingerprint()
   (root/'docs/private').write_text('changed generated evidence');self.assertEqual(prepared.fingerprint(),first)
   (root/'a/z.js').write_text('changed actual source');self.assertNotEqual(prepared.fingerprint(),first)
 def test_excluded_trees_are_never_scanned(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(prepared,'ROOT',Path(directory)):
   root=Path(directory);(root/'node_modules/large').mkdir(parents=True);(root/'source.js').write_text('source');real=os.scandir;seen=[]
   def scan(path):
    seen.append(Path(path));self.assertNotIn('node_modules',Path(path).parts);return real(path)
   with patch.object(prepared.os,'scandir',side_effect=scan):prepared.fingerprint()
   self.assertEqual(seen,[root])
 def test_read_errors_propagate_instead_of_certifying_partial_source(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(prepared,'ROOT',Path(directory)),patch.object(prepared.os,'scandir',side_effect=PermissionError('unreadable source')):
   with self.assertRaisesRegex(PermissionError,'unreadable source'):prepared.fingerprint()
 def test_source_symlinks_are_refused_but_excluded_trees_stay_excluded(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(prepared,'ROOT',Path(directory)):
   root=Path(directory);(root/'node_modules').symlink_to(root/'missing',target_is_directory=True)
   self.assertEqual(prepared.fingerprint(),legacy(root))
   (root/'source.js').symlink_to(root/'missing')
   with self.assertRaisesRegex(RuntimeError,'symlinks'):prepared.fingerprint()

if __name__=='__main__':unittest.main()
