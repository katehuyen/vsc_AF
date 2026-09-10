// A-21 — SETTINGS ▸ ALERT SOUNDS, DRIVEN.
//
// ‼️ THE BUG THIS FILE IS ABOUT IS AN INVISIBLE ONE, and it is the third time
// the same one: `agentFarm.alerts.on` and `agentFarm.alerts.voices` are both
// EMPTY objects out of the box, so two JSON boxes showed `{}` twice for a
// feature that already plays five different tones. "Which sound will I hear,
// and why that one" — the only question anybody opens this page with — had no
// answer anywhere on it. Only the resolution chain can answer it, so the host
// hands the RESOLVED rows over and the boxes are gone rather than decorated.
//
// What is defended here:
//   - the card REPLACES both boxes, in their own place, and only once.
//   - every row says what would ACTUALLY play and which step chose it — a row
//     showing only what the user typed is a row that lies the moment a file
//     goes missing.
//   - an armed event whose sound cannot be played is VISIBLE, on the card, at a
//     glance: silence is indistinguishable from the switch being off, which is
//     the whole failure A-18 was opened for.
//   - every gesture goes to the HOST, which runs the same function the matching
//     `alerts.*` bridge op runs. The page holds no rule of its own about
//     reserved ids, the limit of ten, or which formats play.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
// ‼️ THE DEFAULTS ARE READ, NOT TYPED OUT. A-20 moved all five of them and
// these assertions went on naming the old ones — a test that hardcodes what it
// is checking stops checking anything the day the answer changes.
const VOICES = require(path.join(ROOT, 'out', 'core', 'alertVoices.js'));
const LABEL = id => (VOICES.builtinVoices('x').find(v => v.id === id) || {}).label;
const fx = require(path.join(__dirname, 'fixtures', 'alertsettings.js'));

const open = (data) => runPage(fx.script, data);
const sent = (p) => p.posted;
const last = (p) => p.last();
const byId = (p, id) => p.sandbox.document.getElementById(id);
const byAttr = (p, attr, key) =>
    p.query(`[data-${attr}]`).find(b => b.dataset[attr] === key);

// ---------------------------------------------------------------------------
// 1. the card replaces the boxes — in their place, and once
// ---------------------------------------------------------------------------
{
    const p = open(fx.inUse());
    const html = p.html();
    ok('the card is drawn', /🔔 Alert sounds/.test(html));
    ok('‼️ …and it REPLACES both JSON boxes rather than sitting beside them',
        !/id="c-agentFarm\.alerts\.on"/.test(html)
        && !/id="c-agentFarm\.alerts\.voices"/.test(html));
    ok('…exactly once', (html.match(/🔔 Alert sounds/g) || []).length === 1);
    ok('the OTHER settings in the category are untouched',
        /agentFarm\.notifyTurnEnd/.test(html) && /agentFarm\.stuckThresholdSeconds/.test(html));
    // ‼️ Beside the notification switches ON PURPOSE — those open a VS Code
    // notification, these make a noise, and confusing the two is the complaint
    // keeping them apart-but-adjacent exists to prevent.
    ok('‼️ …and it sits where the setting it replaces sat: after notifyTurnEnd,'
        + ' before the rest',
        html.indexOf('notifyTurnEnd') < html.indexOf('🔔 Alert sounds')
        && html.indexOf('🔔 Alert sounds') < html.indexOf('stuckThresholdSeconds'));
    ok('every event gets a row', ['turn-ready', 'question', 'stalled', 'ended', 'error']
        .every(e => byAttr(p, 'alerton', e)));
}

// ---------------------------------------------------------------------------
// 2. what will I hear — the row says what PLAYS, not what was typed
// ---------------------------------------------------------------------------
{
    const p = open(fx.fresh());
    const html = p.html();
    ok('‼️ nothing chosen still names a sound per row — `{}` said nothing at all',
        VOICES.ALERT_EVENTS.every(e => html.indexOf(LABEL(VOICES.DEFAULT_VOICE[e])) >= 0));
    ok('…and says the answer came from the built-in default',
        (html.match(/the built-in default/g) || []).length >= 5);
    ok('‼️ the two the item was opened for are DIFFERENT sounds out of the box —'
        + ' hearing them apart from another room without configuring anything'
        + ' was the user\'s own condition',
        byAttr(p, 'alertplay', VOICES.DEFAULT_VOICE['turn-ready'])
        && byAttr(p, 'alertplay', VOICES.DEFAULT_VOICE.question)
        && VOICES.DEFAULT_VOICE['turn-ready'] !== VOICES.DEFAULT_VOICE.question);
    ok('the picker offers the default as a NAMED option, not as a blank',
        html.indexOf('Default — ' + LABEL(VOICES.DEFAULT_VOICE['turn-ready'])) >= 0);
    // ‼️ AND BOTH FAMILIES ARE ON OFFER, UNDER THEIR OWN HEADINGS. Twenty
    // built-ins in a flat list make the reader read every label to discover
    // there were two sets — the ten the defaults come from, and the ten kept
    // only so that nobody who chose one loses it in an upgrade.
    ok('the picker groups the two built-in families rather than listing twenty',
        /optgroup label="Built in"/.test(html)
        && /optgroup label="Built in — earlier set"/.test(html));
    ok('…and every built-in voice really is offered somewhere in it',
        VOICES.builtinVoices('x').every(v => html.indexOf('>' + v.label) >= 0));
    ok('nothing armed says so rather than showing a count of zero',
        /nothing armed — every event is off/.test(html));

    const q = open(fx.inUse());
    ok('a chosen sound is what the row reports playing',
        /Kapı zili/.test(q.html()));
    ok('…and it says the choice was yours', /your choice here/.test(q.html()));
    ok('the armed count is on the badge', /2 of 5 events armed/.test(q.html()));
}

// ---------------------------------------------------------------------------
// 3. ‼️ broken is LOUD. A sound that cannot play is the failure this feature
//    has, and it is invisible by nature.
// ---------------------------------------------------------------------------
{
    const p = open(fx.broken());
    const html = p.html();
    ok('‼️ an armed event whose sound cannot be played is called out on the badge',
        /armed events? cannot be played/.test(html));
    ok('‼️ the chain FELL THROUGH rather than going silent — the row reports the'
        + ' built-in it landed on, not the choice that failed',
        /Chime, soft/.test(html) && /Ask — two knocks/.test(html));
    ok('…and the row is marked, so the difference between "chosen" and "playing"'
        + ' is visible without hovering',
        (html.match(/alertplays bad/g) || []).length === 2);
    ok('a sound whose file is gone says so in the library',
        /the file is gone/.test(html));
    ok('…and its ▶ is disabled rather than offering silence',
        /data-alertplay="u-kapi-zili" disabled/.test(html));
    ok('‼️ …and when even the BUILT-IN behind it is gone — a partial update —'
        + ' the chain runs out of steps and the row says the event would be'
        + ' SILENT, which is the one state nothing else can reveal',
        html.indexOf('data-alertplay="' + VOICES.DEFAULT_VOICE.error + '" disabled') >= 0);
    // ‼️ audit B-05 — THE BADGE AND THE TABLE POINT AT THE SAME ROW.
    //
    // Measured colours, not markup: `error` was armed with nothing able to play
    // it — the row the badge counts — and drew in the ordinary foreground
    // rgb(204,204,204), while the two rows that fell through to a WORKING
    // default drew in warning yellow. The badge said "1 armed event cannot be
    // played" and the only marked rows were the two that ring. So the counts
    // are asserted against each other rather than against a number typed here.
    {
        const rows = fx.broken().alerts.events;
        const dead = rows.filter(e => e.on && !e.playable).length;
        const fell = rows.filter(e => e.chosen && e.chosen !== e.voice).length;
        ok(`‼️ the row the badge counts is the row drawn as SILENT (${dead})`,
            dead > 0 && (html.match(/alertplays silent/g) || []).length === dead);
        ok('‼️ …and a fallback that still rings is a WARNING, never the same mark'
            + ` (${fell})`,
            fell > 0 && (html.match(/alertplays bad/g) || []).length === fell);
        ok('‼️ …and the silent row does not claim in its own tooltip that it plays'
            + ' the sound it cannot play',
            /is armed and NOTHING plays it/.test(html));
    }
    ok('a format nothing here opens says THAT instead',
        /nothing here plays it/.test(html));
}

// ---------------------------------------------------------------------------
// 4. every gesture leaves for the host
// ---------------------------------------------------------------------------
{
    const p = open(fx.inUse());

    byAttr(p, 'alerton', 'stalled').checked = true;
    byAttr(p, 'alerton', 'stalled').dispatchEvent(new p.sandbox.Event('change'));
    ok('ticking an event posts alertOn with the event and the state',
        last(p).type === 'alertOn' && last(p).event === 'stalled' && last(p).on === true);

    const sel = byAttr(p, 'alertvoice', 'turn-ready');
    sel.value = 'bell-far';
    sel.dispatchEvent(new p.sandbox.Event('change'));
    ok('choosing a sound posts alertVoice', last(p).type === 'alertVoice'
        && last(p).event === 'turn-ready' && last(p).voice === 'bell-far');
    sel.value = '';
    sel.dispatchEvent(new p.sandbox.Event('change'));
    ok('‼️ …and CLEARING it sends an empty voice rather than the default\'s id —'
        + ' "use whatever the default is" and "pin it to chime-soft" are'
        + ' different answers and only one survives a version that changes it',
        last(p).voice === '');

    const stalled = VOICES.DEFAULT_VOICE.stalled;
    byAttr(p, 'alertplay', stalled).dispatchEvent(new p.sandbox.Event('click'));
    ok('▶ posts alertPlay with the voice id — the RESOLVED one, so the button'
        + ' plays what the event would actually make, not what was typed',
        last(p).type === 'alertPlay' && last(p).voice === stalled);

    p.sandbox.document.getElementById('alertadd')
        .dispatchEvent(new p.sandbox.Event('click'));
    ok('+ Add a sound asks the HOST to open the picker — the page owns the'
        + ' gesture, the host owns the dialog', last(p).type === 'alertVoiceAdd');

    p.sandbox.document.getElementById('alertfolder')
        .dispatchEvent(new p.sandbox.Event('click'));
    ok('the suggested folder is the host\'s to open', last(p).type === 'alertFolder');

    byAttr(p, 'alertremove', 'u-uzak-gong').dispatchEvent(new p.sandbox.Event('click'));
    ok('✕ posts alertVoiceRemove by id', last(p).type === 'alertVoiceRemove'
        && last(p).id === 'u-uzak-gong');

    // ‼️ THE NAME IS A BOX ON THE ROW, not a ✎ that opens a prompt: a webview
    // has no `window.prompt`, so a button wired to one does nothing at all.
    const name = byAttr(p, 'alertrename', 'u-kapi-zili');
    ok('the name is an editable box on the row', name && name.tagName === 'INPUT');
    const before = sent(p).length;
    name.value = 'Kapı zili';
    name.dispatchEvent(new p.sandbox.Event('change'));
    ok('an unchanged name sends nothing', sent(p).length === before);
    name.value = '   ';
    name.dispatchEvent(new p.sandbox.Event('change'));
    ok('…and neither does an emptied one — it is put back instead',
        sent(p).length === before && name.value === 'Kapı zili');
    name.value = '  Ön kapı  ';
    name.dispatchEvent(new p.sandbox.Event('change'));
    ok('a real rename posts alertVoiceRename, trimmed',
        last(p).type === 'alertVoiceRename' && last(p).id === 'u-kapi-zili'
        && last(p).label === 'Ön kapı');
}

// ---------------------------------------------------------------------------
// 5. the limit, and the filter
// ---------------------------------------------------------------------------
{
    const full = fx.inUse();
    const mine = full.alerts.voices.filter(v => !v.builtin)[0];
    for (let i = full.alerts.voices.filter(v => !v.builtin).length; i < full.alerts.limit; i++) {
        full.alerts.voices.push({ ...mine, id: `u-fill-${i}`, label: `Fill ${i}` });
    }
    const p = open(full);
    ok('‼️ at the limit the button is DISABLED and says why, rather than opening'
        + ' a picker whose result is refused after the file was chosen',
        /id="alertadd" disabled/.test(p.html()));
    ok('…and the count is on the page', /<b>10<\/b> of 10/.test(p.html()));
}

// ---------------------------------------------------------------------------
// 6. the host wiring — one set of functions, two doors
// ---------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    for (const op of ['alerts.voices', 'alerts.resolve', 'alerts.on', 'alerts.voice.set',
        'alerts.voice.add', 'alerts.voice.remove', 'alerts.voice.rename', 'alerts.play']) {
        ok(`extension.ts registers ${op}`, src.includes(`op: '${op}'`));
    }
    // ‼️ THE SAME ACT THROUGH TWO DOORS GOES THROUGH ONE FUNCTION. A page that
    // wrote globalState itself would be a second place that knows the reserved
    // ids and the limit, and the two would drift on the first change — which is
    // the failure `resolveVoice` exists to prevent one layer down.
    for (const fn of ['alertsSetOn', 'alertsSetVoice', 'alertsVoiceAdd',
        'alertsVoiceRemove', 'alertsVoiceRename', 'alertsPlayVoice']) {
        const defs = (src.match(new RegExp(`const ${fn} =`, 'g')) || []).length;
        const calls = (src.match(new RegExp(`\\b${fn}\\(`, 'g')) || []).length;
        ok(`${fn} is defined once and called from both the op and the page`,
            defs === 1 && calls >= 2);
    }
    ok('‼️ removing a voice CLEARS whatever pointed at it, so no row is left'
        + ' naming a sound nothing answers',
        /alertsVoiceRemove[\s\S]{0,900}orphaned/.test(src));
    ok('the settings page is handed the RESOLVED rows, not the raw setting',
        /alerts: \(\) => alertsPage\(\)/.test(src));

    for (const fn of ['alertsSetMuted', 'alertsSetQuiet']) {
        const defs = (src.match(new RegExp(`const ${fn} =`, 'g')) || []).length;
        const calls = (src.match(new RegExp(`\\b${fn}\\(`, 'g')) || []).length;
        ok(`A-22 — ${fn} is defined once and reached from the op, the page and the bar`,
            defs === 1 && calls >= 2);
    }

    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'settingsPanel.ts'), 'utf8');
    for (const msg of ['alertOn', 'alertVoice', 'alertPlay', 'alertVoiceAdd',
        'alertVoiceRename', 'alertVoiceRemove', 'alertFolder',
        'alertMute', 'alertQuiet', 'alertUnmuteSession']) {
        ok(`settingsPanel handles ${msg}`, panel.includes(`case '${msg}':`));
    }
    ok('‼️ a refusal is SHOWN on the card rather than swallowed — a sound feature'
        + ' that fails silently is indistinguishable from one that is off',
        /alertError\(/.test(panel) && /agentFarm\.alerts\.voices/.test(panel));
    ok('▶ does not redraw the page — a redraw under the hand would close the'
        + ' picker the reader opened to compare two tones',
        /case 'alertPlay':[\s\S]{0,260}alertsPlay/.test(panel)
        && !/case 'alertPlay':[\s\S]{0,260}this\.refresh\(\)/.test(panel));
}

// ---------------------------------------------------------------------------
// A-22 — the gate strip: whether anything is heard at all
// ---------------------------------------------------------------------------
{
    const p = open(fx.inUse());
    const html = p.html();
    ok('A-22 — the gate strip is on the card', /class="alertgate"/.test(html));
    ok('…with the mute and the quiet window on it',
        !!byId(p, 'alertmute') && !!byId(p, 'alertquieton')
        && !!byId(p, 'alertquietfrom') && !!byId(p, 'alertquietto'));
    ok('‼️ …and the two settings it draws are ABSORBED, not left as JSON boxes'
        + ' beside it — two controls for one setting is the shape A-21 removed',
        !/id="c-agentFarm\.alerts\.muted"/.test(html)
        && !/id="c-agentFarm\.alerts\.quietHours"/.test(html));
    ok('nothing holding the gate reads as sounds on', /🔊 sounds on/.test(html));

    byId(p, 'alertmute').checked = true;
    byId(p, 'alertmute').dispatchEvent(new p.sandbox.Event('change'));
    ok('the mute goes to the HOST — same function as the status bar and the op',
        last(p).type === 'alertMute' && last(p).on === true);

    byId(p, 'alertquieton').checked = true;
    byId(p, 'alertquieton').dispatchEvent(new p.sandbox.Event('change'));
    ok('so does the quiet-hours switch',
        last(p).type === 'alertQuiet' && last(p).on === true);

    const from = byId(p, 'alertquietfrom');
    from.value = '22:30';
    from.dispatchEvent(new p.sandbox.Event('change'));
    ok('…and an edited start time, on its own', last(p).type === 'alertQuiet'
        && last(p).from === '22:30' && last(p).to === undefined);

    // ‼️ Emptied is not a time. Sent through it would come back as an error the
    // reader has to read in order to learn they deleted something.
    const before = sent(p).length;
    const to = byId(p, 'alertquietto');
    to.value = '   ';
    to.dispatchEvent(new p.sandbox.Event('change'));
    ok('‼️ an emptied box is PUT BACK rather than sent as a refusal',
        sent(p).length === before && to.value === '08:00');
}
{
    const p = open(fx.gated());
    const html = p.html();
    ok('‼️ A-22 — a muted farm SAYS SO on the badge, above the row counts:'
        + ' "3 of 5 armed" on a silent farm is the true sentence that sends'
        + ' somebody looking in the wrong place',
        /rootbadge warn">silent/.test(html));
    ok('…and every authority holding it is named, not just the first',
        /muted/.test(html) && /quiet hours 23:00/.test(html));
    ok('…including the sessions muted on their own', /muted on their own/.test(html)
        && /developer · TalkScribe/.test(html));
    ok('the mute and the window are shown as SET (MIRROR)',
        byId(p, 'alertmute').checked === true && byId(p, 'alertquieton').checked === true);
    const x = p.query('[data-alertunmute]')[0];
    x.dispatchEvent(new p.sandbox.Event('click'));
    ok('…and one of them can be given its voice back from the row that named it',
        last(p).type === 'alertUnmuteSession'
        && last(p).sessionId === 'a1b2c3d4-1111-2222-3333-444455556666');
}

// ---------------------------------------------------------------------------
// U-123 — THE NUDGE, ON THE GATE STRIP.
//
// ‼️ `agentFarm.alerts.nudge` was the LAST raw JSON box on this card, and the
// odd one out on a card where the rest of the gate (mute · quiet hours · the
// sessions muted on their own) had lived on one line since A-22. It is the one
// control here that makes a sound the reader did not arm — a second chime some
// minutes after a question — so a policy three fields deep in a JSON box is the
// worst place for it to be.
{
    const p = open(fx.inUse());
    const html = p.html();
    ok('‼️ U-123 — the box is ABSORBED: no raw agentFarm.alerts.nudge control is'
        + ' left beside the strip that draws it',
        !/data-set="agentFarm\.alerts\.nudge"/.test(html)
        && !/id="c-agentFarm\.alerts\.nudge"/.test(html));
    ok('…and its three fields are ON THE GATE, where the rest of "will anything'
        + ' be heard" already lives',
        !!byId(p, 'alertnudgeon') && !!byId(p, 'alertnudgemin')
        && !!byId(p, 'alertnudgerep') && !!byId(p, 'alertnudgetone')
        && html.indexOf('id="alertnudgeon"') > html.indexOf('id="alertquietto"')
        && html.indexOf('id="alertnudgeon"') < html.indexOf('alertgate alertspeak'));
    ok('MIRROR — the boxes show what it is set to right now',
        byId(p, 'alertnudgeon').checked === true
        && byId(p, 'alertnudgemin').value === '4' && byId(p, 'alertnudgerep').value === '3');
    // ‼️ THE HEAD SAYS SO. This is the one control on the card that produces a
    // sound nobody armed; a badge is cheap and the surprise is not.
    ok('…and the card head says the nudge is on, beside the armed count rather'
        + ' than instead of it', /nudge 4m ×3 · 2 waiting/.test(html)
        && /2 of 5 events armed/.test(html));
    ok('what is waiting RIGHT NOW is on the strip — the figure that turns a'
        + ' policy into something visibly working', /2 waiting/.test(html));

    // Every gesture goes to the host, through the same function `alerts.nudge` is.
    const tone = byId(p, 'alertnudgetone');
    tone.value = 'tick-dry';
    tone.dispatchEvent(new p.sandbox.Event('change'));
    ok('the tone goes to the HOST on its own', last(p).type === 'alertNudge'
        && last(p).voice === 'tick-dry' && last(p).minutes === undefined);

    const min = byId(p, 'alertnudgemin');
    min.value = '10';
    min.dispatchEvent(new p.sandbox.Event('change'));
    ok('…and so does an edited wait, without disturbing the repeat',
        last(p).type === 'alertNudge' && last(p).minutes === '10'
        && last(p).repeat === undefined);

    // ‼️ EMPTIED IS NOT A NUMBER — sent through, it would come back as an error
    // the reader has to read in order to learn they deleted something.
    const before = sent(p).length;
    const rep = byId(p, 'alertnudgerep');
    rep.value = '  ';
    rep.dispatchEvent(new p.sandbox.Event('change'));
    ok('‼️ an emptied box is PUT BACK rather than sent as a refusal',
        sent(p).length === before && rep.value === '3');

    // ‼️ OFF IS `minutes: 0`, and switching back ON has to carry the numbers or
    // it would arm nothing — the setting has no fourth field saying "on".
    const sw = byId(p, 'alertnudgeon');
    sw.checked = false;
    sw.dispatchEvent(new p.sandbox.Event('change'));
    ok('the switch goes to the host as the setting\'s own way of saying off',
        last(p).type === 'alertNudge' && last(p).on === false);
    sw.checked = true;
    sw.dispatchEvent(new p.sandbox.Event('change'));
    ok('…and switching it back on carries the numbers with it',
        last(p).type === 'alertNudge' && last(p).on === true
        && last(p).minutes === '10' && last(p).repeat === '3');
}
{
    // Off is the shipped default, and the boxes still have to say what turning
    // it on would DO — an empty pair of numbers is not an answer.
    const p = open(fx.fresh());
    ok('a farm that has never used it draws the switch off, on the defaults',
        byId(p, 'alertnudgeon').checked === false
        && byId(p, 'alertnudgemin').value === '3' && byId(p, 'alertnudgerep').value === '2');
    ok('…and the head says nothing about a nudge that is off',
        !/nudge \d+m/.test(p.html()));
}
{
    // ‼️ THE PICKER OFFERS EXACTLY WHAT THE OP WILL ACCEPT. The host refuses a
    // tone nothing here plays BY NAME; a page that offered one would be asking
    // the reader to make a choice it knows will be rejected.
    const p = open(fx.broken());
    const html = p.html();
    const picker = html.slice(html.indexOf('id="alertnudgetone"'));
    const box = picker.slice(0, picker.indexOf('</select>'));
    ok('U-123 — an unplayable tone is drawn in the nudge picker and DISABLED,'
        + ' never dropped: a setting naming a missing sound must go on naming it',
        /disabled/.test(box) && /Kapı zili/.test(box));
    ok('…and it is the same list the event rows offer — one grouping, one set of'
        + ' refusals, because two would drift on the first change',
        /optgroup label="Built in"/.test(box) && /optgroup label="Your own"/.test(box));
}
{
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'settingsPanel.ts'), 'utf8');
    ok('settingsPanel handles alertNudge', panel.includes("case 'alertNudge':"));
    ok('‼️ …through the SAME host function `alerts.nudge` goes through, not a'
        + ' second way of writing the setting', /alertsSetNudge\?\.\(patch\)/.test(panel));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('…and the op calls it rather than owning the rule',
        /if \(touched\) \{\s*\n\s*await alertsSetNudge\(raw\);/.test(ext));
    ok('…where a tone nothing here plays is refused BY NAME — accepted, it would'
        + ' fall through to the event\'s own voice and look as though it took',
        /const alertsSetNudge[\s\S]{0,900}nothing on this machine plays/.test(ext));
}

// ---------------------------------------------------------------------------
// A-25 — THE ANNOUNCEMENT STRIP.
//
// ‼️ `agentFarm.alerts.speak` was the FOURTH raw JSON box on this card, and the
// worst of the four: seven fields, one of them a voice NAME that has to exist
// on this machine. A box cannot know whether it does — and the engine's answer
// to a name nothing answers to is a FAILED announcement (`exit 5`), by design,
// not a quiet fall back to English. So the one thing the box could never show
// is the one thing that decides whether the feature works at all.
{
    const p = open(fx.inUse());
    const html = p.html();
    ok('‼️ A-25 — the box is ABSORBED: no raw agentFarm.alerts.speak control is'
        + ' left beside the strip that draws it',
        !/data-set="agentFarm\.alerts\.speak"/.test(html));
    ok('the strip is on the card, below the gate and above the table — the two'
        + ' are read in the order they take effect: is anything heard at all,'
        + ' then what does it say',
        html.indexOf('alertgate alertspeak') > html.indexOf('id="alertmute"')
        && html.indexOf('alertgate alertspeak') < html.indexOf('<table class="settbl alerttbl">'));
    ok('‼️ WHICH VOICE THE SETTING ACTUALLY REACHES is the selected row, not the'
        + ' fragment the user typed — "Tolga" is a legal setting and no voice is'
        + ' called that, so a box keyed on the raw value would read "System'
        + ' default" on a machine about to speak Turkish',
        byId(p, 'alertspeakvoice').value === 'Microsoft Tolga - Turkish (Turkey)');
    ok('…and every row carries the LANGUAGE, which is what the choice is made on',
        /tr-TR · onecore/.test(html) && /en-US · sapi5/.test(html));
    ok('what will actually be SAID is on the strip, filled in — a template is a'
        + ' thing to read back, not to imagine',
        /developer, asking you/.test(html));
    ok('MIRROR — the switch and the numbers show what they are set to',
        byId(p, 'alertspeakon').checked === true
        && byId(p, 'alertspeakrate').value === '1'
        && byId(p, 'alertspeakvol').value === '100');
    ok('‼️ a conversation with a voice of ITS OWN is NAMED, not counted:'
        + ' "one session speaks Turkish" cannot be acted on without knowing which',
        /their own voice/.test(html) && /Microsoft Zira Desktop/.test(html));

    // Every gesture goes to the host, through the same function `alerts.speak`
    // is. The page holds no rule of its own about clamping, or about what a
    // partial change means.
    byId(p, 'alertspeakon').checked = false;
    byId(p, 'alertspeakon').dispatchEvent(new p.sandbox.Event('change'));
    ok('the switch is a host act', last(p).type === 'alertSpeak' && last(p).on === false);

    const sel = byId(p, 'alertspeakvoice');
    sel.value = 'Microsoft Mark - English (United States)';
    sel.dispatchEvent(new p.sandbox.Event('change'));
    ok('picking a voice writes its FULL name — the user\'s own act, never a'
        + ' silent rewrite of the fragment they typed',
        last(p).type === 'alertSpeak'
        && last(p).voice === 'Microsoft Mark - English (United States)');

    const rate = byId(p, 'alertspeakrate');
    rate.value = '4';
    rate.dispatchEvent(new p.sandbox.Event('change'));
    ok('the rate goes as a NUMBER, not as text',
        last(p).type === 'alertSpeak' && last(p).rate === 4);

    const tpl = byId(p, 'alertspeaktpl');
    const before = sent(p).length;
    tpl.value = '   ';
    tpl.dispatchEvent(new p.sandbox.Event('change'));
    ok('‼️ an emptied template is PUT BACK rather than sent: the host would'
        + ' restore the default and the reader would watch their sentence'
        + ' reappear without being told why',
        sent(p).length === before && tpl.value === '{agent}, {event}');

    byId(p, 'alertspeaktest').dispatchEvent(new p.sandbox.Event('click'));
    ok('‼️ ▶ sends NO text — the host reads back what the setting would say,'
        + ' filled in. The box\'s raw contents would be read out as'
        + ' "{agent}, {event}", the one sentence the feature never produces',
        last(p).type === 'alertSpeakTest' && last(p).text === undefined);

    const clear = p.query('[data-alertspeakclear]')[0];
    clear.dispatchEvent(new p.sandbox.Event('click'));
    ok('…and a session\'s own voice is cleared from the chip that named it',
        last(p).type === 'alertSpeakSession'
        && last(p).sessionId === 'c3d4e5f6-1111-2222-3333-444455556666');
}
{
    // ‼️ WHICH EVENTS ARE SPOKEN LIVES IN THE TABLE THAT ALREADY SAYS WHAT THEY
    // PLAY. `alerts.speak.events` is a list of the same five names; five more
    // ticks in the strip would be a second event table three lines from this
    // one, and the reader would have to match them up by name to answer "and
    // what happens on `question`?".
    const p = open(fx.inUse());
    const q = byAttr(p, 'alertsay', 'question');
    ok('A-25 — every event row carries its own 🗣 tick', !!q && q.checked === true);
    ok('…and an event nobody announces is shown unticked, not hidden',
        byAttr(p, 'alertsay', 'ended').checked === false);
    q.checked = false;
    q.dispatchEvent(new p.sandbox.Event('change'));
    ok('…and it is one act on one event, never a rewritten list',
        last(p).type === 'alertSpeak' && last(p).event === 'question'
        && last(p).on === false);
}
{
    const p = open(fx.broken());
    const html = p.html();
    ok('‼️ A-25 — A VOICE NAME NOTHING ANSWERS TO IS THE LOUDEST STATE ON THE'
        + ' STRIP. The announcement FAILS rather than reading out in English,'
        + ' and until this existed the only place to find that out was the'
        + ' moment the alert did not arrive',
        /no voice answers to that/.test(html) && /voice not found/.test(html));
    ok('…and the name is still SELECTED, so the reader can see what was asked for',
        byId(p, 'alertspeakvoice').value === 'Ayşe');
}
{
    // ‼️ NOT ASKED YET IS NOT "NO VOICES". The list costs a PowerShell process,
    // so an empty picker drawn before the answer arrives reads as "this machine
    // cannot speak" — the opposite of the truth.
    const p = open(fx.fresh());
    ok('A-25 — before the list arrives the box says it is READING, and is'
        + ' disabled rather than empty',
        /id="alertspeakvoice" disabled/.test(p.html())
        && /reading this machine's voices/.test(p.html()));
    ok('…and the page asks for it ONCE, by itself',
        sent(p).filter(m => m.type === 'alertSpeakVoices').length === 1);
    const rescan = byId(p, 'alertspeakrescan');
    rescan.dispatchEvent(new p.sandbox.Event('click'));
    ok('…with ↻ as the deliberate second ask, for the language pack installed'
        + ' a minute ago',
        last(p).type === 'alertSpeakVoices' && last(p).force === true);
}
{
    // ‼️ "NOTHING ANSWERS TO THAT" IS ONLY SAYABLE WHERE THE LIST IS
    // AUTHORITATIVE. Listing installed voices is Windows-only: on macOS
    // `say -v Yelda` works perfectly and the list comes back EMPTY WITH A
    // REASON. A warning keyed on "no match" alone would therefore call a
    // working setting broken on every machine that is not this one — the same
    // class of mistake as A-20's "install a language pack", which was advice
    // for a problem the user did not have.
    const d = fx.inUse();
    d.alerts.speak = {
        ...d.alerts.speak, voice: 'Yelda', resolved: '', resolvedName: '',
        voices: [], voicesLoaded: true,
        voicesError: 'listing installed voices is Windows-only; on darwin the'
            + ' system voice is used unless a name is set by hand'
    };
    const p = open(d);
    const html = p.html();
    ok('‼️ A-25 — an UNREADABLE list is not a wrong name: the strip says the'
        + ' platform cannot answer, and does not call the setting broken',
        !/no voice answers to that/.test(html) && !/voice not found/.test(html));
    ok('…the reason is shown rather than swallowed',
        /the voice list could not be read/.test(html));
    ok('…and the setting is still SELECTED, because a picker that silently'
        + ' drops the value it is set to is the box this strip replaced',
        byId(p, 'alertspeakvoice').value === 'Yelda');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
