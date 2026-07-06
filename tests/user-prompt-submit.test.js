'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { makeTempProject, runHook, postToolUseEvent } = require('./helpers');

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

test('non-empty notebook: injects the refreshed index via additionalContext', () => {
  const dir = projectWithAuthTopic();
  const res = runHook('user-prompt-submit.js', userPromptEvent(dir));

  assert.strictEqual(res.status, 0, 'exit 0, stderr: ' + res.stderr);
  assert.ok(res.json, 'stdout is valid JSON, got: ' + res.stdout);
  const hso = res.json.hookSpecificOutput;
  assert.ok(hso, 'hookSpecificOutput present');
  assert.strictEqual(hso.hookEventName, 'UserPromptSubmit');
  assert.strictEqual(typeof hso.additionalContext, 'string');
  assert.ok(
    hso.additionalContext.includes('- auth-flow — How auth works [covers: src/auth/]'),
    'context carries the generated index line, got: ' + hso.additionalContext
  );
});

test('empty notebook: produces no output (nothing worth injecting)', () => {
  const dir = makeTempProject();
  fs.mkdirSync(path.join(dir, '.project-notes'), { recursive: true });

  const res = runHook('user-prompt-submit.js', userPromptEvent(dir));

  assert.strictEqual(res.status, 0, 'exit 0, stderr: ' + res.stderr);
  assert.strictEqual(res.stdout.trim(), '', 'silent on empty notebook, got: ' + res.stdout);
});

test('index injected reflects a note written earlier this session', () => {
  const dir = makeTempProject();
  fs.mkdirSync(path.join(dir, '.project-notes'), { recursive: true });

  // Simulate a note being written mid-session (the write path stamps + reindexes).
  const notePath = path.join(dir, '.project-notes', 'cache.md');
  fs.writeFileSync(notePath, '---\nsummary: Caching layer\n---\nBody.\n');
  runHook('post-tool-use.js', postToolUseEvent(dir, 'Write', { file_path: notePath }));

  const res = runHook('user-prompt-submit.js', userPromptEvent(dir));
  const ctx = res.json.hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes('- cache — Caching layer'), 'fresh note is in the index, got: ' + ctx);
});

test('still resets per-turn state: a prior code edit does not leak to the Stop check', () => {
  const dir = projectWithAuthTopic();

  // Record a covered code edit this turn.
  const codeFile = path.join(dir, 'src', 'auth', 'login.ts');
  fs.mkdirSync(path.dirname(codeFile), { recursive: true });
  fs.writeFileSync(codeFile, 'code\n');
  runHook('post-tool-use.js', postToolUseEvent(dir, 'Edit', { file_path: codeFile }));

  // A new user prompt must clear that state...
  runHook('user-prompt-submit.js', userPromptEvent(dir));

  // ...so Stop sees a clean turn and does not block.
  const stop = runHook('stop.js', {
    session_id: 'test-session',
    cwd: dir,
    hook_event_name: 'Stop',
    stop_hook_active: false,
  });
  assert.strictEqual(stop.status, 0, stop.stderr);
  assert.ok(!stop.json || stop.json.decision !== 'block', 'state was reset: ' + stop.stdout);
});
