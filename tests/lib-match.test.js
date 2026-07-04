'use strict';

const { test } = require('node:test');
const assert = require('assert');

const { coversMatch, classifyEdits } = require('../lib/match');

// --- coversMatch ---

test('trailing slash means directory prefix', () => {
  assert.ok(coversMatch('src/auth/', 'src/auth/login.ts'));
  assert.ok(coversMatch('src/auth/', 'src/auth/deep/nested.ts'));
  assert.ok(!coversMatch('src/auth/', 'src/authx/other.ts'));
  assert.ok(!coversMatch('src/auth/', 'lib/src/auth/other.ts'));
});

test('exact file path matches only itself', () => {
  assert.ok(coversMatch('Makefile', 'Makefile'));
  assert.ok(!coversMatch('Makefile', 'sub/Makefile'));
  assert.ok(!coversMatch('Makefile', 'Makefile.bak'));
});

test('single star stays within one path segment', () => {
  assert.ok(coversMatch('*.md', 'README.md'));
  assert.ok(!coversMatch('*.md', 'docs/guide.md'));
  assert.ok(coversMatch('src/*.js', 'src/app.js'));
  assert.ok(!coversMatch('src/*.js', 'src/deep/app.js'));
});

test('double star crosses segments', () => {
  assert.ok(coversMatch('src/**', 'src/app.js'));
  assert.ok(coversMatch('src/**', 'src/very/deep/file.ts'));
  assert.ok(!coversMatch('src/**', 'lib/file.ts'));
  assert.ok(coversMatch('**/*.test.js', 'tests/deep/x.test.js'));
});

test('windows separators in the edited path are normalized', () => {
  assert.ok(coversMatch('src/auth/', 'src\\auth\\login.ts'));
  assert.ok(coversMatch('src/**', 'src\\deep\\file.ts'));
});

test('regex metacharacters in patterns are literal', () => {
  assert.ok(coversMatch('src/file.js', 'src/file.js'));
  assert.ok(!coversMatch('src/file.js', 'src/fileXjs'));
  assert.ok(coversMatch('file?.js', 'file?.js'));
  assert.ok(!coversMatch('file?.js', 'file.js'), '? is literal, not a quantifier');
});

test('literal spaces in patterns stay literal', () => {
  assert.ok(coversMatch('my dir/*.js', 'my dir/app.js'));
  assert.ok(!coversMatch('my dir/*.js', 'myXdir/app.js'));
  assert.ok(!coversMatch('my dir/*.js', 'my/anything/dir/app.js'));
});

test('leading **/ also matches the root level', () => {
  assert.ok(coversMatch('**/*.test.js', 'x.test.js'));
  assert.ok(coversMatch('**/*.test.js', 'a/b/x.test.js'));
});

// --- classifyEdits ---

const TOPICS = [
  { name: 'auth-flow', covers: ['src/auth/', 'middleware/session.ts'] },
  { name: 'build', covers: ['Makefile', 'scripts/**'] },
  { name: 'ideas', covers: [] },
];

test('classifies stale topics and uncovered paths', () => {
  const result = classifyEdits(TOPICS, ['src/auth/login.ts', 'docs/readme.md'], []);
  assert.deepStrictEqual(result.stale.map((t) => t.name), ['auth-flow']);
  assert.deepStrictEqual(result.stale[0].matches, ['src/auth/login.ts']);
  assert.deepStrictEqual(result.uncovered, ['docs/readme.md']);
});

test('a topic whose note was updated this turn is not stale', () => {
  const result = classifyEdits(TOPICS, ['src/auth/login.ts'], ['auth-flow']);
  assert.deepStrictEqual(result.stale, []);
  assert.deepStrictEqual(result.uncovered, []);
});

test('topics without covers are never stale', () => {
  const result = classifyEdits(TOPICS, ['whatever.txt'], []);
  assert.deepStrictEqual(result.stale, []);
  assert.deepStrictEqual(result.uncovered, ['whatever.txt']);
});

test('multiple stale topics reported, each with its matches', () => {
  const result = classifyEdits(TOPICS, ['src/auth/a.ts', 'scripts/build.js'], []);
  assert.deepStrictEqual(result.stale.map((t) => t.name), ['auth-flow', 'build']);
});

test('two topics covering the same file: only the un-updated one is stale', () => {
  const overlapping = [
    { name: 'auth-flow', covers: ['src/auth/'] },
    { name: 'security', covers: ['src/auth/', 'src/crypto/'] },
  ];
  const result = classifyEdits(overlapping, ['src/auth/login.ts'], ['auth-flow']);
  assert.deepStrictEqual(result.stale.map((t) => t.name), ['security']);
  assert.deepStrictEqual(result.uncovered, []);
});
