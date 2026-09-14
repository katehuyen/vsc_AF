/**
 * X-308 — WHAT `${vault}` IS WHEN NOBODY TYPED IT.
 *
 * The defect this guards: `agentFarm.vaultDir` had never been set, so the
 * variable resolved to nothing, X-188's law cancelled every path using it, and
 * NO SURFACE SAID SO. The fallback reads Obsidian's own registry — and the
 * interesting half of the design is where it REFUSES to, because a wrong vault
 * would be worse than the silence it replaces.
 *
 * ‼️ The last case is this machine's REAL registry, replayed as a fixture: four
 * vaults, exactly one open. A rule written against invented data and never run
 * against the record it exists for is how the X-307 brake nearly shipped a
 * condition that would not have fired on its own incident.
 */
const path = require('path');
const {
    obsidianRegistryPath, readVaultRegistry, resolveVault
} = require(path.resolve(__dirname, '../out/core/vaultDiscovery.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const reg = (vaults) => JSON.stringify({ vaults });

// ---------- the registry path, per platform ----------
ok('windows reads APPDATA/obsidian/obsidian.json',
    obsidianRegistryPath({ platform: 'win32', appData: 'C:\\Users\\x\\AppData\\Roaming' })
    === 'C:\\Users\\x\\AppData\\Roaming\\obsidian\\obsidian.json');
ok('…and falls back to the home folder when APPDATA is not set',
    obsidianRegistryPath({ platform: 'win32', home: 'C:\\Users\\x' })
    === 'C:\\Users\\x\\AppData\\Roaming\\obsidian\\obsidian.json');
ok('macOS reads Library/Application Support',
    obsidianRegistryPath({ platform: 'darwin', home: '/Users/x' })
    === '/Users/x/Library/Application Support/obsidian/obsidian.json');
ok('linux reads .config',
    obsidianRegistryPath({ platform: 'linux', home: '/home/x' })
    === '/home/x/.config/obsidian/obsidian.json');

// ---------- reading the registry ----------
ok('a missing registry is an empty list, not an exception',
    readVaultRegistry(undefined).length === 0 && readVaultRegistry('').length === 0);
ok('…and so is one that is not JSON at all',
    readVaultRegistry('{not json').length === 0);
ok('…and one with no vaults key',
    readVaultRegistry('{"other":1}').length === 0);
ok('a BOM does not hide the vaults',
    readVaultRegistry('\uFEFF' + reg({ a: { path: 'D:\\v', open: true } })).length === 1);
ok('an entry with no path is dropped rather than carried as an empty folder',
    readVaultRegistry(reg({ a: { open: true }, b: { path: '   ' }, c: { path: 'D:\\v' } })).length === 1);
{
    const one = readVaultRegistry(reg({ vid: { path: 'D:\\v', open: true, ts: 42 } }))[0];
    ok('a vault carries its id, its open flag and its stamp',
        one.id === 'vid' && one.path === 'D:\\v' && one.open === true && one.ts === 42);
    ok('…and a missing stamp is 0, never undefined',
        readVaultRegistry(reg({ v: { path: 'D:\\v' } }))[0].ts === 0);
    ok('…and `open` is only true for a literal true',
        readVaultRegistry(reg({ v: { path: 'D:\\v', open: 'yes' } }))[0].open === false);
}

// ---------- ‼️ THE SETTING ALWAYS WINS ----------
{
    const r = resolveVault('D:\\typed', reg({ a: { path: 'D:\\other', open: true } }));
    ok('‼️ X-308: A FOLDER THE USER TYPED BEATS THE ONE OBSIDIAN HAS OPEN',
        r.ok && r.value === 'D:\\typed' && r.source === 'setting');
    ok('…and it says nothing, because nothing went wrong', r.why === '');
    ok('…and the candidates are still reported, so a surface can show the choice',
        r.candidates.length === 1);
}
ok('whitespace is not an answer — a blank setting falls through to Obsidian',
    resolveVault('   ', reg({ a: { path: 'D:\\v', open: true } })).source === 'obsidian');

// ---------- exactly one open vault IS an answer ----------
{
    const r = resolveVault('', reg({
        a: { path: 'D:\\closed', open: false },
        b: { path: 'D:\\open', open: true }
    }));
    ok('‼️ X-308: WITH THE SETTING EMPTY, THE ONE OPEN VAULT ANSWERS ${vault}',
        r.ok && r.value === 'D:\\open' && r.source === 'obsidian');
    ok('…and it says the value was derived and how to pin it',
        /not set/.test(r.why) && /D:\\open/.test(r.why) && /Set the folder/.test(r.why));
}

// ---------- ‼️ AND IT REFUSES TO GUESS ----------
{
    const r = resolveVault('', reg({
        a: { path: 'D:\\one', open: true },
        b: { path: 'D:\\two', open: true }
    }));
    ok('‼️ X-308: TWO OPEN VAULTS IS NOT AN ANSWER — IT REFUSES RATHER THAN PICKING ONE',
        !r.ok && r.value === '' && r.source === 'none');
    ok('…and it names both, so the person can see what it could not choose between',
        /D:\\one/.test(r.why) && /D:\\two/.test(r.why) && /cannot be guessed/.test(r.why));
}
{
    const r = resolveVault('', reg({ a: { path: 'D:\\v', open: false } }));
    ok('‼️ X-308: A REGISTRY WITH NOTHING OPEN CANCELS THE VARIABLE, AND SAYS WHY',
        !r.ok && r.value === '' && r.source === 'none' && /no vault open/.test(r.why));
}
{
    const r = resolveVault('', undefined);
    ok('‼️ X-308: NO OBSIDIAN AT ALL IS STILL A SENTENCE, NOT A SILENCE',
        !r.ok && r.value === '' && r.source === 'none'
        && /no Obsidian vault registry/.test(r.why) && r.candidates.length === 0);
}
{
    // every refusal must be usable by the surface that draws it
    ['', '   '].forEach(s => {
        const r = resolveVault(s, reg({ a: { path: 'D:\\v', open: false } }));
        ok('‼️ A REFUSAL NEVER RETURNS A HALF-BUILT PATH (' + JSON.stringify(s) + ')',
            r.value === '' && r.why.length > 40);
    });
}

// ---------- ‼️ THE REAL REGISTRY OF THE MACHINE THIS WAS MEASURED ON ----------
{
    const real = reg({
        d2ebe48c: { path: 'D:\\My Documents\\Prgfile\\Obsidian\\Demo', open: false, ts: 1781405395666 },
        '1a50795e': { path: 'D:\\zone\\know\\note\\obsidian', open: true, ts: 1787310863618 },
        e7a3015a: { path: 'D:\\My Documents\\Valbfile\\Savevalb\\ME-Notes\\2025+', open: false, ts: 1786443598043 },
        cbc68c7b: { path: 'D:\\zone\\agent', open: false, ts: 1787193983427 }
    });
    const r = resolveVault('', real);
    ok('‼️ X-308 REPLAY: the real machine has four vaults and exactly one open',
        r.candidates.length === 4 && r.candidates.filter(c => c.open).length === 1);
    ok('‼️ X-308 REPLAY: ${vault} lands on the vault every agent actually writes to',
        r.ok && r.value === 'D:\\zone\\know\\note\\obsidian' && r.source === 'obsidian');
    ok('‼️ X-308 REPLAY: …and the moment they type that same folder, it is THEIR answer',
        resolveVault('D:\\zone\\know\\note\\obsidian', real).source === 'setting');
}

console.log(`test_vault_discovery: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
