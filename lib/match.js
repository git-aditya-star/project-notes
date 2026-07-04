'use strict';

// Covers-glob matching: maps edited file paths onto topics' `covers:`
// patterns. Pure functions, forward-slash canonical form.

function normalize(p) {
  return p.replace(/\\/g, '/');
}

function globToRegExp(pattern) {
  // Char-by-char translation. '**/' matches zero or more path segments,
  // '**' crosses segments, '*' stays within one, everything else literal.
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*') {
      if (pattern[i + 1] === '*') {
        i++;
        if (pattern[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else {
      re += pattern[i].replace(/[.+^${}()|[\]\\?]/, '\\$&');
    }
  }
  return new RegExp('^' + re + '$');
}

// pattern forms: 'dir/' prefix, glob with * or **, or exact path.
function coversMatch(pattern, filePath) {
  const p = normalize(pattern);
  const f = normalize(filePath);
  if (p.endsWith('/')) return f.startsWith(p);
  if (p.includes('*')) return globToRegExp(p).test(f);
  return f === p;
}

// topics: [{name, covers}]; editedPaths: project-relative paths;
// updatedTopics: topic names whose notes were written this turn.
// Returns { stale: [{name, matches}], uncovered: [paths] }.
function classifyEdits(topics, editedPaths, updatedTopics) {
  const stale = [];
  const coveredPaths = new Set();

  for (const topic of topics) {
    const matches = editedPaths.filter((p) =>
      topic.covers.some((pattern) => coversMatch(pattern, p))
    );
    matches.forEach((p) => coveredPaths.add(p));
    if (matches.length > 0 && updatedTopics.indexOf(topic.name) === -1) {
      stale.push({ name: topic.name, matches: matches });
    }
  }

  const uncovered = editedPaths.filter((p) => !coveredPaths.has(p));
  return { stale: stale, uncovered: uncovered };
}

module.exports = { coversMatch, classifyEdits };
