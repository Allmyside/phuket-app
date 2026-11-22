const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const files = fs.readdirSync('js').filter(x => x.endsWith('.js')).map(x => 'js/'+x);
const context = vm.createContext({});
context.window = context;
for (const file of files) {
 const source = fs.readFileSync(file,'utf8');
 const script = new vm.Script(source, {filename:file});
 // Global declarations are instantiated before browser-dependent initialization.
 try { script.runInContext(context); } catch {}
}
new vm.Script(fs.readFileSync('sw.js','utf8'));
let count=0; const names=new Set();
for (const file of ['index.html', ...files]) {
 const source=fs.readFileSync(file,'utf8');
 for (const attr of source.matchAll(/\bon(?:click|input|change)\s*=\s*(["'])(.*?)\1/gs)) {
  count++;
  for (const call of attr[2].matchAll(/(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(/g)) {
   if (!['if','confirm','alert','Number','String','parseInt','parseFloat'].includes(call[1])) names.add(call[1]);
  }
 }
}
const missing=[...names].filter(n=>typeof context[n]!=='function');
console.log({attributes:count,globalFunctions:names.size,missing});
assert.deepEqual(missing,[]);
assert.equal(context.escapeHtml('<img onerror="x">&'), '&lt;img onerror=&quot;x&quot;&gt;&amp;');
const sw=fs.readFileSync('sw.js','utf8');
for(const file of files) assert(sw.includes('"./'+file+'"'),file);
console.log('Syntax, global handlers, escaping and cache coverage: OK');
