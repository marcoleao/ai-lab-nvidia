import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
for(const script of ['scripts/regression.mjs','scripts/test-isolated.mjs']){
 test(script+' refuses the operational database before any test or reset',()=>{
  const result=spawnSync(process.execPath,[script,'backend'],{env:{...process.env,DATABASE_URL:'postgresql://test:only@127.0.0.1:1/portal',TEST_DATABASE_URL:'postgresql://test:only@127.0.0.1:1/portal'},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/portal_test/);assert.doesNotMatch(result.stderr,/ECONNREFUSED/);
 });
}
test('the test API cannot start without the explicit test-host marker',()=>{
 const env={...process.env,DATABASE_URL:'postgresql://test:only@127.0.0.1:1/portal_test',TEST_DATABASE_URL:'postgresql://test:only@127.0.0.1:1/portal_test'};delete env.REGRESSION_TEST_HOST;
 const result=spawnSync(process.execPath,['--import','tsx','tests/support/server.mjs'],{env,encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Explicit regression harness/);assert.doesNotMatch(result.stderr,/ECONNREFUSED/);
});
test('a filtered run cannot be reported as complete regression',()=>{
 const result=spawnSync(process.execPath,['scripts/regression.mjs','full','--grep=only-one-case'],{env:{...process.env,DATABASE_URL:'postgresql://test:only@127.0.0.1:1/portal_test',TEST_DATABASE_URL:'postgresql://test:only@127.0.0.1:1/portal_test'},encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Full regression requires all cases/);assert.doesNotMatch(result.stderr,/ECONNREFUSED/);
});
