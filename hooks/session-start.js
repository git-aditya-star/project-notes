'use strict';

// SessionStart hook: bootstraps the project notebook.
// Creates .project-notes/, keeps it out of git via <gitdir>/info/exclude (never
// .gitignore), and injects the notebook protocol into session context.
// Contract: JSON event on stdin -> JSON on stdout, exit 0.

const fs = require('fs');
const path = require('path');

const { generateIndex, topicFiles, INDEX_FILE, NOTES_DIRNAME } = require('../lib/notes');
const { projectDirOf, run } = require('../lib/hook-io');
const state = require('../lib/session-state');

const NOTES_DIR = NOTES_DIRNAME;
const EXCLUDE_ENTRY = NOTES_DIRNAME + '/';
const STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Resolves the directory holding info/exclude for this project, following
// a .git *file* (linked worktree / submodule) to its real git dir, and a
// worktree's `commondir` up to the shared repository dir — exclude patterns
// only apply repository-wide from there.
function resolveGitDir(projectDir) {
  const gitPath = path.join(projectDir, '.git');
  let stat;
  try {
    stat = fs.statSync(gitPath);
  } catch (e) {
    return null; // not a git repo — nothing to hide from
  }
  if (stat.isDirectory()) return gitPath;

  let gitDir;
  try {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(gitPath, 'utf8'));
    if (!m) return null;
    gitDir = path.resolve(projectDir, m[1]);
    const commonDirFile = path.join(gitDir, 'commondir');
    if (fs.existsSync(commonDirFile)) {
      gitDir = path.resolve(gitDir, fs.readFileSync(commonDirFile, 'utf8').trim());
    }
  } catch (e) {
    return null;
  }
  return gitDir;
}

function ensureExcludeEntry(projectDir) {
  const gitDir = resolveGitDir(projectDir);
  if (!gitDir) return;

  const infoDir = path.join(gitDir, 'info');
  fs.mkdirSync(infoDir, { recursive: true });

  const excludePath = path.join(infoDir, 'exclude');
  let content = '';
  try {
    content = fs.readFileSync(excludePath, 'utf8');
  } catch (e) {
    // no exclude file yet
  }
  const hasEntry = content.split(/\r?\n/).some((line) => line.trim() === EXCLUDE_ENTRY);
  if (hasEntry) return;

  const sep = content === '' || content.endsWith('\n') ? '' : '\n';
  fs.appendFileSync(excludePath, sep + EXCLUDE_ENTRY + '\n');
}

function protocolMessage(index, hasNotes) {
  const intro =
    'This project has a persistent notebook at .project-notes/ (local-only, invisible to git). ' +
    'It is YOUR notebook: distilled topic notes written by you, for future sessions of you.';
  const contract =
    'Each note is one topic (a subsystem/concept) as a markdown file with YAML frontmatter — ' +
    'summary: <one line> and covers: [code paths] — followed by distilled understanding ' +
    '(how it works, gotchas, file:line pointers), never transcripts or pasted code. ' +
    'Do not edit INDEX.md (auto-generated) or the updated: field (auto-stamped). ' +
    'When you change code a note covers, refresh that note before finishing; ' +
    'capture what you learn even without code changes. See the project-notes skill for the full protocol.';
  if (!hasNotes) {
    return intro + ' It is currently empty — start it as you learn. ' + contract;
  }
  return intro + ' ' + contract + '\n\nRead the notes relevant to your task. Current index:\n\n' + index;
}

function main(event) {
  const projectDir = projectDirOf(event);
  const notesDirAbs = path.join(projectDir, NOTES_DIR);

  fs.mkdirSync(notesDirAbs, { recursive: true });
  ensureExcludeEntry(projectDir);
  state.pruneOld(projectDir, STATE_MAX_AGE_MS, Date.now());

  // Regenerate on every session start so the index self-heals even if a
  // note was created outside the tool path.
  const index = generateIndex(notesDirAbs);
  fs.writeFileSync(path.join(notesDirAbs, INDEX_FILE), index);
  const hasNotes = topicFiles(notesDirAbs).length > 0;

  process.stdout.write(
    JSON.stringify({
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: protocolMessage(index, hasNotes),
      },
    })
  );
}

run('session-start', main);
