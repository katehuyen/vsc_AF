// S-1 — DICTATION INTO ANY TEXT BOX, IN THE ANDROID SHELL ONLY (media/afVoice.js), measured in a real
// Chrome: with a shell that can dictate, a focused box gets a microphone; a tap asks the shell
// (afVoice, token) through the page's own postMessage; afVoiceDone puts the words at the caret and
// fires `input`; a cancel changes nothing. Without the shell nothing is drawn.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { headlessFlags } = require('./headless_chrome');
const { windowSize, PHONE } = require('./phone_frame');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

let bin;
try { bin = require('./shoot_page').browser(); } catch { bin = null; }
if (!bin) { console.log('test_voice_page: no Chrome here — skipped'); process.exit(0); }

const media = f => fs.readFileSync(path.join(__dirname, '..', 'media', f), 'utf8').replace(/<\/script/gi, '<\\/script');
const MARK = 'AF-VOICE';

function measure(shell, expr) {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
        + '<textarea id="box">merhaba</textarea><input id="ro" readonly value="x">'
        + (shell ? '<script>window.__sent=[];window.afShell={post:function(j){window.__sent.push(JSON.parse(j));},voice:function(){return true;}};</script>' : '')
        + '<script>' + media('afRemote.js') + '</script><script>' + media('afVoice.js') + '</script>'
        + '<script>window.addEventListener("load",function(){var out;try{out=JSON.stringify(' + expr + ');}catch(e){out=JSON.stringify("ERROR: "+e.message);}'
        + 'document.body.innerHTML="<pre id=\\"' + MARK + '\\"></pre>";document.getElementById("' + MARK + '").textContent=out;});</script>'
        + '</body></html>';
    const file = path.join(os.tmpdir(), 'af-voice-' + process.pid + '.html');
    fs.writeFileSync(file, html, 'utf8');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-voice-'));
    try {
        const dom = execFileSync(bin, headlessFlags(profile).concat([windowSize(PHONE.portrait), '--virtual-time-budget=3000',
            '--dump-dom', 'file:///' + file.replace(/\\/g, '/')]), { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
        const m = new RegExp('<pre id="' + MARK + '">([\\s\\S]*?)</pre>').exec(dom);
        const r = m ? JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
        if (typeof r === 'string') { console.log('  page error: ' + r); return {}; }
        return r || {};
    } finally {
        fs.rmSync(file, { force: true });
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }
    }
}

const done = (token, extra) => 'window.dispatchEvent(new MessageEvent("message",{data:Object.assign({type:"afVoiceDone",token:' + JSON.stringify(token) + '},' + JSON.stringify(extra) + ')}));';

const r = measure(true, `(function(){
    var box=document.getElementById('box'), inputs=0, r={};
    box.addEventListener('input',function(){inputs++;});
    r.available=window.AFVoice.available;
    r.before=!!document.getElementById('af-voice');
    // A headless window has no OS focus, so focus() alone fires no focusin: say it as the WebView would.
    var fi=function(el){el.focus();el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));};
    fi(document.getElementById('ro'));
    r.readonlyShows=!!document.getElementById('af-voice');
    fi(box); box.setSelectionRange(7,7);
    var b=document.getElementById('af-voice');
    r.shown=b&&b.style.display==='block';
    r.fits=b?b.getBoundingClientRect().right<=window.innerWidth&&b.getBoundingClientRect().width>=44:false;
    b.click();
    r.sent=window.__sent.slice();
    ${done('v1', { text: 'testleri çalıştır' })}
    r.value=box.value; r.inputs=inputs; r.caret=box.selectionStart; r.focused=document.activeElement===box;
    b.click();
    ${done('v2', {})}
    r.afterCancel=box.value; r.inputsAfterCancel=inputs;
    ${done('v3', { error: 'yok' })}
    r.alive=true;
    return r;})()`);
ok('a shell that can dictate turns it on', r.available === true);
ok('nothing is drawn before a text box is focused, nor for a read-only one', r.before === false && r.readonlyShows === false);
ok('a focused text box gets a microphone within the screen, a finger wide', r.shown === true && r.fits === true);
ok('a tap asks the shell with a token, through the page\'s own postMessage', JSON.stringify(r.sent) === JSON.stringify([{ type: 'afVoice', token: 'v1' }]));
ok('the words land at the caret with a space, and `input` fires as typing would',
    r.value === 'merhaba testleri çalıştır' && r.inputs === 1 && r.caret === r.value.length && r.focused === true);
ok('a cancel changes nothing', r.afterCancel === r.value && r.inputsAfterCancel === 1);
ok('an error with no toast service does not break the page', r.alive === true);

const plain = measure(false, `(function(){ var b=document.getElementById('box'); b.focus(); b.dispatchEvent(new FocusEvent('focusin',{bubbles:true})); return { available: window.AFVoice.available, drawn: !!document.getElementById('af-voice') }; })()`);
ok('without the Android shell nothing is offered', plain.available === false && plain.drawn === false);

console.log(`test_voice_page: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
