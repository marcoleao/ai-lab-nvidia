import {afterEach,expect,test,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {GitLabProvider} from '../apps/api/src/gitlab.ts';
const oldSha='a'.repeat(40),newSha='b'.repeat(40),fileSha='c'.repeat(40),otherSha='d'.repeat(40);
const run='cmvpr9rig000201qsry08a5zu',check='isolated-check';
const patch={summary:'Correção isolada.',files:[{path:'src/MovieForm.tsx',content:'export const form = true;'}, {path:'src/new.ts',content:'export const added = true;'}]};
const context={sha:oldSha,targetBranch:'main',files:[{path:'README.md',content:'A sample is not an inventory.'}]};
afterEach(()=>vi.unstubAllGlobals());

function fixture(options:{lostResponse?:boolean;changedAtStart?:boolean;changedDuringReads?:boolean;metadataStatus?:number;invalidMetadata?:boolean}={}){
  let commitCount=0,headReads=0,head=options.changedAtStart?otherSha:oldSha,message='Earlier application code';
  const requests:{method:string;path:string;body:any}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
    const address=new URL(url),path=address.pathname.replace('/api/v4/',''),method=init.method||'GET',body=init.body?JSON.parse(String(init.body)):null;
    requests.push({method,path:decodeURIComponent(path),body});
    const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
    if(path.includes('/repository/branches/')){headReads++;return json({commit:{id:options.changedDuringReads&&headReads>1?otherSha:head,message}});}
    if(path.includes('/repository/files/')){
      expect(address.searchParams.get('ref')).toBe(oldSha);
      if(options.metadataStatus)return json({message:'isolated unavailable'},options.metadataStatus);
      return decodeURIComponent(path).endsWith('/src/MovieForm.tsx')?json(options.invalidMetadata?{}:{last_commit_id:fileSha}):json({message:'File Not Found'},404);
    }
    if(path.endsWith('/repository/commits')){
      commitCount++;head=newSha;message=body.commit_message;
      if(options.lostResponse&&commitCount===1)throw Error('Lost acknowledgement after commit');
      return json({id:newSha});
    }
    if(path.endsWith('/merge_requests'))return json([{state:'opened',sha:head,web_url:'http://gitlab.invalid/mr/1'}]);
    throw Error('Unexpected request '+method+' '+path);
  }));
  return {provider:new GitLabProvider('http://gitlab.invalid','fixture-only'),requests,count:()=>commitCount};
}

test('correction inspects every target at the expected SHA and updates files missing from the model sample',async()=>{
  const f=fixture();await expect(f.provider.publishCorrection(6,run,check,oldSha,context,patch,'Story',{dependencies:false})).resolves.toMatchObject({sha:newSha});
  const commit=f.requests.find(r=>r.method==='POST')!;
  expect(commit.body.actions).toEqual([{action:'update',file_path:'src/MovieForm.tsx',content:patch.files[0].content,last_commit_id:fileSha},{action:'create',file_path:'src/new.ts',content:patch.files[1].content}]);
  expect(f.requests.filter(r=>r.path.includes('/repository/files/'))).toHaveLength(2);expect(f.count()).toBe(1);
});

test('a stale model sample claiming a file exists cannot override a confirmed 404 at the authorized revision',async()=>{
  const f=fixture();await f.provider.publishCorrection(6,run,check,oldSha,{...context,files:[{path:'src/new.ts',content:'stale'}]},{summary:'Create only',files:[patch.files[1]]},'Story',{dependencies:false});
  expect(f.requests.find(r=>r.method==='POST')!.body.actions[0]).toMatchObject({action:'create',file_path:'src/new.ts'});
});

for(const options of [{changedAtStart:true},{changedDuringReads:true},{metadataStatus:403},{metadataStatus:500},{invalidMetadata:true}])test('failed metadata or changed branch prevents a correction commit '+JSON.stringify(options),async()=>{
  const f=fixture(options);await expect(f.provider.publishCorrection(6,run,check,oldSha,context,patch,'Story',{dependencies:false})).rejects.toThrow();expect(f.count()).toBe(0);
});

test('lost commit response reconciles the same marker and SHA without creating another commit',async()=>{
  const f=fixture({lostResponse:true});await expect(f.provider.publishCorrection(6,run,check,oldSha,context,patch,'Story',{dependencies:false})).rejects.toThrow('indisponível');
  await expect(f.provider.publishCorrection(6,run,check,oldSha,context,patch,'Story',{dependencies:false})).resolves.toMatchObject({sha:newSha});expect(f.count()).toBe(1);
  const marker=`SDLC correction ${check} ${createHash('sha256').update(JSON.stringify(patch)).digest('hex')}`;
  expect(f.requests.find(r=>r.method==='POST')!.body.commit_message).toBe(marker);
});

test('initial publication also resolves existence from the immutable base rather than the bounded sample',async()=>{
  const requests:any[]=[];
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
    const u=new URL(url),path=decodeURIComponent(u.pathname),method=init.method||'GET',body=init.body?JSON.parse(String(init.body)):null;requests.push({method,path,body});
    const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
    if(path.includes('/branches/sdlc/story-'))return json({},404);
    if(path.endsWith('/branches/main'))return json({commit:{id:oldSha}});
    if(path.includes('/repository/files/'))return json({last_commit_id:fileSha});
    if(path.endsWith('/repository/commits'))return json({id:newSha});
    if(path.endsWith('/merge_requests'))return json([{state:'opened',sha:newSha,web_url:'http://gitlab.invalid/mr/1'}]);
    throw Error('Unexpected request');
  }));
  await new GitLabProvider('http://gitlab.invalid','fixture-only').publishCode(6,run,context,{summary:'Initial',files:[patch.files[0]]},'Story');
  expect(requests.find(r=>r.method==='POST').body).toMatchObject({start_sha:oldSha,actions:[{action:'update',file_path:patch.files[0].path,last_commit_id:fileSha}]});
});
