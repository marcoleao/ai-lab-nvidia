import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect,test} from 'vitest';
import {auditPolicy} from '../apps/api/src/audit-catalog.ts';
import ts from 'typescript';

test('application writers cannot insert history outside the audited recorder',()=>{
 const directory=fileURLToPath(new URL('../apps/api/src/',import.meta.url));
 const bypasses=readdirSync(directory).filter(file=>file.endsWith('.ts')&&file!=='audit.ts').filter(file=>/historyEvent\s*\.\s*(create|createMany|upsert)\s*\(/.test(readFileSync(directory+file,'utf8')));
 expect(bypasses).toEqual([]);
});
test('literal producer actions have explicit catalog entries',()=>{
 const directory=fileURLToPath(new URL('../apps/api/src/',import.meta.url));
 const actions=new Set<string>();
 for(const file of readdirSync(directory).filter(f=>f.endsWith('.ts')&&!f.startsWith('audit'))){
  const source=ts.createSourceFile(file,readFileSync(directory+file,'utf8'),ts.ScriptTarget.Latest,true);
  const visit=(node:ts.Node)=>{
   if(ts.isCallExpression(node)&&['h.event','recordAudit','event'].includes(node.expression.getText(source))&&node.arguments[3]){
    const collect=(expression:ts.Node)=>{if(ts.isStringLiteral(expression)&&/^[A-Z][A-Z_]{3,}$/.test(expression.text))actions.add(expression.text);ts.forEachChild(expression,collect);};
    collect(node.arguments[3]);
   }
   ts.forEachChild(node,visit);
  };
  visit(source);
 }
 for(const action of actions)expect(()=>auditPolicy(action),action).not.toThrow();
});
