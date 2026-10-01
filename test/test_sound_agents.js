// U-187 — THE AGENT STEP OF THE TONE CHAIN, GIVEN A SURFACE.
//
// resolveVoice has always tried session > agent > settings > default, and
// nothing could write the agent step. Now `agentFarm.alerts.agentVoices` holds
// it, `alerts.voice.set scope=agent` writes it, and the Sound page's Sessions
// section has an Agents tab whose boxes post the same write.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const A = require(path.join(ROOT, 'out', 'core', 'soundAgents.js'));
const V = require(path.join(ROOT, 'out', 'core', 'alertVoices.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fx = require(path.join(__dirname, 'fixtures', 'sound.js'));
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- the pure core -------------------------------------------------------
{
    const one = A.withAgentVoice({}, 'developer', 'question', 'af_zen_chime');
    ok('a choice is written under the agent and the event',
        one.developer && one.developer.question === 'af_zen_chime');
    const two = A.withAgentVoice(one, 'developer', 'stalled', 'af_marimba_success');
    ok('a second event keeps the first, and the input map is not mutated',
        two.developer.question === 'af_zen_chime' && two.developer.stalled === 'af_marimba_success' && !one.developer.stalled);
    const cleared = A.withAgentVoice(A.withAgentVoice(two, 'developer', 'question', ''), 'developer', 'stalled', '');
    ok('‼️ clearing every choice leaves no trace of the agent', !('developer' in cleared));
    const rows = A.agentSoundRows(['psikolog', 'developer', 'developer'], ['turn-ready', 'question'], one,
        (event, agent) => ({ voice: agent === 'developer' && event === 'question' ? 'af_zen_chime' : 'x', origin: agent === 'developer' && event === 'question' ? 'agent' : 'default' }));
    ok('rows are one per agent, sorted, every event', rows.length === 2 && rows[0].name === 'developer' && rows[0].tones.length === 2);
    ok('…each tone carries the choice and what resolves',
        rows[0].tones[1].chosen === 'af_zen_chime' && rows[0].tones[1].origin === 'agent' && rows[0].tones[0].chosen === '');
}

// ---- the chain itself: the step answers now ------------------------------
{
    const dir = path.join(ROOT, 'media', 'sounds');
    const deps = (extra) => Object.assign({
        soundsDir: dir, exists: () => true,
        backends: [{ backend: 'test', formats: ['wav', 'mp3', 'ogg'] }]
    }, extra);
    const zen = V.resolveVoice('question', deps({ agent: n => n === 'developer' ? { question: 'af_zen_chime' } : undefined }),
        { agentName: 'developer' });
    ok('‼️ the agent step answers for its agent', zen.voice === 'af_zen_chime' && zen.origin === 'agent');
    const other = V.resolveVoice('question', deps({ agent: n => n === 'developer' ? { question: 'af_zen_chime' } : undefined }),
        { agentName: 'psikolog' });
    ok('…and not for another agent', other.origin !== 'agent');
    const own = V.resolveVoice('question', deps({
        agent: () => ({ question: 'af_zen_chime' }), session: () => ({ question: 'af_marimba_success' })
    }), { sessionId: 's1', agentName: 'developer' });
    ok('a session\'s own choice still beats its agent', own.origin === 'session');
}

// ---- the page: Sessions › Agents ------------------------------------------
{
    const p = runPage(fx.script, fx.inUse());
    ok('the Sessions section opens on its Sessions tab', !/class="settbl sstbl sagtbl"/.test(p.html()));
    p.query('#sstab-agents')[0].click();
    const html = p.html();
    ok('‼️ pressing Agents draws every agent with every event',
        /sagtbl/.test(html) && (html.match(/data-sagvoice="developer\|/g) || []).length === 5);
    ok('…and the count says how many have a tone of their own', /4 agents · 2 with a tone of their own/.test(html));
    ok('a box shows the agent\'s own choice', /data-sagvoice="developer\|question"[^>]*title="Plays: [^"]*this agent&#39;s choice/.test(html)
        || /data-sagvoice="developer\|question"[^>]*title="Plays: [^"]*this agent's choice/.test(html));
    ok('…and an empty one reads all\'s, never silence', /all&#39;s<\/option>|all's<\/option>/.test(html));
    const box = p.query('[data-sagvoice]').find(b => b.dataset.sagvoice === 'psikolog|turn-ready');
    box.value = 'af_zen_chime';
    box.dispatchEvent(new p.sandbox.Event('change'));
    const m = p.last();
    ok('‼️ a box goes to the HOST as alertAgentVoice: agent, event, voice',
        m.type === 'alertAgentVoice' && m.agent === 'psikolog' && m.event === 'turn-ready' && m.voice === 'af_zen_chime');
    const fbox = p.query('#ssfilter')[0];
    fbox.value = 'psik';
    fbox.dispatchEvent(new p.sandbox.Event('input'));
    const tbl = p.sandbox.document.getElementById('sstable').innerHTML;
    ok('the section\'s one filter box narrows the agents too (AFQuery, compiled where its grammar is offered)',
        /data-sagvoice="psikolog\|/.test(tbl) && !/data-sagvoice="developer\|/.test(tbl));
}

// ---- the host side: one setting, one write, one op ------------------------
{
    const ext = src('src/extension.ts');
    ok('‼️ the chain\'s agent step reads the setting',
        /agent: agentName => agentVoicesCfg\(\)\[agentName\]/.test(ext));
    ok('alerts.voice.set takes scope agent through alertsSetAgentVoice',
        /if \(scope === 'agent'\) \{[\s\S]{0,200}await alertsSetAgentVoice\(agent, event, voice\);/.test(ext));
    ok('…through the same refusals as the settings step',
        /const alertsSetAgentVoice = [\s\S]{0,900}usableVoice\(voice\)/.test(ext)
        && /const alertsSetVoice = [\s\S]{0,120}usableVoice\(voice\)/.test(ext));
    ok('alerts.status answers the agents too', /sessions: soundSessionRows\(\), agents: soundAgentRows\(\)/.test(ext));
    const panel = src('src/panels/soundPanel.ts');
    ok('the page\'s box runs the function the op runs',
        /msg\.type === 'alertAgentVoice'[\s\S]{0,200}this\.deps\.alertsSetAgentVoice/.test(panel));
    const pkg = JSON.parse(src('package.json'));
    const props = Object.assign({}, ...[].concat(pkg.contributes.configuration).map(c => c.properties || {}));
    ok('the setting exists, an object of objects', props['agentFarm.alerts.agentVoices']
        && props['agentFarm.alerts.agentVoices'].type === 'object');
    ok('…and is filed beside the other sound settings', /'alerts\.agentVoices': 'live'/.test(src('src/core/settingsops.ts')));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
