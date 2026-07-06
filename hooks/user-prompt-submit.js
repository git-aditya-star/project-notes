'use strict';

// UserPromptSubmit hook: a new user prompt starts a new turn.
//   1. Reset the per-turn session state so earlier edits don't leak into this
//      turn's staleness check (stop.js relies on this).
//   2. Re-inject the current notebook index so every turn — not just session
//      start — sees an index reflecting notes written mid-session.
// Contract: JSON event on stdin -> JSON on stdout (or none), exit 0.

const path = require('path');

const { generateIndex, topicFiles, NOTES_DIRNAME } = require('../lib/notes');
const { projectDirOf, run } = require('../lib/hook-io');
const state = require('../lib/session-state');

run('user-prompt-submit', (event) => {
  const projectDir = projectDirOf(event);
  state.reset(projectDir, event.session_id);

  // Regenerate rather than read INDEX.md so the injection self-heals and picks
  // up notes written this session. Skip an empty notebook — nothing to inject.
  const notesDirAbs = path.join(projectDir, NOTES_DIRNAME);
  if (topicFiles(notesDirAbs).length === 0) return;

  process.stdout.write(
    JSON.stringify({
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext:
          'Refreshed .project-notes index below — regenerated at the start of this turn, ' +
          'so it reflects any notes written or changed earlier this session. Each line is ' +
          'one topic note (its summary and covered code paths); Read the note file itself ' +
          'for the full distilled content before relying on it:\n\n' +
          generateIndex(notesDirAbs),
      },
    })
  );
});
