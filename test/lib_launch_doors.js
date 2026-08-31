// X-151 — THE 13 LAUNCH DOORS, CALLED RATHER THAN GREPPED.
//
// ‼️ WHAT CHANGED HERE, AND WHY IT IS THE WHOLE ITEM.
//
// This file used to describe each door by the SOURCE REGION it lives in, and a
// cell was "carried" when a dimension's name appeared somewhere in that region.
// That was the best measurement available while the doors lived inside quickpick
// loops and message handlers in a 30.476-line file — and it was a bad one in two
// directions at once: a door that passes a whole `LaunchOptions` through names
// none of its fields and read as thirteen gaps, while a door that merely
// MENTIONS a dimension in a comment read as carrying it.
//
// The doors are modules now (`src/launch/doors/`). So the question is asked the
// only way that cannot be fooled: **hand the door every dimension there is, call
// it, and see what comes out the other side.** A dimension that does not survive
// the call is not carried, whatever the source says about it.
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { ALL_LAUNCH_DOORS } = require(path.join(ROOT, 'out', 'launch', 'doors', 'all.js'));
const { doorExemptions, FARM_RESOLVED } = require(path.join(ROOT, 'out', 'launch', 'doors', 'index.js'));

/**
 * ‼️ THE FIXTURE IS THE SEEDERS, NOT A DOOR'S INSIDES — and each one answers
 * with exactly the fields the real function answers with, or the measurement
 * lies in the door's favour.
 *
 *  · `seed` is `seedLastLaunch` = `withLastLaunch(o, record)`: whatever the
 *    caller passed, plus the eight remembered dimensions. It does NOT invent a
 *    prompt, a name or a resume — those are the session's, not the setup's.
 *  · `engineSeed` is `agentEngineSeed` = per-engine defaults resolved from
 *    Settings (X-145). ‼️ `superpowers` is absent from it ON PURPOSE, which is
 *    why `treeRow` names that exemption.
 *  · `picked` is everything a person could conceivably have answered AT the
 *    door, so a door that offers a dimension is seen to carry it.
 */
const REMEMBERED = {
    engine: 'claude', model: 'opus', effort: 'high', permissionMode: 'plan',
    providerId: 'route-1', tier: 'big', variant: 'thinking', superpowers: true
};
const PER_ENGINE = {
    engine: 'claude', model: 'opus', effort: 'high', permissionMode: 'plan',
    providerId: 'route-1', tier: 'big', variant: 'thinking'
};
const EVERYTHING = {
    ...REMEMBERED,
    permission: { mode: 'plan' }, name: 'nightly', prompt: 'go',
    resume: 'sess-1', continueLast: true,
    projectContextFile: 'C:/tmp/brief.md', cwd: 'C:/work', cli: 'my-profile'
};

function fixtureCtx() {
    return {
        agentId: 'agent-1',
        engine: 'claude',
        project: 'prj-1',
        seed: (_id, o) => ({ ...(o || {}), ...REMEMBERED }),
        engineSeed: (_id, engine) => ({ ...PER_ENGINE, engine }),
        picked: { ...EVERYTHING }
    };
}

/** What this door really hands on, measured by calling it. */
function carries(door) {
    const out = door.collect(fixtureCtx()) || {};
    return Object.keys(out).filter(k => out[k] !== undefined);
}

module.exports = {
    LAUNCH_DOORS: ALL_LAUNCH_DOORS,
    doorExemptions, FARM_RESOLVED,
    fixtureCtx, carries, EVERYTHING
};
