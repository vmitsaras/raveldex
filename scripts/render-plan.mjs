import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getStatus, loadRoadmap, ROOT } from './lib/roadmap.mjs';

const GENERATED = '<!-- Generated from docs/planning/roadmap.json by scripts/render-plan.mjs. Run npm run docs:generate; do not edit task data here. -->';

const linksPath = resolve(ROOT, 'docs/planning/github-links.json');
const links = existsSync(linksPath) ? JSON.parse(readFileSync(linksPath, 'utf8')) : null;

function table(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function issueSearch(roadmap, id) {
  const number = links?.repository === roadmap.repository ? links.issues?.[id] : undefined;
  if (Number.isSafeInteger(number) && number > 0) {
    return 'https://github.com/' + roadmap.repository + '/issues/' + number;
  }
  return 'https://github.com/' + roadmap.repository + '/issues?q=' +
    encodeURIComponent('in:title "' + id + '"');
}

function taskDocument(task) {
  return task.milestone === 'N5' ? 'OPTIONAL_FEATURES.md' : 'IMPLEMENTATION_TASKS.md';
}

function taskLink(task, prefix = '') {
  return '[' + task.id + '](' + prefix + taskDocument(task) + '#' + task.id.toLowerCase() + ')';
}

function list(items) {
  return items.map((item) => '- ' + item).join('\n');
}

function planningPath(path) {
  return path.startsWith('docs/') ? '../' + path.slice('docs/'.length) : '../../' + path;
}

function taskCard(roadmap, task) {
  const tasks = new Map(roadmap.tasks.map((item) => [item.id, item]));
  const lines = [
    '## ' + task.id,
    '',
    '**' + task.title + '**',
    '',
    '**Milestone:** ' + task.milestone + ' · **Status:** `' + task.status + '` · ' +
      '[GitHub tracking](' + issueSearch(roadmap, task.id) + ')',
    '',
    '**Dependencies:** ' + (task.dependsOn.length > 0
      ? task.dependsOn.map((id) => taskLink(tasks.get(id))).join(', ')
      : 'None'),
    '',
    task.objective,
    '',
  ];
  if (task.blocker !== null) lines.push('**Blocker or decision:** ' + task.blocker, '');
  lines.push(
    '**Expected affected areas**',
    '',
    task.affectedPaths.map((path) => '`' + path + '`').join(', ') +
      '. These are planning boundaries; create files only when this task needs them.',
    '',
    '**Contracts**',
    '',
    task.specs.map((path) => '[' + path.split('/').at(-1) + '](' + planningPath(path) + ')').join(', '),
    '',
    '**Acceptance criteria**',
    '',
    list(task.acceptanceCriteria),
    '',
    '**Verification**',
    '',
    list(task.verification),
    '',
    '**Recorded evidence**',
    '',
    task.evidence.length > 0
      ? list(task.evidence.map((path) => '[' + path + '](' + planningPath(path) + ')'))
      : 'None recorded. A future report destination in the verification steps is not evidence.',
    '',
  );
  return lines.join('\n');
}

function renderRoadmap(roadmap) {
  const status = getStatus(roadmap);
  const lines = [
    GENERATED,
    '',
    '# Raveldex roadmap',
    '',
    'Raveldex will own indexing, retrieval, ranking, incremental updates, and execution. Advanced matching, presentation, workers, persistence, and integrations remain optional capabilities.',
    '',
    'The owner selected the native direction on 2026-10-06 and requested initialization of this new repository. The bootstrap establishes the plan and tooling; it does not implement a usable search engine. The prior companion and its completed tasks are historical inputs, not this repository\'s active implementation or verification record.',
    '',
    '## Current tracked state',
    '',
    '**Release progress:** ' + status.done.length + '/' + status.active.length + ' done · ' +
      status.resume.length + ' in progress · ' + status.ready.length + ' dependency-ready.',
    '',
    '**Planner state:** `' + status.state + '`.',
    '',
    status.next
      ? '**Next or resumable release task:** ' + taskLink(status.next) + ' — ' + status.next.title + '.'
      : '**Next release task:** none. Read the planner state and any blockers below; a completed active backlog is a legitimate terminal state.',
    '',
    'Run `npm run handoff:status` and `npm run handoff:next` for the complete explanation. Dependency readiness identifies technical eligibility; the owner\'s current request determines execution scope. Deferred N5 ideas never enter automatic next-task selection.',
    '',
    '## Where to look',
    '',
    '- [Canonical task state](roadmap.json): IDs, dependencies, status, acceptance, specifications, and actual evidence.',
    '- [Implementation task cards](IMPLEMENTATION_TASKS.md): the release tasks and verification requirements.',
    '- [Optional feature tracks](OPTIONAL_FEATURES.md): current optional-task states and separately unscheduled research ideas.',
    '- [Verification plan](VERIFICATION_PLAN.md): what must be observed before a capability is called verified.',
    '- [GitHub milestones](https://github.com/' + roadmap.repository + '/milestones) and [issues](https://github.com/' + roadmap.repository + '/issues): the human tracking view, using the same IDs and acceptance conditions.',
    '',
    '`docs/planning/roadmap.json` is authoritative. This file, the task cards, and GitHub issues are generated tracking views. Update the manifest first and synchronize the views; issue closure alone does not establish verified completion.',
    '',
    '## Milestones',
    '',
    '| Milestone | Tasks | Done | Required outcome |',
    '| --- | --- | --- | --- |',
  ];
  for (const milestone of roadmap.milestones) {
    const tasks = roadmap.tasks.filter((task) => task.milestone === milestone.id);
    const done = tasks.filter((task) => task.status === 'done').length;
    const span = tasks.length > 0 ? '`' + tasks[0].id + '`–`' + tasks.at(-1).id + '`' : 'None';
    lines.push('| **' + table(milestone.title) + '** | ' + span + ' | ' + done + '/' + tasks.length + ' | ' + table(milestone.goal) + ' |');
  }
  lines.push('', '## Task index', '', '| Task | Status | Dependencies | Tracking |', '| --- | --- | --- | --- |');
  for (const task of roadmap.tasks) {
    lines.push('| ' + taskLink(task) + ' — ' + table(task.title) + ' | `' + task.status + '` | ' +
      (task.dependsOn.map((id) => '`' + id + '`').join(', ') || 'None') +
      ' | [Issue](' + issueSearch(roadmap, task.id) + ') |');
  }
  const blocked = roadmap.tasks.filter((task) => task.blocker !== null);
  if (blocked.length > 0) {
    lines.push('', '## Recorded blockers and decisions', '', list(blocked.map((task) =>
      taskLink(task) + ': ' + task.blocker)));
  }
  lines.push('', '## Milestone exit conditions', '');
  for (const milestone of roadmap.milestones) {
    lines.push('### ' + milestone.title, '', list(milestone.exitCriteria), '');
  }
  lines.push(
    '## Execution and authorization',
    '',
    'The current bootstrap request authorizes initialization, documentation, scaffolding, and GitHub tracking. It does not silently authorize implementing all future milestones during the bootstrap. A later instruction to continue implementation is sufficient to start the next dependency-ready task inside these adopted contracts; no repeated decision about whether to build a native engine is needed.',
    '',
    'The canonical array order is the stable priority among eligible tasks. N2 and N3 contain independent work that can be delegated after its dependencies finish. Shared contract/file changes still require coordination. Select another ready task only when the owner\'s requested scope covers it.',
    '',
    'A task becomes `done` only when its behavior, acceptance evidence, review, and documentation agree. Use `blocked` for a concrete obstacle and `needs_decision` for an actual unresolved owner decision, both with a reason. Missing browser, screen-reader, or measurement access is neither proof of an implementation defect nor a passing observation.',
    '',
    '## Scope guardrails',
    '',
    'The first native core targets at most 10,000 admitted records with explicit input/work bounds. This is a defensive ceiling, not a capacity or latency guarantee. The core-only 15 KiB gzip budget is a measured design target including all mandatory code. A miss triggers a boundary review rather than removal of correctness checks.',
    '',
    'Core-only search must be useful by `RX-1006`. N2 supplies the modular interface and N3 restores host/persistence capabilities. N4 determines the supportable native 0.1 candidate. Publication, release tags, and public releases remain a separate owner decision.',
    '',
    'Vectors, RAG, semantic models, another default engine backend, Rust/WASM, uncontrolled plugin hooks, and the complete optional backlog are not native 0.1 requirements. The native implementation must demonstrate its own advantages instead of adopting unsupported claims from previous comparisons.',
    '',
    '## Provenance',
    '',
    'This roadmap transcribes the native-library direction and `RX-*` milestones from the owner-supplied conversation and adapts them for this fresh repository. It does not claim the earlier planning archive is present, external research was refreshed, or native implementation results already exist. See the [native direction decision](../decisions/0001-native-direction.md) and [project context](PROJECT_CONTEXT.md).',
    '',
  );
  return lines.join('\n');
}

function renderTasks(roadmap) {
  const lines = [
    GENERATED,
    '',
    '# Raveldex implementation tasks',
    '',
    'These bounded contracts describe the native release track. Proposed module paths are not a claim that implementation already exists. Task status and recorded evidence below are generated from [the canonical roadmap](roadmap.json).',
    '',
    '## How to execute a task',
    '',
    '1. Read `../../AGENTS.md`, `PROJECT_CONTEXT.md`, the task card, its specifications, and directly affected source.',
    '2. Confirm dependencies are `done` and the current owner request covers the work. Readiness does not expand a bootstrap into the whole product.',
    '3. Implement the smallest useful slice satisfying its acceptance criteria. Clarify actual load-bearing gaps; do not reopen the selected native direction or invent new feature scope.',
    '4. Verify from the criteria using independent expected outcomes where applicable. Record Pass, Fail, Blocked, or Not Applicable for each criterion and explain any N/A.',
    '5. Collect independent review where required, resolve blocking findings, and synchronize contracts, task state, real evidence, and GitHub tracking.',
    '',
    'Every acceptance criterion has a stable task-specific ID. `evidence` contains existing observations only. A future report destination is not proof. A green build, generated API stub, or old companion result cannot close a native capability task.',
    '',
  ];
  for (const task of roadmap.tasks) {
    const milestone = roadmap.milestones.find((item) => item.id === task.milestone);
    if (milestone.track === 'release') lines.push(taskCard(roadmap, task), '');
  }
  lines.push(
    '## Optional enhancement tasks',
    '',
    'The `RX-A*` task cards in [Optional features](OPTIONAL_FEATURES.md) record their actual selected/completed/deferred states. Their dependency on `RX-4003` is only a prerequisite; unselected ideas never enter automatic next-task selection and do not block the N0–N4 candidate.',
    '',
  );
  return lines.join('\n');
}

function renderOptional(roadmap) {
  const lines = [
    GENERATED,
    '',
    '# Optional capabilities and later research',
    '',
    'The first-party optional modules required for native 0.1 are already in N2/N3: source phrases, positions/offsets, filters/facets, Inspector data, evidence/snippets, DOM UI, workers, snapshots, and IndexedDB. “Optional” describes consumer code/data cost; those release tasks remain part of the proposed product candidate.',
    '',
    'The N5 tracks below require explicit selection; each card records its current state. Select a track because users or the judged query corpus reveal a need. The entire idea list is not an implementation authorization.',
    '',
    '## Selection contract',
    '',
    'Before changing a deferred task to planned, record its concrete user problem, supported semantics, required data, expected costs, success metric, and native-contract interactions. A later owner request selecting an enhancement can supply that direction; do not add ceremonial approval gates for ordinary implementation choices.',
    '',
    'Unused add-ons must remain absent from core-only import and retained-state graphs. Declare compatibility, required providers, indexing/rebuild implications, execution hosts, errors, cleanup, and limits. Avoid unrestricted `beforeSearch` / `afterSearch` hooks whose order changes query meaning. Adapters connect environments without silently changing semantics.',
    '',
    'Live state is in [roadmap.json](roadmap.json); module boundaries are in [Add-ons and adapters](../architecture/ADDONS_AND_ADAPTERS.md).',
    '',
  ];
  for (const task of roadmap.tasks) {
    const milestone = roadmap.milestones.find((item) => item.id === task.milestone);
    if (milestone.track === 'optional') lines.push(taskCard(roadmap, task), '');
  }
  lines.push(
    '## Research ideas outside the task backlog',
    '',
    'These are unscheduled questions, not promised features or release dependencies.',
    '',
    '| Idea | Question before proposing implementation |',
    '| --- | --- |',
    '| Adaptive index detail | Can measured phrase cost justify an explicit atomic upgrade of selected fields to positions while preserving semantics? |',
    '| Search Difference Lab | Can actual score/analyzer traces explain useful configuration regressions without duplicating the scorer in the UI? |',
    '| Temporal/version search | Which revisions are retained/searchable, what are the costs, and how does complete erasure work? |',
    '| Federation | Can grouped collection-local results help before a cross-collection ranker requires compatible statistics? |',
    '| Optional semantic retrieval | Which real failures justify separate vectors/models, and how are related results kept distinct from strict lexical eligibility? |',
    '| Rust or WebAssembly kernels | Does profiling isolate work that warrants cross-language build, memory, transport, and deployment complexity? |',
    '',
    'Research proposals need a user problem and a bounded experiment. No idea permits importing a foreign default search engine or weakening exact totals, evidence, revisions, or optional-cost contracts.',
    '',
  );
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node scripts/render-plan.mjs [--check]\nGenerate roadmap/task documentation, or check that it matches the canonical manifest.');
    return;
  }
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: node scripts/render-plan.mjs [--check]');
  }
  const check = args[0] === '--check';
  const roadmap = loadRoadmap(ROOT);
  const outputs = new Map([
    ['docs/planning/ROADMAP.md', renderRoadmap(roadmap)],
    ['docs/planning/IMPLEMENTATION_TASKS.md', renderTasks(roadmap)],
    ['docs/planning/OPTIONAL_FEATURES.md', renderOptional(roadmap)],
  ]);
  const stale = [];
  for (const [path, content] of outputs) {
    const target = resolve(ROOT, path);
    if (check) {
      if (!existsSync(target) || readFileSync(target, 'utf8') !== content) stale.push(path);
    } else {
      writeFileSync(target, content, 'utf8');
    }
  }
  if (stale.length > 0) {
    throw new Error('Generated plan documents are stale: ' + stale.join(', ') + '. Run npm run docs:generate.');
  }
  console.log(check
    ? 'Generated roadmap and task documents match the canonical manifest (3 files).'
    : 'Generated roadmap and task documents from the canonical manifest (3 files).');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
