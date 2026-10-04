// U-215 — THE SOUND PAGE NAMES THE OTHER PLACES AN EVENT REACHES YOU.
//
// "Why was my phone silent?" found no trace on the Sound page: the phone, Telegram and the
// webhook were settings elsewhere. Now one row under "When something happens" carries a chip
// per channel with its state, its hover opens on that state (MIRROR), and a press opens the
// channel's OWN setting — nothing is copied, so the page cannot disagree with it.
//
//   node test/test_sound_channels.js
'use strict';
const fs = require('fs');
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.resolve(__dirname, '..');
const M = require(path.join(ROOT, 'out', 'panels', 'soundModel.js'));
const fx = require(path.join(__dirname, 'fixtures', 'sound.js'));

// --- the model, from the settings themselves ---
{
    const none = M.channelState(() => undefined);
    ok('nothing set → every channel off, in the order phone · telegram · webhook',
        none.map(c => c.id).join() === 'phone,telegram,webhook' && none.every(c => !c.on) && none[0].value === 'off');
    const set = { 'agentFarm.remote.listen': 'tailscale', 'agentFarm.telegram.enabled': true, 'agentFarm.telegram.digest': 'all',
        'agentFarm.notifyWebhookUrl': 'https://hooks.example/{secret:TOKEN}', 'agentFarm.notifyWebhookEvents': ['permission', 7, 'budget'] };
    const on = M.channelState(k => set[k]);
    ok('each is on from its own setting, carrying its mode / digest / events',
        on.every(c => c.on) && on[0].value === 'tailscale' && on[1].value === 'all' && on[2].value === 'permission, budget');
    ok('‼️ the webhook URL is never carried — it can hold a token', !JSON.stringify(on).includes('hooks.example'));
    ok('a blank URL is no webhook, and Telegram on only when exactly true',
        !M.channelState(k => ({ 'agentFarm.notifyWebhookUrl': '   ', 'agentFarm.telegram.enabled': 'yes' })[k]).some(c => c.on));
    ok('each names the setting it lives in', on.map(c => c.key).join() === 'agentFarm.remote.listen,agentFarm.telegram.enabled,agentFarm.notifyWebhookUrl');
}

// --- the page ---
{
    const r = runPage('sound.js', fx.inUse());
    const html = (r.sandbox.document.getElementById('app') || {}).innerHTML || '';
    const at = s => html.indexOf(s);
    ok('one row under the event table, before Voice', at('<table class="settbl alerttbl">') < at('class="sndchans"') && at('class="sndchans"') < at('>Voice</h3>'));
    ok('a chip per channel with its state', /📱 Phone · on/.test(html) && /💬 Telegram · off/.test(html) && /🔗 Webhook · on/.test(html));
    ok('…on and off look different, not by colour alone (the word is on the chip)', /sndchan on"/.test(html) && /sndchan off"/.test(html));
    ok('‼️ MIRROR — each hover opens on the current state',
        /Phone: on — your network/.test(html) && /Telegram: off — no chat is connected/.test(html) && /Webhook: on — permission, stalled/.test(html));
    ok('…then says what the channel does and that its setting lives elsewhere',
        /a turn finished, a question or a permission ask, a notice, a quota warning/.test(html) && /the choice lives there, not on this page/.test(html));
    const chips = r.query('[data-alertchan]');
    ok('each chip names its own setting', chips.map(b => b.dataset.alertchan).join() === 'agentFarm.remote.listen,agentFarm.telegram.enabled,agentFarm.notifyWebhookUrl');
    chips[0].click();
    const last = r.last();
    ok('a press opens Settings on that setting', last && last.type === 'openSettings' && last.focus === 'agentFarm.remote.listen');

    const d = fx.inUse(); d.channels = [];
    const bare = (runPage('sound.js', d).sandbox.document.getElementById('app') || {}).innerHTML || '';
    ok('no channels in the model → no row', !/class="sndchans"/.test(bare));

    const tr = (runPage('sound.js', fx.inUse(), { __AFUI__: { lang: 'tr', locale: 'tr' } }).sandbox.document.getElementById('app') || {}).innerHTML || '';
    ok('in Turkish the row speaks Turkish', /Ayrıca gider/.test(tr) && /📱 Telefon · açık/.test(tr) && /Telefon: açık — yerel ağın/.test(tr));
}

// --- the host ---
{
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'soundPanel.ts'), 'utf8');
    ok('‼️ the panel opens ONLY a channel\'s own setting — a page cannot steer Settings anywhere',
        /msg\.type === 'openSettings'[\s\S]{0,200}Object\.values\(CHANNEL_KEYS\)\.find\(k => k === msg\.focus\)[\s\S]{0,120}agentfarm\.openFarmSettings/.test(panel));
    ok('…and redraws when any channel setting changes', /\.\.\.CHANNEL_WATCH/.test(panel) && /channels: this\.deps\.channels\?\.\(\) \?\? \[\]/.test(panel));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the Sound page is handed the host\'s channel reader', /SoundPanel\.show\(\{[\s\S]{0,300}channels: soundChannels/.test(ext)
        && /const soundChannels = \(\) => channelState\(/.test(ext));
}

console.log(`test_sound_channels: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
