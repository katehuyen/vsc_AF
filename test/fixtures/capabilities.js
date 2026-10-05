/**
 * The Capability Matrix — who has which skill, MCP server, memory file and duty, and what is used.
 *
 * ‼️ THE SHAPE IS THE POINT. A matrix is a row name beside one cell per agent, so the agents here
 * are five (more than a phone's width) with a name past the header's ten letters, the rows carry
 * names and Windows paths at real length, and every cell kind is present: used, idle, disabled,
 * diverged, missing with a donor (＋), missing with none, a shared row, a paused duty and a task
 * family that always fails. Smallest scene first.
 */
const T = Date.parse('2026-10-06T02:00:00Z');
const H = 3600000, D = 24 * H;
const A = 'D:\\zone\\agent\\ajanlar\\';

const agents = [
    { id: 'developer', name: 'developer' },
    { id: 'asistan', name: 'asistan' },
    { id: 'psikolog', name: 'psikolog' },
    { id: 'pazarlama', name: 'pazarlama' },
    { id: 'arastirmaci', name: 'arastirmaci-uzun' }
];
const used = (calls, source) => ({ present: true, calls, lastTs: T - 3 * H, source });
const idle = source => ({ present: true, calls: 0, source });

const skills = [
    {
        name: 'account-signup', scope: 'user', description: 'Bir Google hesabını servis listesine kaydeder',
        cells: { developer: used(4, 'C:\\Users\\rotam\\.claude\\skills\\account-signup\\SKILL.md'), asistan: idle('C:\\Users\\rotam\\.claude\\skills\\account-signup\\SKILL.md') }
    },
    {
        name: 'gece-mesaisi-raporu', scope: 'agent', description: 'Gece mesaisinin kaydını yol haritasına yazar',
        cells: { developer: used(12, A + 'developer\\.claude\\skills\\gece-mesaisi-raporu\\SKILL.md') }
    },
    { name: 'eski-arsivleyici', scope: 'agent', description: 'Kullanılmayan', cells: { psikolog: idle(A + 'psikolog\\.claude\\skills\\eski-arsivleyici\\SKILL.md') } }
];
const mcp = [
    {
        name: 'obsidian', transport: 'stdio', commandOrUrl: 'npx -y obsidian-mcp-server D:\\zone\\know\\note\\obsidian',
        cells: { developer: used(57, A + 'developer\\.mcp.json'), asistan: used(3, A + 'asistan\\.mcp.json'), pazarlama: { ...idle(A + 'pazarlama\\.mcp.json'), disabled: true } }
    },
    { name: 'airtable', transport: 'http', commandOrUrl: 'http://127.0.0.1:8765/mcp', cells: { asistan: idle(A + 'asistan\\.mcp.json') } }
];
const memory = [
    {
        name: 'feedback_shell_ascii_only.md',
        cells: {
            developer: { ...used(6, A + 'developer\\memory\\feedback_shell_ascii_only.md'), tokens: 180, mtime: T - 2 * D, hash: 1 },
            asistan: { ...idle(A + 'asistan\\memory\\feedback_shell_ascii_only.md'), tokens: 150, mtime: T - 9 * D, hash: 2, diverged: true }
        }
    },
    { name: 'user_profile.md', cells: { psikolog: { ...idle(A + 'psikolog\\memory\\user_profile.md'), tokens: 900, mtime: T - D, hash: 3 } } }
];
const duties = [
    {
        title: 'Notices sorularını kontrol et',
        cells: {
            developer: { cadence: 'session-start', paused: false, watch: 'notices.list', source: A + 'developer\\DUTIES.md' },
            asistan: { cadence: 'daily', paused: true, source: A + 'asistan\\DUTIES.md' }
        }
    }
];
const tasks = [
    { title: 'Sabah özeti — her gün 07:30', source: 'schedule', runsTotal: 9, alwaysFails: false, cells: { asistan: { runs: 9, done: 9, failed: 0, lastTs: T - 18 * H } } },
    { title: 'Kota yoklaması', source: 'trigger', runsTotal: 6, alwaysFails: false, cells: { developer: { runs: 6, done: 4, failed: 2, lastTs: T - 2 * H } } },
    { title: 'Airtable eşitleme', source: 'workflow', runsTotal: 3, alwaysFails: true, cells: { arastirmaci: { runs: 3, done: 0, failed: 3, lastTs: T - 5 * H } } }
];

function data(over) {
    return Object.assign({ generatedAt: T, agents, skills, mcp, memory, duties, tasks }, over);
}

module.exports = {
    script: 'capabilities.js',
    data,
    variants: () => [
        {
            id: 'empty', label: 'Capability Matrix — one agent, nothing installed, no task runs',
            data: data({ agents: agents.slice(0, 1), skills: [], mcp: [], memory: [], duties: [], tasks: [] })
        },
        { id: 'fleet', label: 'Capability Matrix — five agents, every cell kind', data: data() }
    ]
};
