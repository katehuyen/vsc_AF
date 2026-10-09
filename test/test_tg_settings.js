// U-84 (the Farm Settings half) — SETTINGS ▸ ACCESS & REMOTE, WHERE FOUR ROWS
// CONFIGURE THE TELEGRAM BRIDGE AND NONE OF THEM CAN SAY WHETHER IT IS UP.
//
// ‼️ THE FAILURE THIS FILE IS ABOUT IS AN INVISIBLE ONE, and it is the same
// shape as the wiki's missing law: `telegram.enabled` ticked, allowlist filled,
// ceiling set — and no token in the vault, so nothing is polled and every one of
// those four rows looks exactly like a working configuration. The card is the
// page saying so.
//
// ‼️ THE SECOND HALF IS THE ONE THAT WILL ROT IF NOBODY WATCHES IT. This card
// exists on TWO surfaces, and the day somebody adds a state, a copy in
// media/settings.js would go on drawing last month's rules in green. So these
// checks are as much about WHERE the card comes from as about what it says.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fx = require(path.join(__dirname, 'fixtures', 'tgsettings.js'));

const open = (data) => runPage(fx.script, data);
const V = fx.variants();
const of = (id) => V.find(v => v.id === id).data;

// ---------------------------------------------------------------------------
// 1. the card is drawn, once, above the rows it cannot replace
// ---------------------------------------------------------------------------
{
    const p = open(of('tgsettings'));
    const html = p.html();
    // U-233 — the bridge is one Settings card: its state in words on the line, verify and connect beside it
    ok('the card is drawn', /<div class="setcard" id="cat-telegram" data-state="ok"/.test(html) && /class="setcardt">📱 Telegram</.test(html));
    ok('…exactly once, the bridge\'s own head not drawn inside it', (html.match(/<button[^>]*data-svc="connect"/g) || []).length === 1
        && !/>Telegram Bridge</.test(html));
    ok('…above the four rows it reports on',
        html.indexOf('id="cat-telegram"') < html.indexOf('agentFarm.telegram.enabled'));

    // ‼️ ONE SUBJECT. The rows below own the four controls; a second switch two
    // inches above the first is a page that can disagree with itself.
    ok('‼️ the card does NOT grow a second copy of the four controls',
        !/id="svc-enabled"/.test(html) && !/id="svc-cap"/.test(html)
        && !/id="svc-agent"/.test(html) && !/id="svc-allow"/.test(html));
    ok('…and every one of the four rows is still there',
        ['enabled', 'allowedChats', 'maxDailyUSD', 'defaultAgent']
            .every(k => html.indexOf('agentFarm.telegram.' + k) > 0));
    ok('the web-server rows in the same category are untouched',
        /agentFarm\.web\.enabled/.test(html) && /agentFarm\.web\.port/.test(html));
}

// ---------------------------------------------------------------------------
// 2. what the card says that no row can
// ---------------------------------------------------------------------------
{
    const up = open(of('tgsettings')).html();
    ok('it names the bridge state, on the card\'s line', /class="setcardsum">Connected /.test(up));
    ok('it says the token is in the vault', /in the vault/.test(up));
    ok('it says the poller is alive', /alive/.test(up));
    ok('it says how many chats the list admits', /Allowed chats/.test(up));
    ok('it says what today has cost against today\'s ceiling', /\$0\.3812 \/ \$1\.00/.test(up));
    ok('…and who the bot is', /class="setcardsum">Connected \(@muvu_farm_bot\): /.test(up));

    // ‼️ THE CASE THE CARD EXISTS FOR: four rows that look configured, and a
    // bridge that cannot sign in.
    const none = open(of('tgsettings-notoken')).html();
    ok('‼️ switched on with no token reads as "no token", not as working',
        /class="setcardsum">No token[ :]/.test(none) && /id="cat-telegram" data-state="warn"/.test(none));
    ok('…the poller is reported stopped', /stopped/.test(none));
    ok('…and the card says what to press next', /Connect Telegram/.test(none));
    ok('…while the switch row below still says the setting is on',
        /id="c-telegram\.enabled"[^>]*checked/.test(none));

    const deaf = open(of('tgsettings-nochats')).html();
    ok('a polling bridge with an empty allowlist is not called connected',
        /class="setcardsum">No chats[ :]/.test(deaf) && !/Connected/.test(deaf) && /id="cat-telegram" data-state="warn"/.test(deaf));

    const over = open(of('tgsettings-over')).html();
    ok('a spent ceiling paints the bar as over', /class="over"/.test(over));
}

// ---------------------------------------------------------------------------
// 3. the two acts that are not settings — and the token is never one of them
// ---------------------------------------------------------------------------
{
    const p = open(of('tgsettings'));
    const btn = (act) => p.query('[data-svc]').find(b => b.dataset.svc === act);
    ok('there is a verify button', !!btn('verify'));
    ok('there is a token button', !!btn('connect'));

    btn('verify').click();
    ok('verify asks the host, which is the only thing that can reach the token',
        p.posted.some(m => m.type === 'svc-verify'));
    btn('connect').click();
    ok('the token button opens the command that owns the secret',
        p.posted.some(m => m.type === 'svc-connect'));

    // ‼️ NEVER THE TOKEN. The card is handed `hasToken` and nothing else — the
    // same boundary X-100 draws with `hasSecret`.
    ok('‼️ no token reaches the page', !/[0-9]{8,}:[A-Za-z0-9_-]{30,}/.test(p.html()));
}

// ---------------------------------------------------------------------------
// 4. U-84 (b) and (d) — the two controls the item asks for BY NAME
// ---------------------------------------------------------------------------
{
    const p = open(of('tgsettings'));
    const html = p.html();

    // (b) the allowlist gets U-108's list editor, because the schema says it is
    // a plain list — not because anybody named the key on this page.
    ok('the allowlist is the list editor rather than a JSON box',
        /data-lrow="agentFarm\.telegram\.allowedChats"/.test(html)
        || (/agentFarm\.telegram\.allowedChats/.test(html)
            && !/data-json="agentFarm\.telegram\.allowedChats"/.test(html)));
    ok('…with both chat ids on their own row',
        /-1001234567890/.test(html) && /88112233/.test(html));

    // (d) the default agent is a picker over the agents this machine has.
    const sel = p.sandbox.document.getElementById('c-telegram.defaultAgent');
    ok('the default agent is a picker, not a text box', !!sel && sel.tagName === 'SELECT');
    // Read off the markup rather than the DOM shim: the options are what ships.
    const picker = /<select id="c-telegram\.defaultAgent"[\s\S]*?<\/select>/.exec(html);
    const opts = picker ? [...picker[0].matchAll(/value="([^"]*)"/g)].map(m => m[1]) : [];
    ok('…offering every agent the host knows',
        ['asistan', 'developer', 'psikolog', 'yazar'].every(a => opts.indexOf(a) >= 0));
    ok('…plus an empty answer, because "no default" is a real answer', opts.indexOf('') === 0);
    ok('…with the stored one selected', /value="developer" selected/.test(picker ? picker[0] : ''));

    // ‼️ A NAME THIS MACHINE DOES NOT HAVE IS KEPT AND SAID SO. Dropping it
    // would make the page swap a setting nobody touched for whatever sits first
    // in the list.
    const q = open(of('tgsettings-stranger')).html();
    const p2 = /<select id="c-telegram\.defaultAgent"[\s\S]*?<\/select>/.exec(q);
    ok('‼️ a stored agent the host has never heard of stays selected',
        !!p2 && /value="arastirmaci" selected/.test(p2[0]));
    ok('…and the row says it is not on this machine', /not on this machine/.test(q));
}

// ---------------------------------------------------------------------------
// 5. ‼️ ONE CARD. The whole point of the half, checked where it can rot.
// ---------------------------------------------------------------------------
{
    const fs = require('fs');
    const settings = require('./lib_settings_source').settingsPageSource();
    const toolbox = fs.readFileSync(path.join(ROOT, 'media', 'toolbox.js'), 'utf8');
    for (const [name, src] of [['settings.js', settings], ['toolbox.js', toolbox]]) {
        ok(`media/${name} draws the card with the shared component`,
            /window\.AFTelegram\.card\(/.test(src));
        // ‼️ WHAT MUST NOT BE COPIED IS THE VOCABULARY, not the classes. A
        // second card on the Toolbox (U-86's hooks card) paints itself with the
        // SAME `.svc-*` tones on purpose — that is the reuse this is for. What
        // would be wrong is a page keeping its own tone→symbol map, or drawing
        // the bridge's own head a second time.
        ok(`media/${name} keeps no tone map of its own`, !/TONE_DOT/.test(src));
        ok(`media/${name} does not draw a second Telegram head`,
            (src.match(/>Telegram Bridge</g) || []).length === 0);
    }
    // The component is shipped to every page, so a surface that grows a card
    // tomorrow does not have to remember a script tag (base.ts, and the test
    // harness's own list, which fails loudly when the two drift).
    const shared = require(path.join(__dirname, 'lib_shared_media.js'));
    ok('the card component ships with every page', shared.SHARED.indexOf('afTelegram.js') >= 0);
    ok('…and the shell still loads exactly what the harness lists', shared.matchesShell());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
