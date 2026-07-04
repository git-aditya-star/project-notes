'use strict';

// PostToolUse hook: keeps the notebook index true.
// When Claude writes a note file, stamps `updated:` into its frontmatter and
// regenerates INDEX.md from all notes' frontmatter. Silent on everything else.
// Contract: JSON event on stdin -> no output, exit 0.

const fs = require('fs');
const path = require('path');

const {
  stampUpdated,
  generateIndex,
  noteNameOf,
  INDEX_FILE,
  NOTES_DIRNAME,
  WRITE_TOOLS,
} = require('../lib/notes');
const { projectDirOf, run } = require('../lib/hook-io');
const state = require('../lib/session-state');

const EXPLORE_TOOLS = ['Read', 'Grep', 'Glob'];

function main(event) {
  if (EXPLORE_TOOLS.indexOf(event.tool_name) !== -1) {
    recordExploration(projectDirOf(event), event.session_id);
    return;
  }
  if (WRITE_TOOLS.indexOf(event.tool_name) === -1) return;
  // NotebookEdit uses notebook_path; the rest use file_path.
  const filePath =
    event.tool_input && (event.tool_input.file_path || event.tool_input.notebook_path);
  if (!filePath) return;

  const projectDir = projectDirOf(event);
  const notesDirAbs = path.join(projectDir, NOTES_DIRNAME);
  const name = noteNameOf(notesDirAbs, filePath);

  if (!name) {
    recordCodeEdit(projectDir, event.session_id, filePath);
    return;
  }

  if (name !== INDEX_FILE) {
    const notePath = path.join(notesDirAbs, name);
    try {
      const stamped = stampUpdated(fs.readFileSync(notePath, 'utf8'), new Date().toISOString());
      fs.writeFileSync(notePath, stamped);
    } catch (e) {
      // note vanished or unreadable — index regeneration below still runs
    }
    recordNoteWrite(projectDir, event.session_id, name);
  }

  fs.writeFileSync(path.join(notesDirAbs, INDEX_FILE), generateIndex(notesDirAbs));
}

function recordCodeEdit(projectDir, sessionId, filePath) {
  const rel = path.relative(projectDir, path.resolve(filePath));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return; // outside project
  const canonical = rel.replace(/\\/g, '/');
  const turn = state.load(projectDir, sessionId);
  if (turn.codeEdits.indexOf(canonical) === -1) {
    turn.codeEdits.push(canonical);
    state.save(projectDir, sessionId, turn);
  }
}

function recordExploration(projectDir, sessionId) {
  const turn = state.load(projectDir, sessionId);
  turn.explorationCount += 1;
  state.save(projectDir, sessionId, turn);
}

function recordNoteWrite(projectDir, sessionId, noteFile) {
  const topic = noteFile.endsWith('.md') ? noteFile.slice(0, -3) : noteFile;
  const turn = state.load(projectDir, sessionId);
  if (turn.noteWrites.indexOf(topic) === -1) {
    turn.noteWrites.push(topic);
    state.save(projectDir, sessionId, turn);
  }
}

run('post-tool-use', main);
