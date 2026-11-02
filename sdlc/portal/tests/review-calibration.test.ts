import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
const examples=JSON.parse(readFileSync(new URL('../apps/api/src/code-review-examples.json',import.meta.url),'utf8')) as {role:string;content:string}[];
function implementation(index:number,name:string){
 const source=examples[index].content.split('\n').filter(line=>/^\d+\|/.test(line)).map(line=>line.replace(/^\d+\|/,'')).join('\n').replace(/^export /gm,'');
 return new Function(source+'\nreturn '+name)() as (input:string)=>string|number|null;
}
test('positive reference calibration rejects non-ASCII before case conversion and keeps edge normalization',()=>{
 const key=implementation(0,'key');expect(key(' X7 ')).toBe('X7');expect(key('x7')).toBe('X7');
 for(const invalid of ['X 7','X#7','ß','ı','ﬃ',''])expect(key(invalid)).toBeNull();
 expect(JSON.parse(examples[1].content).findings).toEqual([]);
});
test('negative calibration really rejects a valid padded input at the quoted line',()=>{
 const key=implementation(2,'key');expect(key(' X7 ')).toBeNull();expect(key('x7')).toBe('X7');
 const report=JSON.parse(examples[3].content);expect(report.findings).toHaveLength(1);expect(report.findings[0]).toMatchObject({path:'sample.js',line:3,counterexample:{actual:'null',expected:'X7'}});
});
test('numeric calibration demonstrates accepted comma decimals and rejection of excess precision or suffixes',()=>{
 const amount=implementation(4,'amount');for(const input of [',50','.50','0.50'])expect(amount(input)).toBe(.5);
 expect(amount('199,90')).toBe(199.9);for(const invalid of ['12.345','10,000','199abc','Infinity','0','-1',''])expect(amount(invalid)).toBeNull();
 expect(JSON.parse(examples[5].content).findings).toEqual([]);
});
