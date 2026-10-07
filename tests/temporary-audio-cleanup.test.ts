import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeAudioCleanup, cleanupTemporaryAudio, temporaryAudioKey } from '../src/lib/temporaryAudioCleanup.ts';

const url = 'https://project.supabase.co';
const now = Date.parse('2026-10-06T12:00:00Z');
const key = (name: string) => `uploads/audio/user/${name}`;
const object = (name: string, age = 20, size = 100) => ({ id: name, name, metadata: { size },
  created_at: new Date(now - age * 86400000).toISOString(),
  updated_at: new Date(now - age * 86400000).toISOString() });

function fixture({ files = [object('old.mp3')], refs = {} as Record<string, any[]>, fail = '', removeFail = false } = {}) {
  const deleted: string[][] = [];
  const admin = {
    from(table: string) {
      const query: any = {
        select() { return query; }, order() { return query; },
        async range(start: number, end: number) {
          if (table === fail) return { error: { code: '42501', message: 'permission denied' } };
          if (table === 'rvc_covers') return { error: { code: 'PGRST205', message: 'missing table' } };
          return { data: (refs[table] || []).slice(start, end + 1) };
        }
      };
      return query;
    },
    storage: { from(bucket: string) {
      assert.equal(bucket, 'ramber-tunes');
      return {
        async list(folder: string, options: any) {
          if (fail === 'storage') return { error: { message: 'restricted' } };
          const data = folder === 'uploads/audio' ? [{ name: 'user', id: null, metadata: null }]
            : folder === 'uploads/audio/user' ? files : [];
          return { data: data.slice(options.offset, options.offset + options.limit) };
        },
        async remove(names: string[]) {
          deleted.push(names);
          return removeFail ? { error: { message: 'restricted' } } : { data: names.map(name => ({ name })) };
        }
      };
    } }
  };
  return { admin, deleted };
}

test('cron accepts authenticated Vercel GET and manual POST; rejects missing/wrong secrets', () => {
  for (const method of ['GET', 'POST']) assert.equal(authorizeAudioCleanup({ method, headers: { authorization: 'Bearer secret' } }, { CRON_SECRET: 'secret' }), 200);
  assert.equal(authorizeAudioCleanup({ method: 'GET', headers: {} }, {}), 503);
  assert.equal(authorizeAudioCleanup({ method: 'GET', headers: {} }, { CRON_SECRET: 'secret' }), 401);
  assert.equal(authorizeAudioCleanup({ method: 'DELETE', headers: {} }, { CRON_SECRET: 'secret' }), 405);
});

test('recognizes public and signed URLs only in the intended project/bucket', () => {
  for (const mode of ['public', 'sign', 'authenticated']) assert.equal(temporaryAudioKey(`${url}/storage/v1/object/${mode}/ramber-tunes/${key('a%20b.mp3')}?token=expired`, url), key('a b.mp3'));
  assert.equal(temporaryAudioKey(`https://other.supabase.co/storage/v1/object/public/ramber-tunes/${key('old.mp3')}`, url), '');
  assert.equal(temporaryAudioKey(`${url}/storage/v1/object/public/other/${key('old.mp3')}`, url), '');
});

test('paginates folders and all library refs; preserves signed refs, voices, outputs and recent files', async () => {
  const files = Array.from({ length: 205 }, (_, i) => object(`${i}.mp3`));
  files.push(object('recent.mp3', 1), object('masterizada.mp3'), object('rvc_mix_song.mp3'), object('voice.mp3'));
  const refs = { library_items: [...Array.from({ length: 110 }, () => ({ audio_url: '' })),
    { audio_url: `${url}/storage/v1/object/sign/ramber-tunes/${key('204.mp3')}?token=expired` }],
    voice_profiles: [{ sample_original_r2_path: key('voice.mp3') }] };
  const { admin, deleted } = fixture({ files, refs });
  const result = await cleanupTemporaryAudio(admin, url, { now });
  assert.equal(result.ok, true);
  assert.equal(result.borrados, 204);
  assert.equal(result.bytesLiberados, 20400);
  assert.equal(deleted.length, 5);
  assert.ok(deleted.every(batch => batch.length <= 50));
  assert.ok(!deleted.flat().includes(key('204.mp3')));
});

test('dry run reports bytes without deleting', async () => {
  const { admin, deleted } = fixture();
  const result = await cleanupTemporaryAudio(admin, url, { now, dryRun: true });
  assert.equal(result.bytesLiberables, 100);
  assert.equal(result.borrados, 0);
  assert.equal(deleted.length, 0);
});

test('unreadable storage or ANY required reference table prevents all deletion', async () => {
  for (const fail of ['storage', 'library_items', 'kits_voices', 'voice_profiles']) {
    const { admin, deleted } = fixture({ fail });
    assert.equal((await cleanupTemporaryAudio(admin, url, { now })).ok, false);
    assert.equal(deleted.length, 0);
  }
});

test('a failed removal stops processing and reports failure', async () => {
  const { admin, deleted } = fixture({ files: Array.from({ length: 120 }, (_, i) => object(`${i}.mp3`)), removeFail: true });
  const result = await cleanupTemporaryAudio(admin, url, { now });
  assert.equal(result.ok, false);
  assert.equal(result.borrados, 0);
  assert.equal(deleted.length, 1);
});

test('recent replacements and exact 14-day boundary are retained', async () => {
  const { admin, deleted } = fixture({ files: [object('boundary.mp3', 14),
    { ...object('replaced.mp3'), updated_at: new Date(now - 86400000).toISOString() }] });
  assert.equal((await cleanupTemporaryAudio(admin, url, { now })).borrados, 0);
  assert.equal(deleted.length, 0);
});
