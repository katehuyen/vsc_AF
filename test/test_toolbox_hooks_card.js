// U-86 — THE LIVE HOOKS CARD, AS THE PAGE DRAWS IT AND AS A HAND USES IT.
//
// The card decides nothing (core/hooksCockpit.ts does, tested against real
// netstat bytes); what is left to prove is the page: that each state draws the
// facts it names, that "free the port" is offered for a STRANGER only — never
// for another VS Code window, whose editor a status card must not kill — that
// every button posts the message the host listens for, with its scope, and that
// the host's answer is said inside the card rather than in a notification.
'use strict';
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'toolbox.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const scene = (id) => {
    const v = fixture.variants().find(x => x.id === id);
    if (!v) { throw new Error('no fixture scene ' + id); }
    return runPage('toolbox.js', v.data);
};
const click = (page, sel) => { const b = page.query(sel)[0]; if (b) { b.click(); } return !!b; };

// ---------- up: every file carries the hooks, the listener is bound ----------
const up = scene('toolbox-hooks');
const h = up.html();
ok('the card is drawn on the Services tab', /Live Hooks &amp; System Services/.test(h));
ok('the badge carries its tone', /class="svc-badge t-[a-z-]+"/.test(h));
ok('the port is on the head line', /port 8377/.test(h));
ok('user scope reads installed', /User scope <b class="svc-y">installed<\/b>/.test(h));
ok('every hook file is its own row', (h.match(/class="hkfile"/g) || []).length === 3);
ok('an agent file is labelled by its agent', /class="hkscope">developer</.test(h));
ok('nobody else holds the port, so "free the port" is not offered', !/data-hk="clear-port"/.test(h));

// lib_page_dom's query matches ONE attribute, so the scope is picked by hand.
for (const s of ['user', 'agents', 'both']) {
    const b = up.query('[data-hk="install"]').find(x => x.dataset && x.dataset.scope === s);
    if (b) { b.click(); }
    ok(`install (${s}) posts its scope`, !!b && up.posted.some(m => m.type === 'hooks-install' && m.scope === s));
}
ok('remove takes ours out of both scopes',
    click(up, '[data-hk="remove"]') && up.posted.some(m => m.type === 'hooks-remove' && m.scope === 'both'));
ok('restart listener posts', click(up, '[data-hk="restart"]') && up.posted.some(m => m.type === 'hooks-restart'));

up.send({ type: 'hooks-said', ok: true, text: 'Installed into 1 file.' });
ok("the host's answer is said in the card", /class="svc-msg ok">Installed into 1 file\./.test(up.html()));
up.send({ type: 'hooks-said', ok: false, text: 'settings.json is not valid JSON.' });
ok('a refusal is said in the card, marked bad', /class="svc-msg bad">settings\.json is not valid JSON\./.test(up.html()));

// ---------- blind: no file carries the hooks ----------
const blind = scene('toolbox-hooks-blind').html();
ok('blind: user scope reads NOT installed', /User scope <b class="svc-n">NOT installed<\/b>/.test(blind));
ok('blind: no file of three', /Files <b class="svc-n">0 of 3<\/b>/.test(blind));

// ---------- partial: agent files only ----------
const part = scene('toolbox-hooks-partial').html();
ok('partial: user scope NOT installed, two of three files', /NOT installed/.test(part) && /Files <b class="svc-y">2 of 3<\/b>/.test(part));

// ---------- a stranger holds the port ----------
const st = scene('toolbox-hooks-port');
const sh = st.html();
ok('a stranger on the port: "free the port" is offered', /data-hk="clear-port"/.test(sh));
ok('free the port posts', click(st, '[data-hk="clear-port"]') && st.posted.some(m => m.type === 'hooks-clear-port'));
const visible = sh.replace(/<[^>]*>/g, ' ');
ok('the listener is named as not listening', /Listener <b class="svc-n">port-in-use<\/b>/.test(sh));
ok('the holder sentence is said in the card', /node\.exe \(pid 9184\) holds port 8377/.test(visible));

// ---------- another VS Code window holds the port ----------
const ow = scene('toolbox-hooks-otherwindow').html();
ok('another VS Code on the port: stopping it is NOT offered', !/data-hk="clear-port"/.test(ow));
ok('…and the card says where the hooks are going instead', /Another VS Code window \(pid 387884\)/.test(ow));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
