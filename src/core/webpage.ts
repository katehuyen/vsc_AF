/**
 * The page the web surface serves — one self-contained HTML document.
 *
 * No build step, no assets, no external requests: a phone on the same Wi-Fi
 * gets everything in the first response and then polls `/snapshot.json`. It is
 * deliberately a *reading* surface — the same figures the panel shows, sized
 * for a thumb — and it says out loud when what it is showing has stopped
 * being live.
 */

export function renderPage(): string {
    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<title>Agent Farm</title>
<style>
  :root { --bg:#14161a; --card:#1c1f26; --fg:#e6e6e6; --muted:#9aa0a6; --line:#2b2f38;
          --green:#4caf50; --blue:#3794ff; --yellow:#cca700; --red:#f14c4c; --orange:#d18616; }
  @media (prefers-color-scheme: light) {
    :root { --bg:#f6f7f9; --card:#fff; --fg:#1f2328; --muted:#5c6370; --line:#e2e5ea; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         padding:12px 12px 40px; -webkit-text-size-adjust:100%; }
  h1 { font-size:17px; margin:0 0 2px; display:flex; align-items:center; gap:8px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted);
       margin:22px 0 8px; }
  .sub { color:var(--muted); font-size:12px; margin-bottom:14px; }
  .banner { background:var(--orange); color:#111; padding:8px 12px; border-radius:8px;
            font-size:12px; margin:0 0 14px; }
  .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(104px,1fr)); gap:8px; }
  .kpi { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
  .kpi .n { font-size:20px; font-weight:600; }
  .kpi .l { font-size:11px; color:var(--muted); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px;
          padding:10px 12px; margin-bottom:8px; }
  .row { display:flex; gap:10px; align-items:baseline; justify-content:space-between; }
  .row .t { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .row .r { color:var(--muted); font-size:12px; white-space:nowrap; }
  .d { color:var(--muted); font-size:12px; margin-top:2px;
       overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:6px; }
  .tag { font-size:10px; padding:1px 7px; border-radius:9px; border:1px solid var(--line);
         color:var(--muted); margin-left:6px; white-space:nowrap; }
  .lvl3, .lvl4 { border-color:var(--red); color:var(--red); }
  .empty { color:var(--muted); font-size:12px; padding:6px 2px; }
  footer { color:var(--muted); font-size:11px; margin-top:26px; line-height:1.6; }
  .ref { float:right; background:none; border:1px solid var(--line); color:var(--muted);
         border-radius:8px; padding:4px 10px; font-size:12px; }
</style></head>
<body>
<button class="ref" onclick="load(true)">↻</button>
<h1><span class="dot" id="pulse" style="background:var(--muted)"></span>Agent Farm</h1>
<div class="sub" id="sub">loading…</div>
<div id="banner"></div>
<div class="kpis" id="kpis"></div>
<div id="body"></div>
<footer id="foot"></footer>
<script>
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const usd = n => '$' + (Number(n) || 0).toFixed(2);
const tok = n => { n = Number(n) || 0; return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n); };
const ago = ts => {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return s + 's ago';
  const m = Math.round(s/60); if (m < 60) return m + 'm ago';
  const h = Math.round(m/60); if (h < 24) return h + 'h ago';
  return Math.round(h/24) + 'd ago';
};
const STATUS = { working:'var(--blue)', tool:'var(--green)', 'waiting-permission':'var(--red)',
                 'waiting-input':'var(--yellow)', stalled:'var(--orange)' };

function list(rows, render, emptyText) {
  return rows && rows.length ? rows.map(render).join('') : '<div class="empty">' + emptyText + '</div>';
}

function render(s) {
  const age = Math.max(0, Math.round((Date.now() - s.ts) / 1000));
  const stale = s.writer === 'service' || age > 75;
  $('pulse').style.background = stale ? 'var(--orange)' : 'var(--green)';
  $('sub').textContent = s.host + ' · snapshot ' + ago(s.ts);
  $('banner').innerHTML = stale
    ? '<div class="banner">' + (s.writer === 'service'
        ? 'VS Code is closed. The headless service keeps schedules running and is serving the last snapshot it has.'
        : 'This snapshot stopped updating ' + ago(s.ts) + ' — VS Code was probably closed.') + '</div>'
    : '';
  const t = s.totals || {};
  $('kpis').innerHTML = [
    ['Today', usd(t.costToday)], ['30 days', usd(t.cost30)],
    ['Active', (t.activeAgents||0) + '/' + (t.agents||0)],
    ['Needs you', t.needs || 0], ['Unread', t.unreadNotices || 0],
    ['Running', t.runningTasks || 0]
  ].map(([l, n]) => '<div class="kpi"><div class="n">' + esc(n) + '</div><div class="l">' + l + '</div></div>').join('');

  let html = '';
  html += '<h2>Needs you (' + (s.needs||[]).length + ')</h2>' + list(s.needs, n =>
    '<div class="card"><div class="row"><span class="t">' + esc(n.title) + '</span><span class="r">' + ago(n.ts) + '</span></div>'
    + (n.detail ? '<div class="d">' + esc(n.detail) + '</div>' : '') + '</div>', 'Nothing is blocked on you.');

  html += '<h2>Live sessions</h2>' + list(s.live, x =>
    '<div class="card"><div class="row"><span class="t"><span class="dot" style="background:' + (STATUS[x.status]||'var(--muted)') + '"></span>'
    + esc(x.agent) + '</span><span class="r">' + esc(x.status) + '</span></div>'
    + '<div class="d">' + esc(x.title) + '</div></div>', 'No session is running.');

  html += '<h2>Agents</h2>' + list(s.agents, a =>
    '<div class="card"><div class="row"><span class="t"><span class="dot" style="background:' + (a.active ? 'var(--green)' : 'var(--muted)') + '"></span>'
    + esc(a.name) + (a.project && a.project !== 'Unassigned' ? '<span class="tag">' + esc(a.project) + '</span>' : '')
    + '</span><span class="r">' + usd(a.costToday) + ' today</span></div>'
    + '<div class="d">' + (a.quietDays < 0 ? 'never ran' : a.quietDays === 0 ? 'active today' : a.quietDays + ' days quiet')
    + ' · ' + usd(a.cost30) + ' in 30d</div></div>', 'No agents.');

  if ((s.projects||[]).length) {
    html += '<h2>Projects</h2>' + list(s.projects, p =>
      '<div class="card"><div class="row"><span class="t">' + esc(p.name) + '</span><span class="r">' + usd(p.costToday) + ' today</span></div>'
      + '<div class="d">' + p.agents + ' agents · ' + p.sessions + ' sessions · ' + usd(p.cost) + ' total</div></div>', '');
  }

  html += '<h2>Notices</h2>' + list(s.notices, n =>
    '<div class="card"><div class="row"><span class="t">' + (n.unread ? '● ' : '') + esc(n.title)
    + '<span class="tag lvl' + (n.level||1) + '">' + esc(n.type) + '</span></span><span class="r">' + ago(n.ts) + '</span></div></div>',
    'No notices.');

  html += '<h2>Recent sessions</h2>' + list(s.sessions, x =>
    '<div class="card"><div class="row"><span class="t">' + esc(x.title) + '</span><span class="r">' + ago(x.ts) + '</span></div>'
    + '<div class="d">' + esc(x.agent) + (x.project && x.project !== 'Unassigned' ? ' · ' + esc(x.project) : '')
    + ' · ' + x.turns + ' turns · ' + usd(x.cost) + '</div></div>', 'No sessions yet.');

  if ((s.tasks||[]).length) {
    html += '<h2>Tasks</h2>' + list(s.tasks, x =>
      '<div class="card"><div class="row"><span class="t">' + esc(x.title) + '</span><span class="r">' + esc(x.status) + '</span></div>'
      + '<div class="d">' + esc(x.agent) + ' · ' + ago(x.ts) + '</div></div>', '');
  }
  $('body').innerHTML = html;
  $('foot').textContent = 'Read-only view · tokens ' + tok(t.tokensToday) + ' today · served by the '
    + (s.writer === 'service' ? 'headless service' : 'VS Code extension')
    + '. Nothing here starts, stops or changes anything — the farm is driven from the machine itself.';
}

let timer = null;
function load(manual) {
  fetch('snapshot.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
    .then(render)
    .catch(e => { $('sub').textContent = 'cannot reach the farm — ' + e.message; $('pulse').style.background = 'var(--red)'; });
  if (manual) { return; }
}
load();
timer = setInterval(load, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { load(); } });
</script>
</body></html>`;
}
