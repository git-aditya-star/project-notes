'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { makeTempProject } = require('./helpers');
const { parseFrontmatter, generateIndex, stampUpdated } = require('../lib/notes');

function notesDir(dir) {
  const p = path.join(dir, '.project-notes');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

// --- parseFrontmatter ---

test('parses summary and inline covers list', () => {
  const fm = parseFrontmatter(
    '---\nsummary: How auth works\ncovers: [src/auth/, middleware/session.ts]\n---\n\nBody.\n'
  );
  assert.strictEqual(fm.summary, 'How auth works');
  assert.deepStrictEqual(fm.covers, ['src/auth/', 'middleware/session.ts']);
});

test('parses block-style covers list', () => {
  const fm = parseFrontmatter(
    '---\nsummary: Build system\ncovers:\n  - Makefile\n  - scripts/build/\n---\nBody.\n'
  );
  assert.strictEqual(fm.summary, 'Build system');
  assert.deepStrictEqual(fm.covers, ['Makefile', 'scripts/build/']);
});

test('strips surrounding quotes from summary', () => {
  const fm = parseFrontmatter('---\nsummary: "Quoted: summary"\ncovers: []\n---\n');
  assert.strictEqual(fm.summary, 'Quoted: summary');
});

test('no frontmatter -> null summary, empty covers', () => {
  const fm = parseFrontmatter('# Just a heading\n\nText.\n');
  assert.strictEqual(fm.summary, null);
  assert.deepStrictEqual(fm.covers, []);
});

test('unclosed frontmatter -> treated as malformed, does not throw', () => {
  const fm = parseFrontmatter('---\nsummary: dangling\nno closing fence\n');
  assert.strictEqual(fm.summary, null);
  assert.deepStrictEqual(fm.covers, []);
});

test('missing covers -> empty list; missing summary -> null', () => {
  const fm = parseFrontmatter('---\nsummary: Only summary\n---\n');
  assert.deepStrictEqual(fm.covers, []);
  const fm2 = parseFrontmatter('---\ncovers: [a]\n---\n');
  assert.strictEqual(fm2.summary, null);
  assert.deepStrictEqual(fm2.covers, ['a']);
});

test('UTF-8 BOM before the frontmatter fence is tolerated', () => {
  const fm = parseFrontmatter('\uFEFF---\nsummary: S\ncovers: [src/]\n---\nBody.\n');
  assert.strictEqual(fm.summary, 'S');
  assert.deepStrictEqual(fm.covers, ['src/']);
});

test('parses updated field', () => {
  const fm = parseFrontmatter('---\nsummary: S\nupdated: 2026-07-04T10:00:00.000Z\n---\n');
  assert.strictEqual(fm.updated, '2026-07-04T10:00:00.000Z');
  const fm2 = parseFrontmatter('---\nsummary: S\n---\n');
  assert.strictEqual(fm2.updated, null);
});

// --- stampUpdated ---

test('stampUpdated inserts updated into existing frontmatter', () => {
  const out = stampUpdated('---\nsummary: S\ncovers: [a]\n---\nBody.\n', '2026-07-04T10:00:00.000Z');
  const fm = parseFrontmatter(out);
  assert.strictEqual(fm.updated, '2026-07-04T10:00:00.000Z');
  assert.strictEqual(fm.summary, 'S');
  assert.ok(out.includes('Body.'), out);
});

test('stampUpdated replaces an existing updated value', () => {
  const src = '---\nsummary: S\nupdated: 2020-01-01T00:00:00.000Z\n---\nBody.\n';
  const out = stampUpdated(src, '2026-07-04T10:00:00.000Z');
  assert.strictEqual(parseFrontmatter(out).updated, '2026-07-04T10:00:00.000Z');
  assert.ok(!out.includes('2020-01-01'), out);
});

test('stampUpdated prepends minimal frontmatter when none exists', () => {
  const out = stampUpdated('Just body text.\n', '2026-07-04T10:00:00.000Z');
  assert.strictEqual(parseFrontmatter(out).updated, '2026-07-04T10:00:00.000Z');
  assert.ok(out.includes('Just body text.'), out);
});

test('stampUpdated preserves CRLF line endings', () => {
  const out = stampUpdated('---\r\nsummary: S\r\n---\r\nBody.\r\n', '2026-07-04T10:00:00.000Z');
  assert.ok(out.includes('updated: 2026-07-04T10:00:00.000Z\r\n'), JSON.stringify(out));
  assert.ok(!/[^\r]\n/.test(out), 'no lone LF introduced: ' + JSON.stringify(out));
  assert.strictEqual(parseFrontmatter(out).summary, 'S');
});

test('stampUpdated prepend branch matches a CRLF body', () => {
  const out = stampUpdated('Body only.\r\n', '2026-07-04T10:00:00.000Z');
  assert.ok(out.startsWith('---\r\n'), JSON.stringify(out.slice(0, 20)));
  assert.strictEqual(parseFrontmatter(out).updated, '2026-07-04T10:00:00.000Z');
});

// --- generateIndex ---

test('generates one line per topic: name, summary, covers', () => {
  const dir = notesDir(makeTempProject());
  fs.writeFileSync(
    path.join(dir, 'auth-flow.md'),
    '---\nsummary: How auth works\ncovers: [src/auth/]\n---\nBody.\n'
  );
  fs.writeFileSync(
    path.join(dir, 'build.md'),
    '---\nsummary: Build and test commands\ncovers: [Makefile, scripts/]\n---\nBody.\n'
  );

  const index = generateIndex(dir);
  assert.ok(index.includes('- auth-flow — How auth works [covers: src/auth/]'), index);
  assert.ok(index.includes('- build — Build and test commands [covers: Makefile, scripts/]'), index);
});

test('topics sorted by name for deterministic output', () => {
  const dir = notesDir(makeTempProject());
  fs.writeFileSync(path.join(dir, 'zebra.md'), '---\nsummary: Z\n---\n');
  fs.writeFileSync(path.join(dir, 'alpha.md'), '---\nsummary: A\n---\n');

  const index = generateIndex(dir);
  assert.ok(index.indexOf('alpha') < index.indexOf('zebra'), index);
});

test('malformed note included with explicit no-summary marker', () => {
  const dir = notesDir(makeTempProject());
  fs.writeFileSync(path.join(dir, 'broken.md'), 'no frontmatter at all\n');

  const index = generateIndex(dir);
  assert.ok(index.includes('- broken — (no summary)'), index);
});

test('note without covers omits the covers bracket', () => {
  const dir = notesDir(makeTempProject());
  fs.writeFileSync(path.join(dir, 'ideas.md'), '---\nsummary: Loose ideas\n---\n');

  const index = generateIndex(dir);
  assert.ok(index.includes('- ideas — Loose ideas'), index);
  assert.ok(!index.includes('ideas — Loose ideas [covers:'), index);
});

test('ignores dot-prefixed entries, INDEX.md itself, and non-md files', () => {
  const dir = notesDir(makeTempProject());
  fs.writeFileSync(path.join(dir, 'real.md'), '---\nsummary: Real\n---\n');
  fs.writeFileSync(path.join(dir, 'INDEX.md'), 'stale index content\n');
  fs.writeFileSync(path.join(dir, '.hidden.md'), '---\nsummary: hidden\n---\n');
  fs.mkdirSync(path.join(dir, '.backups'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not markdown\n');

  const index = generateIndex(dir);
  assert.ok(index.includes('- real — Real'), index);
  assert.ok(!index.includes('hidden'), index);
  assert.ok(!index.includes('stale'), index);
  assert.ok(!index.includes('INDEX'), index);
  assert.ok(!index.includes('notes.txt'), index);
});

test('index line shows updated timestamp when present', () => {
  const dir = notesDir(makeTempProject());
  fs.writeFileSync(
    path.join(dir, 'auth.md'),
    '---\nsummary: S\ncovers: [src/]\nupdated: 2026-07-04T10:00:00.000Z\n---\n'
  );
  const index = generateIndex(dir);
  assert.ok(index.includes('(updated: 2026-07-04T10:00:00.000Z)'), index);
});

test('unreadable entry (directory named *.md) does not abort generation', () => {
  const dir = notesDir(makeTempProject());
  fs.writeFileSync(path.join(dir, 'good.md'), '---\nsummary: Good\n---\n');
  fs.mkdirSync(path.join(dir, 'imposter.md'));

  const index = generateIndex(dir);
  assert.ok(index.includes('- good — Good'), index);
  assert.ok(index.includes('- imposter — (no summary)'), index);
});

test('empty notes dir -> index indicates no notes yet', () => {
  const dir = notesDir(makeTempProject());
  const index = generateIndex(dir);
  assert.ok(index.toLowerCase().includes('no notes yet'), index);
});
