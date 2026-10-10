/**
 * X-533 — THE SESSION ID A TASK'S LAUNCH BINDING DECLARES.
 *
 * A declared id beats every clock-and-folder guess (launchBinding.ts). A run is
 * told its id when it resumes, when the Console hosts it, or when Claude is given
 * `--session-id`; an OpenCode `run` is told nothing and PUBLISHES its id on its own
 * stream instead, which tasks.ts reads the moment it appears into `runSessionId`.
 * That is a declaration too. Left out, a headless OpenCode run sharing a folder and
 * a minute with other OpenCode runs matched none of them and was filed as the
 * user's own interactive session — and lost its manifest, so its route as well.
 * Every other engine's `runSessionId` may be a clock match written back, so it is
 * not declared here. Pure.
 */
export interface RunSessionFacts {
    engine?: string;
    mode?: string;
    resumeSessionId?: string;
    hostedSessionId?: string;
    spawnSessionId?: string;
    runSessionId?: string;
}

export function runDeclaredSession(t: RunSessionFacts): string | undefined {
    const published = t.engine === 'opencode' && t.mode !== 'interactive' ? t.runSessionId : undefined;
    return t.resumeSessionId || t.hostedSessionId || t.spawnSessionId || published || undefined;
}
