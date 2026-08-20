// Cut one rendered section out of dist/render/<name>.html into its own file.
// usage: node .tmp/cut.js <src-name> <needle> <out-name>
const fs = require('fs');
const [src, needle, out] = process.argv.slice(2);
const s = fs.readFileSync('dist/render/' + src + '.html', 'utf8');
const H = '<h1 class="rndr-h">';
const at = s.indexOf(needle);
if (at < 0) { throw new Error('section not found: ' + needle); }
const start = s.lastIndexOf(H, at);
let end = s.indexOf(H, at);
if (end < 0) { end = s.length; }
const head = s.slice(0, s.indexOf('<body>') + 6);
fs.writeFileSync('dist/render/' + out + '.html', head + '\n' + s.slice(start, end) + '\n</body></html>', 'utf8');
console.log(out + '.html', end - start, 'chars');
