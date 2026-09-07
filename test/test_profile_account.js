// X-253 — A SAVED LAUNCH PROFILE REMEMBERS THE SIGN-IN, SOFTLY.
//
// The user's decision, in their own words: "Tutsun ama YUMUŞAK (Hibrit): profil
// hesabı hatırlar, form açıldığında o hesap seçili gelir ama kilitli olmaz;
// istersen değiştirebilirsin. veya istersen orayı boş olarak profili
// kaydedebilirsin. Ama kayıtlıysa önceden ve hesap artık geçerli değilse boş
// gelir ve uyarır."
//
// Three rules come out of that, and each of them is a way the obvious
// implementation goes wrong:
//
//   · STORED AND LOADED like every other dimension — but a profile that stores
//     NOTHING must go on meaning nothing, because that is what every profile
//     saved before today means and there are some on this machine.
//   · NOT A LOCK. `matchProfile` is what tells the launcher "you are looking at
//     this profile", and a strict comparison on the account would have made
//     every existing profile unrecognisable the moment a standing sign-in
//     answered under it — the same defect `surface` was given its own clause
//     for.
//   · AND A DEAD ONE IS REFUSED BY NAME. A profile pointing at a slot the user
//     deleted must arrive EMPTY and SAY so; silently falling through to another
//     plan is the one outcome this whole family of items exists to end.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    applyProfile, describeProfile, matchProfile, profileAccountGone, profileFrom,
    PROFILE_KEYS
} = require(path.join(__dirname, '..', 'out', 'core', 'launchProfiles.js'));

// ---------- it is one of the stored dimensions ----------
{
    ok('‼️ the account is one of the setup\'s dimensions now', PROFILE_KEYS.includes('account'));
    ok('…listed beside the ROUTE, because they are the same question one axis over — '
        + 'which endpoint answers, and whose sign-in is billed for it',
        PROFILE_KEYS.join(',')
        === 'engine,providerId,tier,account,model,variant,effort,permissionMode,prompt');

    const p = profileFrom({
        engine: 'claude', model: 'opus', effort: 'high', account: 'claude-murvietnam-2'
    }, 'gece');
    ok('saving stores it', p.account === 'claude-murvietnam-2');

    // ‼️ The user asked for this by name: "veya istersen orayı boş olarak
    // profili kaydedebilirsin". An empty box is a REAL answer — "this setup
    // does not say whose plan pays" — and it is what every profile saved
    // before today says.
    ok('‼️ saving with the box empty leaves the key OFF rather than storing \'\'',
        !('account' in profileFrom({ engine: 'claude', model: 'opus' }, 'boş')));
    ok('…and a blank string is the same answer, not a value',
        !('account' in profileFrom({ engine: 'claude', account: '   ' }, 'boşluk')));
}

// ---------- loading one ----------
{
    const back = applyProfile(
        { engine: 'claude', account: 'duran-hesap' },
        { name: 'gece', engine: 'claude', account: 'claude-aicozums' });
    ok('loading preselects the sign-in the profile stored', back.account === 'claude-aicozums');

    // Cleared, exactly like the model and the permission mode beside it: "load
    // this setup" means the setup is now THIS, and an account left over from
    // the last thing the launcher was showing is a plan the user did not choose
    // and cannot see they are about to spend.
    const silent = applyProfile(
        { engine: 'claude', account: 'duran-hesap' }, { name: 'boş', engine: 'claude' });
    ok('‼️ a profile that says nothing about the sign-in CLEARS it, so the '
        + 'resolver answers again rather than a leftover being spent',
        silent.account === '');
}

// ---------- it is a seed, not a lock ----------
{
    const list = [
        { name: 'eski', engine: 'claude', model: 'opus' },
        { name: 'hesaplı', engine: 'claude', model: 'opus', account: 'claude-aicozums' }
    ];
    const on = a => ({ engine: 'claude', model: 'opus', ...(a ? { account: a } : {}) });

    // ‼️ THE REGRESSION THIS CLAUSE EXISTS TO PREVENT. Every profile on this
    // machine was saved before the account was a dimension, and a launcher
    // always carries a resolved one — so a strict comparison would have made
    // the row stop naming any of them, which reads as "it forgot my profile".
    ok('‼️ a profile that stores NO account matches a launcher that has one',
        matchProfile(list, on('claude-aicozums')).name === 'eski');
    ok('…and one that stores one is recognised when they agree',
        matchProfile([list[1]], on('claude-aicozums')).name === 'hesaplı');
    ok('‼️ …and stops being recognised when the reader moves the box — it is a '
        + 'seed the reader may change, and the row must not go on claiming it',
        matchProfile([list[1]], on('başka-hesap')) === undefined);
    ok('the other dimensions still have to agree',
        matchProfile(list, { engine: 'claude', model: 'haiku' }) === undefined);
}

// ---------- a sign-in that is no longer there ----------
{
    const known = ['claude-aicozums', 'claude-murvietnam-2'];

    ok('a profile naming a slot that is still on the machine is fine',
        profileAccountGone({ name: 'x', account: 'claude-aicozums' }, known) === undefined);
    ok('‼️ …and one naming a slot that is GONE is reported BY NAME, so the '
        + 'launcher can say which sign-in it dropped',
        profileAccountGone({ name: 'x', account: 'silinmiş' }, known) === 'silinmiş');
    ok('a profile that names none has nothing to be gone',
        profileAccountGone({ name: 'x' }, known) === undefined);
    // ‼️ NOT "everything is gone". A machine with no captured sign-ins at all is
    // a machine where the account axis does not apply; answering "gone" there
    // would put a warning in front of every profile on a fresh install.
    ok('‼️ with no slots captured at all, nothing is called gone',
        profileAccountGone({ name: 'x', account: 'claude-aicozums' }, []) === undefined);
}

// ---------- what the row says it stores ----------
{
    ok('the setup line names the sign-in, because a profile that spends a plan '
        + 'must say which one before it is pressed',
        describeProfile({ name: 'gece', model: 'opus', account: 'claude-aicozums' })
            .includes('claude-aicozums'));
    ok('…and says nothing where the profile says nothing',
        describeProfile({ name: 'gece', model: 'opus' }) === 'opus');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
