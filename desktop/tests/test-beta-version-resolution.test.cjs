'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCore, nextBetaVersion } = require('../scripts/resolveTestBetaVersion.cjs');

test('uses first beta of patch after Desktop stable package if no beta tag exists', () => {
  assert.equal(nextBetaVersion('1.9.17', []), '1.9.18-beta.1');
});
test('auto increments highest beta tag rather than accepting a manually mistyped version', () => {
  const tags = [
    {ref:'refs/tags/v1.9.18-beta.1'},
    {ref:'refs/tags/v1.9.18-beta.5'},
    {ref:'refs/tags/v1.9.18-beta.3'},
    {ref:'refs/tags/v1.9.17-beta.50'},
    {ref:'refs/tags/v2.0.60'},
  ];
  assert.equal(nextBetaVersion('1.9.17', tags), '1.9.18-beta.6');
});
test('does not select a lower beta line when a newer beta line exists', () => {
  const tags=['refs/tags/v1.9.18-beta.99','refs/tags/v1.9.19-beta.2'];
  assert.equal(nextBetaVersion('1.9.17', tags), '1.9.19-beta.3');
});
test('malformed tags are ignored and invalid package version fails closed', () => {
  assert.deepEqual(parseCore('1.9.17'),[1,9,17]);
  assert.throws(() => nextBetaVersion('beta.1', []), /package version/);
  assert.equal(nextBetaVersion('1.9.17',['refs/tags/not-a-beta']), '1.9.18-beta.1');
});
