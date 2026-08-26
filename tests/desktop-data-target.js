const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveDataTarget } = require('../desktop/data-target.cjs');

const current = path.resolve(path.parse(process.cwd()).root, 'CounselorDesk', 'profile');
const outside = path.resolve(path.parse(process.cwd()).root, 'CounselorDesk-Data');

for (const value of [null, undefined, '', '   ', 42]) {
  assert.throws(() => resolveDataTarget(value, current), error => error.code === 'DATA_TARGET_INVALID', `empty target must be rejected: ${String(value)}`);
}
assert.throws(() => resolveDataTarget(current, current), error => error.code === 'DATA_TARGET_SAME');
assert.throws(() => resolveDataTarget(path.dirname(current), current), error => error.code === 'DATA_TARGET_INVALID');
assert.throws(() => resolveDataTarget(path.join(current, 'child'), current), error => error.code === 'DATA_TARGET_INVALID');
assert.throws(() => resolveDataTarget(path.parse(current).root, current), error => error.code === 'DATA_TARGET_INVALID');
assert.equal(resolveDataTarget(outside, current), outside);
console.log('PASS desktop-data-target');
