// Wave D tests: premiere sequence builders + scene detection + ingest auto-scene.
const fs = require('fs');
const os = require('os');
const path = require('path');
const OUT = require('path').resolve(__dirname, '../out/core');
const pr = require(path.join(OUT, 'premiere.js'));
const prod = require(path.join(OUT, 'production.js'));
const ingest = require(path.join(OUT, 'ingest.js'));
const media = require(path.join(OUT, 'media.js'));

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) { pass++; } else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } };
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- framesToTc / pathToFileUrl ----------
eq('tc 0', pr.framesToTc(0, 30), '00:00:00:00');
eq('tc 30f@30 = 1s', pr.framesToTc(30, 30), '00:00:01:00');
eq('tc 90061f@30', pr.framesToTc(3600 * 30 + 61, 30), '01:00:02:01');
eq('win path url', pr.pathToFileUrl('D:\\a b\\clip.mp4'), 'file://localhost/D:/a%20b/clip.mp4');

// ---------- pickSequenceAssets ----------
const production = { id: 'film', title: 'Film', scenes: [
    { id: 's01', title: 'Açılış', status: 'approved' },
    { id: 's02', title: 'Orta', status: 'review' },
    { id: 's03', title: 'Kapanış', status: 'draft' }
] };
const metas = [
    // s01: an image and a video; a selection kept the video's url
    { taskId: 'a', projectId: 'film', sceneId: 's01', assetFiles: ['/o/a-img.png', '/o/a-vid.mp4'],
      assetUrls: ['http://x/aimg', 'http://x/avid'], selectedUrls: ['http://x/avid'] },
    // s02: two videos, one rejected
    { taskId: 'b', projectId: 'film', sceneId: 's02', assetFiles: ['/o/b1.mp4', '/o/b2.mp4'],
      assetUrls: ['http://x/b1', 'http://x/b2'], rejectedUrls: ['http://x/b1'] },
    // s03: only an image
    { taskId: 'c', projectId: 'film', sceneId: 's03', assetFiles: ['/o/c.png'], assetUrls: ['http://x/c'] },
    // other project ignored
    { taskId: 'z', projectId: 'OTHER', sceneId: 's01', assetFiles: ['/o/z.mp4'], assetUrls: ['http://x/z'] }
];
const clips = pr.pickSequenceAssets(production, metas);
eq('one clip per scene with assets', clips.map(c => c.name), ['a-vid.mp4', 'b2.mp4', 'c.png']);
eq('s01 picks selected video', clips[0].kind, 'video');
eq('s02 skips rejected, picks b2', clips[1].name, 'b2.mp4');
eq('scene titles carried', clips.map(c => c.sceneTitle), ['Açılış', 'Orta', 'Kapanış']);

// scene with no asset is skipped
const clips2 = pr.pickSequenceAssets({ id: 'film', title: 'F', scenes: [
    { id: 's01', title: 'A' }, { id: 's99', title: 'empty' }
] }, metas);
eq('empty scene skipped', clips2.length, 1);

// ---------- buildFcpXml ----------
const xml = pr.buildFcpXml(clips, { fps: 30, clipSeconds: 5, title: 'Film', width: 1920, height: 1080 });
ok('xml has xmeml root', /<xmeml version="4">/.test(xml) && /<!DOCTYPE xmeml>/.test(xml));
ok('xml has 3 clipitems', (xml.match(/<clipitem /g) || []).length === 3);
ok('xml duration = 3*150 frames', /<duration>450<\/duration>/.test(xml));
ok('xml sequential start/end', /<start>0<\/start>[\s\S]*<end>150<\/end>/.test(xml) && /<start>300<\/start>/.test(xml));
ok('xml pathurl file url', /<pathurl>file:\/\/localhost\/o\/a-vid.mp4<\/pathurl>/.test(xml));
ok('xml timebase 30', /<timebase>30<\/timebase>/.test(xml));
// name escaping
const xmlEsc = pr.buildFcpXml([{ file: '/o/a&b<c>.mp4', name: 'a&b<c>.mp4', sceneTitle: 'x', kind: 'video' }], {});
ok('xml escapes name', /a&amp;b&lt;c&gt;.mp4/.test(xmlEsc));

// ---------- buildEdl ----------
const edl = pr.buildEdl(clips, { fps: 30, clipSeconds: 5, title: 'Film' });
ok('edl title', /TITLE: Film/.test(edl));
ok('edl 3 events', /^001 /m.test(edl) && /^002 /m.test(edl) && /^003 /m.test(edl));
ok('edl record timecodes advance', /00:00:00:00 00:00:05:00 00:00:00:00 00:00:05:00/.test(edl) && /00:00:05:00 00:00:10:00/.test(edl));
ok('edl clip names', /FROM CLIP NAME: a-vid.mp4/.test(edl));
ok('edl scene comments', /SCENE: Açılış/.test(edl));

// ---------- detectSceneId ----------
eq('detect scene id token', pr.detectSceneId('P01_s02_T03_approved.mp4', production), 's02');
eq('detect S-index (1-based)', pr.detectSceneId('render_S3_final.mp4', production), 's03');
eq('detect none', pr.detectSceneId('random.mp4', production), undefined);
eq('id token needs boundary', pr.detectSceneId('xs01x.mp4', production), undefined);

// ---------- ingest auto-scene wiring ----------
(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-waved-'));
    const outputsDir = path.join(tmp, 'out'); fs.mkdirSync(outputsDir);
    const dl = path.join(tmp, 'dl'); fs.mkdirSync(dl);
    fs.writeFileSync(path.join(dl, 'clip_s02_v1.mp4'), 'x'.repeat(50));
    fs.writeFileSync(path.join(dl, 'clip_nomatch.mp4'), 'x'.repeat(50));
    const resolveScene = (projectId, filename) => projectId === 'film' ? pr.detectSceneId(filename, production) : undefined;
    const res = await ingest.scanIngestFolders(outputsDir, [{ path: dl, label: 'dl', projectId: 'film' }], undefined, resolveScene);
    const byName = Object.fromEntries(res.registered.map(m => [path.basename(m.assetFiles[0]), m.sceneId]));
    eq('s02 auto-linked from filename', byName['clip_s02_v1.mp4'], 's02');
    eq('no-match stays unassigned', byName['clip_nomatch.mp4'], undefined);
    eq('both still assigned to project', res.registered.every(m => m.projectId === 'film'), true);

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
