// U-109 — the settings form and the settings table, DRIVEN.
//
// `test_setting_shape.js` pins what the page is made of; this one presses its
// buttons and reads what leaves. The distinction matters, because every defect
// this feature could ship is a defect of BEHAVIOUR: a draft that saves when it
// should not, a redraw that throws away a typed cell, a required field accepted
// empty, and — the one that would be worst — a key the schema does not declare
// being deleted by the build that does not know about it.
//
// ‼️ THE MODEL IS BUILT FROM THE REAL MANIFEST (see the fixture). A form
// assembled from invented fields would prove nothing about the settings the
// user actually has.
const path = require('path');

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const fx = require(path.join(__dirname, 'fixtures', 'jsonsettings.js'));
const open = () => runPage(fx.script, fx.data());

/** The page's own way to a box. `els` is filled lazily, as the markup is
 *  walked, so a test reaching into it directly reads a dictionary the page has
 *  not written yet — and gets `undefined` for a box that is really there. */
const el = (p, id) => p.sandbox.document.getElementById(id);

/** The one control a gesture lives on. */
const btn = (p, attr, key) =>
    p.query(`[data-${attr}]`).find(b => b.dataset[attr] === key);

/** U-227 — 'Edit it as JSON' is on the row's right-click menu: the relay the menu sends the page. */
const asJson = (p, key) => p.send({ type: 'afctx', act: 'stJson', ctx: { setKey: key } });

{
    const p = open();
    const ctx = p.contexts().filter(c => c.webviewSection === 'afSettingRow');
    const of = key => ctx.find(c => c.setKey === key) || {};
    ok('U-227 — a row with a list, form, table or pairs editor offers "Edit it as JSON" on its right-click',
        of('agentFarm.taskRetry').afJson === true && of('agentFarm.browserAllowHosts').afJson === true
        && of('agentFarm.budgets').afJson === true);
    ok('…and the row itself no longer carries the link', !/>Edit as JSON</.test(p.html()));
    asJson(p, 'agentFarm.budgets');
    const now = p.contexts().find(c => c.setKey === 'agentFarm.budgets') || {};
    ok('…which a row already showing its JSON box does not offer', now.afJson === false && /data-json="agentFarm.budgets"/.test(p.html()));
}

// ---------------------------------------------------------------------------
// the form — one object whose sixteen fields the manifest declares
// ---------------------------------------------------------------------------
{
    const p = open();
    const html = p.html();
    ok('taskRetry is drawn as a form, one box per field, not as a JSON textarea',
        /id="f-taskRetry-max"/.test(html) && /id="f-taskRetry-backoff"/.test(html)
        && !/id="c-taskRetry"/.test(html));
    ok('…and every field the schema declares got a box',
        ['max', 'delayMin', 'delay2Min', 'delay3Min', 'backoff', 'formula', 'capMin',
            'resetAware', 'safetyBufferMin', 'when', 'prompt', 'behavior',
            'continuationPrompt', 'continuationPrompt2', 'continuationPromptLater',
            'unknownProgressFallback']
            .every(f => html.indexOf(`id="f-taskRetry-${f}"`) >= 0));

    // What is stored is what is shown — the other half of "a live value beside a
    // derived shape is the whole reading".
    ok('the stored value is IN the boxes', el(p, 'f-taskRetry-max').value === '3'
        && el(p, 'f-taskRetry-delayMin').value === '30'
        && el(p, 'f-taskRetry-when').value === 'limit');
    ok('‼️ …and a field that is NOT stored reads empty rather than as its default —'
        + ' the two are different answers, and only one of them is the user’s',
        el(p, 'f-taskRetry-capMin').value === ''
        && el(p, 'f-taskRetry-backoff').value === '');

    // ‼️ A BOOLEAN IS THREE-WAY. An unticked checkbox cannot say "not set", and
    // here "not set" and "false" are opposite answers.
    ok('‼️ a boolean field can say "not set", which a checkbox cannot',
        /<select id="f-taskRetry-resetAware"[^>]*>[\s\S]{0,400}?<option value="false"/.test(html)
        && el(p, 'f-taskRetry-resetAware').value === ''
        && !/id="f-taskRetry-resetAware"[^>]*type="checkbox"/.test(html));

    el(p, 'f-taskRetry-capMin').value = '120';
    el(p, 'f-taskRetry-backoff').value = 'double';
    btn(p, 'fapply', 'agentFarm.taskRetry').click();
    const sent = p.last();
    ok('‼️ Save the form sends a REAL OBJECT, not text — what the user assembled'
        + ' cannot fail to parse',
        sent.type === 'set' && sent.key === 'agentFarm.taskRetry'
        && sent.value && typeof sent.value === 'object' && !Array.isArray(sent.value));
    ok('…carrying what was typed, typed: a number field arrives as a number',
        sent.value.capMin === 120 && sent.value.backoff === 'double');
    ok('…and what was already there survives an edit to one field',
        sent.value.max === 3 && sent.value.delayMin === 30 && sent.value.when === 'limit');
    ok('‼️ …while a field left empty is LEFT OUT, so its own default stays in'
        + ' charge. A form that wrote all sixteen would turn one edit into'
        + ' fifteen overrides nobody asked for',
        !('formula' in sent.value) && !('resetAware' in sent.value)
        && !('prompt' in sent.value) && Object.keys(sent.value).length === 5);
}

// a number box typed into with words is refused IN WORDS, not written as NaN
{
    const p = open();
    el(p, 'f-taskRetry-capMin').value = 'soon';
    btn(p, 'fapply', 'agentFarm.taskRetry').click();
    ok('‼️ a number field with words in it is refused rather than saved as NaN',
        !p.posted.some(m => m.type === 'set' && m.key === 'agentFarm.taskRetry'));
    ok('…and the page says which field and why', /capMin has to be a number/.test(p.html()));
}

// ---------------------------------------------------------------------------
// the table — a list of entries whose fields the manifest declares
// ---------------------------------------------------------------------------
{
    const p = open();
    const html = p.html();
    ok('cliProfiles is drawn as a table, one row per entry',
        /id="rr-cliProfiles-0"/.test(html) && /id="r-cliProfiles-0-name"/.test(html));
    ok('…and livingChecks — the last box the schema refused to describe — with it',
        /id="rr-livingChecks-0"/.test(html) && /id="rr-livingChecks-1"/.test(html));
    ok('the stored entries are IN the cells',
        el(p, 'r-cliProfiles-0-name').value === 'gece-tarayici'
        && el(p, 'r-livingChecks-0-label').value === 'bugünün günlüğü yazıldı'
        && el(p, 'r-livingChecks-1-level').value === 'warn');
    ok('‼️ a field the schema does not flatten keeps its JSON in ONE CELL rather'
        + ' than pretending to be a text field',
        el(p, 'r-livingChecks-0-when').value
        === '{"kind":"fileMissing","path":"01_INBOX/{today}.md"}');

    ok('‼️ a required column is marked where it is asked for',
        /label<b class="req">\*<\/b>/.test(html) && /when<b class="req">\*<\/b>/.test(html));

    el(p, 'r-livingChecks-1-hint').value = 'Gelen kutusunu boşalt.';
    btn(p, 'rapply', 'agentFarm.livingChecks').click();
    const sent = p.last();
    ok('‼️ Save the table sends a REAL ARRAY OF OBJECTS',
        sent.type === 'set' && sent.key === 'agentFarm.livingChecks'
        && Array.isArray(sent.value) && sent.value.length === 2);
    ok('…the JSON cell arrives PARSED, as the object it names',
        sent.value[0].when && sent.value[0].when.kind === 'fileMissing'
        && sent.value[0].when.path === '01_INBOX/{today}.md');
    ok('…and the edit is in it, beside everything that was already there',
        sent.value[1].hint === 'Gelen kutusunu boşalt.'
        && sent.value[1].label === 'gelen kutusu boşaltıldı'
        && sent.value[1].level === 'warn');
    ok('‼️ …with the empty optional columns left OUT rather than written as ""',
        !('detail' in sent.value[0]) && !('okDetail' in sent.value[0]));
}

// ‼️ THE SILENT LOSS. `cliProfiles`' stored entry carries `command`, which this
// manifest does not declare — an older build wrote it. Rebuilding the entry out
// of the declared fields alone would DELETE it without a word, which is worse
// than the JSON box this replaced ever was.
{
    const p = open();
    ok('the fixture really does hold a key the schema does not declare, or this'
        + ' proves nothing',
        fx.data().categories[0].items.find(i => i.key === 'agentFarm.cliProfiles')
            .value[0].command !== undefined);
    el(p, 'r-cliProfiles-0-headless').value = 'my-cli --headless';
    btn(p, 'rapply', 'agentFarm.cliProfiles').click();
    const sent = p.last();
    ok('‼️ a key the schema does not name SURVIVES the round trip — a build that'
        + ' does not know about a key must not be the build that deletes it',
        sent.value[0].command === 'my-cli --headless "{prompt}"');
    ok('…alongside the declared fields, edited and unedited',
        sent.value[0].name === 'gece-tarayici'
        && sent.value[0].headless === 'my-cli --headless');
}

// a required field left empty is refused, naming the row and the field
{
    const p = open();
    el(p, 'r-livingChecks-0-label').value = '';
    btn(p, 'rapply', 'agentFarm.livingChecks').click();
    ok('‼️ a required column left empty is refused rather than saved as a hole',
        !p.posted.some(m => m.type === 'set' && m.key === 'agentFarm.livingChecks'));
    ok('…and the page says WHICH ROW and which field', /row 1: label is required/.test(p.html()));
}

// ---------------------------------------------------------------------------
// ‼️ NOTHING SAVES EXCEPT THE BUTTON THAT SAYS IT SAVES, and every structural
// gesture reads the boxes FIRST — type a price, press + on the row above, and
// without that read the price is gone. This is the lesson U-108 learned on the
// list and the composer learned on its rounds.
// ---------------------------------------------------------------------------
{
    const p = open();
    el(p, 'r-livingChecks-0-hint').value = 'yazıldı ama kaydedilmedi';
    btn(p, 'radd', 'agentFarm.livingChecks').click();
    ok('‼️ + add saves NOTHING — a table half-edited and abandoned leaves the'
        + ' setting exactly as it was',
        !p.posted.some(m => m.type === 'set'));
    ok('…it adds an empty row to the draft', !!el(p, 'rr-livingChecks-2'));
    ok('‼️ …and the cell typed into but not committed SURVIVED the redraw',
        el(p, 'r-livingChecks-0-hint').value === 'yazıldı ama kaydedilmedi');
    ok('‼️ …including the pickers, which have no value attribute to survive on',
        el(p, 'r-livingChecks-0-level').value === 'alert');

    btn(p, 'rdel', 'agentFarm.livingChecks').click();   // drops row 0
    ok('✕ saves nothing either', !p.posted.some(m => m.type === 'set'));
    ok('‼️ …and the row that moved UP brought its own cells with it, rather than'
        + ' the page redrawing stale ones',
        el(p, 'r-livingChecks-0-label').value === 'gelen kutusu boşaltıldı');

    btn(p, 'rapply', 'agentFarm.livingChecks').click();
    const sent = p.last();
    ok('…and the empty row + left behind is dropped rather than refused as a'
        + ' required field nobody filled in',
        Array.isArray(sent.value) && sent.value.length === 1
        && sent.value[0].label === 'gelen kutusu boşaltıldı');
}

{
    const p = open();
    el(p, 'f-taskRetry-capMin').value = '99';
    asJson(p, 'agentFarm.taskRetry');
    ok('‼️ the JSON box is one click away and comes back — a value the schema'
        + ' cannot describe is always possible',
        !!el(p, 'c-taskRetry'));
    ok('‼️ …and what was typed goes WITH it: switching view is not a reason to'
        + ' lose an edit',
        /"capMin": 99/.test(el(p, 'c-taskRetry').value));
    ok('…nothing was saved by looking at it',
        !p.posted.some(m => m.type === 'set'));

    el(p, 'c-taskRetry').value = '{ not json';
    btn(p, 'fform', 'agentFarm.taskRetry').click();
    ok('‼️ a JSON that does not parse is REFUSED rather than turned into a form'
        + ' of braces, and the box stays where the user can fix it',
        !!el(p, 'c-taskRetry')
        && /does not parse, so it cannot be shown as fields/.test(p.html()));

    el(p, 'c-taskRetry').value = '{"max": 9, "behavior": "smart"}';
    btn(p, 'fform', 'agentFarm.taskRetry').click();
    ok('…and a JSON that does parse comes back as fields, carrying what it said',
        !!el(p, 'f-taskRetry-max') && el(p, 'f-taskRetry-max').value === '9'
        && el(p, 'f-taskRetry-behavior').value === 'smart');
}

// ---------------------------------------------------------------------------
// ‼️ THE DEFECT U-108 SHIPPED, and the reason a behaviour test exists at all.
//
// "Edit as JSON" read the rows carefully into the draft and then drew the
// textarea from the STORED value — so everything typed since the last save was
// silently replaced the moment the user asked to see it as JSON. The link
// promises the opposite in its own tooltip, and every string assertion about it
// passed, because the markup was right and only the value was wrong.
// ---------------------------------------------------------------------------
{
    const p = open();
    el(p, 'l-browserAllowHosts-0').value = 'yazildi.ama.kaydedilmedi';
    asJson(p, 'agentFarm.browserAllowHosts');
    ok('‼️ a LIST switched to JSON carries what was typed into the box, rather'
        + ' than replacing it with what was last saved',
        /yazildi\.ama\.kaydedilmedi/.test(el(p, 'c-browserAllowHosts').value));
    ok('…and looking at it saved nothing', !p.posted.some(m => m.type === 'set'));

    btn(p, 'llist', 'agentFarm.browserAllowHosts').click();
    ok('…and it comes back the same way',
        el(p, 'l-browserAllowHosts-0').value === 'yazildi.ama.kaydedilmedi');
}

// ---------------------------------------------------------------------------
// ‼️ U-139 — THE LIST EDITOR ANSWERS THE HAND, and the page keeps its place.
//
// Reported as "you press enter and nothing happens, you press the json link and
// nothing happens". Both controls worked. Enter was bound to nothing at all,
// and every redraw threw the reader back to the top of the longest page in the
// extension — so the JSON box appeared two screens below where they were
// looking and the press read as dead. A string test cannot see either of these.
// ---------------------------------------------------------------------------
{
    const p = open();
    const row = el(p, 'l-browserAllowHosts-0');
    row.value = 'yeni.host.example';
    row.fire('keydown', { key: 'Enter' });
    const sent = p.posted.filter(m => m.type === 'set' && m.key === 'agentFarm.browserAllowHosts');
    ok('‼️ Enter in a row SAVES the list — the key a single-line box is expected'
        + ' to answer was bound to nothing', sent.length === 1);
    ok('…and it carries what is being typed RIGHT NOW, not what was last saved —'
        + ' `change` has not fired yet, so the boxes are read directly',
        sent.length === 1 && Array.isArray(sent[0].value)
        && sent[0].value[0] === 'yeni.host.example');

    // Any other key is not a save: a list being typed into must not write the
    // setting on every letter.
    const p2 = open();
    el(p2, 'l-browserAllowHosts-0').fire('keydown', { key: 'a' });
    ok('…and no other key saves anything', !p2.posted.some(m => m.type === 'set'));
}

{
    // ‼️ THE SAME KEY IN ALL FOUR EDITORS. The defect was never about lists:
    // the form, the table and the pair editor each had one button and no other
    // door, and a reader who pressed Enter in any of them got silence.
    const pf = open();
    el(pf, 'f-taskRetry-capMin').value = '120';
    el(pf, 'f-taskRetry-capMin').fire('keydown', { key: 'Enter' });
    const f = pf.posted.filter(m => m.type === 'set' && m.key === 'agentFarm.taskRetry');
    ok('‼️ Enter in a FORM field saves the form', f.length === 1 && f[0].value.capMin === 120);

    const pr = open();
    el(pr, 'r-cliProfiles-0-headless').value = 'my-cli --headless';
    el(pr, 'r-cliProfiles-0-headless').fire('keydown', { key: 'Enter' });
    const r = pr.posted.filter(m => m.type === 'set' && m.key === 'agentFarm.cliProfiles');
    ok('‼️ Enter in a TABLE cell saves the table',
        r.length === 1 && Array.isArray(r[0].value)
        && r[0].value[0].headless === 'my-cli --headless');

    const pm = open();
    el(pm, 'm-budgets-0-v').value = '35';
    el(pm, 'm-budgets-0-v').fire('keydown', { key: 'Enter' });
    const m = pm.posted.filter(x => x.type === 'set' && x.key === 'agentFarm.budgets');
    ok('‼️ Enter in a PAIR box saves the pairs',
        m.length === 1 && m[0].value.developer === 35);

    // A refusal is still a refusal from this door — Enter is another way in,
    // not a way past the checks.
    const pbad = open();
    el(pbad, 'm-budgets-0-k').value = '';
    el(pbad, 'm-budgets-0-v').fire('keydown', { key: 'Enter' });
    ok('…and Enter does not walk past a refusal the button would have shown',
        !pbad.posted.some(x => x.type === 'set')
        && /needs a name/.test(pbad.html()));
}

{
    // ‼️ THE PLACE ON THE PAGE. `render()` replaces the whole of #app; the
    // reader was two thirds of the way down when they pressed the control.
    const p = open();
    const moved = [];
    p.sandbox.window.scrollY = 900;
    p.sandbox.window.scrollTo = (x, y) => { moved.push(y); };
    asJson(p, 'agentFarm.browserAllowHosts');
    ok('‼️ "Edit as JSON" leaves the reader where they were standing — a redraw'
        + ' that jumps to the top is read as a link that did nothing',
        moved.length === 1 && moved[0] === 900);
    ok('…and the box it promised is really there',
        !!el(p, 'c-browserAllowHosts'));

    const p3 = open();
    const moved3 = [];
    p3.sandbox.window.scrollY = 0;
    p3.sandbox.window.scrollTo = (x, y) => { moved3.push(y); };
    // ‼️ U-108's rule, DRIVEN rather than spelled: a row typed into and not yet
    // committed lives only in the DOM, so a structural gesture that did not read
    // the boxes first would throw the typing away. test_setting_shape.js pins
    // the line; this proves the lesson.
    el(p3, 'l-browserAllowHosts-1').value = 'typed.not.saved';
    btn(p3, 'ladd', 'agentFarm.browserAllowHosts').click();
    ok('…and a reader already at the top is not scrolled at all', moved3.length === 0);
    ok('‼️ + add puts the caret in the row it just made, which is also how the'
        + ' press proves it landed',
        p3.sandbox.document.activeElement
        && p3.sandbox.document.activeElement.id === 'l-browserAllowHosts-2');
    ok('‼️ …and adding a row keeps what was typed into the rows already there',
        el(p3, 'l-browserAllowHosts-1').value === 'typed.not.saved'
        && el(p3, 'l-browserAllowHosts-2').value === '');
    ok('…and it saved nothing — adding acts on the draft',
        !p3.posted.some(m => m.type === 'set'));
}

// ---------------------------------------------------------------------------
// ‼️ U-142 — THE ESCAPE HATCH LETS GO WHEN THE SAVE LANDS, AND ONLY THEN.
//
// `Edit as JSON` set `jsonMode` and nothing ever cleared it, so a setting the
// schema describes completely stayed a raw textarea for the rest of the
// session once it had been applied once. Clearing it on Apply is only half the
// answer: the host parses the text and answers `error` when it cannot, and a
// reader thrown out of the box AND robbed of what they typed is worse than the
// lock was.
// ---------------------------------------------------------------------------
{
    const p = open();
    asJson(p, 'agentFarm.browserAllowHosts');
    el(p, 'c-browserAllowHosts').value = '["one.example", "two.example"]';
    btn(p, 'apply', 'agentFarm.browserAllowHosts').click();
    ok('applying the raw JSON sends the text to the host',
        p.last() && p.last().type === 'set'
        && p.last().key === 'agentFarm.browserAllowHosts');
    // The host answers a successful save with a redraw carrying the new value.
    p.send({
        type: 'data',
        data: { categories: fx.data().categories }
    });
    ok('‼️ …and once it lands the setting is back in its own editor, not stuck'
        + ' as a textarea for the rest of the session',
        /id="l-browserAllowHosts-0"/.test(p.html())
        && !/id="c-browserAllowHosts"/.test(p.html()));

    const pbad = open();
    asJson(pbad, 'agentFarm.browserAllowHosts');
    el(pbad, 'c-browserAllowHosts').value = '["broken", ';
    btn(pbad, 'apply', 'agentFarm.browserAllowHosts').click();
    pbad.send({
        type: 'error', key: 'agentFarm.browserAllowHosts',
        error: 'that is not JSON'
    });
    ok('‼️ a REFUSED apply stays in the box it came from',
        /id="c-browserAllowHosts"/.test(pbad.html()));
    ok('‼️ …with the text that was refused still in it — a mistyped brace must'
        + ' not cost the reader everything they wrote',
        el(pbad, 'c-browserAllowHosts').value === '["broken", ');
    ok('…and the refusal is on screen', /that is not JSON/.test(pbad.html()));

    // ‼️ RESET IS THE OTHER DOOR OUT OF THE RAW BOX, and it needs no waiting:
    // it only removes a key and cannot be refused. Leaving `jsonMode` set there
    // kept the setting a textarea with nothing left in it to show.
    const pr = open();
    asJson(pr, 'agentFarm.browserAllowHosts');
    ok('the raw box is up before the reset',
        /id="c-browserAllowHosts"/.test(pr.html()));
    btn(pr, 'reset', 'agentFarm.browserAllowHosts').click();
    ok('…having asked the host to remove the key',
        pr.last() && pr.last().type === 'reset'
        && pr.last().key === 'agentFarm.browserAllowHosts');
    // The host removes the key and the config change brings the redraw back.
    pr.send({ type: 'data', data: { categories: fx.data().categories } });
    ok('‼️ …and a reset leaves the raw box as well as the value',
        !/id="c-browserAllowHosts"/.test(pr.html())
        && /id="l-browserAllowHosts-0"/.test(pr.html()));
}

// ---------------------------------------------------------------------------
// ‼️ U-141 — AND THE CARET GOES INTO THE ROW THAT WAS JUST MADE, in the table
// and the pair editor as well as the list. A page that redraws itself gives no
// other sign that the press landed.
// ---------------------------------------------------------------------------
{
    const p = open();
    el(p, 'r-livingChecks-0-label').value = 'typed.not.saved';
    btn(p, 'radd', 'agentFarm.livingChecks').click();
    ok('‼️ + add on a TABLE puts the caret in the new row’s first declared field',
        p.sandbox.document.activeElement
        && p.sandbox.document.activeElement.id === 'r-livingChecks-2-label');
    ok('…and the cells already typed into survive it',
        el(p, 'r-livingChecks-0-label').value === 'typed.not.saved');
    ok('…and it saved nothing', !p.posted.some(m => m.type === 'set'));

    const pm = open();
    el(pm, 'm-budgets-0-v').value = '41';
    btn(pm, 'madd', 'agentFarm.budgets').click();
    ok('‼️ + add on a PAIR editor puts the caret in the NAME box — the one that'
        + ' cannot be left empty',
        pm.sandbox.document.activeElement
        && pm.sandbox.document.activeElement.id === 'm-budgets-2-k');
    ok('…and the pairs already typed into survive it',
        el(pm, 'm-budgets-0-v').value === '41');
}

// ---------------------------------------------------------------------------
// ‼️ U-139 — ENTER LETS GO OF A ONE-LINE SCALAR BOX, which is how it saves:
// these settings commit on `change`, and `change` fires on blur.
// ---------------------------------------------------------------------------
{
    // The JSON-shaped fixture draws no scalar settings at all, so the scene
    // that has them is the one this claim has to be made in.
    const tg = require(path.join(__dirname, 'fixtures', 'tgsettings.js'));
    const p = runPage(tg.script, typeof tg.data === 'function' ? tg.data() : tg.data);
    const box = p.query('[data-set]').find(e =>
        String(e.tagName || '').toUpperCase() === 'INPUT');
    ok('there is a scalar box on the page to test', !!box);
    if (box) {
        let blurred = 0;
        const realBlur = box.blur;
        box.blur = function () { blurred++; if (realBlur) { realBlur.call(box); } };
        box.fire('keydown', { key: 'Enter' });
        ok('‼️ Enter releases the box, so its own change handler commits the value',
            blurred === 1);
        box.fire('keydown', { key: 'a' });
        ok('…and no other key does', blurred === 1);
    }
}

{
    // ‼️ THE FILE THIS PAGE IS A VIEW OF, from the page itself.
    const p = open();
    const open1 = el(p, 'opensettingsjson');
    ok('the header offers the settings.json the boxes write into',
        p.html().indexOf('id="opensettingsjson"') >= 0);
    open1.click();
    ok('…and pressing it asks the host for that file',
        p.last() && p.last().type === 'openSettingsJson');
    p.send({ type: 'afctx', act: 'stShowJson', ctx: { setKey: 'agentFarm.budgets' } });
    ok('U-227 — "Show it in settings.json" on a row asks for the file AT that key',
        p.last() && p.last().type === 'openSettingsJson' && p.last().key === 'agentFarm.budgets');
    const host = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'panels', 'settingsValueMessages.ts'), 'utf8');
    ok('…and the host opens it there (VS Code\'s own revealSetting)',
        /'workbench\.action\.openSettingsJson',\s*\.\.\.\(typeof msg\.key === 'string' && msg\.key \? \[\{ revealSetting: \{ key: msg\.key \} \}\] : \[\]\)/.test(host));
}

// ---------------------------------------------------------------------------
// ‼️ U-110 — THE THREE SETS OF NAME → VALUE PAIRS, DRIVEN.
//
// Nothing can list a map's keys, which is why all three were left as a JSON
// textarea — and it is the wrong conclusion. The KEY is free; the PAIR is not.
// Setting a budget meant hand-writing `{"developer": 20}` including the brace,
// the quote and the colon, and getting the agent's name right from memory, with
// a misfiled name failing silently for ever.
// ---------------------------------------------------------------------------
{
    const p = open();
    const html = p.html();
    ok('budgets is drawn as pairs, not as a JSON box',
        /id="m-budgets-0-k"/.test(html) && /id="m-budgets-0-v"/.test(html)
        && !/id="c-budgets"/.test(html));
    ok('the stored pairs are IN the boxes',
        el(p, 'm-budgets-0-k').value === 'developer'
        && el(p, 'm-budgets-0-v').value === '20'
        && el(p, 'm-budgets-1-k').value === '*'
        && el(p, 'm-budgets-1-v').value === '50');

    // ‼️ THE THREE MAPS DO NOT AGREE, and each box proves its own schema read.
    ok('‼️ a name → NUMBER map gets number boxes',
        /id="m-budgets-0-v"[^>]*type="number"|<input type="number" id="m-budgets-0-v"/.test(html));
    ok('‼️ …while a name → BOOLEAN map gets a yes/no picker, and it can still say'
        + ' "not set"',
        /<select id="m-superpowersDefaults-0-v"/.test(html)
        && el(p, 'm-superpowersDefaults-0-v').value === 'true'
        && el(p, 'm-superpowersDefaults-1-v').value === 'false');

    // ‼️ THE NAME BOX SUGGESTS AND DOES NOT CONSTRAIN.
    ok('‼️ the fleet the page is already holding is offered as suggestions',
        /<datalist id="dl-budgets">[\s\S]*?<option value="developer">/.test(html)
        && /<option value="asistan">/.test(html));
    ok('‼️ …with `*` offered where it MEANS something, and only there — the'
        + ' superpowers map is an exact name match and a `*` in it does nothing',
        /<datalist id="dl-budgets"><option value="\*">/.test(html)
        && !/<datalist id="dl-superpowersDefaults"><option value="\*">/.test(html));
    ok('…and the box is a text input, so a name nobody has yet is still typeable',
        /<input type="text" id="m-budgets-0-k"[^>]*list="dl-budgets"/.test(html));

    el(p, 'm-budgets-0-v').value = '35';
    btn(p, 'mapply', 'agentFarm.budgets').click();
    const sent = p.last();
    ok('‼️ Save the pairs sends a REAL OBJECT, keyed by what was typed',
        sent.type === 'set' && sent.key === 'agentFarm.budgets'
        && sent.value.developer === 35 && sent.value['*'] === 50);
    ok('…with the number typed, not left as text',
        typeof sent.value.developer === 'number');
}

// the refusals a pair editor owes: a nameless value, a valueless name, a name twice
{
    const p = open();
    btn(p, 'madd', 'agentFarm.budgets').click();
    ok('‼️ + add saves nothing and leaves an empty pair in the draft',
        !p.posted.some(m => m.type === 'set') && !!el(p, 'm-budgets-2-k'));
    ok('…and the edit that was in flight survived the redraw',
        el(p, 'm-budgets-0-k').value === 'developer');

    btn(p, 'mapply', 'agentFarm.budgets').click();
    ok('…an empty pair is dropped rather than refused — it is what + leaves behind',
        p.last().value && Object.keys(p.last().value).length === 2);
}
{
    const p = open();
    el(p, 'm-budgets-0-k').value = '';
    btn(p, 'mapply', 'agentFarm.budgets').click();
    ok('‼️ a value with no name is refused', !p.posted.some(m => m.type === 'set'));
    ok('…in words the reader can act on', /a value needs a name/.test(p.html()));
}
{
    const p = open();
    el(p, 'm-budgets-0-v').value = '';
    btn(p, 'mapply', 'agentFarm.budgets').click();
    ok('‼️ a name with no value is refused too — "" would file a budget of nothing'
        + ' under a real agent, which looks set and does nothing',
        !p.posted.some(m => m.type === 'set')
        && /developer has no value/.test(p.html()));
}
{
    const p = open();
    el(p, 'm-budgets-1-k').value = 'developer';
    btn(p, 'mapply', 'agentFarm.budgets').click();
    ok('‼️ the same name twice is refused rather than one silently eating the other',
        !p.posted.some(m => m.type === 'set')
        && /developer is in the list twice/.test(p.html()));
}
{
    const p = open();
    el(p, 'm-budgets-0-v').value = 'yirmi';
    btn(p, 'mapply', 'agentFarm.budgets').click();
    ok('…and a figure typed in words is refused, naming the pair',
        !p.posted.some(m => m.type === 'set')
        && /developer: has to be a number/.test(p.html()));
}

// …and the JSON box, both ways, carrying what is on screen
{
    const p = open();
    el(p, 'm-budgets-0-v').value = '77';
    asJson(p, 'agentFarm.budgets');
    ok('‼️ a map switched to JSON carries what was typed, rather than replacing it'
        + ' with what was last saved',
        /"developer": 77/.test(el(p, 'c-budgets').value));
    ok('…and looking at it saved nothing', !p.posted.some(m => m.type === 'set'));

    el(p, 'c-budgets').value = '{"asistan": 5}';
    btn(p, 'mpairs', 'agentFarm.budgets').click();
    ok('…and it comes back as pairs, carrying what the box said',
        el(p, 'm-budgets-0-k').value === 'asistan'
        && el(p, 'm-budgets-0-v').value === '5');
}

// ---------- ‼️ X-196 — THE HOVER THAT REPEATED THE ROW ----------
//
// A declared field's description is drawn on one ellipsised line, so a hover
// is right — but it was a native `title` carrying the IDENTICAL string, which
// is the exact thing the panel component was built to replace: the platform
// tooltip repeats what is already on the row and then stops wherever it feels
// like stopping. The cut line is the SHORTHAND; the panel is the sentence.
{
    const p = open();
    const h = p.sandbox.document.getElementById('app').innerHTML;
    ok('‼️ X-196: a field description is no longer a native title repeating its own row',
        !/class="setfdesc" title=/.test(h));
    ok('…it is an AFTip, which can be read whole and scrolled',
        h.includes('setfdescw') && h.includes('af-tipb'));
    // ‼️ THE WRAPPER TAKES THE SIZING. Wrapping the line makes the WRAPPER the
    // flex child, so a column sized by the line's own rule silently stops
    // being sized at all — the same trap `AFTip.label` exists for.
    ok('…and the wrapper is what the row lays out, so the column keeps its width',
        /class="setfdescw af-tipw"|class="af-tipw setfdescw"/.test(h)
        || h.includes('af-tipw setfdescw') || h.includes('setfdescw af-tipw'));
}

// ---------- U-143 — the filter box, and the two sections that answered it themselves ----------
/*
 * ‼️ THE SECTIONS THAT ARE NOT MADE OF SETTING ROWS HAD NEVER BEEN DRAWN IN A
 * PAGE TEST. `jsonsettings` carries `engines: null, docOpen: null`, so the only
 * two hand-rolled filter gates on the page were unmeasured — which is how one
 * of them stayed case-sensitive and the other kept a list of engine names that
 * had never heard of `opencode`. They answer the page's own grammar now, over
 * text derived from the data, so neither can go stale again.
 */
const ENGINES = [
    {
        id: 'claude', label: 'Claude Code', ready: true, next: 'Nothing to do.',
        cli: { command: 'claude', found: true, path: 'C:/bin/claude.cmd' },
        auth: { mode: 'subscription', detail: 'Signed in on a plan', file: '.claude/.credentials.json' },
        key: { env: 'ANTHROPIC_API_KEY', inVault: false }
    },
    {
        id: 'opencode', label: 'OpenCode', ready: true, next: 'Nothing to do.',
        cli: { command: 'opencode', found: true, path: 'C:/bin/opencode.cmd' },
        auth: { mode: 'builtin', detail: 'Runs on its own provider' },
        key: {}
    }
];
const DOCOPEN = {
    defaultMode: 'obsidian', modes: ['vscode', 'preview', 'obsidian', 'custom'],
    customCommand: 'notepad.exe', customArgs: ''
};
/** The same page, with the two data-backed sections actually present. */
const openFull = () => runPage(fx.script,
    Object.assign(fx.data(), { engines: ENGINES, docOpen: DOCOPEN }));

/** Type into the filter box the way a keystroke does, with the caret somewhere. */
const typeFilter = (p, text, caret) => {
    const box = el(p, 'filter');
    box.value = text;
    box.selectionStart = box.selectionEnd = caret == null ? text.length : caret;
    box.fire('input');
};

{
    const p = openFull();
    ok('both data-backed sections draw when nothing is filtered',
        p.html().includes('id="cat-engines"') && p.html().includes('id="cat-docopen"'));

    // ‼️ The defect, in the user's own words: typing the name of the section
    // hid the section. `DOCOPEN_TERMS.includes(filter)` compared case-sensitively.
    typeFilter(p, 'Obsidian');
    ok('‼️ U-143: `Obsidian` no longer HIDES the section that word names',
        p.html().includes('id="cat-docopen"'));

    typeFilter(p, 'obsidian');
    ok('…and lower case still finds it, as it always did',
        p.html().includes('id="cat-docopen"'));
}

{
    const p = openFull();
    // ‼️ The engine list was a hand-typed string. `opencode` was added to the
    // product after somebody wrote it, so it was the one engine you could not
    // search for — and the gate is derived from DATA.engines now.
    typeFilter(p, 'opencode');
    ok('‼️ U-143: an engine added after the terms string was written is searchable',
        p.html().includes('id="cat-engines"'));

    typeFilter(p, 'Claude Code');
    ok('…and so is an engine by its label, whatever its case',
        p.html().includes('id="cat-engines"'));

    typeFilter(p, 'zzzznothing');
    ok('…while a word that matches nothing still hides it',
        !p.html().includes('id="cat-engines"'));
}

{
    // The gate is the page's grammar, not a substring test in the wrong
    // direction: an exclusion used to hide every section on the page.
    const p = openFull();
    typeFilter(p, '-zzzznothing');
    ok('‼️ U-143: an exclusion no longer hides the sections wholesale',
        p.html().includes('id="cat-engines"') && p.html().includes('id="cat-docopen"'));
}

{
    /*
     * ‼️ THE CARET. Every keystroke redraws #app, so the box under the hand is
     * destroyed and rebuilt; the caret was put back at the END, which made the
     * box append-only — correcting a typo in the middle of a query threw the
     * caret past the last character on the very next letter.
     */
    const p = openFull();
    typeFilter(p, 'obsidian markdown', 8);
    const box = el(p, 'filter');
    ok('‼️ U-143: the caret stays where the reader put it, mid-text',
        box.selectionStart === 8 && box.selectionEnd === 8);

    typeFilter(p, 'obsidian');
    ok('…and a caret at the end is still at the end',
        el(p, 'filter').selectionStart === 8);
}

{
    /*
     * ‼️ A `<select>` HOLDS THE BACKGROUND REFRESH. An open dropdown is a
     * control the reader is in the middle of using; the guard named INPUT and
     * TEXTAREA and forgot the one control that can be OPEN when fresh data
     * arrives, so the list shut under the hand and the choice was lost.
     */
    const p = openFull();
    const before = p.html();
    p.sandbox.document.getElementById('app').fire('focusin', { target: { tagName: 'SELECT' } });
    p.send({ type: 'data', data: Object.assign(fx.data(), { engines: [], docOpen: DOCOPEN }) });
    ok('‼️ U-143: a push that arrives while a dropdown is open does NOT redraw',
        p.html() === before);

    p.sandbox.document.getElementById('app').fire('focusout', {});
    ok('…and it lands the moment the control is let go',
        !p.html().includes('id="cat-engines"'));
}

{
    // U-150 — the auto-answer rows answer the words a person types for them,
    // and Escape empties the box the way the ✕ does.
    const S = require(path.join(__dirname, '..', 'out', 'core', 'settingsops.js'));
    const props = require(path.join(__dirname, '..', 'package.json')).contributes.configuration.properties;
    const aa = {};
    ['agentFarm.console.autoAnswer.enabled', 'agentFarm.console.autoAnswer.timeoutSeconds']
        .forEach(k => { aa[k] = props[k]; });
    const p = runPage(fx.script, Object.assign(fx.data(), {
        engines: ENGINES, docOpen: DOCOPEN,
        categories: S.buildSettingsModel(aa, k => aa[k].default)
    }));
    typeFilter(p, 'soru');
    ok('U-150: "soru" finds the auto-answer rows', /console\.autoAnswer\.timeoutSeconds/.test(p.html()));
    typeFilter(p, 'timeout question');
    ok('U-150: "timeout question" finds them too', /console\.autoAnswer\.enabled/.test(p.html()));
    el(p, 'filter').fire('keydown', { key: 'Escape' });
    ok('U-150: Escape clears the filter', el(p, 'filter').value === ''
        && p.html().includes('id="cat-engines"'));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
