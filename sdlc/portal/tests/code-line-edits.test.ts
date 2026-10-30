import {expect,test} from 'vitest';
import {resolveGeneratedPatch,PatchValidationError} from '../apps/api/src/code-schema.ts';
const sha='a'.repeat(40);
test('line edits use original coordinates, preserve unrelated bytes and CRLF, and freeze full files',()=>{
 const source='alpha\r\nbeta\r\ngamma\r\n',context={sha,files:[{path:'src/app.js',content:source}]};
 const patch=resolveGeneratedPatch({summary:'Correção pequena',expectedSha:sha,lineEdits:[{path:'src/app.js',startLine:2,deleteLines:1,content:'B'},{path:'src/app.js',startLine:1,deleteLines:1,content:'A'}]},context);
 expect(patch.files).toEqual([{path:'src/app.js',content:'A\r\nB\r\ngamma\r\n'}]);expect(context.files[0].content).toBe(source);
});
test('insertion and deletion have explicit line boundaries without rewriting the surrounding source',()=>{
 const context={sha,files:[{path:'app.js',content:'first\nsecond\nlast'}]};
 expect(resolveGeneratedPatch({summary:'Inserir',expectedSha:sha,lineEdits:[{path:'app.js',startLine:2,deleteLines:0,content:'inserted'}]},context).files[0].content).toBe('first\ninserted\nsecond\nlast');
 expect(resolveGeneratedPatch({summary:'Remover',expectedSha:sha,lineEdits:[{path:'app.js',startLine:2,deleteLines:1,content:''}]},context).files[0].content).toBe('first\nlast');
 expect(resolveGeneratedPatch({summary:'Acrescentar',expectedSha:sha,lineEdits:[{path:'app.js',startLine:4,deleteLines:0,content:'end'}]},context).files[0].content).toBe('first\nsecond\nlast\nend');
 expect(resolveGeneratedPatch({summary:'Acrescentar após linha vazia',expectedSha:sha,lineEdits:[{path:'app.js',startLine:3,deleteLines:0,content:'end'}]},{sha,files:[{path:'app.js',content:'first\n'}]}).files[0].content).toBe('first\n\nend');
});
test('wrong revision, nonexistent files, overlap and invalid ranges refuse the whole proposal',()=>{
 const context={sha,files:[{path:'app.js',content:'one\ntwo\nthree'}]},edit={path:'app.js',startLine:2,deleteLines:1,content:'new'};
 for(const proposal of [{expectedSha:'b'.repeat(40),lineEdits:[edit]},{expectedSha:sha,lineEdits:[{...edit,path:'missing.js'}]},{expectedSha:sha,lineEdits:[edit,{...edit,startLine:2,deleteLines:0}]},{expectedSha:sha,lineEdits:[{...edit,startLine:90}]},{expectedSha:sha,lineEdits:[{...edit,deleteLines:3}]}])expect(()=>resolveGeneratedPatch({summary:'Recusar',...proposal},context)).toThrow(PatchValidationError);
 expect(context.files[0].content).toBe('one\ntwo\nthree');
});
test('line mode retains protected-path and aggregate patch constraints',()=>{
 expect(()=>resolveGeneratedPatch({summary:'Recusar',expectedSha:sha,lineEdits:[{path:'infra/app.js',startLine:1,deleteLines:1,content:'new'}]},{sha,files:[{path:'infra/app.js',content:'old'}]})).toThrow(PatchValidationError);
 const files=Array.from({length:7},(_,i)=>({path:`app${i}.js`,content:'old'}));expect(()=>resolveGeneratedPatch({summary:'Recusar',expectedSha:sha,lineEdits:files.map(f=>({path:f.path,startLine:1,deleteLines:1,content:'new'}))},{sha,files})).toThrow();
});

test('inclusive start/end coordinates replace exactly the selected original lines',()=>{
 const context={sha,files:[{path:'app.js',content:'first\r\nsecond\r\nthird\r\nlast'}]};
 expect(resolveGeneratedPatch({summary:'Substituir trecho',expectedSha:sha,lineEdits:[{path:'app.js',startLine:2,endLine:3,content:'replacement'}]},context).files[0].content).toBe('first\r\nreplacement\r\nlast');
 expect(resolveGeneratedPatch({summary:'Inserir trecho',expectedSha:sha,lineEdits:[{path:'app.js',startLine:2,endLine:1,content:'inserted'},{path:'app.js',startLine:4,endLine:4,content:'end'}]},context).files[0].content).toBe('first\r\ninserted\r\nsecond\r\nthird\r\nend');
 for(const edit of [{startLine:3,endLine:1},{startLine:2,endLine:10},{startLine:2,endLine:3,deleteLines:2}])expect(()=>resolveGeneratedPatch({summary:'Recusar',expectedSha:sha,lineEdits:[{path:'app.js',content:'new',...edit}]},context)).toThrow();
 expect(context.files[0].content).toBe('first\r\nsecond\r\nthird\r\nlast');
});

test('overlap feedback identifies both conflicting intervals instead of blaming valid bounds',()=>{
 const context={sha,files:[{path:'app.js',content:'one\ntwo\nthree\nfour\nfive'}]};
 try{
  resolveGeneratedPatch({summary:'Recusar sobreposição',expectedSha:sha,lineEdits:[{path:'app.js',startLine:2,endLine:4,content:'first'},{path:'app.js',startLine:3,endLine:4,content:'second'}]},context);
  throw Error('Overlapping ranges must be refused');
 }catch(error){
  expect(error).toBeInstanceOf(PatchValidationError);expect((error as PatchValidationError).issues).toMatchObject([{path:'app.js',code:'LINE_RANGE_OVERLAP',message:expect.stringContaining('2–4 e 3–4')}]);
 }
 expect(context.files[0].content).toBe('one\ntwo\nthree\nfour\nfive');
});
