'use strict';

// Pure functions for the note format: frontmatter parsing, timestamp
// stamping, and INDEX.md generation. No I/O beyond generateIndex reading
// the notes directory. Node 16-compatible, zero dependencies.

const fs = require('fs');
const path = require('path');

const INDEX_FILE = 'INDEX.md';
const NOTES_DIRNAME = '.project-notes';
const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

// Returns the basename if filePath is a direct, non-dot-prefixed entry of the
// notes dir (i.e. a topic note or INDEX.md), else null. Nested paths (runtime
// state, backups) and outside paths return null.
function noteNameOf(notesDirAbs, filePath) {
  const rel = path.relative(notesDirAbs, path.resolve(filePath));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (rel.includes(path.sep)) return null;
  if (rel.startsWith('.')) return null;
  return rel;
}

// Splits a note into { fmLines, body } if it starts with a closed
// `---` frontmatter fence, else null.
function splitFrontmatter(content) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end === -1) return null;
  return { fmLines: lines.slice(1, end), bodyLines: lines.slice(end + 1) };
}

function stripQuotes(value) {
  const m = /^(["'])(.*)\1$/.exec(value);
  return m ? m[2] : value;
}

// Tolerant subset-of-YAML parser for the three note fields.
// Supports `covers: [a, b]` inline and `covers:` + `- item` block lists.
function parseFrontmatter(content) {
  const result = { summary: null, covers: [], updated: null };
  const split = splitFrontmatter(content);
  if (!split) return result;

  let inCovers = false;
  for (const line of split.fmLines) {
    const blockItem = /^\s+-\s+(.+)$/.exec(line);
    if (inCovers && blockItem) {
      result.covers.push(stripQuotes(blockItem[1].trim()));
      continue;
    }
    inCovers = false;

    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim();

    if (key === 'summary' && value) {
      result.summary = stripQuotes(value);
    } else if (key === 'updated' && value) {
      result.updated = stripQuotes(value);
    } else if (key === 'covers') {
      if (value.startsWith('[') && value.endsWith(']')) {
        result.covers = value
          .slice(1, -1)
          .split(',')
          .map((s) => stripQuotes(s.trim()))
          .filter((s) => s !== '');
      } else if (value === '') {
        inCovers = true; // block list follows
      }
    }
  }
  return result;
}

// Upserts `updated: <iso>` into the note's frontmatter; prepends a minimal
// frontmatter block if the note has none. Preserves the note's line endings;
// content otherwise untouched.
function stampUpdated(content, iso) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const split = splitFrontmatter(content);
  if (!split) {
    return '---' + eol + 'updated: ' + iso + eol + '---' + eol + content;
  }
  const fmLines = split.fmLines.filter((l) => !/^updated:/.test(l));
  fmLines.push('updated: ' + iso);
  return ['---'].concat(fmLines, '---', split.bodyLines).join(eol);
}

function topicFiles(notesDirAbs) {
  let entries;
  try {
    entries = fs.readdirSync(notesDirAbs);
  } catch (e) {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.md') && !name.startsWith('.') && name !== INDEX_FILE)
    .sort();
}

// Reads every topic note's frontmatter: [{name, summary, covers, updated}].
function readTopics(notesDirAbs) {
  return topicFiles(notesDirAbs).map((file) => {
    let fm;
    try {
      fm = parseFrontmatter(fs.readFileSync(path.join(notesDirAbs, file), 'utf8'));
    } catch (e) {
      fm = { summary: null, covers: [], updated: null }; // unreadable entry — still listed
    }
    return { name: file.slice(0, -3), summary: fm.summary, covers: fm.covers, updated: fm.updated };
  });
}

// Renders INDEX.md content from every topic note's frontmatter.
function generateIndex(notesDirAbs) {
  const header = '# Project Notes Index\n\n(generated — do not edit; one line per topic note)\n\n';
  const topics = readTopics(notesDirAbs);
  if (topics.length === 0) {
    return header + 'No notes yet.\n';
  }

  const lines = topics.map((t) => {
    let line = '- ' + t.name + ' — ' + (t.summary || '(no summary)');
    if (t.covers.length > 0) line += ' [covers: ' + t.covers.join(', ') + ']';
    if (t.updated) line += ' (updated: ' + t.updated + ')';
    return line;
  });
  return header + lines.join('\n') + '\n';
}

module.exports = {
  parseFrontmatter,
  stampUpdated,
  generateIndex,
  topicFiles,
  readTopics,
  noteNameOf,
  INDEX_FILE,
  NOTES_DIRNAME,
  WRITE_TOOLS,
};
