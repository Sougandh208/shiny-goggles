import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeZip } from '../public/js/render/zip.js';

function haveUnzip() {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('zip: produces an archive that a real unzip accepts, with intact contents', { skip: !haveUnzip() && 'unzip not installed' }, () => {
  const bin = new Uint8Array(70000).map((_, i) => (i * 31) % 251);
  const zip = makeZip([
    { name: 'copy.txt', data: 'Héllo — ₹ ad copy\nline two' },
    { name: 'posters/square.png', data: bin },
    { name: 'empty.txt', data: '' },
  ]);
  const dir = mkdtempSync(path.join(tmpdir(), 'novaad-zip-'));
  const file = path.join(dir, 'kit.zip');
  writeFileSync(file, zip);

  // -t verifies every entry's CRC-32
  const test = execFileSync('unzip', ['-t', file]).toString();
  assert.match(test, /No errors detected/);

  execFileSync('unzip', ['-o', '-q', file, '-d', dir]);
  assert.equal(readFileSync(path.join(dir, 'copy.txt'), 'utf8'), 'Héllo — ₹ ad copy\nline two');
  assert.deepEqual(new Uint8Array(readFileSync(path.join(dir, 'posters/square.png'))), bin);
  assert.equal(readFileSync(path.join(dir, 'empty.txt')).length, 0);
});

test('zip: strips path traversal from entry names', () => {
  const zip = makeZip([{ name: '../../evil.txt', data: 'x' }, { name: '/abs/path.txt', data: 'y' }]);
  const text = Buffer.from(zip).toString('latin1');
  assert.ok(!text.includes('../'));
  assert.ok(text.includes('abs/path.txt'));
});
