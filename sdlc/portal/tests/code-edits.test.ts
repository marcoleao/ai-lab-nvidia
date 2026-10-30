import {expect,test} from 'vitest';
import {resolveGeneratedPatch,DependencyPermissionRequired,PatchValidationError,codeSchema,schemaPatchIssues} from '../apps/api/src/code-schema.ts';
import {syntaxIssues} from '../apps/api/src/code-validation.ts';

test('literal edits preserve unrelated source, sequential intent and literal replacement characters',async()=>{
 const source='export const price = 0;\nexport const label = "Original";\n',context={files:[{path:'src/catalog.js',content:source}]};
 const patch=resolveGeneratedPatch({summary:'Correção pontual',edits:[{path:'src/catalog.js',before:'price = 0',after:'price = 10'},{path:'src/catalog.js',before:'"Original"',after:'"R$ $&"'}]},context);
 expect(patch.files).toEqual([{path:'src/catalog.js',content:'export const price = 10;\nexport const label = "R$ $&";\n'}]);expect(context.files[0].content).toBe(source);expect(await syntaxIssues(patch)).toEqual([]);
});
test('ambiguous, missing and nonexistent source refuse the whole proposal without guessing',()=>{
 const context={files:[{path:'src/catalog.js',content:'value value'}]};
 for(const edit of [{path:'src/catalog.js',before:'value',after:'next'},{path:'src/catalog.js',before:'missing',after:'next'},{path:'src/new.js',before:'value',after:'next'}])expect(()=>resolveGeneratedPatch({summary:'test',edits:[edit]},context)).toThrow(PatchValidationError);
 expect(context.files[0].content).toBe('value value');
 expect(()=>resolveGeneratedPatch({summary:'test',edits:[{path:'src/catalog.js',before:'aaa',after:'next'}]},{files:[{path:'src/catalog.js',content:'aaaa'}]})).toThrow(PatchValidationError);
});
test('resolved edits keep file, dependency, protected-path and syntax constraints',async()=>{
 for(const path of ['../outside.js','infra/config.js'])expect(()=>resolveGeneratedPatch({summary:'test',edits:[{path,before:'old',after:'new'}]},{files:[{path,content:'old'}]})).toThrow(PatchValidationError);
 expect(()=>resolveGeneratedPatch({summary:'test',edits:[{path:'package.json',before:'old',after:'new'}]},{files:[{path:'package.json',content:'old'}]})).toThrow(DependencyPermissionRequired);
 const files=Array.from({length:7},(_,i)=>({path:`file${i}.js`,content:'old'}));expect(()=>resolveGeneratedPatch({summary:'test',edits:files.map(f=>({path:f.path,before:'old',after:'new'}))},{files})).toThrow();
 const malformed=resolveGeneratedPatch({summary:'test',edits:[{path:'src/App.jsx',before:'<main/>',after:'<main>'}]},{files:[{path:'src/App.jsx',content:'export default () => <main/>;'}]});expect(await syntaxIssues(malformed)).toEqual(expect.arrayContaining([expect.objectContaining({code:'SYNTAX_ERROR'})]));
 expect(()=>resolveGeneratedPatch({summary:'test',edits:[{path:'src/large.js',before:'old',after:'replacement'}]},{files:[{path:'src/large.js',content:'old'+'x'.repeat(19997)}]})).toThrow();
});
test('full-file generation remains supported and output forms cannot be mixed',()=>{
 expect(resolveGeneratedPatch({summary:'Novo módulo',files:[{path:'new.js',content:'export const value=1;'}]},{files:[]})).toMatchObject({files:[{path:'new.js'}]});
 expect(()=>resolveGeneratedPatch({summary:'Ambíguo',files:[{path:'new.js',content:'new'}],edits:[{path:'new.js',before:'old',after:'new'}]},{files:[{path:'new.js',content:'old'}]})).toThrow();
});

test('file-size refusal tells the agent the bound without exposing the rejected source',()=>{
 const invalid=codeSchema.safeParse({summary:'Isolated size guard',files:[{path:'src/App.jsx',content:'private-fixture'.repeat(1800)}]});expect(invalid.success).toBe(false);if(invalid.success)throw Error('Expected refusal');
 const issues=schemaPatchIssues(invalid.error);expect(issues[0]).toMatchObject({path:'files.0.content',code:'PATCH_SCHEMA'});expect(issues[0].message).toContain('20000');expect(JSON.stringify(issues)).not.toContain('private-fixture');
});
