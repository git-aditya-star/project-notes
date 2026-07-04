'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { makeTempProject, runHook, sessionStartEvent, postToolUseEvent } = require('./helpers');

const MARKER = '.project-notes-off'; // must match lib/hook-io.js

function optOut(dir) {
  fs.writeFileSync(path.join(dir, MARKER), '');
}

test('opted out: session start creates nothing and injects nothing', () => {
  const dir = makeTempProject({ git: true });
  optOut(dir);

  const res = runHook('session-start.js', sessionStartEvent(dir));

  assert.strictEqual(res.status, 0);
  assert.ok(!fs.existsSync(path.join(dir, '.project-notes')), 'no notes dir');
  assert.strictEqual(res.stdout.trim(), '', 'no context injected');
});

test('opted out: post-tool-use does not track or regenerate', () => {
  const dir = makeTempProject();
  const notes = path.join(dir, '.project-notes');
  fs.mkdirSync(notes, { recursive: true });
  optOut(dir);
  const note = path.join(notes, 'auth.md');
  fs.writeFileSync(note, '---\nsummary: S\n---\n');

  const res = runHook('post-tool-use.js', postToolUseEvent(dir, 'Write', { file_path: note }));

  assert.strictEqual(res.status, 0);
  assert.ok(!fs.existsSync(path.join(notes, 'INDEX.md')), 'no index generated');
  assert.strictEqual(fs.readFileSync(note, 'utf8'), '---\nsummary: S\n---\n', 'note not stamped');
});

test('opted out: stop never blocks even after a covered edit', () => {
  const dir = makeTempProject();
  const notes = path.join(dir, '.project-notes');
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(notes, 'auth.md'), '---\nsummary: S\ncovers: [src/]\n---\n');
  // record an edit BEFORE opting out, then opt out and stop
  const code = path.join(dir, 'src', 'a.ts');
  fs.mkdirSync(path.dirname(code), { recursive: true });
  fs.writeFileSync(code, 'x\n');
  runHook('post-tool-use.js', postToolUseEvent(dir, 'Edit', { file_path: code }));
  optOut(dir);

  const res = runHook('stop.js', { session_id: 'test-session', cwd: dir, hook_event_name: 'Stop' });

  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), '', 'no block when opted out');
});

test('removing the marker restores behavior', () => {
  const dir = makeTempProject({ git: true });
  optOut(dir);
  runHook('session-start.js', sessionStartEvent(dir));
  fs.unlinkSync(path.join(dir, MARKER));

  const res = runHook('session-start.js', sessionStartEvent(dir));

  assert.ok(fs.existsSync(path.join(dir, '.project-notes')), 'notes dir now created');
  assert.ok(res.json && res.json.hookSpecificOutput, 'context injected again');
});
