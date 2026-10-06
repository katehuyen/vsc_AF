// U-207 — THE ONE BUTTON FOR A PAGE'S OWN TEXT (a notice, an article, a question): the step
// button's component, named by the page's key. Pressed it asks for that text by name, so the
// reading view answers with the same key and the same button turns ■ (stop) and ▶ (resume).
//
//   node test/test_read_text_btn.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const posted = [];
const sandbox = { window: {}, document: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afReadAloud.js'), 'utf8'), sandbox);
const R = sandbox.window.AFRead;
R.init(m => posted.push(m), null);
const b = { dataset: { readSid: '', read: 'notice:n1' } };

ok('the button is the step button\'s, under the page\'s key and no session', /data-read="notice:n1" data-read-sid=""/.test(R.textBtn('notice:n1'))
    && /🔊<\/button>$/.test(R.textBtn('notice:n1')));
R.press(b, null);
ok('with no text to give, a press asks for nothing', posted.length === 0);
R.texts(key => (key === 'notice:n1' ? 'The build is ready.' : ''));
R.press(b, null);
ok('pressed, it asks for the page\'s text by its name', JSON.stringify(posted.pop())
    === '{"type":"readAloud","pick":{"text":"The build is ready.","key":"notice:n1"}}');
R.set({ sessionId: '', key: 'notice:n1', paused: false });
ok('while that text is read the same button is ■', R.stateOf('', 'notice:n1') === 'reading' && /■<\/button>$/.test(R.textBtn('notice:n1')));
R.press(b, null);
ok('…and a press stops it', posted.pop().action === 'stop');
R.set({ sessionId: '', key: 'notice:n1', paused: true });
R.press(b, null);
ok('paused, a press resumes it', posted.pop().action === 'resume');
R.set({ sessionId: '', key: 'notice:n2', paused: false });
ok('another text being read leaves this one\'s button quiet', R.stateOf('', 'notice:n1') === '');
const step = { dataset: { readSid: 'S', read: 'a1' } };
R.set(null);
R.press(step, null);
ok('a step\'s button still asks for its step', JSON.stringify(posted.pop()) === '{"type":"readAloud","sessionId":"S","pick":{"msg":"a1"}}');

console.log(`test_read_text_btn: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
