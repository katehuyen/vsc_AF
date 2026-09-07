// A-11 — launch profiles (compiled core/launchProfiles.js, pure list→list).
//
// The item was reopened because a previous pass renamed the launcher row and
// left loading broken. Both halves of that are pinned here, because both were
// invisible to every test that existed: the rules lived inside a quickpick loop
// in extension.ts, which nothing can call.
//
//   · THE ENGINE. A profile saved on Codex stored no engine, so loading it gave
//     a Claude session carrying Codex's model name — "it does not load the
//     profile any more", from the user's side.
//   · THE NAME. `LaunchProfile extends LaunchOptions`, whose `name` is `-n`.
//     Spread a profile into the launcher and every session started from a
//     profile called "gece taraması" is named "gece taraması".
//   · AND EDIT MEANS EVERY DIMENSION. Renaming was shipped as "editable"; the
//     item says in so many words that it is not what was asked for.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    applyProfile, deleteProfile, describeProfile, editProfile, profileFrom,
    profileNameClash, profileSurface, renameProfile, replaceProfile, saveProfile,
    PROFILE_KEYS
} = require(path.join(__dirname, '..', 'out', 'core', 'launchProfiles.js'));

const names = list => list.map(p => p.name).join(',');

// ---------- what a profile IS ----------
{
    const launcher = {
        engine: 'codex', model: 'gpt-5.1-codex-max', effort: 'high',
        permissionMode: 'acceptEdits', prompt: 'sabah taraması',
        name: 'bu oturumun adı', cwd: 'D:\\zone', resume: 'abc'
    };
    const p = profileFrom(launcher, '  gece  ');

    ok('‼️ the ENGINE is stored — the dimension that decides what the others mean',
        p.engine === 'codex');
    ok('…with the rest of the setup', p.model === 'gpt-5.1-codex-max'
        && p.effort === 'high' && p.permissionMode === 'acceptEdits'
        && p.prompt === 'sabah taraması');
    ok('‼️ the SESSION\'s name is dropped and the PROFILE\'s name is kept',
        p.name === 'gece');
    ok('…and nothing that is not a setup rides along (cwd, resume)',
        p.cwd === undefined && p.resume === undefined);
    ok('a dimension left empty is stored as absent, not as an empty flag',
        profileFrom({ model: '  ', effort: 'high' }, 'x').model === undefined);
    // ‼️ X-103 — EIGHT NOW, and the three that joined are the provider axis:
    // route, tier and variant. A setup that could not say which endpoint it ran
    // against reproduced everything about a launch except what it costs, who
    // serves it and whose key pays — and two profiles differing only in route
    // were indistinguishable to `matchProfile`, whose whole job is telling
    // setups apart. Ordered the way the answers depend on each other.
    // X-253 — and the NINTH is the sign-in, by the user's decision and in the
    // soft form: stored, preselected, never a lock. Its own rules are pinned in
    // test_profile_account.js, because they are the part a later tidy-up would
    // undo without noticing.
    ok('the nine dimensions are exactly the setup', PROFILE_KEYS.join(',')
        === 'engine,providerId,tier,account,model,variant,effort,permissionMode,prompt');
}

// ---------- loading one ----------
{
    const o = {
        engine: 'codex', model: 'gpt-5.1-codex-max', effort: 'xhigh',
        permissionMode: 'plan', name: 'oturum adı', cwd: 'D:\\zone'
    };
    const back = applyProfile(o, { name: 'gece', engine: 'claude', model: 'opus', effort: 'high' });

    ok('‼️ loading puts the ENGINE back — the bug the user saw as "it does not load"',
        back.engine === 'claude');
    ok('…and the dimensions it stores', back.model === 'opus' && back.effort === 'high');
    ok('‼️ a dimension the profile does NOT store is CLEARED, not left standing',
        back.permissionMode === '');
    ok('‼️ the session\'s own name survives — a profile name is not a -n',
        back.name === 'oturum adı');
    ok('…and so does everything that is not part of a setup', back.cwd === 'D:\\zone');

    const noEngine = applyProfile(o, { name: 'x', model: 'opus' });
    ok('a profile with no engine means THE DEFAULT engine, not the one left over',
        noEngine.engine === undefined);

    // The one field that survives on purpose, and the reason: it is long, it is
    // as often per-launch as it is part of a setup, and the launcher shows it on
    // its own row — so it is not carried invisibly.
    ok('a profile with no prompt does not wipe a prompt the user has typed',
        applyProfile({ prompt: 'yazdığım şey' }, { name: 'x', model: 'opus' }).prompt === 'yazdığım şey');
    ok('…but a profile that HAS one overwrites it',
        applyProfile({ prompt: 'yazdığım şey' }, { name: 'x', prompt: 'kendi promptu' }).prompt === 'kendi promptu');
}

// ---------- the list ----------
{
    const list = [
        { name: 'gece', model: 'opus' },
        { name: 'hızlı', model: 'haiku' },
        { name: 'derin', model: 'opus', effort: 'high' }
    ];

    ok('save appends a new one', names(saveProfile(list, { name: 'yeni' }))
        === 'gece,hızlı,derin,yeni');
    // ‼️ One name, one profile — and saving over a name is an EDIT, so the row
    // does not jump to the bottom of a list whose order is the user's.
    const over = saveProfile(list, { name: 'hızlı', model: 'sonnet' });
    ok('‼️ saving over a name replaces it IN PLACE', names(over) === 'gece,hızlı,derin'
        && over[1].model === 'sonnet' && over.length === 3);

    ok('rename keeps the row\'s place', names(renameProfile(list, 'gece', 'sabah'))
        === 'sabah,hızlı,derin');
    ok('…and carries what it stores', renameProfile(list, 'gece', 'sabah')[0].model === 'opus');
    ok('renaming onto an existing name replaces that one',
        names(renameProfile(list, 'gece', 'derin')) === 'derin,hızlı');
    ok('renaming to nothing changes nothing', names(renameProfile(list, 'gece', '  ')) === names(list));

    const rep = replaceProfile(list, 'hızlı', { engine: 'gemini', model: 'gemini-3-pro', name: 'oturum' });
    ok('replace keeps the name and the place', names(rep) === 'gece,hızlı,derin');
    ok('…stores the engine, and does not smuggle in the session name',
        rep[1].engine === 'gemini' && rep[1].model === 'gemini-3-pro' && rep[1].name === 'hızlı');

    ok('delete removes exactly one', names(deleteProfile(list, 'hızlı')) === 'gece,derin');
    ok('deleting something that is not there leaves the list alone',
        names(deleteProfile(list, 'yok')) === names(list));
}

// ---------- edit: every dimension, name included ----------
{
    const list = [
        { name: 'gece', model: 'opus' },
        { name: 'hızlı', model: 'haiku' },
        { name: 'derin', model: 'opus', effort: 'high' }
    ];
    const out = editProfile(list, 'hızlı',
        { name: 'çabuk', engine: 'codex', model: 'gpt-5.1-codex-mini', permissionMode: 'plan' });

    ok('‼️ EDIT rewrites the setup AND the name in one gesture — what the item asked for',
        out[1].name === 'çabuk' && out[1].engine === 'codex'
        && out[1].model === 'gpt-5.1-codex-mini' && out[1].permissionMode === 'plan');
    ok('…and the row does not move', names(out) === 'gece,çabuk,derin');
    ok('…what it no longer stores is gone, not merged from the old one',
        out[1].effort === undefined);

    const onto = editProfile(list, 'hızlı', { name: 'derin', model: 'sonnet' });
    ok('editing a name onto another row obeys one-name-one-profile',
        names(onto) === 'gece,derin' && onto[1].model === 'sonnet');
    ok('an edit with no name is refused rather than making a nameless row',
        names(editProfile(list, 'hızlı', { name: '  ' })) === names(list));
}

// ---------- how a row describes itself ----------
{
    ok('‼️ a profile\'s own name is NOT printed as a session name',
        !/gece/.test(describeProfile({ name: 'gece', model: 'opus', effort: 'high' })));
    ok('…it says the setup, in the launcher\'s words',
        describeProfile({ name: 'gece', model: 'opus', effort: 'high' }) === 'opus · effort high');
    ok('…the engine leads when it is not the default',
        /^Codex/.test(describeProfile({ name: 'x', engine: 'codex', model: 'gpt-5.1-codex-max' })));
    ok('…and a profile that stores nothing says so instead of drawing an empty line',
        describeProfile({ name: 'boş' }) === 'CLI defaults');
}

// ---------------------------------------------------------------------------
// ‼️ A-11 (reopened) — WHERE IT OPENS IS PART OF THE SETUP.
//
// "You save the profile with Console picked and it loads back as a terminal."
// The launcher has had a Where row for a long time; the profile had no such
// field, so saving read it nowhere, loading wrote it nowhere, and the edit
// picker did not even mention it. The user could not tell whether it was being
// stored and ignored or never stored at all: it was never stored at all.
{
    const launcher = { engine: 'codex', model: 'gpt-5.1-codex-max', effort: 'high' };
    const con = profileFrom(launcher, 'gece', 'console');
    ok('‼️ a profile saved on the Console stores the Console',
        profileSurface(con) === 'console');
    ok('…and a profile saved on a terminal stores the terminal',
        profileSurface(profileFrom(launcher, 'gece', 'terminal')) === 'terminal');
    ok('‼️ …and the row SAYS it, because it is the dimension a reader notices first',
        /in the Console/.test(describeProfile(con)));
    ok('…the terminal reads as itself', /in a terminal/.test(describeProfile(
        profileFrom(launcher, 'g', 'terminal'))));

    // The compatibility rule: every profile saved before this says nothing, and
    // must go on saying nothing rather than being read as "terminal".
    ok('‼️ a profile that was never told where says NOTHING, not "terminal"',
        profileSurface(profileFrom(launcher, 'eski')) === undefined
        && !('surface' in profileFrom(launcher, 'eski')));
    ok('…and its description does not invent a surface for it',
        !/terminal|Console/.test(describeProfile(profileFrom(launcher, 'eski'))));
    ok('…a value that is neither is not stored',
        profileSurface(profileFrom(launcher, 'x', 'nowhere')) === undefined);
    ok('a profile that stores ONLY a surface still describes itself',
        describeProfile({ name: 'x', surface: 'console' }) === 'in the Console');

    // Replace is "make this profile mean what I have in front of me", and the
    // surface is part of what is in front of you.
    const list = [profileFrom(launcher, 'gece', 'terminal')];
    const rep = replaceProfile(list, 'gece', { model: 'opus' }, 'console');
    ok('replace carries the launcher\'s current surface too',
        profileSurface(rep[0]) === 'console' && rep[0].model === 'opus');
    ok('…and replacing from a launcher with no surface clears it rather than keeping a stale one',
        profileSurface(replaceProfile(list, 'gece', { model: 'opus' })[0]) === undefined);
}

// ---------------------------------------------------------------------------
// ‼️ A-11 (reopened) — ONE NAME ONE PROFILE, BUT NEVER SILENTLY.
//
// The audit found it: renaming A to B deleted B without a word. The end state
// is right — the launcher picks by name — but a caller has to be able to SEE
// the row it is about to destroy, or the rule is just data loss with a reason.
{
    const list = [
        profileFrom({ model: 'opus' }, 'gece'),
        profileFrom({ model: 'sonnet' }, 'sabah')
    ];
    ok('‼️ the row a new name would destroy is named before anything is written',
        (profileNameClash(list, 'sabah', 'gece') || {}).name === 'sabah');
    ok('…a name nobody owns is no clash', profileNameClash(list, 'öğle', 'gece') === undefined);
    ok('…and keeping your own name is not a clash with yourself',
        profileNameClash(list, 'gece', 'gece') === undefined);
    ok('…nor is empty, which is refused elsewhere for its own reason',
        profileNameClash(list, '   ', 'gece') === undefined);
    // The list function itself is unchanged: the guard is the caller's, so the
    // rule still holds once the user (or an agent with overwrite:true) says yes.
    ok('once it is allowed, the rule still collapses the two rows into one',
        names(editProfile(list, 'gece', { name: 'sabah', model: 'opus' })) === 'sabah');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
