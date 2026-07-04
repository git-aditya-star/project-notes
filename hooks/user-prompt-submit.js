'use strict';

// UserPromptSubmit hook: a new user prompt starts a new turn — reset the
// per-turn session state so earlier edits don't leak into this turn's
// staleness check. Contract: JSON event on stdin -> no output, exit 0.

const { projectDirOf, run } = require('../lib/hook-io');
const state = require('../lib/session-state');

run('user-prompt-submit', (event) => {
  state.reset(projectDirOf(event), event.session_id);
});
