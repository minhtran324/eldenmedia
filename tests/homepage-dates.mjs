import assert from 'node:assert/strict';
import { fromVnInput,toVnInput } from '../src/lib/homepage.ts';
assert.equal(fromVnInput('2026-10-01T00:00'),'2026-09-30T17:00:00.000Z');
assert.equal(toVnInput('2026-09-30T17:00:00Z'),'2026-10-01T00:00');
assert.equal(fromVnInput(''),null);
assert.throws(()=>fromVnInput('2026-02-30T12:00'));
assert.throws(()=>fromVnInput('2026-10-01T25:00'));
assert.throws(()=>fromVnInput('2026-10-01T12:00Z'));
console.log('PASS Vietnam timezone, midnight, empty and invalid dates (6 assertions)');
