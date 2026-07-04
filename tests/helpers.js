'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..', 'hooks');

// Creates a temp project directory; opts.git = true runs `git init` in it.
function makeTempProject(opts) {
  opts = opts || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-notes-test-'));
  if (opts.git) {
    const res = spawnSync('git', ['init', '--quiet'], { cwd: dir, encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error('git init failed: ' + res.stderr);
    }
  }
  return dir;
}

// Runs a hook script as a real process: JSON event on stdin, JSON/exit code out.
// This is the primary test seam — no mocks, real fs effects.
function runHook(scriptName, event) {
  const script = path.join(HOOKS_DIR, scriptName);
  const res = spawnSync(process.execPath, [script], {
    input: JSON.stringify(event),
    cwd: event.cwd,
    encoding: 'utf8',
  });
  let json = null;
  if (res.stdout && res.stdout.trim()) {
    try {
      json = JSON.parse(res.stdout);
    } catch (e) {
      json = null;
    }
  }
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, json: json };
}

function sessionStartEvent(cwd) {
  return {
    session_id: 'test-session',
    transcript_path: path.join(cwd, 'fake-transcript.jsonl'),
    cwd: cwd,
    hook_event_name: 'SessionStart',
    source: 'startup',
  };
}

function postToolUseEvent(cwd, toolName, toolInput) {
  return {
    session_id: 'test-session',
    transcript_path: path.join(cwd, 'fake-transcript.jsonl'),
    cwd: cwd,
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input: toolInput,
  };
}

function readExclude(projectDir) {
  const p = path.join(projectDir, '.git', 'info', 'exclude');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function countExcludeEntries(projectDir, entry) {
  return readExclude(projectDir)
    .split('\n')
    .filter((l) => l.trim() === entry).length;
}

function git(dir, args) {
  const res = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' failed: ' + res.stderr);
  }
  return res.stdout;
}

module.exports = {
  makeTempProject,
  runHook,
  sessionStartEvent,
  postToolUseEvent,
  readExclude,
  countExcludeEntries,
  git,
};
