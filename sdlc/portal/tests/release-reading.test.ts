import {expect,test} from 'vitest';
import {releaseReading} from '../packages/shared/src/release-reading';
test.each(['OPEN','CLOSED','CANCELED'])('%s is composition, never an environment or deployment',compositionStatus=>{
 const result=releaseReading(compositionStatus,'DEV');expect(result.source).toBe('release_composition');expect(result.composition.state).toBe(compositionStatus);
 expect(result.environment).toMatchObject({code:'DEV',state:'registered'});expect(result.candidate.state).toBe('no_evidence');expect(result.deployment.state).toBe('no_evidence');expect(result.validation.state).toBe('no_evidence');expect(result).not.toHaveProperty('legacy');
});
test('missing composition is unknown and does not invent a draft',()=>{expect(releaseReading().composition.state).toBe('unconfirmed');});

test('only OPEN implies the initial DEV flow; unknown historical destinations remain unknown',()=>{
 expect(releaseReading('OPEN').environment).toMatchObject({code:'DEV',state:'registered'});
 for(const state of ['CLOSED','CANCELED',undefined,'unknown'])expect(releaseReading(state).environment).toMatchObject({code:null,state:'unconfirmed'});
 expect(releaseReading('CLOSED','QA').environment.code).toBe('QA');
 expect(releaseReading('unknown','DEV').environment.code).toBeNull();
 expect(releaseReading('OPEN',null).environment.code).toBeNull();
 expect(releaseReading('OPEN','invalid').environment.code).toBeNull();
});
