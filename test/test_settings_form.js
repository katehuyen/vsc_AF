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
    btn(p, 'fjson', 'agentFarm.taskRetry').click();
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
    btn(p, 'ljson', 'agentFarm.browserAllowHosts').click();
    ok('‼️ a LIST switched to JSON carries what was typed into the box, rather'
        + ' than replacing it with what was last saved',
        /yazildi\.ama\.kaydedilmedi/.test(el(p, 'c-browserAllowHosts').value));
    ok('…and looking at it saved nothing', !p.posted.some(m => m.type === 'set'));

    btn(p, 'llist', 'agentFarm.browserAllowHosts').click();
    ok('…and it comes back the same way',
        el(p, 'l-browserAllowHosts-0').value === 'yazildi.ama.kaydedilmedi');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
