import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeManagedBody, synchronize, taskState } from '../../scripts/sync-github.mjs';

const repository = 'vmitsaras/raveldex';
const base = 'https://github.com/' + repository;

function fixture() {
  const milestone = (id) => ({
    id, title: id + ' — Milestone', goal: 'Complete ' + id,
    exitCriteria: ['Accepted evidence'], track: 'release',
  });
  const task = (id, milestone, dependsOn) => ({
    id, title: 'Implement ' + id, milestone, status: 'planned', dependsOn,
    objective: 'Initial objective for ' + id, acceptanceCriteria: ['AC-01: Actual outcome'],
    verification: ['Verify outcome'], affectedPaths: ['src/core/**'],
    specs: ['docs/specs/CORE_CONTRACT.md'], evidence: [], blocker: null,
  });
  return {
    schemaVersion: 1, repository,
    milestones: [milestone('N0'), milestone('N1')],
    tasks: [task('RX-0001', 'N0', []), task('RX-1001', 'N1', ['RX-0001'])],
  };
}

/**
 * In-memory REST boundary: lists paginate, writes return detached API-shaped objects.
 * No GitHub token, browser, fetch, or network is used by these tests.
 */
function service(seed = {}, options = {}) {
  const db = structuredClone({ labels: [], milestones: [], issues: [], ...seed });
  const calls = [];
  const mutations = () => calls.filter((call) => call.method !== 'GET');
  const request = async (method, path, body) => {
    calls.push(structuredClone({ method, path, body }));
    const url = new URL(path, 'https://api.example.test');
    const match = url.pathname.match(/^\/repos\/vmitsaras\/raveldex\/(labels|milestones|issues)(?:\/(\d+))?$/u);
    assert.ok(match, 'Unexpected endpoint: ' + path);
    const [, kind, rawNumber] = match;
    const number = Number(rawNumber);
    if (method === 'GET') {
      assert.equal(rawNumber, undefined);
      const page = Number(url.searchParams.get('page'));
      const size = Number(url.searchParams.get('per_page'));
      assert.equal(size, 100);
      assert.ok(page >= 1);
      const rows = structuredClone(db[kind]);
      if (options.readback && mutations().length > 0) options.readback(kind, rows);
      return rows.slice((page - 1) * size, page * size);
    }
    if (method === 'POST' && kind === 'labels') {
      const value = structuredClone(body);
      db.labels.push(value);
      return structuredClone(value);
    }
    if (method === 'POST') {
      assert.equal(rawNumber, undefined);
      const nextNumber = Math.max(0, ...db[kind].map((item) => item.number)) + 1;
      const value = {
        number: nextNumber, state: 'open', ...structuredClone(body),
        html_url: base + '/' + (kind === 'milestones' ? 'milestone' : 'issues') + '/' + nextNumber,
      };
      if (kind === 'issues') {
        value.labels = body.labels.map((name) => ({ name }));
        value.milestone = { number: body.milestone };
      }
      db[kind].push(value);
      return structuredClone(value);
    }
    assert.equal(method, 'PATCH');
    const existing = db[kind].find((item) => item.number === number);
    assert.ok(existing, 'PATCH target missing');
    const oldState = existing.state;
    Object.assign(existing, structuredClone(body));
    if (kind === 'issues') {
      existing.labels = body.labels.map((name) => ({ name }));
      existing.milestone = { number: body.milestone };
    }
    if (kind === 'milestones' && options.ignoreMilestoneState) existing.state = oldState;
    return structuredClone(existing);
  };
  return { db, calls, mutations, request };
}

function managedIssue(api, id) {
  return api.db.issues.find((issue) => issue.body?.includes('<!-- raveldex:' + id + ':start -->'));
}

async function initialized(roadmap = fixture(), options = {}) {
  const api = service({}, options);
  const result = await synchronize(roadmap, api.request);
  api.calls.length = 0;
  return { api, result, roadmap };
}

test('fresh synchronization creates linked tracking, then a second run performs zero mutations', async () => {
  const roadmap = fixture();
  const before = JSON.stringify(roadmap);
  const api = service();
  const first = await synchronize(roadmap, api.request);
  assert.equal(Object.keys(first.milestones).length, 2);
  assert.equal(Object.keys(first.issues).length, 4);
  assert.equal(api.db.issues.length, 4);
  assert.equal(api.db.milestones.length, 2);
  assert.ok(api.mutations().length > 0);
  assert.match(managedIssue(api, 'RX-1001').body,
    new RegExp('\\[RX-0001\\]\\(https://github.com/vmitsaras/raveldex/issues/' + first.issues['RX-0001'].number + '\\)', 'u'));
  assert.doesNotMatch(managedIssue(api, 'RX-1001').body, /issues\?q=/u);
  api.calls.length = 0;
  const second = await synchronize(roadmap, api.request);
  assert.deepEqual(second, first);
  assert.equal(api.mutations().length, 0);
  assert.equal(JSON.stringify(roadmap), before);
});

test('updating managed content preserves human notes and unrelated labels', async () => {
  const { api, roadmap } = await initialized();
  const issue = managedIssue(api, 'RX-0001');
  const prefix = 'Owner note before the generated section.\n\n';
  const suffix = '\n\n## Investigation\n\nKeep this human-written context.\n';
  issue.body = prefix + issue.body + suffix;
  issue.labels.push({ name: 'customer-report' }, { name: 'status:triaged-by-human' });
  roadmap.tasks[0].objective = 'Revised implementation objective';
  roadmap.tasks[0].status = 'blocked';
  roadmap.tasks[0].blocker = 'Required environment unavailable.';
  await synchronize(roadmap, api.request);
  const updated = managedIssue(api, 'RX-0001');
  assert.ok(updated.body.startsWith(prefix));
  assert.ok(updated.body.endsWith(suffix));
  assert.match(updated.body, /Revised implementation objective/u);
  assert.doesNotMatch(updated.body, /Initial objective for RX-0001/u);
  assert.deepEqual(updated.labels.map((item) => item.name).sort(), [
    'customer-report', 'status:blocked', 'status:triaged-by-human', 'track:release', 'type:task',
  ]);
  api.calls.length = 0;
  await synchronize(roadmap, api.request);
  assert.equal(api.mutations().length, 0);
});

test('accepted tasks close their issues and milestones with concrete evidence and dependency links', async () => {
  const { api, roadmap } = await initialized();
  for (const task of roadmap.tasks) {
    task.status = 'done';
    task.evidence = ['docs/evidence/' + task.id + '.md'];
  }
  const result = await synchronize(roadmap, api.request);
  assert.ok(api.db.issues.every((issue) => issue.state === 'closed'));
  assert.ok(api.db.milestones.every((milestone) => milestone.state === 'closed'));
  assert.ok(Object.values(result.issues).every((issue) => issue.state === 'closed'));
  const issue = managedIssue(api, 'RX-1001');
  assert.equal(issue.state_reason, 'completed');
  assert.match(issue.body, /- \[x\] AC-01: Actual outcome/u);
  assert.doesNotMatch(issue.body, /AC-01: AC-01:/u);
  assert.match(issue.body, /\/blob\/main\/docs\/evidence\/RX-1001\.md/u);
  const overview = managedIssue(api, 'N1');
  assert.match(overview.body, new RegExp('- \\[x\\] \\[RX-1001\\]\\(' + base + '/issues/' + result.issues['RX-1001'].number, 'u'));
  api.calls.length = 0;
  await synchronize(roadmap, api.request);
  assert.equal(api.mutations().length, 0);
});

test('an issue closed contrary to the manifest refuses synchronization before any write', async () => {
  const { api, roadmap } = await initialized();
  managedIssue(api, 'RX-0001').state = 'closed';
  api.db.labels = [];
  await assert.rejects(synchronize(roadmap, api.request), /closed on GitHub but unfinished/u);
  assert.equal(api.mutations().length, 0);
});

test('ambiguous managed ownership and unmanaged collisions fail before all writes', async (context) => {
  const { api: original, roadmap } = await initialized();
  const cases = [
    ['two issues own one ID', (api) => {
      const duplicate = structuredClone(managedIssue(api, 'RX-0001'));
      duplicate.number = 900;
      api.db.issues.push(duplicate);
    }, /Duplicate managed issues/u],
    ['unmanaged title collision', (api) => {
      api.db.issues.push({ number: 900, title: '[RX-0001] Existing human issue', body: 'Unmanaged', state: 'open' });
    }, /Unmanaged or duplicate title/u],
    ['repeated marker within one issue', (api) => {
      managedIssue(api, 'RX-0001').body += '\n<!-- raveldex:RX-0001:start -->';
    }, /missing, duplicate, or reversed managed markers/u],
    ['two milestones own one ID', (api) => {
      const duplicate = structuredClone(api.db.milestones[0]);
      duplicate.number = 900;
      api.db.milestones.push(duplicate);
    }, /Duplicate or unmanaged milestone/u],
    ['unmanaged milestone title collision', (api) => {
      api.db.milestones.push({ number: 900, title: roadmap.milestones[0].title, description: 'Human milestone', state: 'open' });
    }, /Duplicate or unmanaged milestone/u],
    ['one issue claims two IDs', (api) => {
      const issue = managedIssue(api, 'RX-0001');
      const overview = managedIssue(api, 'N0');
      issue.body += '\n' + overview.body;
      api.db.issues = api.db.issues.filter((item) => item !== overview);
    }, /multiple.*IDs|multiple.*identities|shared.*issue|claims.*IDs/iu],
    ['one milestone claims two IDs', (api) => {
      api.db.milestones[0].description += '\n<!-- raveldex:milestone:N1 -->';
      api.db.milestones = [api.db.milestones[0]];
    }, /multiple.*IDs|multiple.*identities|shared.*milestone|claims.*IDs/iu],
  ];
  for (const [name, change, pattern] of cases) {
    await context.test(name, async () => {
      const api = service(original.db);
      change(api);
      await assert.rejects(synchronize(roadmap, api.request), pattern);
      assert.equal(api.mutations().length, 0, 'Preflight must finish before any external write.');
    });
  }
});

test('pagination finds tracking beyond page one instead of creating duplicates', async () => {
  const { api, roadmap } = await initialized();
  api.db.issues.unshift(...Array.from({ length: 100 }, (_, index) => ({
    number: 1000 + index, title: 'Unrelated ' + index, body: 'Human issue', state: 'open',
    ...(index === 0 ? { pull_request: { url: 'https://api.example.test/pull/1000' } } : {}),
  })));
  api.db.milestones.unshift(...Array.from({ length: 100 }, (_, index) => ({
    number: 1000 + index, title: 'Unrelated milestone ' + index, description: '', state: 'open',
  })));
  api.db.labels.unshift(...Array.from({ length: 100 }, (_, index) => ({ name: 'human-label-' + index })));
  await synchronize(roadmap, api.request);
  assert.equal(api.mutations().length, 0);
  for (const kind of ['issues', 'milestones', 'labels']) {
    assert.ok(api.calls.some((call) => call.path.includes('/' + kind + '?') && call.path.endsWith('page=2')));
  }
  assert.equal(api.db.issues.length, 104);
});

test('final issue readback must match the intended state rather than successful write responses', async () => {
  const roadmap = fixture();
  const api = service({}, {
    readback(kind, rows) {
      if (kind === 'issues') {
        const target = rows.find((issue) => issue.title.startsWith('[RX-0001]'));
        if (target) target.state = 'closed';
      }
    },
  });
  await assert.rejects(synchronize(roadmap, api.request), /Read-back mismatch for RX-0001/u);
});

test('final milestone readback must match the manifest even when a PATCH ignores the requested state', async () => {
  const roadmap = fixture();
  for (const task of roadmap.tasks) {
    task.status = 'done';
    task.evidence = ['docs/evidence/' + task.id + '.md'];
  }
  const api = service({}, { ignoreMilestoneState: true });
  await assert.rejects(synchronize(roadmap, api.request), /Read-back mismatch for milestone N0/u);
});

test('managed-block replacement preserves exact surrounding text and rejects malformed delimiters', () => {
  const original = 'before\n<!-- raveldex:RX-0001:start -->\nold\n<!-- raveldex:RX-0001:end -->\nafter';
  const updated = mergeManagedBody(original, 'RX-0001', 'new');
  assert.equal(updated, 'before\n<!-- raveldex:RX-0001:start -->\nnew\n<!-- raveldex:RX-0001:end -->\nafter');
  for (const malformed of [
    'Only human content.',
    '<!-- raveldex:RX-0001:end --><!-- raveldex:RX-0001:start -->',
    '<!-- raveldex:RX-0001:start --><!-- raveldex:RX-0001:end --><!-- raveldex:RX-0001:end -->',
  ]) {
    assert.throws(() => mergeManagedBody(malformed, 'RX-0001', 'replacement'), /refusing to overwrite/u);
  }
});

test('task labels distinguish dependency readiness from recorded blocks and decisions', () => {
  const roadmap = fixture();
  assert.equal(taskState(roadmap.tasks[0], roadmap), 'ready');
  assert.equal(taskState(roadmap.tasks[1], roadmap), 'waiting');
  roadmap.tasks[0].status = 'done';
  assert.equal(taskState(roadmap.tasks[1], roadmap), 'ready');
  for (const [status, expected] of [
    ['in_progress', 'in-progress'], ['needs_decision', 'needs-decision'],
    ['blocked', 'blocked'], ['deferred', 'deferred'], ['done', 'done'],
  ]) {
    roadmap.tasks[1].status = status;
    assert.equal(taskState(roadmap.tasks[1], roadmap), expected);
  }
  roadmap.milestones[1].track = 'optional';
  roadmap.tasks[1].status = 'planned';
  assert.equal(taskState(roadmap.tasks[1], roadmap), 'planned');
});
