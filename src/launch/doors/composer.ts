import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick, withAccount } from './index';

/**
 * ‼️ X-506 — WHAT EVERY DOOR HANDS THE CONSOLE COMPOSER, NAMED ONCE.
 *
 * Five doors opened the composer on a setup they had settled, and each wrote
 * the fields out by hand inside `ConsolePanel.show({ launch: … })`. Two of them
 * left out `providerId` and `tier`: a saved profile on a route opened the
 * composer on the route's model with no route under it, and the first message
 * went to the default endpoint. A door now passes `composerSetup(o)` — the
 * whole setup through this one list — and `test_console_route_parity.js`
 * refuses a `launch:` written out at a call site.
 */
export const COMPOSER_SETUP_KEYS = [
    'account', 'model', 'effort', 'permissionMode', 'providerId', 'tier', 'superpowers', 'prompt'
] as const;

export interface ComposerSetup {
    model?: string; effort?: string; permissionMode?: string;
    prompt?: string; superpowers?: boolean;
    /** X-103 — the route the calling door settled; the composer narrows it by its engine. */
    providerId?: string; tier?: string;
    /** X-169 — the sign-in the calling door resolved. Absent leaves the
     *  engine's active account to answer at the spawn. */
    account?: string;
}

export const composerSetup = (o: object): ComposerSetup =>
    pick(o as never, COMPOSER_SETUP_KEYS) as ComposerSetup;

/** The route a setup record names; the tier only with the route it belongs to. */
export function setupRoute(o: { providerId?: string; tier?: string }): { providerId: string; tier?: string } | undefined {
    const providerId = String(o.providerId ?? '').trim();
    const tier = String(o.tier ?? '').trim();
    return providerId ? { providerId, ...(tier ? { tier } : {}) } : undefined;
}

export const composerDoor: LaunchDoor = {
    id: 'composer',
    label: 'Console composer',
    surface: 'console',
    why: 'the pre-spawn strip. X-103 put providerId and tier on the type and this is the door '
        + 'that went three versions without a box for either - the failure the family is named after.',
    exempt: {
        cli: 'M-22 - the Console hosts an ENGINE process; a CLI profile is a different program.',
        continueLast: 'a card is resumed by id, because the Console knows which seat it is.'
    },
    /**
     * The fields HostedSessionInit really carries (src/core/consolehost.ts).
     * variant and name are NOT among them, and they are left as GAPS rather than
     * exempted: nobody has decided they do not belong here, and a gap somebody
     * has to look at is worth more than an excuse nobody wrote.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return withAccount(ctx, pick(ctx.seed(ctx.agentId ?? '', ctx.picked as never),
            ['engine', ...COMPOSER_SETUP_KEYS, 'resume']));
    }
};
