'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const validation = import('../shared/data-validation.mjs');

async function exists(file) {
  try { await fs.stat(file); return true; }
  catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readLibrary(file, today) {
  const { checkDataSize, MAX_FILE_BYTES, normalizeAppData } = await validation;
  if ((await fs.stat(file)).size > MAX_FILE_BYTES) throw new Error('Library too large.');
  const raw = await fs.readFile(file, 'utf8');
  checkDataSize(raw);
  return normalizeAppData(JSON.parse(raw), today);
}

async function loadLibrary(target, legacy, today) {
  if (await exists(target)) return readLibrary(target, today);
  if (!(await exists(legacy))) return { decks: [] };

  const temporary = target + '.' + randomUUID() + '.tmp';
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.copyFile(legacy, temporary);
    const data = await readLibrary(temporary, today);
    await fs.rename(temporary, target);
    return data;
  } finally { await fs.rm(temporary, { force: true }); }
}

module.exports = { loadLibrary };
