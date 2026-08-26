const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/core/cwb-employment-resources.js', 'utf8');
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename:'cwb-employment-resources.js' });

const api = sandbox.CWBEmploymentResources;
assert.ok(api, 'CWBEmploymentResources should be exposed');
const resources = api.seedResources();
assert.ok(resources.length >= 80, 'seed catalog should contain at least 80 resources');
assert.equal(new Set(resources.map(item => item.url)).size, resources.length, 'seed URLs should be unique');
assert.ok(resources.every(item => /^https:\/\//.test(item.url) && item.source && item.category && item.audience));
const favorites = api.filterResources(resources.map((item, index) => Object.assign({}, item, { favorite:index === 0 })), { favorite:true });
assert.equal(favorites.length, 1);
assert.equal(favorites[0].favorite, true);
console.log('PASS employment-resources');
