import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectVoiceReadiness, requireVoiceReady, voiceRecordError } from '../src/lib/voiceAvailability.ts';

function provider(record: any, available?: unknown, code = 200) {
  const calls: string[] = [];
  const fetcher = async (path: string) => {
    calls.push(path);
    return { res: { ok: code === 200 }, data: { code, data: path.includes('record-info') ? record : { isAvailable: available } } };
  };
  return { calls, fetcher };
}

test('José: success and voiceId must not conceal the provider expiry error', async () => {
  const p = provider({ status: 'success', voiceId: 'voice', errorCode: 400, errorMessage: 'The voice has expired. Please recreate the voice or switch to a new voice' }, true);
  const state = await inspectVoiceReadiness('task', 'voice', p.fetcher);
  assert.equal(state.status, 'expired');
  assert.equal(state.isAvailable, false);
  assert.throws(() => requireVoiceReady(state), /No se generó ni se cobró/);
  assert.equal(p.calls.length, 1, 'do not let a contradictory availability flag override the error');
});

test('Caín: an unavailable voice is not treated as ready or assigned an invented TTL', async () => {
  const p = provider({ status: 'success', voiceId: 'voice', errorCode: null, errorMessage: '' }, false);
  const state = await inspectVoiceReadiness('task', 'voice', p.fetcher);
  assert.equal(state.status, 'unavailable');
  assert.throws(() => requireVoiceReady(state));
  assert.equal('expiresAt' in state, false);
});

test('ready requires matching ID, successful record without errors and explicit availability', async () => {
  for (const value of [true, 'true']) {
    const p = provider({ status: 'success', voiceId: 'voice', errorCode: 0 }, value);
    const state = await inspectVoiceReadiness('task?x', 'voice', p.fetcher);
    assert.doesNotThrow(() => requireVoiceReady(state));
    assert.match(p.calls[0], /task%3Fx/);
    assert.equal(p.calls.length, 2);
  }
  for (const value of [false, 'false', null, undefined, 'success', 1]) {
    const p = provider({ status: 'success', voiceId: 'voice' }, value);
    assert.equal((await inspectVoiceReadiness('task', 'voice', p.fetcher)).isAvailable, false);
  }
});

test('missing task, mismatched voice, processing and failed validation never pass', async () => {
  const p = provider({ status: 'success', voiceId: 'other' });
  assert.equal((await inspectVoiceReadiness('', 'voice', p.fetcher)).status, 'unconfirmed');
  assert.equal(p.calls.length, 0);
  assert.equal((await inspectVoiceReadiness('task', 'voice', p.fetcher)).status, 'unconfirmed');
  for (const status of ['wait_processing', 'wait_validating', 'processing_validate_fail', 'fail']) {
    const q = provider({ status, voiceId: 'voice' });
    assert.equal((await inspectVoiceReadiness('task', 'voice', q.fetcher)).isAvailable, false);
  }
});

test('provider/network failures are errors, not a fabricated permanent expiry', async () => {
  const p = provider({}, false, 503);
  await assert.rejects(inspectVoiceReadiness('task', 'voice', p.fetcher), /comprobar/);
  await assert.rejects(inspectVoiceReadiness('task', 'voice', async () => { throw new Error('offline'); }), /offline/);
  assert.equal(voiceRecordError({ errorCode: 500 }), 'Error de voz del proveedor (500).');
  assert.equal(voiceRecordError({ errorCode: null, errorMessage: '' }), '');
});
