'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  makeTempProject,
  runHook,
  sessionStartEvent,
  readExclude,
  countExcludeEntries,
  git,
} = require('./helpers');

const EXCLUDE_ENTRY = '.project-notes/';

test('git repo: creates notes dir and adds exclude entry once', () => {
  const dir = makeTempProject({ git: true });
  const res = runHook('session-start.js', sessionStartEvent(dir));

  assert.strictEqual(res.status, 0, 'exit 0, stderr: ' + res.stderr);
  assert.ok(fs.existsSync(path.join(dir, '.project-notes')), 'notes dir created');
  assert.strictEqual(countExcludeEntries(dir, EXCLUDE_ENTRY), 1, 'exactly one exclude entry');
});

test('git repo: running twice adds no duplicate exclude entry', () => {
  const dir = makeTempProject({ git: true });
  runHook('session-start.js', sessionStartEvent(dir));
  const res = runHook('session-start.js', sessionStartEvent(dir));

  assert.strictEqual(res.status, 0);
  assert.strictEqual(countExcludeEntries(dir, EXCLUDE_ENTRY), 1, 'still exactly one entry');
});

test('git repo: missing .git/info directory is created', () => {
  const dir = makeTempProject({ git: true });
  fs.rmSync(path.join(dir, '.git', 'info'), { recursive: true, force: true });
  const res = runHook('session-start.js', sessionStartEvent(dir));

  assert.strictEqual(res.status, 0, 'exit 0, stderr: ' + res.stderr);
  assert.ok(readExclude(dir).includes(EXCLUDE_ENTRY), 'entry written into recreated exclude file');
});

test('git repo: git status never shows files inside the notes dir', () => {
  const dir = makeTempProject({ git: true });
  runHook('session-start.js', sessionStartEvent(dir));

  fs.writeFileSync(path.join(dir, '.project-notes', 'some-topic.md'), 'note body\n');
  fs.writeFileSync(path.join(dir, 'control.txt'), 'control\n');

  const status = git(dir, ['status', '--porcelain']);
  assert.ok(!status.includes('.project-notes'), 'notes invisible to git, got:\n' + status);
  assert.ok(status.includes('control.txt'), 'control file proves status works');
});

test('linked worktree: notes dir created there and excluded via common git dir', () => {
  const main = makeTempProject({ git: true });
  git(main, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init']);
  const wt = path.join(main, 'wt');
  git(main, ['worktree', 'add', wt]);

  const res = runHook('session-start.js', sessionStartEvent(wt));

  assert.strictEqual(res.status, 0, 'exit 0, stderr: ' + res.stderr);
  assert.ok(fs.existsSync(path.join(wt, '.project-notes')), 'notes dir created in worktree');

  fs.writeFileSync(path.join(wt, '.project-notes', 'some-topic.md'), 'note body\n');
  const status = git(wt, ['status', '--porcelain']);
  assert.ok(!status.includes('.project-notes'), 'worktree notes invisible to git, got:\n' + status);
});

test('non-git dir: creates notes dir, no error, no .git created', () => {
  const dir = makeTempProject({ git: false });
  const res = runHook('session-start.js', sessionStartEvent(dir));

  assert.strictEqual(res.status, 0, 'exit 0, stderr: ' + res.stderr);
  assert.ok(fs.existsSync(path.join(dir, '.project-notes')), 'notes dir created');
  assert.ok(!fs.existsSync(path.join(dir, '.git')), 'no .git conjured up');
});

test('injects protocol message via hookSpecificOutput.additionalContext', () => {
  const dir = makeTempProject({ git: true });
  const res = runHook('session-start.js', sessionStartEvent(dir));

  assert.strictEqual(res.status, 0);
  assert.ok(res.json, 'stdout is valid JSON, got: ' + res.stdout);
  const hso = res.json.hookSpecificOutput;
  assert.ok(hso, 'hookSpecificOutput present');
  assert.strictEqual(hso.hookEventName, 'SessionStart');
  assert.strictEqual(typeof hso.additionalContext, 'string');
  assert.ok(
    hso.additionalContext.includes('.project-notes'),
    'context mentions the notebook location'
  );
});

test('empty notebook: message says it is empty', () => {
  const dir = makeTempProject({ git: false });
  const res = runHook('session-start.js', sessionStartEvent(dir));
  assert.ok(res.json.hookSpecificOutput.additionalContext.includes('empty'));
});

test('non-empty notebook: injects the generated index, no emptiness claim', () => {
  const dir = makeTempProject({ git: false });
  fs.mkdirSync(path.join(dir, '.project-notes'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.project-notes', 'auth-flow.md'),
    '---\nsummary: How auth works\ncovers: [src/auth/]\n---\nBody.\n'
  );

  const res = runHook('session-start.js', sessionStartEvent(dir));
  const ctx = res.json.hookSpecificOutput.additionalContext;
  assert.ok(!ctx.includes('empty'), 'no false emptiness claim, got: ' + ctx);
  assert.ok(ctx.includes('- auth-flow — How auth works [covers: src/auth/]'), ctx);
});

test('note whose summary contains "No notes yet." still gets the index injected', () => {
  const dir = makeTempProject({ git: false });
  fs.mkdirSync(path.join(dir, '.project-notes'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.project-notes', 'tricky.md'),
    '---\nsummary: No notes yet. Ha, fooled you\n---\n'
  );

  const res = runHook('session-start.js', sessionStartEvent(dir));
  const ctx = res.json.hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes('- tricky —'), 'index injected despite tricky summary: ' + ctx);
});

test('session start (re)generates INDEX.md so it self-heals', () => {
  const dir = makeTempProject({ git: false });
  fs.mkdirSync(path.join(dir, '.project-notes'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.project-notes', 'topic.md'), '---\nsummary: T\n---\n');
  fs.writeFileSync(path.join(dir, '.project-notes', 'INDEX.md'), 'stale garbage\n');

  runHook('session-start.js', sessionStartEvent(dir));

  const index = fs.readFileSync(path.join(dir, '.project-notes', 'INDEX.md'), 'utf8');
  assert.ok(!index.includes('garbage'), 'stale index overwritten: ' + index);
  assert.ok(index.includes('- topic — T'), index);
});

test('session start prunes stale state files but keeps recent ones', () => {
  const dir = makeTempProject({ git: false });
  const stateDir = path.join(dir, '.project-notes', '.state');
  fs.mkdirSync(stateDir, { recursive: true });
  const oldFile = path.join(stateDir, 'ancient.json');
  const newFile = path.join(stateDir, 'recent.json');
  fs.writeFileSync(oldFile, '{}');
  fs.writeFileSync(newFile, '{}');
  const tenDaysAgo = (Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(oldFile, tenDaysAgo, tenDaysAgo);

  runHook('session-start.js', sessionStartEvent(dir));

  assert.ok(!fs.existsSync(oldFile), 'stale state pruned');
  assert.ok(fs.existsSync(newFile), 'recent state kept');
});

test('idempotent on all resources when run repeatedly in non-git dir', () => {
  const dir = makeTempProject({ git: false });
  runHook('session-start.js', sessionStartEvent(dir));
  const res = runHook('session-start.js', sessionStartEvent(dir));
  assert.strictEqual(res.status, 0);
  assert.ok(fs.existsSync(path.join(dir, '.project-notes')));
});
