'use strict';

// Stop hook: the freshness guarantee. If this turn edited code covered by
// topic notes that weren't updated, block the stop once — naming exactly the
// stale topics. If instead the turn was heavy exploration with nothing written
// down, issue a single declinable nudge. Everything else passes silently.
// Contract: JSON event on stdin -> JSON verdict (or nothing) on stdout, exit 0.

const path = require('path');

const { readTopics, NOTES_DIRNAME } = require('../lib/notes');
const { classifyEdits } = require('../lib/match');
const { projectDirOf, run } = require('../lib/hook-io');
const state = require('../lib/session-state');

const EXPLORATION_THRESHOLD = 5;

function blockMessage(stale, uncovered) {
  const lines = [
    'project-notes: you edited code this turn without updating the covering topic notes.',
  ];
  for (const t of stale) {
    lines.push(
      '- stale: ' + t.name + ' (you edited ' + t.matches.join(', ') + ') — update .project-notes/' + t.name + '.md'
    );
  }
  if (uncovered.length > 0) {
    lines.push(
      '- edited but covered by no topic: ' +
        uncovered.join(', ') +
        ' — consider whether a new topic or a covers: addition is warranted (your judgment).'
    );
  }
  lines.push('Update the stale notes now — distilled understanding, not transcripts or code dumps.');
  return lines.join('\n');
}

function nudgeMessage() {
  return (
    'project-notes: you explored the project a lot this turn but wrote nothing down. ' +
    'If you learned something a future session would want (how a subsystem works, a ' +
    'gotcha, where things live), capture it as a topic note in .project-notes/ now. ' +
    'If there is nothing worth noting, just say so and finish — this is your judgment.'
  );
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: reason }));
}

run('stop', (event) => {
  if (event.stop_hook_active) return; // already blocked once this turn — never loop

  const projectDir = projectDirOf(event);
  const turn = state.load(projectDir, event.session_id);

  if (turn.codeEdits.length > 0) {
    // Hard block owns any code-edit turn.
    const topics = readTopics(path.join(projectDir, NOTES_DIRNAME));
    const result = classifyEdits(topics, turn.codeEdits, turn.noteWrites);
    if (result.stale.length > 0) block(blockMessage(result.stale, result.uncovered));
    return;
  }

  // No code changed: soft, declinable nudge for heavy no-capture exploration.
  if (turn.explorationCount >= EXPLORATION_THRESHOLD && turn.noteWrites.length === 0) {
    block(nudgeMessage());
  }
});
