// Console attachments — the carrier rule, the wire format and the refusals.
//
// The point of this suite is the ONE decision the feature rests on: an image
// travels inside the message because the model cannot open a file, everything
// else travels as a path because the agent already has the disk. Everything
// here checks that rule survives contact with real files.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { userMessageLine, acceptUserText, newSessionState, ATTACH_LIMITS, IMAGE_MEDIA_TYPES } =
    require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));
const { describeAttachment } = require(path.join(__dirname, '..', 'out', 'core', 'consolehost.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));

// a scratch folder with one of each kind of thing you can attach
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-attach-test-'));
const pngPath = path.join(dir, 'shot.png');
const txtPath = path.join(dir, 'notes.txt');
const subDir = path.join(dir, 'folder');
// a 1x1 PNG — real bytes, so statSync and base64 both have something to do
fs.writeFileSync(pngPath, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'));
fs.writeFileSync(txtPath, 'hello');
fs.mkdirSync(subDir);

// ---------- the carrier rule ----------
{
    const img = describeAttachment(pngPath);
    ok('a png is carried as an image', img && img.kind === 'image' && img.mediaType === 'image/png');
    ok('an image reports its real size', img && img.bytes === fs.statSync(pngPath).size);

    const txt = describeAttachment(txtPath);
    ok('a text file is carried as a path', txt && txt.kind === 'path' && !txt.mediaType);

    const folder = describeAttachment(subDir);
    ok('a folder is carried as a path', folder && folder.kind === 'path');
    ok('a folder has no byte size to report', folder && folder.bytes === 0);

    ok('a path that is not there describes as nothing',
        describeAttachment(path.join(dir, 'ghost.png')) === null);

    ok('extension case does not decide the carrier',
        (() => {
            const upper = path.join(dir, 'SHOT.PNG');
            fs.copyFileSync(pngPath, upper);
            const d = describeAttachment(upper);
            return d && d.kind === 'image' && d.mediaType === 'image/png';
        })());

    ok('every declared image type maps to a media type',
        Object.keys(IMAGE_MEDIA_TYPES).every(k => /^image\//.test(IMAGE_MEDIA_TYPES[k])));
}

// ---------- the wire format ----------
{
    const plain = JSON.parse(userMessageLine('just words'));
    ok('a plain message still has exactly one text block',
        plain.type === 'user' && plain.message.content.length === 1
        && plain.message.content[0].type === 'text'
        && plain.message.content[0].text === 'just words');

    const withImg = JSON.parse(userMessageLine('what is this?', [{
        path: pngPath, name: 'shot.png', bytes: 70, kind: 'image',
        mediaType: 'image/png', data: 'QUJD'
    }]));
    const c = withImg.message.content;
    ok('an image becomes a base64 image block',
        c[0].type === 'image' && c[0].source.type === 'base64'
        && c[0].source.media_type === 'image/png' && c[0].source.data === 'QUJD');
    ok('the image comes BEFORE the question it belongs to',
        c[0].type === 'image' && c[1].type === 'text');

    const withPath = JSON.parse(userMessageLine('look at this', [{
        path: txtPath, name: 'notes.txt', bytes: 5, kind: 'path'
    }]));
    ok('a path attachment adds no extra content block',
        withPath.message.content.length === 1);
    ok('the path is written into the sentence the model reads',
        withPath.message.content[0].text.includes(txtPath));
    ok('the path is quoted so spaces cannot split it',
        withPath.message.content[0].text.includes('`' + txtPath + '`'));
    ok('the typed words survive alongside the path',
        withPath.message.content[0].text.startsWith('look at this'));

    const imagesOnly = JSON.parse(userMessageLine('', [{
        path: pngPath, name: 'shot.png', bytes: 70, kind: 'image',
        mediaType: 'image/png', data: 'QUJD'
    }]));
    ok('a message that is only a screenshot sends no empty text block',
        imagesOnly.message.content.length === 1 && imagesOnly.message.content[0].type === 'image');

    const mixed = JSON.parse(userMessageLine('both', [
        { path: pngPath, name: 'shot.png', bytes: 70, kind: 'image', mediaType: 'image/png', data: 'QUJD' },
        { path: txtPath, name: 'notes.txt', bytes: 5, kind: 'path' }
    ]));
    ok('mixed attachments split by carrier, not by order',
        mixed.message.content.length === 2
        && mixed.message.content[0].type === 'image'
        && mixed.message.content[1].text.includes(txtPath));

    ok('an image with no payload is not put on the wire half-formed',
        JSON.parse(userMessageLine('x', [{ path: pngPath, name: 'shot.png', bytes: 1, kind: 'image', mediaType: 'image/png' }]))
            .message.content.every(b => b.type !== 'image'));
}

// ---------- what counts as a message ----------
{
    const base = newSessionState('id', 'agent', 'Agent', process.cwd());
    ok('nothing typed and nothing attached is not a message',
        acceptUserText(base, '   ', Date.now(), false, []).send === false);
    ok('a file with no words IS a message',
        acceptUserText(base, '', Date.now(), false,
            [{ name: 'shot.png', kind: 'image', path: pngPath, bytes: 70 }]).send === true);

    const r = acceptUserText(base, 'here', Date.now(), false,
        [{ name: 'shot.png', kind: 'image', path: pngPath, bytes: 70 }]);
    const last = r.state.messages[r.state.messages.length - 1];
    ok('the transcript remembers which files went with the message',
        last.attach && last.attach.length === 1 && last.attach[0].name === 'shot.png');
    ok('the transcript never keeps the payload',
        last.attach && last.attach[0].data === undefined);

    const clean = acceptUserText(base, 'no files', Date.now(), false, []);
    const cleanLast = clean.state.messages[clean.state.messages.length - 1];
    ok('a message without files carries no attach field at all',
        !('attach' in cleanLast));
}

// ---------- the ceilings are one definition ----------
{
    ok('per-image ceiling is 5 MB', ATTACH_LIMITS.perImageBytes === 5 * 1024 * 1024);
    ok('per-message ceiling is 20 MB', ATTACH_LIMITS.totalBytes === 20 * 1024 * 1024);
    ok('file-count ceiling is 20', ATTACH_LIMITS.count === 20);
}

// ---------- the bridge carries it too ----------
(async () => {
    const reg = new BridgeRegistry();
    let seen = null;
    reg.register([{
        op: 'console.send',
        describe: 'say something. args: id, text, hold?, attach? (absolute paths)',
        handler: a => {
            const paths = Array.isArray(a.attach) ? a.attach : [];
            seen = paths.map(describeAttachment).filter(Boolean);
            return { attached: seen.map(x => ({ name: x.name, kind: x.kind })) };
        }
    }]);

    const r = await reg.dispatch('console.send', { id: 'x', text: 'hi', attach: [pngPath, txtPath] });
    ok('the bridge resolves paths through the same carrier rule',
        seen && seen.length === 2 && seen[0].kind === 'image' && seen[1].kind === 'path');
    ok('the bridge answers with what it actually attached',
        r.ok && r.result.attached.length === 2);

    const missing = await reg.dispatch('console.send', { id: 'x', text: 'hi', attach: [path.join(dir, 'nope.png')] });
    ok('a path that does not exist is dropped, not invented',
        missing.ok && missing.result.attached.length === 0);

    const cat = reg.catalog();
    const entry = cat.find(o => o.op === 'console.send');
    ok('console.send is in the catalog', !!entry);
    ok('the catalog tells an agent about attach', entry && /attach/.test(entry.describe));

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* windows lock */ }
    console.log(`${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
