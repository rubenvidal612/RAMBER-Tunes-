import assert from 'node:assert/strict';
import test from 'node:test';
import { isVoiceAvailable, requireVoiceAvailable } from '../src/lib/voiceAvailability.ts';

test('serialized false must not confirm a voice', () => {
  assert.equal(isVoiceAvailable('false'), false);
  assert.throws(() => requireVoiceAvailable('false'), /no confirmó/);
});

test('missing, pending and malformed confirmations fail closed', () => {
  for (const value of [false, null, undefined, '', 'processing', 'success', 1, {}, []]) {
    assert.throws(() => requireVoiceAvailable(value), /no confirmó/);
  }
});

test('explicit provider confirmation permits use', () => {
  for (const value of [true, 'true']) {
    assert.doesNotThrow(() => requireVoiceAvailable(value));
  }
});
