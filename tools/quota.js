// Quota probe — reads the same endpoint Claude Code's /usage uses.
//
// ‼️ IT READS THE WINDOW OF THE ACCOUNT THIS SESSION IS ACTUALLY RUNNING AS.
// A session started from an Agent Farm account slot carries CLAUDE_CONFIG_DIR
// and its credentials live THERE; `credentialsPath()` defaults to ~/.claude,
// which belongs to whatever account the machine happens to be signed in as.
// Measured 2026-09-06: this script was calling the default and reporting 0%
// for an account the session had not spent a token on — under the 90% rule
// that reading would have kept a session working past its own wall.
// So the directory is resolved here and PRINTED: if that line names an account
// you are not running as, the number below it is a stranger's.
const path = require('path');
const { readOauthCredentials, credentialsPath, fetchUsage, usageUserAgent, buildBars } =
  require('../out/core/planusage.js');
(async () => {
  const dir = String(process.env.CLAUDE_CONFIG_DIR || '').trim();
  const file = dir ? path.join(dir, '.credentials.json') : credentialsPath();
  console.log('config dir   ' + (dir || '(home) ' + path.dirname(file)));
  const cred = readOauthCredentials(file);
  if (!cred) { console.log('no-auth: credentials not readable at ' + file); process.exit(1); }
  const res = await fetchUsage(cred.token, usageUserAgent());
  if (res.status !== 200) { console.log('status', res.status, res.body.slice(0, 200)); process.exit(1); }
  const bars = buildBars(JSON.parse(res.body));
  for (const b of bars) {
    const r = b.resetsAt ? new Date(b.resetsAt).toLocaleString('tr-TR') : '—';
    console.log(`${b.id.padEnd(12)} ${String(b.percent).padStart(3)}%  resets ${r}`);
  }
})();
