'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { makeTempProject, runHook, postToolUseEvent } = require('./helpers');

function stopEvent(cwd, stopHookActive) {
  return {
    session_id: 'test-session',
    transcript_path: path.join(cwd, 'fake-transcript.jsonl'),
    cwd: cwd,
    hook_event_name: 'Stop',
    stop_hook_active: !!stopHookActive,
  };
}

function userPromptEvent(cwd) {
  return {
    session_id: 'test-session',
    transcript_path: path.join(cwd, 'fake-transcript.jsonl'),
    cwd: cwd,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'next task please',
  };
}

// Project with one topic note covering src/auth/.
function projectWithAuthTopic() {
  const dir = makeTempProject();
  const notes = path.join(dir, '.project-notes');
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(
    path.join(notes, 'auth-flow.md'),
    '---\nsummary: How auth works\ncovers: [src/auth/]\n---\nBody.\n'
  );
  return dir;
}

// Simulates Claude editing a code file: file on disk + PostToolUse event.
function editCodeFile(dir, relPath) {
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, 'code\n');
  const res = runHook('post-tool-use.js', postToolUseEvent(dir, 'Edit', { file_path: abs }));
  assert.strictEqual(res.status, 0, 'post-tool-use ok: ' + res.stderr);
}

function updateNote(dir, name) {
  const abs = path.join(dir, '.project-notes', name);
  fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8') + 'refreshed\n');
  const res = runHook('post-tool-use.js', postToolUseEvent(dir, 'Edit', { file_path: abs }));
  assert.strictEqual(res.status, 0, 'post-tool-use ok: ' + res.stderr);
}

test('editing covered code then stopping without a note update blocks with the topic named', () => {
  const dir = projectWithAuthTopic();
  editCodeFile(dir, path.join('src', 'auth', 'login.ts'));

  const res = runHook('stop.js', stopEvent(dir));

  assert.strictEqual(res.status, 0, res.stderr);
  assert.ok(res.json, 'JSON verdict, got: ' + res.stdout);
  assert.strictEqual(res.json.decision, 'block');
  assert.ok(res.json.reason.includes('auth-flow'), res.json.reason);
  assert.ok(res.json.reason.includes('src/auth/login.ts'), res.json.reason);
});

test('updating the covering note during the turn lets the stop through silently', () => {
  const dir = projectWithAuthTopic();
  editCodeFile(dir, path.join('src', 'auth', 'login.ts'));
  updateNote(dir, 'auth-flow.md');

  const res = runHook('stop.js', stopEvent(dir));

  assert.strictEqual(res.status, 0);
  assert.ok(!res.json || res.json.decision !== 'block', 'no block, got: ' + res.stdout);
});

test('uncovered edits are listed in the block message as judgment, not obligation', () => {
  const dir = projectWithAuthTopic();
  editCodeFile(dir, path.join('src', 'auth', 'login.ts'));
  editCodeFile(dir, path.join('scripts', 'deploy.sh'));

  const res = runHook('stop.js', stopEvent(dir));

  assert.strictEqual(res.json.decision, 'block');
  assert.ok(res.json.reason.includes('scripts/deploy.sh'), res.json.reason);
  assert.ok(/consider/i.test(res.json.reason), 'judgment phrasing: ' + res.json.reason);
});

test('uncovered-only edits do not block', () => {
  const dir = projectWithAuthTopic();
  editCodeFile(dir, path.join('docs', 'readme.md'));

  const res = runHook('stop.js', stopEvent(dir));

  assert.strictEqual(res.status, 0);
  assert.ok(!res.json || res.json.decision !== 'block', 'no block, got: ' + res.stdout);
});

test('stop_hook_active prevents a second block in the same turn', () => {
  const dir = projectWithAuthTopic();
  editCodeFile(dir, path.join('src', 'auth', 'login.ts'));

  const res = runHook('stop.js', stopEvent(dir, true));

  assert.strictEqual(res.status, 0);
  assert.ok(!res.json || res.json.decision !== 'block', 'never double-blocks: ' + res.stdout);
});

test('a new user prompt resets turn state; earlier edits do not leak', () => {
  const dir = projectWithAuthTopic();
  editCodeFile(dir, path.join('src', 'auth', 'login.ts'));
  runHook('user-prompt-submit.js', userPromptEvent(dir));

  const res = runHook('stop.js', stopEvent(dir));

  assert.strictEqual(res.status, 0);
  assert.ok(!res.json || res.json.decision !== 'block', 'state was reset: ' + res.stdout);
});

test('turns with zero code edits produce no block and no output', () => {
  const dir = projectWithAuthTopic();

  const res = runHook('stop.js', stopEvent(dir));

  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), '', 'silent pass-through');
});

test('note writes are not recorded as code edits', () => {
  const dir = projectWithAuthTopic();
  updateNote(dir, 'auth-flow.md');

  const res = runHook('stop.js', stopEvent(dir));

  assert.strictEqual(res.status, 0);
  assert.ok(!res.json || res.json.decision !== 'block', 'note-only turn silent: ' + res.stdout);
});

test('NotebookEdit on a covered notebook is tracked and blocks', () => {
  const dir = projectWithAuthTopic();
  const nb = path.join(dir, 'src', 'auth', 'analysis.ipynb');
  fs.mkdirSync(path.dirname(nb), { recursive: true });
  fs.writeFileSync(nb, '{}');
  const res1 = runHook(
    'post-tool-use.js',
    postToolUseEvent(dir, 'NotebookEdit', { notebook_path: nb })
  );
  assert.strictEqual(res1.status, 0, res1.stderr);

  const res = runHook('stop.js', stopEvent(dir));
  assert.strictEqual(res.json && res.json.decision, 'block', 'notebook edit tracked: ' + res.stdout);
  assert.ok(res.json.reason.includes('src/auth/analysis.ipynb'), res.json.reason);
});

test('state dir stays out of the generated index', () => {
  const dir = projectWithAuthTopic();
  editCodeFile(dir, path.join('src', 'auth', 'login.ts'));
  updateNote(dir, 'auth-flow.md');

  const index = fs.readFileSync(path.join(dir, '.project-notes', 'INDEX.md'), 'utf8');
  assert.ok(!index.includes('.state'), index);
});
