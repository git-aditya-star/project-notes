'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { makeTempProject, runHook, postToolUseEvent } = require('./helpers');
const { parseFrontmatter } = require('../lib/notes');

function setupNotes(dir) {
  const notes = path.join(dir, '.project-notes');
  fs.mkdirSync(notes, { recursive: true });
  return notes;
}

function writeNoteViaTool(dir, name, content) {
  // Simulates the state after Claude's Write tool ran: file exists on disk,
  // then the PostToolUse event fires.
  const notes = setupNotes(dir);
  const file = path.join(notes, name);
  fs.writeFileSync(file, content);
  return runHook('post-tool-use.js', postToolUseEvent(dir, 'Write', { file_path: file }));
}

test('note write regenerates INDEX.md with the topic line', () => {
  const dir = makeTempProject();
  const res = writeNoteViaTool(
    dir,
    'auth-flow.md',
    '---\nsummary: How auth works\ncovers: [src/auth/]\n---\nBody.\n'
  );

  assert.strictEqual(res.status, 0, 'exit 0, stderr: ' + res.stderr);
  const index = fs.readFileSync(path.join(dir, '.project-notes', 'INDEX.md'), 'utf8');
  assert.ok(index.includes('- auth-flow — How auth works [covers: src/auth/]'), index);
});

test('note write stamps updated timestamp into the note frontmatter', () => {
  const dir = makeTempProject();
  writeNoteViaTool(dir, 'auth-flow.md', '---\nsummary: S\ncovers: [src/]\n---\nBody.\n');

  const note = fs.readFileSync(path.join(dir, '.project-notes', 'auth-flow.md'), 'utf8');
  const fm = parseFrontmatter(note);
  assert.ok(fm.updated, 'updated stamped, note now:\n' + note);
  assert.ok(!isNaN(Date.parse(fm.updated)), 'updated is a parseable timestamp: ' + fm.updated);
  assert.strictEqual(fm.summary, 'S', 'rest of frontmatter untouched');
  assert.ok(note.includes('Body.'), 'body untouched');

  const index = fs.readFileSync(path.join(dir, '.project-notes', 'INDEX.md'), 'utf8');
  assert.ok(index.includes('(updated: ' + fm.updated + ')'), index);
});

test('second write replaces the stamp instead of duplicating it', () => {
  const dir = makeTempProject();
  writeNoteViaTool(dir, 'topic.md', '---\nsummary: S\n---\nv1\n');
  const notePath = path.join(dir, '.project-notes', 'topic.md');
  const afterFirst = fs.readFileSync(notePath, 'utf8');
  fs.writeFileSync(notePath, afterFirst.replace('v1', 'v2'));
  const res = runHook('post-tool-use.js', postToolUseEvent(dir, 'Edit', { file_path: notePath }));

  assert.strictEqual(res.status, 0);
  const note = fs.readFileSync(notePath, 'utf8');
  const stamps = note.match(/^updated:/gm) || [];
  assert.strictEqual(stamps.length, 1, 'exactly one updated line:\n' + note);
  assert.ok(note.includes('v2'), 'edit preserved');
});

test('non-note file write does not create an index', () => {
  const dir = makeTempProject();
  setupNotes(dir);
  const src = path.join(dir, 'src', 'app.js');
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(src, 'code\n');

  const res = runHook('post-tool-use.js', postToolUseEvent(dir, 'Write', { file_path: src }));

  assert.strictEqual(res.status, 0);
  assert.ok(!fs.existsSync(path.join(dir, '.project-notes', 'INDEX.md')), 'no index created');
});

test('non-write tools are ignored even inside the notes dir', () => {
  const dir = makeTempProject();
  const notes = setupNotes(dir);
  const file = path.join(notes, 'topic.md');
  fs.writeFileSync(file, '---\nsummary: S\n---\n');

  const res = runHook('post-tool-use.js', postToolUseEvent(dir, 'Read', { file_path: file }));

  assert.strictEqual(res.status, 0);
  assert.ok(!fs.existsSync(path.join(notes, 'INDEX.md')), 'Read triggers nothing');
  assert.strictEqual(parseFrontmatter(fs.readFileSync(file, 'utf8')).updated, null, 'no stamp');
});

test('dot-prefixed files inside notes dir are ignored', () => {
  const dir = makeTempProject();
  const notes = setupNotes(dir);
  const stateFile = path.join(notes, '.state', 'session.json');
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, '{}');

  const res = runHook('post-tool-use.js', postToolUseEvent(dir, 'Write', { file_path: stateFile }));

  assert.strictEqual(res.status, 0);
  assert.ok(!fs.existsSync(path.join(notes, 'INDEX.md')), 'runtime state triggers nothing');
});

test('editing INDEX.md itself regenerates it from notes without stamping it', () => {
  const dir = makeTempProject();
  const notes = setupNotes(dir);
  fs.writeFileSync(path.join(notes, 'real.md'), '---\nsummary: Real\n---\n');
  const indexPath = path.join(notes, 'INDEX.md');
  fs.writeFileSync(indexPath, 'hand-edited garbage\n');

  const res = runHook('post-tool-use.js', postToolUseEvent(dir, 'Edit', { file_path: indexPath }));

  assert.strictEqual(res.status, 0);
  const index = fs.readFileSync(indexPath, 'utf8');
  assert.ok(!index.includes('garbage'), 'hand edit overwritten: ' + index);
  assert.ok(index.includes('- real — Real'), index);
  assert.ok(!index.startsWith('---'), 'index itself not stamped');
});

test('malformed note still indexed and stamped without crashing', () => {
  const dir = makeTempProject();
  const res = writeNoteViaTool(dir, 'broken.md', 'no frontmatter here\n');

  assert.strictEqual(res.status, 0, 'stderr: ' + res.stderr);
  const index = fs.readFileSync(path.join(dir, '.project-notes', 'INDEX.md'), 'utf8');
  assert.ok(index.includes('- broken — (no summary)'), index);
  const note = fs.readFileSync(path.join(dir, '.project-notes', 'broken.md'), 'utf8');
  assert.ok(parseFrontmatter(note).updated, 'stamped via prepended frontmatter');
  assert.ok(note.includes('no frontmatter here'), 'original content preserved');
});
