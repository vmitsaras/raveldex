import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  formatNext, formatStatus, getStatus, loadRoadmap, RoadmapValidationError, validateRoadmap,
} from '../../scripts/lib/roadmap.mjs';

function milestone(id = 'N0', track = 'release') {
  return { id, title: 'Milestone ' + id, goal: 'Bounded outcome', exitCriteria: ['Outcome verified'], track };
}

function task(id, changes = {}) {
  return {
    id, title: 'Task ' + id, milestone: 'N0', status: 'planned', dependsOn: [],
    objective: 'One concrete outcome', acceptanceCriteria: ['Observable behavior'],
    verification: ['Run relevant checks'], affectedPaths: ['future/files/**'],
    specs: ['docs/spec.md'], evidence: [], blocker: null, ...changes,
  };
}

function fixture(tasks = [], milestones = [milestone()]) {
  return { schemaVersion: 1, repository: 'vmitsaras/raveldex', milestones, tasks };
}

function done(id, changes = {}) {
  return task(id, { status: 'done', evidence: ['docs/evidence.md'], ...changes });
}

function state(roadmap) {
  const validation = validateRoadmap(roadmap);
  assert.deepEqual(validation.errors, []);
  return getStatus(roadmap);
}

function assertInvalid(roadmap, pattern) {
  const result = validateRoadmap(roadmap);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), pattern);
}

test('selects canonical first ready task and lists every ready release task without changing input', () => {
  const roadmap = fixture([
    task('RX-1002', { dependsOn: ['RX-1001'] }),
    done('RX-1001'),
    task('RX-1003'),
    task('RX-1004', { dependsOn: ['RX-1002'] }),
  ]);
  const before = JSON.stringify(roadmap);
  const status = state(roadmap);
  assert.equal(status.state, 'ready');
  assert.equal(status.next.id, 'RX-1002');
  assert.deepEqual(status.ready.map((item) => item.id), ['RX-1002', 'RX-1003']);
  assert.deepEqual(status.dependencyBlocked[0].dependencies.map((item) => item.id), ['RX-1002']);
  assert.match(formatNext(status), /All dependency-ready release tasks \(2\)/u);
  assert.equal(JSON.stringify(roadmap), before);
});

test('resumes in-progress work before starting another ready task', () => {
  const status = state(fixture([
    task('RX-1001'),
    task('RX-1002', { status: 'in_progress' }),
    task('RX-1003', { status: 'in_progress' }),
  ]));
  assert.equal(status.state, 'in_progress');
  assert.equal(status.next.id, 'RX-1002');
  assert.equal(status.resume.length, 2);
  assert.equal(status.ready[0].id, 'RX-1001');
  assert.match(formatNext(status), /^Resume in-progress release work: RX-1002/u);
});

test('reports explicit blocked work and dependent unfinished work without claiming completion', () => {
  const status = state(fixture([
    task('RX-1001', { status: 'blocked', blocker: 'Required browser environment unavailable.' }),
    task('RX-1002', { dependsOn: ['RX-1001'] }),
  ]));
  const output = formatNext(status);
  assert.equal(status.next, null);
  assert.equal(status.state, 'blocked');
  assert.equal(status.blocked.length, 1);
  assert.equal(status.dependencyBlocked.length, 1);
  assert.match(output, /Unfinished blocked work remains/u);
  assert.match(output, /Required browser environment unavailable/u);
  assert.match(output, /RX-1002 waits for RX-1001 \(blocked\)/u);
  assert.doesNotMatch(output, /backlog complete/u);
});

test('shows owner decisions separately from blocked implementation work', () => {
  const status = state(fixture([
    task('RX-1001', { status: 'needs_decision', blocker: 'Choose the release support scope.' }),
    task('RX-1002', { dependsOn: ['RX-1001'] }),
  ]));
  assert.equal(status.state, 'needs_decision');
  assert.equal(status.blocked.length, 0);
  assert.equal(status.decisions.length, 1);
  assert.equal(status.dependencyBlocked.length, 1);
  assert.match(formatNext(status), /Owner decisions are pending/u);
  assert.match(formatNext(status), /Choose the release support scope/u);
});

test('mixed blocks and owner decisions remain separately visible', () => {
  const status = state(fixture([
    task('RX-1001', { status: 'blocked', blocker: 'Required observation missing.' }),
    task('RX-1002', { status: 'needs_decision', blocker: 'Release decision pending.' }),
  ]));
  const output = formatNext(status);
  assert.equal(status.next, null);
  assert.match(output, /Explicitly blocked release work \(1\)/u);
  assert.match(output, /Pending owner decisions \(1\)/u);
});

test('an optional-only deferred backlog never starts work and has no unfinished active release tasks', () => {
  const status = state(fixture([
    task('RX-A010', { milestone: 'N5', status: 'deferred' }),
  ], [milestone('N5', 'optional')]));
  assert.equal(status.state, 'complete');
  assert.equal(status.next, null);
  assert.equal(status.active.length, 0);
  assert.equal(status.optional.length, 1);
  assert.match(formatNext(status), /^Active release backlog complete/u);
  assert.match(formatNext(status), /Optional backlog — never selected automatically/u);
});

test('completed active work stays complete with optional work remaining', () => {
  const status = state(fixture([
    done('RX-1001'),
    task('RX-A010', { milestone: 'N5', status: 'deferred', dependsOn: ['RX-1001'] }),
  ], [milestone(), milestone('N5', 'optional')]));
  assert.equal(status.state, 'complete');
  assert.equal(status.done.length, 1);
  assert.equal(status.next, null);
});

test('deferring a release task does not hide it as completed', () => {
  const status = state(fixture([task('RX-1001', { status: 'deferred' })]));
  assert.equal(status.state, 'deferred');
  assert.equal(status.unfinished.length, 1);
  assert.match(formatNext(status), /Deferred release work — not complete/u);
  assert.doesNotMatch(formatNext(status), /backlog complete/u);
});

test('waiting on optional dependencies does not automatically activate the optional track', () => {
  const status = state(fixture([
    task('RX-1001', { dependsOn: ['RX-A010'] }),
    task('RX-A010', { milestone: 'N5', status: 'planned' }),
  ], [milestone(), milestone('N5', 'optional')]));
  assert.equal(status.state, 'dependency_blocked');
  assert.equal(status.next, null);
  assert.equal(status.ready.length, 0);
  assert.match(formatNext(status), /Unfinished work is waiting on dependencies/u);
  assert.match(formatNext(status), /RX-1001 waits for RX-A010 \(planned\)/u);
});

test('rejects malformed required schema data instead of crashing or silently defaulting', async (context) => {
  const mutations = [
    ['unsupported version', (value) => { value.schemaVersion = 2; }, /schemaVersion must be 1/u],
    ['wrong repository', (value) => { value.repository = 'another/repository'; }, /repository must be vmitsaras/u],
    ['missing task list', (value) => { delete value.tasks; }, /tasks is required/u],
    ['unknown property', (value) => { value.tasks[0].statsu = 'done'; }, /statsu is unknown/u],
    ['missing acceptance list', (value) => { delete value.tasks[0].acceptanceCriteria; }, /acceptanceCriteria is required/u],
    ['empty acceptance list', (value) => { value.tasks[0].acceptanceCriteria = []; }, /acceptanceCriteria must not be empty/u],
    ['invalid status', (value) => { value.tasks[0].status = 'ready'; }, /status is not a supported status/u],
    ['invalid dependencies', (value) => { value.tasks[0].dependsOn = null; }, /dependsOn must be an array/u],
    ['missing milestone', (value) => { value.tasks[0].milestone = 'N9'; }, /unknown milestone N9/u],
    ['nonobject task', (value) => { value.tasks[0] = null; }, /tasks\[0\] must be an object/u],
    ['empty text', (value) => { value.tasks[0].objective = ' '; }, /objective must be a nonempty string/u],
    ['invalid track', (value) => { value.milestones[0].track = 'maybe'; }, /track must be release or optional/u],
  ];
  for (const [name, mutate, pattern] of mutations) {
    await context.test(name, () => {
      const roadmap = fixture([task('RX-1001')]);
      mutate(roadmap);
      assertInvalid(roadmap, pattern);
    });
  }
  assertInvalid(null, /Roadmap must be an object/u);
});

test('rejects duplicate IDs, duplicate dependencies, and unknown dependency references', () => {
  assertInvalid(fixture([task('RX-1001'), task('RX-1001')]), /Duplicate task ID/u);
  assertInvalid(fixture([], [milestone(), milestone()]), /Duplicate milestone ID/u);
  assertInvalid(fixture([task('RX-1001', { dependsOn: ['RX-9999'] })]), /depends on unknown task RX-9999/u);
  assertInvalid(fixture([
    done('RX-1001'),
    task('RX-1002', { dependsOn: ['RX-1001', 'RX-1001'] }),
  ]), /dependsOn has duplicate entries/u);
});

test('enforces stable milestone/task ID namespaces used by GitHub ownership markers', () => {
  assertInvalid(fixture([], [milestone('Phase1')]), /id must be N followed by digits/u);
  assertInvalid(fixture([], [milestone('N1\n')]), /id must be N followed by digits/u);
  for (const id of ['TASK-1001', 'RX-100', 'RX-A10', 'RX-1001\n']) {
    assertInvalid(fixture([task(id)]), /id must match RX-0000 or RX-A000/u);
  }
  assert.equal(validateRoadmap(fixture([task('RX-A010')])).valid, true);
});

test('rejects self-cycles and multi-task cycles with an actionable path', () => {
  assertInvalid(fixture([task('RX-1001', { dependsOn: ['RX-1001'] })]),
    /Dependency cycle: RX-1001 -> RX-1001/u);
  assertInvalid(fixture([
    task('RX-1001', { dependsOn: ['RX-1003'] }),
    task('RX-1002', { dependsOn: ['RX-1001'] }),
    task('RX-1003', { dependsOn: ['RX-1002'] }),
  ]), /Dependency cycle: RX-1001 -> RX-1003 -> RX-1002 -> RX-1001/u);
});

test('rejects completed or started tasks with unfinished prerequisites', () => {
  assertInvalid(fixture([task('RX-1001'), done('RX-1002', { dependsOn: ['RX-1001'] })]),
    /RX-1002 is done but dependency RX-1001 is planned/u);
  assertInvalid(fixture([
    task('RX-1001'),
    task('RX-1002', { status: 'in_progress', dependsOn: ['RX-1001'] }),
  ]), /RX-1002 is in_progress but dependency RX-1001 is planned/u);
});

test('done needs actual evidence references; block and decision statuses need a reason', () => {
  assertInvalid(fixture([task('RX-1001', { status: 'done' })]), /done but has no evidence/u);
  assertInvalid(fixture([task('RX-1001', { status: 'blocked' })]), /blocker must explain/u);
  assertInvalid(fixture([task('RX-1001', { status: 'needs_decision' })]), /blocker must explain/u);
  assertInvalid(fixture([task('RX-1001', { blocker: 'Stale blocked state' })]), /blocker must be null/u);
});

test('checks listed evidence and specs, rejects escaped paths, and leaves future affected paths optional', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'raveldex-roadmap-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs/spec.md'), '# Existing spec\n');
  writeFileSync(join(root, 'docs/evidence.md'), '# Recorded observation\n');
  assert.equal(validateRoadmap(fixture([done('RX-1001')]), { root }).valid, true);
  assert.equal(validateRoadmap(fixture([task('RX-1001')]), { root }).valid, true);

  const missing = validateRoadmap(fixture([task('RX-1001', {
    specs: ['docs/unknown.md'], evidence: ['docs/not-observed.md'],
  })]), { root });
  assert.equal(missing.valid, false);
  assert.match(missing.errors.join('\n'), /docs\/unknown\.md/u);
  assert.match(missing.errors.join('\n'), /docs\/not-observed\.md/u);
  const directory = validateRoadmap(fixture([task('RX-1001', { specs: ['docs'] })]), { root });
  assert.match(directory.errors.join('\n'), /must reference a file/u);
  for (const path of ['../outside.md', '/tmp/outside.md', 'docs/../spec.md', 'C:\\spec.md', 'docs//spec.md']) {
    const result = validateRoadmap(fixture([task('RX-1001', { specs: [path] })]), { root });
    assert.equal(result.valid, false, path);
    assert.match(result.errors.join('\n'), /repository-relative path/u);
  }
});

test('rejects a specification symlink resolving outside the repository', (context) => {
  const container = mkdtempSync(join(tmpdir(), 'raveldex-roadmap-link-'));
  const root = join(container, 'repo');
  context.after(() => rmSync(container, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(container, 'outside.md'), '# Outside the repository\n');
  try {
    symlinkSync(join(container, 'outside.md'), join(root, 'docs/spec.md'), 'file');
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
    context.skip('This platform does not permit unprivileged file symlinks.');
    return;
  }
  const result = validateRoadmap(fixture([task('RX-1001')]), { root });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /resolves outside the repository/u);
});

test('loading validates real files, surfaces malformed JSON and graph errors, and never rewrites the plan', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'raveldex-roadmap-load-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs/planning'), { recursive: true });
  writeFileSync(join(root, 'docs/spec.md'), '# Existing spec\n');
  const path = join(root, 'docs/planning/roadmap.json');
  const content = JSON.stringify(fixture([task('RX-1001')]), null, 2) + '\n';
  writeFileSync(path, content);
  assert.equal(loadRoadmap(root).tasks[0].id, 'RX-1001');
  assert.equal(readFileSync(path, 'utf8'), content);
  writeFileSync(path, '{broken json');
  assert.throws(() => loadRoadmap(root), /Invalid JSON/u);
  writeFileSync(path, JSON.stringify(fixture([done('RX-1001')])));
  assert.throws(() => loadRoadmap(root), RoadmapValidationError);
  rmSync(path);
  assert.throws(() => loadRoadmap(root), /Cannot read/u);
});

test('planner output labels tooling verification without claiming search qualification', () => {
  const output = formatNext(state(fixture([done('RX-1001')])));
  assert.match(output, /does not qualify search features/u);
  assert.match(output, /or verify the contents of evidence/u);
});

test('status presentation does not duplicate an ID already present in the milestone title', () => {
  const roadmap = fixture();
  roadmap.milestones[0].title = 'N0 — Native design adoption';
  const output = formatStatus(roadmap);
  assert.match(output, /N0 — Native design adoption: 0\/0/u);
  assert.doesNotMatch(output, /N0 — N0/u);
});
