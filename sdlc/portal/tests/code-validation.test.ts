import {test,expect} from 'vitest';
import {syntaxIssues,needsQualityDiagnosis,confirmedDecisionVersion} from '../apps/api/src/code-validation.ts';
test('repeated corrections require a conversation and a subsequent decision can resume',()=>{
 const decisions=[{summary:'Decisão confirmada',discussionVersion:7}];
 expect(needsQualityDiagnosis({qualityCycle:2,qualityCycleDecisionVersion:7,decisions})).toBe(false);
 expect(needsQualityDiagnosis({qualityCycle:3,qualityCycleDecisionVersion:7,decisions})).toBe(true);
 expect(needsQualityDiagnosis({qualityCycle:3,qualityCycleDecisionVersion:7,decisions:[...decisions,{summary:'Nova escolha confirmada',discussionVersion:8}]})).toBe(false);
 expect(confirmedDecisionVersion({decisions})).toBe(7);expect(confirmedDecisionVersion({})).toBe(0);
});
test('syntax gate rejects duplicate declarations and malformed expressions without running source',async()=>{
 for(const content of ["import { key } from './config.js'; export const key='placeholder';",'const value = /[/;'])expect(await syntaxIssues({summary:'test',files:[{path:'server.mjs',content}]})).toMatchObject([{code:'SYNTAX_ERROR',path:'server.mjs'}]);
});
test('syntax gate does not execute code or resolve imports',async()=>{
 expect(await syntaxIssues({summary:'test',files:[{path:'server.mjs',content:"import missing from './does-not-exist.js'; throw new Error('must never execute');"},{path:'a.cjs',content:'module.exports = 1;'}]})).toEqual([]);
});

test('React and TypeScript syntax is parsed without executing code or resolving imports',async()=>{
 for(const path of ['src/App.jsx','src/App.tsx','src/context.ts'])expect(await syntaxIssues({summary:'parse',files:[{path,content:'export const update = (item) => { setItems(items.map(j => j.id === item.id ? updatedJ君\n};'}]})).toMatchObject([{path,code:'SYNTAX_ERROR'}]);
 expect(await syntaxIssues({summary:'parse',files:[{path:'src/App.tsx',content:'import missing from "./missing"; const n:number=1; export default function App(){throw new Error("must never execute");return <main>{n}</main>;}'},{path:'src/App.jsx',content:'export default () => <main>Catálogo</main>;'}]})).toEqual([]);
});

test('transpiled React and TypeScript still reject invalid regular expression grammar',async()=>{
 for(const path of ['src/App.jsx','src/App.tsx','src/context.ts']){
  const issues=await syntaxIssues({summary:'parse',files:[{path,content:'export const validPhoto = value => /^(https?:\\/\\/)?([a-z]+)*)*$/.test(value);'}]});
  expect(issues).toMatchObject([{path,code:'SYNTAX_ERROR',message:expect.stringContaining('regular expression')}]);
 }
 expect(await syntaxIssues({summary:'parse',files:[{path:'src/App.jsx',content:'import missing from "./missing"; const normalize = value => value.replace(/\\p{Diacritic}/gu, ""); throw new Error("must not execute"); export default () => <main>{normalize("Joias")}</main>;'}]})).toEqual([]);
});
