import {expect,test} from 'vitest';
import {createItemSchema} from '../packages/shared/src/index.ts';

test('system acronyms require six letters and normalize case before persistence',()=>{
  const input={kind:'system',name:'Sistema de aceite'};
  expect(createItemSchema.parse({...input,key:'aBcDeF'}).key).toBe('ABCDEF');
  for(const key of [undefined,'','ABCDE','ABCDEFG','ABC123','AB CDE','ABC-DE','ÁBCDEF']){
    expect(createItemSchema.safeParse({...input,key}).success,String(key)).toBe(false);
  }
});

test('project keys retain their existing alphanumeric contract',()=>{
  expect(createItemSchema.parse({kind:'project',parentId:'system',name:'Projeto',key:'app1'}).key).toBe('APP1');
});
