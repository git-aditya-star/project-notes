'use strict';

// Shared I/O for hook scripts: stdin event parsing, the per-project opt-out
// gate, and the never-break-the-session error contract (errors go to stderr
// with exit 1, never a throw).

const fs = require('fs');
const path = require('path');

const OPT_OUT_MARKER = '.project-notes-off';

function readEvent() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function projectDirOf(event) {
  return event.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function isOptedOut(projectDir) {
  return fs.existsSync(path.join(projectDir, OPT_OUT_MARKER));
}

function run(hookName, main) {
  try {
    const event = readEvent();
    if (isOptedOut(projectDirOf(event))) return; // disabled here — every hook no-ops
    main(event);
  } catch (e) {
    process.stderr.write('project-notes ' + hookName + ' failed: ' + (e && e.message) + '\n');
    process.exit(1); // non-blocking: never breaks the session
  }
}

module.exports = { readEvent, projectDirOf, isOptedOut, run };
