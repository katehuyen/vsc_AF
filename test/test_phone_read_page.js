// U-209 — A PHONE'S 🔊 IS READ BY THE PHONE: the page's half (media/afPhoneRead.js).
//
// The shell's own scripts are loaded as the phone loads them (afRemote.js, afReadAloud.js, then
// afPhoneRead.js) into a window whose events keep the DOM's order (capture first) and its
// stopImmediatePropagation, because "the farm's reading never reaches the page" IS that order.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const media = f => fs.readFileSync(path.join(__dirname, '..', 'media', f), 'utf8');

function phone(remote, speaks) {
    const shellPosts = [], toasts = [], listeners = [];
    const el = tag => ({
        tag, id: '', className: '', attrs: {}, on: {}, innerHTML: '', textContent: '', parentNode: null,
        setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
        addEventListener(t, f) { this.on[t] = f; }
    });
    const body = {
        kids: [], appendChild(e) { this.kids.push(e); e.parentNode = this; },
        removeChild(e) { this.kids = this.kids.filter(x => x !== e); e.parentNode = null; }
    };
    const document = { head: null, body, createElement: el, getElementById: id => body.kids.find(e => e.id === id) || null };
    class MessageEvent {
        constructor(type, init) { this.type = type; this.data = init.data; this.stopped = false; }
        stopImmediatePropagation() { this.stopped = true; }
    }
    const shell = { post: j => shellPosts.push(JSON.parse(j)) };
    if (speaks !== undefined) { shell.speaks = () => speaks; }
    const window = {
        __AFUI__: { remote }, afShell: shell,
        addEventListener(t, fn, capture) { if (t === 'message') { listeners.push({ fn, capture: capture === true }); } },
        dispatchEvent(ev) {
            for (const l of [...listeners.filter(x => x.capture), ...listeners.filter(x => !x.capture)]) { if (ev.stopped) { break; } l.fn(ev); }
            return true;
        },
        AFReadingPlayer: { css: '.af-rp{}', html: r => `[${r.head}|${r.paragraph}|${r.paused}|${r.rate}]` },
        AFCtx: { toast: m => toasts.push(m) }
    };
    window.window = window;
    const ctx = vm.createContext({ window, document, MessageEvent, location: { pathname: '/v', search: '' } });
    for (const f of ['afRemote.js', 'afReadAloud.js', 'afPhoneRead.js']) { vm.runInContext(media(f), ctx, { filename: f }); }
    const page = [];
    window.addEventListener('message', ev => { page.push(ev.data); window.AFRead.receive(ev.data); });
    const send = data => window.dispatchEvent(new MessageEvent('message', { data }));
    return { window, document, shellPosts, toasts, page, send, api: window.acquireVsCodeApi() };
}

// ---- inside VS Code or a browser it turns nothing ----
{
    const p = phone(false, true);
    ok('off the phone it is off and mutes nothing', p.window.AFPhoneRead.on === false && p.window.AFPhoneRead.mute === false);
    ok('…a 🔊 is drawn as ever', /data-read="k"/.test(p.window.AFRead.btn('s', 'k')));
}

// ---- a phone whose shell cannot speak draws no 🔊 ----
{
    const p = phone(true, undefined);
    ok('an older shell (no speaks()) mutes the page\'s reading', p.window.AFPhoneRead.mute === true && p.window.AFPhoneRead.on === false);
    ok('…so no 🔊 is drawn, on a step or on a page\'s own text', p.window.AFRead.btn('s', 'k') === '' && p.window.AFRead.textBtn('notice:1') === '');
}

// ---- a phone that speaks ----
{
    const p = phone(true, true);
    ok('a speaking shell turns it on', p.window.AFPhoneRead.on === true && /data-read="k"/.test(p.window.AFRead.btn('s', 'k')));

    p.window.AFRead.init(m => p.api.postMessage(m), { sessionId: 'S', key: 'A1', paused: false, head: 'x' });
    ok('‼️ the PC\'s reading at the page\'s start is not the phone\'s', p.window.AFRead.reading() === null);
    p.send({ type: 'reading', reading: { sessionId: 'S', key: 'A1', paused: false, head: 'x' } });
    ok('‼️ the farm\'s reading (the PC\'s speakers) never reaches the page', p.page.length === 0 && p.window.AFRead.reading() === null);

    p.api.postMessage({ type: 'readAloud', sessionId: 'S', pick: { msg: 'A1' }, surface: 'console' });
    const asked = p.shellPosts[0] || {};
    ok('a 🔊 asks the farm for the text (readFor), under a token, with what it named',
        asked.type === 'readFor' && asked.token === 'p1' && asked.pick.msg === 'A1' && asked.sessionId === 'S' && asked.surface === 'console');
    p.api.postMessage({ type: 'readControl', action: 'stop' });
    p.api.postMessage({ type: 'afnav', to: 'reading:rate:-3' });
    p.api.postMessage({ type: 'refresh' });
    const [stop, rate, other] = p.shellPosts.slice(1);
    ok('■ / ▶ go to the shell, never the farm', stop.type === 'afSpeakControl' && stop.action === 'stop');
    ok('a player\'s speed is the shell\'s rate control', rate.type === 'afSpeakControl' && rate.action === 'rate' && rate.rate === -3);
    ok('anything else goes out as it is', other.type === 'refresh');

    const before = p.shellPosts.length;
    p.send({ type: 'readText', token: 'p0', paragraphs: ['Old.'], keys: ['A0'], heads: ['Old.'] });
    ok('an answer to an older press is dropped', p.shellPosts.length === before && p.page.length === 0);
    p.send({ type: 'readText', token: 'p1', sessionId: 'S', label: 'developer', paragraphs: ['One.', 'Two.'], keys: ['A1', 'A2'], heads: ['One', 'Two'], lang: 'en', rate: 2 });
    const speak = p.shellPosts[before] || {};
    ok('the answer goes to the phone\'s voice: paragraphs, language, speed, token',
        speak.type === 'afSpeak' && speak.token === 'p1' && speak.paragraphs.join('|') === 'One.|Two.' && speak.lang === 'en' && speak.rate === 2);
    ok('…and is not the page\'s business', p.page.length === 0);

    p.send({ type: 'afSpeakState', token: 'p1', state: 'reading', paragraph: 1, count: 2, rate: 2 });
    const r = p.page[p.page.length - 1] || {};
    ok('the shell\'s word becomes the page\'s own reading message', r.type === 'reading' && r.phone === true);
    ok('…naming the step and paragraph being said, as the PC\'s channel names them',
        r.reading && r.reading.sessionId === 'S' && r.reading.key === 'A2' && r.reading.paused === false && r.reading.head === 'Two');
    ok('…so every 🔊 paints from the phone\'s voice', p.window.AFRead.reading() && p.window.AFRead.reading().key === 'A2'
        && p.window.AFRead.stateOf('S', 'A2') === 'reading' && p.window.AFRead.stateOf('S', '@last') === 'reading');
    const bar = p.document.getElementById('af-rp-phone');
    ok('a player sits over the tab bar while it reads', !!bar && bar.innerHTML === '[developer|Paragraph 2 of 2|false|2]' && bar.attrs.role === 'region');
    bar.on.click({ target: { closest: () => ({ getAttribute: () => 'toggle' }) }, stopPropagation() { } });
    ok('its buttons steer the phone\'s voice', p.shellPosts[p.shellPosts.length - 1].action === 'toggle');

    p.send({ type: 'afSpeakState', token: 'p0', state: 'idle' });
    ok('an older reading\'s last word changes nothing', p.window.AFRead.reading().key === 'A2');
    p.send({ type: 'afSpeakState', token: 'p1', state: 'paused', paragraph: 1, count: 2, rate: 4 });
    ok('paused paints ▶ and the player follows', p.window.AFRead.stateOf('S', 'A2') === 'paused' && /\|true\|4\]$/.test(p.document.getElementById('af-rp-phone').innerHTML));
    p.send({ type: 'afSpeakState', token: 'p1', state: 'idle', error: 'This phone has no voice for Turkish.' });
    ok('the end clears every 🔊 and takes the player away', p.window.AFRead.reading() === null && !p.document.getElementById('af-rp-phone'));
    ok('…and a reason the voice gave is shown', p.toasts.join() === 'This phone has no voice for Turkish.');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
