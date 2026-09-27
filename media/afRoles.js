// Agent Farm — ROLE SLOTS (M-53). A step can name a role (senarist, kurgu,
// yayinci …) instead of an agent: the Role box on its card. Which agent fills
// the role is this workflow's choice on its form (Roles), else the showrunner —
// Farm Settings agentFarm.showrunner, default youtuber, who takes every role a
// workflow leaves open (the flex point workflow.role, media/afFlex.js;
// resolved in src/core/workflowRoles.ts). The bridge: workflows.add roles=,
// steps[].role, and workflows.roles says who fills what and why.
(function () {
    'use strict';
    const WF = 'wf-roles';
    // M-53 — Run with…: this run's own agent per role (the flex point's run level)
    const RUN = 'wi-roles';
    const KNOWN = ['senarist', 'prompt', 'kurgu', 'yayinci'];

    /** Every role the composer's steps name, first appearance first. */
    function rolesOf(c) {
        const seen = [];
        (c.steps || []).concat(c.step ? [c.step] : []).forEach(s => {
            const r = String((s && s.role) || '').trim();
            if (r && seen.indexOf(r) < 0) { seen.push(r); }
        });
        return seen;
    }

    /** The workflow form's Roles box: one picker per role the steps name. */
    function workflowBox(c, agents, showrunner, C) {
        const roles = rolesOf(c);
        const own = c.roles || {};
        const lead = showrunner || 'youtuber';
        const head = `<div class="ntsec" id="nt-${WF}"><b>Roles</b>
            <span class="muted small">A step can name a role instead of an agent. Pick who fills each one here — a role left to the showrunner goes to <b>${C.esc(lead)}</b> (Farm Settings).</span></div>`;
        if (!roles.length) {
            return `${head}<div class="muted small">No step names a role — give a step a Role instead of an agent and it turns up here.</div>`;
        }
        const rows = roles.map(r => {
            const cur = own[r] || '';
            const gone = cur && (agents || []).indexOf(cur) < 0
                ? C.option(cur, '⚠ ' + cur, { selected: true, detail: 'No such agent any more — saving is refused until another is picked.' }) : '';
            const opts = C.option('', lead + ' — showrunner', { selected: !cur, detail: 'Left open: the showrunner ' + lead + ' fills it (Farm Settings agentFarm.showrunner).' })
                + gone + (agents || []).map(a => C.option(a, a, { selected: a === cur, detail: a + ' fills role ' + r + ' in every run of this workflow.' })).join('');
            const tip = (cur || lead) + '\n\n' + (cur
                ? 'This workflow gives role ' + r + ' to ' + cur + '.'
                : 'Nobody is named here, so the showrunner ' + lead + ' fills role ' + r + ' (Farm Settings agentFarm.showrunner).');
            return `<label class="ntf thin" title="${C.esc(tip)}"><span>${C.esc(r)}</span>
                <select id="nt-wf-role-${C.esc(r)}">${opts}</select></label>`;
        }).join('');
        return `${head}<div class="ntgrid">${rows}</div>`;
    }

    function wireWf(byId, getC) {
        const c = getC();
        if (!c) { return; }
        rolesOf(c).forEach(r => byId('nt-wf-role-' + r, 'change', e => {
            const cc = getC();
            if (!cc) { return; }
            cc.roles = Object.assign({}, cc.roles || {});
            if (e.target.value) { cc.roles[r] = e.target.value; } else { delete cc.roles[r]; }
        }));
    }

    /** The step card's Role box — on the kinds an agent runs. */
    function stepField(s, c, C) {
        if (!s || (s.stype !== 'agent' && s.stype !== 'browser')) { return ''; }
        const cur = s.role || '';
        const list = KNOWN.concat(rolesOf(c)).filter((x, i, a) => a.indexOf(x) === i);
        const tip = (cur || 'no role — the Agent box runs this step') + '\n\n'
            + 'A role instead of an agent: the step runs as whoever fills the role — the workflow\'s Roles box, else the showrunner. The Agent box is then not used.';
        return `<label class="ntf" title="${C.esc(tip)}"><span>Role</span>
            <input type="text" id="nt-st-role" list="nt-st-role-list" value="${C.esc(cur)}" placeholder="or a role: senarist, kurgu…">
            <datalist id="nt-st-role-list">${list.map(x => `<option value="${C.esc(x)}"></option>`).join('')}</datalist></label>`;
    }

    function wireStep(byId, getS, rerender) {
        byId('nt-st-role', 'change', e => {
            const s = getS();
            if (!s) { return; }
            s.role = String(e.target.value || '').trim();
            if (rerender) { rerender(); }
        });
    }

    /** Run with…: one box per role the steps name — this run's own agent, over the workflow's and the showrunner. `p.roleSlots` = [{role, agent, from}]. */
    function runBoxes(p, run, agents, Fm) {
        return (p.roleSlots || []).map(s => {
            const mine = (run.roles || {})[s.role] || '';
            const whose = s.from === 'workflow' ? 'the workflow\'s' : 'the showrunner';
            const base = s.agent || '?';
            return Fm.sel(RUN + '.' + s.role, s.role, [{ id: '', label: base + ' — ' + whose }].concat((agents || []).map(a => ({ id: a, label: a }))), mine, {
                tip: (mine ? mine + ' — this run' : base + ' — ' + whose) + '\n\nWho fills role ' + s.role + ' in this run only; the workflow keeps its own.',
                redraw: true
            });
        }).join('');
    }

    function applyRun(p, run, values) {
        (p.roleSlots || []).forEach(s => {
            const v = values[RUN + '.' + s.role];
            if (v === undefined) { return; }
            run.roles = Object.assign({}, run.roles || {});
            if (v) { run.roles[s.role] = v; } else { delete run.roles[s.role]; }
        });
    }

    /** A role step in the list: the role and who fills it — the workflow's binding, else the showrunner. */
    function who(role, c, showrunner) {
        return role + ' → ' + (((c && c.roles) || {})[role] || showrunner || 'youtuber');
    }

    window.AFRoles = { workflowBox, wireWf, stepField, wireStep, rolesOf, runBoxes, applyRun, who };
})();
