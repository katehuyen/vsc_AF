// X-110 — the provider mark and the palette behind it (media/afProvider.js +
// common.css).
//
// ‼️ WHAT THIS PINS THAT NO PAGE TEST CAN. A provider chip is only useful if it
// answers three questions a page cannot check for itself:
//
//   1. WHICH ONE — so two providers never share a hue, and one provider never
//      changes hue between two tables (the reason the slot is hashed off the id
//      rather than taken from a position in a list).
//   2. NOT WHICH ENGINE — the engine badge already owns five hues on every
//      surface here, so the axis has to be carried by the SHAPE: solid is an
//      engine, dashed is a provider.
//   3. AND NEVER A LIE — a run that changed provider between turns must not
//      wear the name of one of them, and a run with nothing recorded must not
//      borrow the engine's own default and call it a route.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const media = f => fs.readFileSync(path.resolve(__dirname, '..', 'media', f), 'utf8');
const CSS = media('common.css');

ok('CSS comments are balanced before any rule is trusted',
    (CSS.match(/\/\*/g) || []).length === (CSS.match(/\*\//g) || []).length);

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(media('afProvider.js'), sandbox);
const P = sandbox.window.AFProvider;

// ---------- the component ----------
{
    ok('a shipped route id resolves to what a person calls it',
        P.label('kimi') === 'Kimi' && P.label('minimax') === 'MiniMax');
    ok('‼️ a profile\'s OWN name wins over the shipped label — it is what the user typed',
        P.label({ providerId: 'kimi', providerLabel: 'Kimi (work)' }) === 'Kimi (work)');
    ok('‼️ nothing means nothing — an absent route is NOT the engine\'s default '
        + 'wearing a chip, which is the guess this family refuses',
        P.label('') === '' && P.label(undefined) === '' && P.chip('') === '');
    ok('an id this build never heard of is still drawn, as itself',
        /openrouter/.test(P.chip('openrouter')));
    ok('‼️ the colour class is the component\'s to give, for chips and non-chips alike',
        P.cls('kimi') === 'af-provc kimi' && P.cls('') === 'af-provc none');
    ok('the chip carries both classes, so it keeps resolving --af-provc',
        /class="af-prov af-provc minimax"/.test(P.chip('minimax')));
    ok('…and a caller may size it without inventing a colour',
        /class="af-prov af-provc kimi dense"/.test(P.chip('kimi', 'dense')));
    ok('the label is escaped',
        /&quot;x&quot;/.test(P.chip({ providerId: 'x', providerLabel: 'a "x" b' })));
    // S-131 — a user-named route is cut to the card's fixed length; no cap, no cut.
    const longName = { providerId: 'p1', providerLabel: 'Qwen Coder Plus (work)' };
    ok('S-131: with a cap the chip says at most that many characters, the last one an ellipsis',
        P.CARD_MAX === 15 && />Qwen Coder Plu…</.test(P.chip(longName, '', P.CARD_MAX))
        && Array.from(P.cut(longName.providerLabel, 15)).length === 15);
    ok('…a name that fits is left whole, and a chip asked for no cap keeps the whole name',
        P.cut('Kimi', 15) === 'Kimi' && P.cut('123456789012345', 15) === '123456789012345'
        && />Qwen Coder Plus \(work\)</.test(P.chip(longName)));

    // ‼️ THE SAME ID IS THE SAME COLOUR ON EVERY PAGE. A slot taken from a
    // position in a list would make one provider change colour between two
    // tables, which is the failure a shared component exists to end.
    ok('‼️ an unknown id lands in the same slot every time it is asked',
        P.cls('openrouter') === P.cls('openrouter')
        && P.cls('openrouter') !== P.cls('groq'));
    ok('…and case and padding do not make two providers out of one',
        P.cls(' KIMI ') === P.cls('kimi'));
}

// ---------- ‼️ the reported half, which is a different fact from the declared one ----------
{
    const declared = {
        providerId: 'kimi', providerLabel: 'Kimi (work)', binding: 'declared',
        proof: 'matched', reportedProviderIds: ['kimi'],
        requestedModelRef: 'kimi-k2-thinking', reportedModels: ['kimi-k2-thinking']
    };
    ok('a run whose engine named what was declared draws the declared one',
        P.servedBy(declared) === 'kimi' && /Kimi \(work\)/.test(P.chip(declared)));
    ok('‼️ …and the panel does NOT restate it — a panel that repeats itself is one '
        + 'a reader stops opening',
        !P.tipLines(declared).some(l => /^Answered by:/.test(l)));
    const moved = {
        providerId: 'anthropic', providerLabel: 'Anthropic', binding: 'declared',
        proof: 'engine-reported', reportedProviderIds: ['kimi']
    };
    ok('‼️ where the engine named someone ELSE, the chip shows WHO ANSWERED — the '
        + 'declared one is what was asked for, not what served it',
        P.servedBy(moved) === 'kimi'
        && P.tipLines(moved).some(l => l === 'Answered by: Kimi'));
    ok('…and the declared one is still the first line, so nothing is hidden',
        /^Route: Anthropic/.test(P.tipLines(moved)[0]));
}

// ---------- ‼️ a run that changed provider is not one chip ----------
{
    const many = {
        providerId: 'anthropic', providerLabel: 'Anthropic', binding: 'declared',
        proof: 'matched', multiProvider: true,
        reportedProviderIds: ['anthropic', 'kimi']
    };
    ok('‼️ the chip COUNTS rather than naming one of them — saying "Kimi" over a run '
        + 'that was half Anthropic is the specific lie this component exists to stop',
        /2 providers/.test(P.chip(many)) && !/Kimi/.test(P.chip(many)));
    ok('…and it wears no provider hue, because no single one is true of it',
        /class="af-prov af-prov-multi"/.test(P.chip(many)));
    ok('…while the panel names them in the order they served',
        P.tipLines(many).some(l => /Changed provider mid-run: Anthropic → Kimi/.test(l)));
    ok('…and the tooltip\'s first line says so rather than naming one',
        /this run changed provider between turns/.test(P.title(many)));
    ok('‼️ multiProvider with ONE reported id is not a change — the flag alone must '
        + 'not produce a "1 providers" chip',
        /Kimi/.test(P.chip({ providerId: 'kimi', multiProvider: true, reportedProviderIds: ['kimi'] })));
}

// ---------- ‼️ why there is nothing to show: three answers, never one blank ----------
{
    const legacy = { providerId: '', binding: 'legacy', reportedProviderIds: [] };
    ok('‼️ an old run says it is old, and does not borrow a route it never had',
        /older than the launch manifest/.test(P.tipLines(legacy)[0])
        && P.chip(legacy) === '');
    ok('an imported transcript says it is not ours',
        /not ours/.test(P.tipLines({ binding: 'external' })[0]));
    ok('…and "asked, and nothing answered" stays its own answer',
        /nothing answered/.test(P.tipLines({ binding: 'unknown' })[0]));
    ok('‼️ a legacy run whose ENGINE named a provider still shows that evidence — it '
        + 'is the only evidence there is',
        P.tipLines({ binding: 'legacy', reportedProviderIds: ['kimi'] })
            .some(l => l === 'Answered by: Kimi'));
    ok('a declared run with no route says the engine\'s own default answered',
        /none declared/.test(P.tipLines({ binding: 'declared', providerId: '' })[0]));
}

// ---------- the palette ----------
{
    const hue = id => {
        const m = new RegExp(`\\.af-provc\\.${id}\\s*\\{\\s*--af-provc:\\s*([^;]+);`).exec(CSS);
        return m ? m[1].trim() : '';
    };
    // DERIVED, NOT TYPED — the same lesson U-59 taught the engine palette: a
    // hand-written list stops covering the newest member in silence.
    ok('every shipped route has a declared hue', P.known.every(id => hue(id).length > 0));
    ok('‼️ no two shipped routes share one — the chip answers WHICH, not "not the default"',
        new Set(P.known.map(hue)).size === P.known.length);
    ok('…and the neutral is declared, so an absent route is still a class that resolves',
        hue('none').length > 0);
    // Every derived slot must exist, or an unknown provider resolves to no
    // colour at all and reads as a broken chip rather than an unknown one.
    const slots = [...new Set(['openrouter', 'groq', 'together', 'xai', 'ollama', 'deepseek',
        'github-copilot', 'openai', 'google', 'mistral', 'azure', 'vertex']
        .map(id => P.cls(id).split(' ')[1]))];
    ok('‼️ every derived slot an id can land in is declared — an unknown provider '
        + 'must read as unknown, never as broken',
        slots.length > 1 && slots.every(s => hue(s).length > 0));
    // ‼️ U-49's lesson, one palette across: red means a FAULT on every surface
    // here, so a provider that hashed onto it would read as a broken route
    // rather than as a named one.
    ok('‼️ nothing a provider can wear is the colour this extension signals a fault in',
        [...P.known, ...slots].every(id => !/charts-red/.test(hue(id))));
    ok('the palette is VS Code\'s own, so it survives a theme change',
        [...P.known, 'none'].every(id => /var\(--vscode-/.test(hue(id))));
    ok('the chip resolves the variable rather than declaring a colour of its own',
        /\.af-prov\s*\{[^}]*color:\s*var\(--af-provc/.test(CSS));

    // ‼️ THE AXIS IS THE SHAPE, NOT THE HUE. The engine badge owns five hues on
    // every surface here, so a provider chip sharing one would read as a sixth
    // engine unless the border already said otherwise.
    ok('‼️ a provider chip is DASHED and an engine badge is SOLID, which is what '
        + 'stops a provider being read as a sixth engine',
        /\.af-prov\s*\{[^}]*border:\s*1px dashed/.test(CSS)
        && /\.af-eng\s*\{[^}]*border:\s*1px solid/.test(CSS));
    // …and the mark that means "it moved" must not throw the hue away, or the
    // chip stops answering WHICH at the one moment that is hardest to read.
    ok('‼️ a moved chip keeps its provider\'s hue and only changes weight',
        /\.af-prov\.af-prov-moved\s*\{[^}]*font-weight/.test(CSS)
        && !/\.af-prov\.af-prov-moved\s*\{[^}]*color:/.test(CSS));
}

// ---------- ‼️ the Console no longer draws a pill of its own ----------
{
    const console_ = media('console.js');
    ok('‼️ the one page that had invented a route pill now asks the component',
        /window\.AFProvider\.chip\(/.test(console_)
        && !/class="af-route/.test(console_));
    // The colour is keyed on the COMPANY, not on the profile: two profiles on
    // Kimi are one colour in a table, not two.
    ok('…and it colours by the provider the profile routes to, not by the profile',
        /r\.shape \|\| r\.id/.test(console_));
    const ext = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('…which the host answers off the profile itself, never guessed from a name',
        /shape: profile\?\.providerId \|\| named\?\.providerId \|\| id,/.test(ext));
}

// ---------- X-112: who is billed, in the host's own words ----------
{
    // The rule lives in src/core/billing.ts and travels on the identity; the
    // panel PRINTS it and never derives it, so the spend card and the row
    // cannot disagree about one run.
    const kimi = {
        providerId: 'kimi', providerLabel: 'Kimi (work)', binding: 'declared', proof: 'matched',
        reportedProviderIds: ['kimi'],
        billing: { mode: 'third-party', planWindow: false, cost: 'none', currency: '',
            why: 'Kimi (work) — NOT on the Claude plan window.' }
    };
    ok('‼️ the panel ends with the billing line the host worded',
        P.tipLines(kimi).filter(Boolean).pop() === 'Billing: Kimi (work) — NOT on the Claude plan window.');
    const legacy = { providerId: '', binding: 'legacy', billing: { mode: 'plan', planWindow: true, cost: 'estimate', currency: 'USD', why: 'the Claude plan.' } };
    ok('…on a run with no route too — a legacy run is on the plan and says so',
        P.tipLines(legacy).some(l => l === 'Billing: the Claude plan.'));
    ok('…and an identity from an older host, with no billing, draws no empty line',
        !P.tipLines({ providerId: 'kimi', binding: 'declared' }).some(l => /^Billing:/.test(l)));
}

// ---------- and it ships on every page ----------
{
    const { SHARED, matchesShell } = require('./lib_shared_media');
    ok('‼️ the component ships to every page, or the surface that forgets it is the '
        + 'surface where the provider goes unnamed',
        SHARED.indexOf('afProvider.js') >= 0 && matchesShell());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
