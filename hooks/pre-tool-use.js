'use strict';

// PreToolUse hook: before a note is overwritten, snapshot its current content
// into the bounded backup ring. Runs pre-write so it captures the version
// about to be replaced; a brand-new note (no file yet) is skipped naturally.
// Contract: JSON event on stdin -> no output, exit 0.

const fs = require('fs');
const path = require('path');

const { noteNameOf, INDEX_FILE, NOTES_DIRNAME, WRITE_TOOLS } = require('../lib/notes');
const { projectDirOf, run } = require('../lib/hook-io');
const { backupNote } = require('../lib/backup');

run('pre-tool-use', (event) => {
  if (WRITE_TOOLS.indexOf(event.tool_name) === -1) return;
  const filePath =
    event.tool_input && (event.tool_input.file_path || event.tool_input.notebook_path);
  if (!filePath) return;

  const notesDirAbs = path.join(projectDirOf(event), NOTES_DIRNAME);
  const name = noteNameOf(notesDirAbs, filePath);
  if (!name || name === INDEX_FILE) return;

  let current;
  try {
    current = fs.readFileSync(path.join(notesDirAbs, name), 'utf8');
  } catch (e) {
    return; // brand-new note — nothing to preserve
  }
  backupNote(notesDirAbs, name, current);
});
