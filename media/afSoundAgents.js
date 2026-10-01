// Agent Farm — 🔊 SOUND › SESSIONS › AGENTS (U-187). The agent step of the tone
// chain: one tone for every session of one agent, above the fleet's choice and
// below a session's own. Each box posts alertAgentVoice, the function
// `alerts.voice.set scope=agent` runs; its hover says what plays and from where
// (MIRROR). Clearing a box is never silence — the fleet's choice answers again.
(function () {
    const C = window.AFCharts;
    const T = () => window.AFTip;
    const S = () => window.AFSoundCard;
    const ORIGIN = { agent: 'this agent\'s choice', settings: 'the fleet\'s choice', default: 'the built-in default' };
    const evName = e => ((S().EVENT_TEXT || {})[e] || [e])[0];
    const differs = a => (a.tones || []).some(t => t.chosen);
    const fleetVoice = (al, event) => ((al.events || []).find(e => e.event === event) || {}).voice || '';

    function cell(al, a, t) {
        const fleet = S().voiceName(al, fleetVoice(al, t.event));
        const tip = `Plays: ${S().voiceName(al, t.voice)} — ${ORIGIN[t.origin] || t.origin}`
            + `\n\n${evName(t.event)} for every session of ${a.name}. A session's own choice still wins; `
            + `clearing this hands the answer back to the fleet's choice (${fleet}), never to silence.`;
        return `<td><select data-sagvoice="${C.esc(a.name)}|${C.esc(t.event)}" title="${C.esc(tip)}">
            ${C.option('', 'all\'s', { selected: !t.chosen, detail: `The fleet's choice answers: ${fleet}` })}${S().toneGroups(al, t.chosen)}</select></td>`;
    }

    function row(al, a) {
        const lines = (a.tones || []).map(t => `${evName(t.event)}: ${S().voiceName(al, t.voice)} — ${ORIGIN[t.origin] || t.origin}`);
        const own = (a.tones || []).filter(t => t.chosen).length;
        return `<tr><td>${T().wrap(`<span class="ssname">${C.esc(a.name)}</span>`,
            `${a.name} — ${own ? `${own} tone${own === 1 ? '' : 's'} of its own` : 'like all'}`, T().lines(lines))}</td>
            ${(a.tones || []).map(t => cell(al, a, t)).join('')}</tr>`;
    }

    /** The Agents tab: every agent, every event, filtered by the Sessions section's own box (`q`, compiled there). */
    function agentsTable(d, q, show) {
        const al = d.alerts || {};
        const all = d.agents || [];
        if (!all.length) { return '<p class="muted">No agent was found under the agent roots.</p>'; }
        const rows = all.filter(a => (show === 'all' || differs(a)) && q.test(a.name));
        if (!rows.length) { return `<p class="muted">No agent matches${show === 'differs' ? ' among those with a tone of their own' : ''}.</p>`; }
        const events = (rows[0].tones || []).map(t => t.event);
        return `<style id="sag-style">
            .sagtbl { width:100%; max-width:900px; table-layout:fixed; }
            .sagtbl th:first-child { width:150px; }
            .sagtbl td:first-child { overflow:hidden; text-overflow:ellipsis; }
            .sagtbl select { width:100%; }
        </style><table class="settbl sstbl sagtbl"><thead><tr>
            <th title="The agent — hover for what each event plays for its sessions and why">Agent</th>
            ${events.map(e => `<th title="${C.esc(((S().EVENT_TEXT || {})[e] || ['', ''])[1])}">${C.esc(evName(e))}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(a => row(al, a)).join('')}</tbody></table>`;
    }

    function wireAgents(vscode) {
        document.querySelectorAll('[data-sagvoice]').forEach(el => el.addEventListener('change', () => {
            const v = String(el.dataset.sagvoice);
            const at = v.lastIndexOf('|');
            vscode.postMessage({ type: 'alertAgentVoice', agent: v.slice(0, at), event: v.slice(at + 1), voice: el.value });
        }));
    }

    window.AFSoundCard = Object.assign(window.AFSoundCard || {}, { agentsTable, wireAgents, agentDiffers: differs });
})();
