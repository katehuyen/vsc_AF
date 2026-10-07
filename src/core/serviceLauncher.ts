/**
 * ‼️ THE INSTALLED HEADLESS SERVICE RUNS THE BUILD THAT LAST STARTED.
 *
 * The scheduled task runs `<storage>/farm-service.js`, a copy that has to
 * outlive every extension update (each version lives in its own folder, and the
 * old one is deleted). The service itself is not one file: it requires its
 * compiled siblings (`../core/…`, `../remote/…`), so a copied farmService.js
 * died at its first line — measured: `Cannot find module '../core/aftime'`,
 * and nothing ran while VS Code was closed. So the copy is this launcher: it
 * reads `serviceScript` out of `service-config.json` — which every activation
 * rewrites with the running build's own `out/service/farmService.js` — and
 * runs that, with the same arguments.
 */
import * as fs from 'fs';

/** The whole launcher, as the task runs it. Plain node, no dependencies. */
export function serviceLauncher(): string {
    return [
        '// Agent Farm headless service launcher - runs the service of the Agent Farm build that last started.',
        '// Written by Agent Farm (serviceLauncher.ts); service-config.json names the script.',
        '\'use strict\';',
        'const fs = require(\'fs\');',
        'const path = require(\'path\');',
        'const at = process.argv.indexOf(\'--storage\');',
        'const storage = at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : __dirname;',
        'let script = \'\';',
        'try { script = String(JSON.parse(fs.readFileSync(path.join(storage, \'service-config.json\'), \'utf8\')).serviceScript || \'\'); } catch (e) { script = \'\'; }',
        'if (!script || !fs.existsSync(script)) {',
        '    console.error(new Date().toISOString() + \' Agent Farm service: no service script to run (\' + (script || \'service-config.json names none\') + \') - start VS Code once so Agent Farm writes it.\');',
        '    process.exit(1);',
        '}',
        'require(script);',
        ''
    ].join('\n');
}

/** An installed copy that is not today's launcher is replaced; true = it was. Absent = not installed, left alone. */
export function repairLauncher(file: string): boolean {
    try {
        if (!fs.existsSync(file)) { return false; }
        const want = serviceLauncher();
        if (fs.readFileSync(file, 'utf8') === want) { return false; }
        fs.writeFileSync(file, want, 'utf8');
        return true;
    } catch { return false; }
}
