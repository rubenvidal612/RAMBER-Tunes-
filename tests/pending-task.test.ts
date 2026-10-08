import assert from 'node:assert/strict';
import test from 'node:test';
import {readSunoTaskState, fetchPendingTaskJson, removePendingTask} from '../src/lib/pendingTask.ts';

test('nested persona failures stop the wait and retain the actual reason', () => {
  const result = readSunoTaskState({data:{data:{status:'GENERATE_PERSONA_FAILED',errorMessage:'Voice persona generation failed'}}});
  assert.equal(result.failed, true);
  assert.equal(result.error, 'Voice persona generation failed');
});
test('actual provider timeout is terminal, not 95 percent progress', () => {
  const state = readSunoTaskState({code:200,data:{status:'GENERATE_AUDIO_FAILED',errorCode:408,errorMessage:'Upstream is currently experiencing service issues. No result has been returned for over 10 minutes.'}});
  assert.equal(state.failed,true);
  assert.match(state.error,/10 minutes/);
});
test('late results after cancellation do not remove a different queued task', () => {
  assert.deepEqual(removePendingTask([{taskId:'new-task'}],'cancelled-task'),[{taskId:'new-task'}]);
});
test('pending and successful generation are not failures', () => {
  for (const status of ['PENDING','GENERATING','FIRST_SUCCESS','SUCCESS']) assert.equal(readSunoTaskState({data:{status}}).failed,false);
});
test('all provider failure families stop waiting', () => {
  for (const status of ['FAILED','FAIL','ERROR','GENERATE_LYRICS_FAILED','CALLBACK_EXCEPTION','SENSITIVE_WORD_ERROR','CANCELLED']) assert.equal(readSunoTaskState({data:{status}}).failed,true);
});
test('missing provider state produces a visible error rather than endless progress', () => {
  assert.throws(()=>readSunoTaskState({data:{}}), /estado válido/);
});
test('HTTP errors retain reason and status', async () => {
  const fake = (async () => new Response(JSON.stringify({detail:'Provider unavailable'}),{status:502})) as typeof fetch;
  await assert.rejects(fetchPendingTaskJson('/task',{},fake), (e:any)=>e.httpStatus===502 && e.message==='Provider unavailable');
});
test('network errors propagate and every request has a deadline and bypasses cache', async () => {
  const fake = (async (_url:any, init:any) => {
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.cache,'no-store');
    throw new Error('Connection interrupted');
  }) as typeof fetch;
  await assert.rejects(fetchPendingTaskJson('/task',{},fake), /Connection interrupted/);
});
