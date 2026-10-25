import {test,expect} from 'vitest';
import {syntaxIssues,needsQualityDiagnosis} from '../apps/api/src/code-validation.ts';
test('repeated corrections require a conversation and a subsequent decision can resume',()=>{
 expect(needsQualityDiagnosis({qualityCycle:2,qualityCycleDecisionVersion:7},7)).toBe(false);
 expect(needsQualityDiagnosis({qualityCycle:3,qualityCycleDecisionVersion:7},7)).toBe(true);
 expect(needsQualityDiagnosis({qualityCycle:3,qualityCycleDecisionVersion:7},8)).toBe(false);
});
test('syntax gate rejects duplicate declarations and malformed expressions without running source',async()=>{
 for(const content of ["import { key } from './config.js'; export const key='placeholder';",'const value = /[/;'])expect(await syntaxIssues({summary:'test',files:[{path:'server.mjs',content}]})).toMatchObject([{code:'SYNTAX_ERROR',path:'server.mjs'}]);
});
test('syntax gate does not execute code or resolve imports',async()=>{
 expect(await syntaxIssues({summary:'test',files:[{path:'server.mjs',content:"import missing from './does-not-exist.js'; throw new Error('must never execute');"},{path:'a.cjs',content:'module.exports = 1;'}]})).toEqual([]);
});
