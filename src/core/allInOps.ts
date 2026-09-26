import { BridgeRegistry, need, optBool, optStr } from './bridge';
import { ALLIN_UNSURE, AllInReport, AllInUnsure } from './allInIntake';
import { resolveFlex } from './flexResolve';

/** X-422 — the all_in pass on the bridge; the manager's daily media batch calls it too. */
export interface AllInOpsDeps {
    /** the Farm setting agentFarm.allInUnsure */
    setting(): unknown;
    /** the Farm setting agentFarm.allInWhen */
    when(): unknown;
    run(a: { base?: string; lang?: string; apply: boolean; start: boolean; unsure: AllInUnsure; spec: Record<string, unknown> }): Promise<AllInReport>;
}

export function registerAllInOps(bridge: BridgeRegistry, deps: AllInOpsDeps): void {
    bridge.register([{
        op: 'media.allin',
        describe: 'X-422 — PROCESS THE WAITING AREA media_<base>\\all_in\\ (files the user dropped that nobody has processed; agents never put anything there): each image is looked at by claude (Read), each video by agy (its frames), and given a stage — source | raw | semi | final, never asset (that is a promotion). A file the model is SURE of is filed and recorded (as media.record: moved to <root>\\media_<base>\\<type>\\<stage>\\, fingerprint, probe) and its form filled (as media.enrich). A file it is not sure of, an audio file (no model here can hear), and a file that is not media STAY where they are — unsure=ask posts one Notices question listing them, unsure=wait leaves them for the next pass (flex point library.allin.unsure: the setting agentFarm.allInUnsure, then this argument). DRY RUN BY DEFAULT: apply=true looks, moves and writes — about two model turns per file (the stage, then the form). A base whose engine does not answer is left alone, said. WHEN (flex point library.allin.when, setting agentFarm.allInWhen daily|manual): the manager\'s daily media batch calls this with scheduled=true, and that pass is skipped when the setting says manual; a call without scheduled always runs. args: base? (default every base under every media root), lang?, apply? (default false), unsure? (ask|wait), model? / videoModel? / effort? (as media.enrich; defaults library.enrich.*), autoStart? (true = a stopped engine may be started), scheduled? (true = a timed pass, honours library.allin.when). Returns {skipped?, whenWhy?} for a skipped timed pass, else {dryRun, unsure, unsureWhy, bases, down?, counts {filed, unsure, unknown, failed, waiting}, items [{file, base, action, why, engine?, stage?, target?, id?, filled?, costUsd?}], lines, asked? (the notice id)}.',
        handler: async (args) => {
            const base = optStr(args, 'base');
            need(!base || /^[\w.\- ]{1,80}$/.test(base), 'base is a plain name');
            const asked = optStr(args, 'unsure');
            need(!asked || (ALLIN_UNSURE as readonly string[]).includes(asked), `unsure is ${ALLIN_UNSURE.join(' | ')}`);
            const w = deps.when();
            const when = resolveFlex('library.allin.when', w ? { settings: w } : {});
            if (optBool(args, 'scheduled') && when.value === 'manual') {
                return { skipped: true, whenWhy: when.sentence, lines: [`Skipped — all_in is processed by hand only (${when.sentence}); call media.allin without scheduled to run it now.`] };
            }
            const s = deps.setting();
            const f = resolveFlex('library.allin.unsure', { ...(s ? { settings: s } : {}), ...(asked ? { run: asked } : {}) });
            const spec: Record<string, unknown> = {};
            for (const k of ['model', 'videoModel', 'effort']) { const v = optStr(args, k); if (v) { spec[k] = v; } }
            const r = await deps.run({ base, lang: optStr(args, 'lang'), apply: optBool(args, 'apply'), start: optBool(args, 'autoStart'), unsure: String(f.value) as AllInUnsure, spec });
            return { ...r, unsureWhy: f.sentence };
        }
    }]);
}
