"""Opt-in actual DEV HTTP tests against exclusively owned build/deployment fixtures."""
from pathlib import Path
import runpy,sys
script=Path(__file__).with_name('validate-development-deployment.py');sys.argv=[str(script),'--with-tests'];runpy.run_path(str(script),run_name='__main__')
