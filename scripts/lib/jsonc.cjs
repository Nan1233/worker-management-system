'use strict';

// Minimal JSONC reader for repository config such as wrangler.jsonc.
// Removes // line comments, /* block */ comments and trailing commas outside of
// string literals, then defers to JSON.parse. No dependency is added; this is
// only used by tests/contract scripts, never at runtime.
function stripJsonc(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) throw new SyntaxError('Unterminated block comment in JSONC');
      out += source.slice(i, end + 2).replace(/[^\n]/g, ' ');
      i = end + 1;
      continue;
    }
    out += ch;
  }
  // Trailing commas before } or ] (outside strings; strings were copied verbatim
  // above so a second string-aware pass is used here).
  let result = '';
  inString = false; escaped = false;
  for (let i = 0; i < out.length; i += 1) {
    const ch = out[i];
    if (inString) {
      result += ch;
      if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; result += ch; continue; }
    if (ch === ',') {
      let j = i + 1;
      while (j < out.length && /\s/.test(out[j])) j += 1;
      if (out[j] === '}' || out[j] === ']') continue;
    }
    result += ch;
  }
  return result;
}

function parseJsonc(text) {
  return JSON.parse(stripJsonc(text));
}

module.exports = { stripJsonc, parseJsonc };
