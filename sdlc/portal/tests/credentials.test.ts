import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,test} from 'vitest';
import {gitlabToken} from '../apps/api/src/credentials.ts';

test('GitLab supports a file credential without leaking it in configuration errors',()=>{
  const dir=mkdtempSync(join(tmpdir(),'portal-credential-'));
  try{
    const path=join(dir,'token');writeFileSync(path,'private-fixture\n');
    expect(gitlabToken({GITLAB_TOKEN_FILE:path})).toBe('private-fixture');
    expect(()=>gitlabToken({GITLAB_TOKEN_FILE:path,GITLAB_TOKEN:'other-private'})).toThrow('only one');
    writeFileSync(path,'');expect(()=>gitlabToken({GITLAB_TOKEN_FILE:path})).toThrow('Invalid GitLab credential file');
    expect(()=>gitlabToken({GITLAB_TOKEN_FILE:join(dir,'missing')})).toThrow('GitLab credential file cannot be read');
    expect(gitlabToken({})).toBeUndefined();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
