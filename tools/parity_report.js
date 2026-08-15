// Prints the gate's remaining complaints, grouped — the working view while a
// manifest is being filled in.
const fs = require('fs');
const lines = fs.readFileSync(process.argv[2] || 'par.out', 'utf8').split('\n');
const drift = lines.filter(l => /nothing links/.test(l));
const wrong = lines.filter(l => /is exempt as/.test(l));
const other = lines.filter(l => /FAIL|capabilities/.test(l));
console.log(other.join('\n'));
console.log('\nDRIFT ' + drift.length);
console.log(drift.map(l => l.trim().split(' — ')[0].replace(/^\S\s/, '')).join('\n'));
console.log('\nWRONG-EXEMPTION ' + wrong.length);
console.log(wrong.map(l => l.trim()).join('\n'));
