'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { makeTempProject, runHook } = require('./helpers');
const { generateIndex } = require('../lib/notes');

function preEvent(cwd, toolName, filePath) {
  return {
    session_id: 'test-session',
    cwd: cwd,
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: { file_path: filePath },
  };
}

function notesDir(dir) {
  const p = path.join(dir, '.project-notes');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function backupsOf(notes, name) {
  const d = path.join(notes, '.backups', name);
  return fs.existsSync(d) ? fs.readdirSync(d) : [];
}

test('editing an existing note backs up its pre-edit content', () => {
  const dir = makeTempProject();
  const notes = notesDir(dir);
  const note = path.join(notes, 'auth.md');
  fs.writeFileSync(note, 'ORIGINAL\n');

  const res = runHook('pre-tool-use.js', preEvent(dir, 'Edit', note));

  assert.strictEqual(res.status, 0, res.stderr);
  const files = backupsOf(notes, 'auth.md');
  assert.strictEqual(files.length, 1);
  assert.strictEqual(fs.readFileSync(path.join(notes, '.backups', 'auth.md', files[0]), 'utf8'), 'ORIGINAL\n');
});

test('creating a brand-new note produces no backup', () => {
  const dir = makeTempProject();
  const notes = notesDir(dir);
  const note = path.join(notes, 'new-topic.md'); // does not exist yet

  const res = runHook('pre-tool-use.js', preEvent(dir, 'Write', note));

  assert.strictEqual(res.status, 0);
  assert.strictEqual(backupsOf(notes, 'new-topic.md').length, 0);
});

test('editing a code file (not a note) produces no backup', () => {
  const dir = makeTempProject();
  const notes = notesDir(dir);
  const code = path.join(dir, 'src', 'app.js');
  fs.mkdirSync(path.dirname(code), { recursive: true });
  fs.writeFileSync(code, 'code\n');

  const res = runHook('pre-tool-use.js', preEvent(dir, 'Edit', code));

  assert.strictEqual(res.status, 0);
  assert.ok(!fs.existsSync(path.join(notes, '.backups')), 'no backups dir at all');
});

test('editing INDEX.md is not backed up', () => {
  const dir = makeTempProject();
  const notes = notesDir(dir);
  fs.writeFileSync(path.join(notes, 'INDEX.md'), 'index\n');

  runHook('pre-tool-use.js', preEvent(dir, 'Edit', path.join(notes, 'INDEX.md')));

  assert.strictEqual(backupsOf(notes, 'INDEX.md').length, 0);
});

test('backups directory is ignored by index generation', () => {
  const dir = makeTempProject();
  const notes = notesDir(dir);
  fs.writeFileSync(path.join(notes, 'auth.md'), '---\nsummary: Auth\n---\n');
  const note = path.join(notes, 'auth.md');
  runHook('pre-tool-use.js', preEvent(dir, 'Edit', note));

  const index = generateIndex(notes);
  assert.ok(!index.includes('.backups'), index);
  assert.ok(!index.includes('bak'), index);
});
