'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { makeTempProject, runHook, postToolUseEvent } = require('./helpers');

const THRESHOLD = 5; // must match hooks/stop.js EXPLORATION_THRESHOLD

function stopEvent(cwd, stopHookActive) {
  return {
    session_id: 'test-session',
    cwd: cwd,
    hook_event_name: 'Stop',
    stop_hook_active: !!stopHookActive,
  };
}

function projectWithTopic() {
  const dir = makeTempProject();
  const notes = path.join(dir, '.project-notes');
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(notes, 'auth.md'), '---\nsummary: S\ncovers: [src/auth/]\n---\nB.\n');
  return dir;
}

function explore(dir, tool, n) {
  for (let i = 0; i < n; i++) {
    const res = runHook(
      'post-tool-use.js',
      postToolUseEvent(dir, tool, { file_path: path.join(dir, 'src', 'x' + i + '.ts') })
    );
    assert.strictEqual(res.status, 0, res.stderr);
  }
}

test('threshold+ exploration, no edits, no notes -> declinable nudge', () => {
  const dir = projectWithTopic();
  explore(dir, 'Read', THRESHOLD);

  const res = runHook('stop.js', stopEvent(dir));
  assert.strictEqual(res.json && res.json.decision, 'block', res.stdout);
  assert.ok(/nothing/i.test(res.json.reason), 'declinable wording: ' + res.json.reason);
  assert.ok(/finish|stop|proceed/i.test(res.json.reason), res.json.reason);
});

test('Grep and Glob also count toward exploration', () => {
  const dir = projectWithTopic();
  explore(dir, 'Grep', 3);
  explore(dir, 'Glob', 2);

  const res = runHook('stop.js', stopEvent(dir));
  assert.strictEqual(res.json && res.json.decision, 'block', res.stdout);
});

test('below-threshold exploration passes through silently', () => {
  const dir = projectWithTopic();
  explore(dir, 'Read', THRESHOLD - 1);

  const res = runHook('stop.js', stopEvent(dir));
  assert.strictEqual(res.stdout.trim(), '', 'silent: ' + res.stdout);
});

test('writing a note suppresses the nudge', () => {
  const dir = projectWithTopic();
  explore(dir, 'Read', THRESHOLD + 2);
  const notePath = path.join(dir, '.project-notes', 'auth.md');
  fs.writeFileSync(notePath, fs.readFileSync(notePath, 'utf8') + 'more\n');
  runHook('post-tool-use.js', postToolUseEvent(dir, 'Edit', { file_path: notePath }));

  const res = runHook('stop.js', stopEvent(dir));
  assert.ok(!res.json || res.json.decision !== 'block', 'suppressed: ' + res.stdout);
});

test('code-edit turn never gets the nudge (hard-block path owns it)', () => {
  const dir = projectWithTopic();
  explore(dir, 'Read', THRESHOLD + 2);
  const code = path.join(dir, 'src', 'auth', 'a.ts');
  fs.mkdirSync(path.dirname(code), { recursive: true });
  fs.writeFileSync(code, 'x\n');
  runHook('post-tool-use.js', postToolUseEvent(dir, 'Edit', { file_path: code }));

  const res = runHook('stop.js', stopEvent(dir));
  assert.strictEqual(res.json.decision, 'block');
  assert.ok(res.json.reason.includes('auth'), 'this is the staleness block, not the nudge');
  assert.ok(!/nothing to note/i.test(res.json.reason), 'not the nudge wording');
});

test('stop_hook_active makes the nudge declinable (second stop passes)', () => {
  const dir = projectWithTopic();
  explore(dir, 'Read', THRESHOLD);

  const res = runHook('stop.js', stopEvent(dir, true));
  assert.ok(!res.json || res.json.decision !== 'block', 'declined: ' + res.stdout);
});
