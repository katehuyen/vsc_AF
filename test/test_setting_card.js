// U-233 — a special block of Farm Settings is one card (media/afSettingSections.js cardHtml): a state dot, its name,
// one sentence of where it stands and its primary action on one line; the long explanation on the name's AFTip and
// the extra boxes behind Details. Driven on the real model (test/fixtures/allsettings.js) with "Open with" data.
const { runPage } = require('./lib_page_dom.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const fx = require('./fixtures/allsettings.js');
const docOpen = extra => Object.assign({ defaultMode: 'preview', modes: ['vscode', 'preview', 'obsidian', 'custom'], customCommand: '', customArgs: '{file}' }, extra || {});
function general(d) {
    const p = runPage(fx.script, Object.assign(fx.data(), { docOpen: d }), {}, {});
    p.query('[data-fold]').find(b => b.dataset.fold === 'general').click();
    return p;
}
const card = p => (p.html().split('id="cat-docopen"')[1] || '').split('class="setgroup"')[0];
const el = (p, id) => p.sandbox.document.getElementById(id);

{
    const p = general(docOpen());
    const c = card(p);
    ok('"Open with" is a card under its old anchor, at the head of General',
        /<div class="setcard" id="cat-docopen" data-state="ok">/.test(p.html()) && p.html().indexOf('id="cat-docopen"') < p.html().indexOf('class="setgroup"'));
    ok('…a state dot a screen reader can read, then the name', /class="setcardst st-ok" role="img" aria-label="Ready"/.test(c) && /class="setcardt">📄 Open documents with</.test(c));
    ok('…one sentence of where it stands, naming the app', /class="setcardsum">Every Open button uses Markdown preview \(rendered\)\.</.test(c));
    ok('…its primary control on the same line', /class="setcardact"><select id="docopenmode"/.test(c));
    ok('…the long explanation on the name\'s AFTip, not on the page', /af-tipw tip-free/.test(c) && /travel between machines/.test(c) && !/<p class="muted small"/.test(c));
    ok('…the extra boxes behind a closed Details', /<details class="setcarddet"><summary>Details<\/summary>/.test(c) && /id="docopencmd"/.test(c));
    el(p, 'docopenmode').value = 'obsidian';
    el(p, 'docopenmode').fire('change');
    ok('choosing an app still posts what it always did', p.posted.some(m => m.type === 'docOpenSet' && m.field === 'defaultMode' && m.value === 'obsidian'));
}
{
    const c = card(general(docOpen({ defaultMode: 'custom' })));
    ok('a custom app with no command is the one warning: the dot and the sentence say so',
        /data-state="warn"/.test(c) && /aria-label="Needs a look"/.test(c) && /Custom app is chosen, but no command is set\./.test(c));
    ok('…and Details opens on the boxes that fix it', /<details class="setcarddet" open>/.test(c) && /id="docopencustom" style="margin-top:10px; "/.test(c));
    const set = card(general(docOpen({ defaultMode: 'custom', customCommand: 'notepad.exe' })));
    ok('with a command set it is ready again', /data-state="ok"/.test(set) && /value="notepad.exe"/.test(set));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
