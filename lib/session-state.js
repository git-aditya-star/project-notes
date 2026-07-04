'use strict';

// Per-turn session state bridging PostToolUse -> Stop. One JSON file per
// session under the dot-prefixed runtime dir (invisible to index generation),
// reset by UserPromptSubmit at each turn boundary.

const fs = require('fs');
const path = require('path');

const { NOTES_DIRNAME } = require('./notes');

const STATE_DIRNAME = '.state';

function emptyState() {
  return { codeEdits: [], noteWrites: [], explorationCount: 0 };
}

function stateDir(projectDir) {
  return path.join(projectDir, NOTES_DIRNAME, STATE_DIRNAME);
}

function statePath(projectDir, sessionId) {
  const safe = String(sessionId || 'default').replace(/[^A-Za-z0-9_-]/g, '_');
  return path.join(stateDir(projectDir), safe + '.json');
}

function load(projectDir, sessionId) {
  const s = emptyState();
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(projectDir, sessionId), 'utf8'));
    if (Array.isArray(parsed.codeEdits)) s.codeEdits = parsed.codeEdits.slice();
    if (Array.isArray(parsed.noteWrites)) s.noteWrites = parsed.noteWrites.slice();
    if (typeof parsed.explorationCount === 'number') s.explorationCount = parsed.explorationCount;
  } catch (e) {
    // missing or torn file — a fresh empty turn
  }
  return s;
}

// load->mutate->save is read-modify-write; safe because Claude runs tools
// sequentially, so no two hook processes touch one session's state at once.
function save(projectDir, sessionId, state) {
  const file = statePath(projectDir, sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, file); // atomic: a concurrent reader never sees a partial file
}

function reset(projectDir, sessionId) {
  try {
    fs.unlinkSync(statePath(projectDir, sessionId));
  } catch (e) {
    // nothing to reset
  }
}

// Removes state files whose last write is older than maxAgeMs so the
// runtime dir doesn't grow one file per session forever.
function pruneOld(projectDir, maxAgeMs, now) {
  let entries;
  try {
    entries = fs.readdirSync(stateDir(projectDir));
  } catch (e) {
    return;
  }
  for (const name of entries) {
    const f = path.join(stateDir(projectDir), name);
    try {
      if (now - fs.statSync(f).mtimeMs > maxAgeMs) fs.unlinkSync(f);
    } catch (e) {
      // raced with another prune / unreadable — skip
    }
  }
}

module.exports = { load, save, reset, pruneOld };
