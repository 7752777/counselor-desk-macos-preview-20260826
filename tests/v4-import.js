const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('node:path');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const errors=[]; const vc=new VirtualConsole(); vc.on('jsdomError',e=>{if(!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(e.message))errors.push(e.message)}); vc.on('error',(...a)=>errors.push(a.join(' ')));
  const dom=await JSDOM.fromFile(path.join(__dirname,'..','index.html'),{runScripts:'dangerously',resources:'usable',url:'https://c.local/',virtualConsole:vc,pretendToBeVisual:true}); await wait(700);
  const p=dom.window.CWB.importer.previewCSV('序号1,序号2,姓名,学号,社区/书院,危机预警级别,是否解除预警\n1,A,张三,20240001,东区书院,二级,否','students');
  assert.equal(p.serialColumns.length,2); assert.equal(p.needsSerialDecision,true); assert.ok(p.mapped.includes('community')); assert.ok(p.mapped.includes('crisis_level')); assert.ok(p.mapped.includes('crisis_relieved'));
  assert.equal(p.serialColumns[0].position,0); assert.equal(p.serialColumns[0].defaultAction,'keep'); assert.deepEqual(errors,[]); dom.window.close(); console.log('PASS v4-import');
})().catch(e=>{console.error(e.stack||e.message);process.exit(1)});
