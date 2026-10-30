import {expect,test} from 'vitest';
import {storyLifecycleReading} from '../packages/shared/src/story-lifecycle-reading';

test.each(['specification','approved','coding','code_review','security_scan','merge_request','testing','uat','production','completed','cancelled'])('%s does not fabricate development approval or production evidence',status=>{
 const reading=storyLifecycleReading({id:'isolated-story',status,version:17,revision:{specification:null,execution:null}});
 expect(reading.development).toMatchObject({state:'not_recorded',approvalAvailable:false});
 expect(reading.completion).toMatchObject({production:'unconfirmed',completionAvailable:false});
 expect(reading.revision).toEqual({recordVersion:17,specification:null,execution:null,executionContext:'not_checked'});
 expect(reading.completion.state).toBe(status==='completed'?'recorded_without_production_evidence':status==='cancelled'?'cancelled':'awaiting_production');
});
