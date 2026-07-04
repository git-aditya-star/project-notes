'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { makeTempProject } = require('./helpers');
const state = require('../lib/session-state');

test('load on a fresh project returns independent objects', () => {
  const dir = makeTempProject();
  const a = state.load(dir, 's1');
  const b = state.load(dir, 's1');
  a.codeEdits.push('leak.js');
  assert.deepStrictEqual(b.codeEdits, [], 'no shared array references');
  assert.deepStrictEqual(state.load(dir, 's1').codeEdits, [], 'module state unpolluted');
});

test('save/load roundtrip and reset', () => {
  const dir = makeTempProject();
  state.save(dir, 's1', { codeEdits: ['a.js'], noteWrites: ['t'], explorationCount: 2 });
  assert.deepStrictEqual(state.load(dir, 's1'), {
    codeEdits: ['a.js'],
    noteWrites: ['t'],
    explorationCount: 2,
  });
  state.reset(dir, 's1');
  assert.deepStrictEqual(state.load(dir, 's1').codeEdits, []);
});

test('save leaves no lingering temp files', () => {
  const dir = makeTempProject();
  state.save(dir, 's1', { codeEdits: [], noteWrites: [], explorationCount: 0 });
  const stateDir = path.join(dir, '.project-notes', '.state');
  const leftovers = fs.readdirSync(stateDir).filter((f) => !f.endsWith('.json'));
  assert.deepStrictEqual(leftovers, [], 'atomic write cleans up its temp file');
});

test('torn state file loads as empty instead of throwing', () => {
  const dir = makeTempProject();
  state.save(dir, 's1', { codeEdits: ['a.js'], noteWrites: [], explorationCount: 0 });
  const file = path.join(dir, '.project-notes', '.state', 's1.json');
  fs.writeFileSync(file, '{"codeEdits":["a.js"'); // simulate torn write
  assert.deepStrictEqual(state.load(dir, 's1').codeEdits, []);
});
