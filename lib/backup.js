'use strict';

// Note backups: because notes are excluded from git, an in-place rewrite is
// otherwise unrecoverable. We keep a bounded ring of prior versions per topic
// under the dot-prefixed .backups/ dir (invisible to index generation).

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX = 5;
const BACKUPS_DIRNAME = '.backups';
const WIDTH = 6;

function backupFiles(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^\d+\.bak$/.test(f))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10)); // chronological by counter
  } catch (e) {
    return [];
  }
}

// Copies `content` into the topic's backup ring, pruning oldest past `max`.
function backupNote(notesDirAbs, noteName, content, max) {
  max = max || DEFAULT_MAX;
  const dir = path.join(notesDirAbs, BACKUPS_DIRNAME, noteName);
  fs.mkdirSync(dir, { recursive: true });

  const existing = backupFiles(dir);
  const last = existing.length ? parseInt(existing[existing.length - 1], 10) : 0;
  const name = String(last + 1).padStart(WIDTH, '0') + '.bak';
  fs.writeFileSync(path.join(dir, name), content);

  const after = backupFiles(dir);
  for (let i = 0; i < after.length - max; i++) {
    fs.unlinkSync(path.join(dir, after[i]));
  }
}

module.exports = { backupNote };
