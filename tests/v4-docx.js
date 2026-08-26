const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts:'dangerously', url:'https://c.local/' });
const { window } = dom;
const bytes = window.CWB.utils.createDocxBytes('测试导出', [['姓名','班级'],['张三','2024级']]);
if (!(bytes instanceof window.Uint8Array) || bytes.length < 200 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('DOCX zip payload invalid');
window.CWB.go('grades');
if (!window.document.querySelector('[data-act="v4-docx"][data-kind="grades"]')) throw new Error('DOCX export action missing');
window.document.querySelector('[data-act="v4-xlsx"][data-kind="grades"]').click();
if (!window.document.querySelector('[data-export-confirm]')) throw new Error('XLSX export preview missing');
console.log('PASS v4-docx');
