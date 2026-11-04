import { pathToFileURL } from 'node:url';

const PREFIX = '/repos/vmitsaras/raveldex';
const marker = (id, edge) => '<!-- raveldex:' + id + ':' + edge + ' -->';

function managed(inventory, id) {
  const matches = inventory.filter(issue => !issue.pull_request &&
    typeof issue.body === 'string' && issue.body.includes(marker(id, 'start')) &&
    issue.body.includes(marker(id, 'end')));
  if (matches.length !== 1) throw new Error('Expected exactly one managed issue for ' + id + '; found ' + matches.length + '.');
  const issue = matches[0];
  if (!Number.isSafeInteger(issue.id) || !Number.isSafeInteger(issue.number)) throw new Error('Invalid managed issue identity for ' + id + '.');
  return issue;
}
async function pages(request, endpoint) {
  const result = [];
  for (let page = 1; page <= 25; page++) {
    const values = await request('GET', endpoint + (endpoint.includes('?') ? '&' : '?') + 'per_page=100&page=' + page);
    if (!Array.isArray(values)) throw new Error('Expected issue list for ' + endpoint + '.');
    result.push(...values);
    if (values.length < 100) return result;
  }
  throw new Error('Pagination limit exceeded for ' + endpoint + '.');
}

/** Only N9: no replacing parents, deleting unrelated relationships or changing milestone membership. */
export async function linkN9Subissues(roadmap, request, log = () => {}) {
  if (roadmap.repository !== 'vmitsaras/raveldex') throw new Error('Unexpected repository.');
  if (!roadmap.milestones.some(m => m.id === 'N9')) throw new Error('N9 is not in the canonical roadmap.');
  const tasks = roadmap.tasks.filter(t => t.milestone === 'N9');
  if (!tasks.length || tasks.some(t => !/^RX-8\d{3}$/.test(t.id))) throw new Error('Unexpected N9 task IDs.');
  const inventory = await pages(request, PREFIX + '/issues?state=all');
  const parent = managed(inventory, 'N9');
  if (parent.milestone !== null && parent.milestone !== undefined) throw new Error('Overview would inflate milestone progress.');
  const children = tasks.map(task => managed(inventory, task.id));
  const assigned = new Set(children.map(issue => issue.milestone?.number));
  if (assigned.size !== 1 || !Number.isSafeInteger([...assigned][0])) throw new Error('Task milestone assignments disagree.');
  const endpoint = PREFIX + '/issues/' + parent.number + '/sub_issues';
  const existing = new Set((await pages(request, endpoint)).map(issue => issue.id));
  for (const child of children) {
    if (child.id === parent.id) throw new Error('An overview cannot be its own sub-issue.');
    if (existing.has(child.id)) continue;
    // Do not replace another parent. GitHub owns and validates the relationship.
    await request('POST', endpoint, { sub_issue_id: child.id });
    log('Linked issue #' + child.number + ' under N9 overview #' + parent.number + '.');
  }
  const actual = new Set((await pages(request, endpoint)).map(issue => issue.id));
  for (const child of children) if (!actual.has(child.id)) throw new Error('Native sub-issue read-back missing #' + child.number + '.');
  return { parentNumber: parent.number, subIssueCount: children.length,
    added: children.filter(child => !existing.has(child.id)).length };
}
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply') throw new Error('Usage: node scripts/link-native-subissues.mjs --apply');
  const { loadRoadmap } = await import('./lib/roadmap.mjs');
  const roadmap = loadRoadmap();
  if (process.env.GITHUB_REPOSITORY !== roadmap.repository) throw new Error('GITHUB_REPOSITORY mismatch.');
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN required.');
  async function request(method, path, body) {
    if (!['GET','POST'].includes(method) || !path.startsWith(PREFIX + '/')) throw new Error('Unsupported GitHub operation.');
    const response = await fetch('https://api.github.com' + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error('GitHub ' + method + ' ' + path.split('?')[0] + ' returned ' + response.status + '. No blind retry.');
    if (method === 'POST') await new Promise(resolve => setTimeout(resolve, 1100));
    return response.json();
  }
  console.log('N9_SUBISSUES=' + JSON.stringify(await linkN9Subissues(roadmap, request, console.log)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
