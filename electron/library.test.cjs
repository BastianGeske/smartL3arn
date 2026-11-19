'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { loadLibrary } = require('./library.cjs');

test('desktop migration distinguishes missing, unreadable, malformed and valid sources', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartl3arn-migration-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const legacy = path.join(root, 'Anki Web', 'ankiweb_data.json');
  const target = path.join(root, 'smartL3arn', 'ankiweb_data.json');
  const load = () => loadLibrary(target, legacy, '2026-11-19');
  assert.deepEqual(await load(), { decks: [] });

  await fs.mkdir(path.dirname(legacy));
  await fs.writeFile(legacy, '{"decks":"invalid"}');
  t.mock.method(fs, 'copyFile', async () => { throw Object.assign(new Error('Denied'), { code: 'EACCES' }); }, { times: 1 });
  await assert.rejects(load(), { code: 'EACCES' });
  await assert.rejects(fs.stat(target), { code: 'ENOENT' });
  await assert.rejects(load(), /Invalid/);
  assert.deepEqual(await fs.readdir(path.dirname(target)), []);

  const valid = { decks: [{ id: 'legacy', name: 'Legacy', cards: [] }] };
  await fs.writeFile(legacy, JSON.stringify(valid));
  assert.deepEqual(await load(), valid);
  assert.equal(await fs.readFile(target, 'utf8'), await fs.readFile(legacy, 'utf8'));
  await fs.writeFile(legacy, '{}');
  assert.deepEqual(await load(), valid);
});
