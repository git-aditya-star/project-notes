'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { makeTempProject } = require('./helpers');
const { backupNote } = require('../lib/backup');

function notesDir(dir) {
  const p = path.join(dir, '.project-notes');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function backupsOf(notes, name) {
  const d = path.join(notes, '.backups', name);
  return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
}

test('backupNote writes the given content under .backups/<name>/', () => {
  const notes = notesDir(makeTempProject());
  backupNote(notes, 'auth.md', 'v1 content');
  const files = backupsOf(notes, 'auth.md');
  assert.strictEqual(files.length, 1);
  assert.strictEqual(
    fs.readFileSync(path.join(notes, '.backups', 'auth.md', files[0]), 'utf8'),
    'v1 content'
  );
});

test('successive backups accumulate in order', () => {
  const notes = notesDir(makeTempProject());
  backupNote(notes, 'auth.md', 'v1');
  backupNote(notes, 'auth.md', 'v2');
  backupNote(notes, 'auth.md', 'v3');
  const files = backupsOf(notes, 'auth.md');
  assert.strictEqual(files.length, 3);
  const contents = files.map((f) => fs.readFileSync(path.join(notes, '.backups', 'auth.md', f), 'utf8'));
  assert.deepStrictEqual(contents, ['v1', 'v2', 'v3'], 'chronological');
});

test('backups are bounded: oldest pruned past the cap', () => {
  const notes = notesDir(makeTempProject());
  for (let i = 1; i <= 8; i++) backupNote(notes, 'auth.md', 'v' + i, 5);
  const files = backupsOf(notes, 'auth.md');
  assert.strictEqual(files.length, 5, 'capped at 5');
  const contents = files.map((f) => fs.readFileSync(path.join(notes, '.backups', 'auth.md', f), 'utf8'));
  assert.deepStrictEqual(contents, ['v4', 'v5', 'v6', 'v7', 'v8'], 'kept newest 5');
});

test('backups for different topics are isolated', () => {
  const notes = notesDir(makeTempProject());
  backupNote(notes, 'auth.md', 'a');
  backupNote(notes, 'build.md', 'b');
  assert.strictEqual(backupsOf(notes, 'auth.md').length, 1);
  assert.strictEqual(backupsOf(notes, 'build.md').length, 1);
});
