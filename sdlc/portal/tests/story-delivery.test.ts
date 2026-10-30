import {describe,expect,test} from 'vitest';
import {deliveryEnvironment,storyDeliveryReading} from '../packages/shared/src/story-delivery';

describe('Story development and release delivery ownership',()=>{
 test('DEV is independent; QA requires association, development approvals and an immutable candidate',()=>{
  const view=storyDeliveryReading({status:'merge_request',mergeConfirmed:true,release:null});
  expect(view.development).toMatchObject({unit:'story',releaseRequired:false,next:true,publication:'unconfirmed',approval:'unconfirmed',publicationAvailable:false});
  expect(view.release.association).toBe('unassigned');
  expect(view.promotion).toEqual({releaseRequiredFrom:'QA',immutableCandidateRequired:true,allStoriesDevelopmentApprovalRequired:true,available:false});
  expect(view.destinations.map(d=>[d.code,d.label,d.unit])).toEqual([['DEV','DEV','story'],['QA','QA','release'],['HML','HML','release'],['PRD','PROD','release']]);
 });
 test('unknown association differs from a confirmed absence or assignment',()=>{
  expect(storyDeliveryReading({status:'coding'}).release.association).toBe('unconfirmed');
  expect(storyDeliveryReading({status:'coding',release:null}).release.association).toBe('unassigned');
  const release={id:'r',key:'R1',name:'Release 1',compositionStatus:'CLOSED'};
  expect(storyDeliveryReading({status:'testing',release}).release).toEqual({association:'assigned',reference:release,candidate:'unconfirmed'});
 });
 test.each(['testing','uat','production','completed','cancelled'])('%s cannot attest any deployment or validation',status=>{
  const view=storyDeliveryReading({status,mergeConfirmed:true});
  expect(view.destinations.every(d=>d.publication==='unconfirmed'&&d.validation==='unconfirmed')).toBe(true);
  expect(view.development.next).toBe(!['completed','cancelled'].includes(status));
 });
 test('URL normalizes PROD to the persisted environment code',()=>{
  expect(deliveryEnvironment('PROD')).toBe('PRD');expect(deliveryEnvironment('QA')).toBe('QA');
  expect(deliveryEnvironment(null)).toBe('DEV');expect(deliveryEnvironment('unknown')).toBe('DEV');
 });
});
