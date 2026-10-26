import {expect,test} from 'vitest';
import {createItemSchema} from '../packages/shared/src/index.ts';

test('system acronyms require six letters and normalize case before persistence',()=>{
  const input={kind:'system',name:'Sistema de aceite'};
  expect(createItemSchema.parse({...input,key:'aBcDeF'}).key).toBe('ABCDEF');
  for(const key of [undefined,'','ABCDE','ABCDEFG','ABC123','AB CDE','ABC-DE','ÁBCDEF']){
    expect(createItemSchema.safeParse({...input,key}).success,String(key)).toBe(false);
  }
});

test('project keys use the same six-letter rule and case normalization as Systems',()=>{
  const input={kind:'project',parentId:'system',name:'Projeto'};
  expect(createItemSchema.parse({...input,key:'pRoJeT'}).key).toBe('PROJET');
  for(const key of [undefined,'','ABCDE','ABCDEFG','ABC123','AB CDE','ABC-DE','ÁBCDEF']){
    expect(createItemSchema.safeParse({...input,key}).success,String(key)).toBe(false);
  }
});
