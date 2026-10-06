import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const ROADMAP_FILE = 'docs/planning/roadmap.json';
export const TASK_STATUSES = Object.freeze([
  'planned', 'in_progress', 'done', 'blocked', 'needs_decision', 'deferred',
]);
export const SCOPE_NOTE =
  'Scope: roadmap tooling checks structure, dependencies, and evidence references. ' +
  'It does not qualify search features or verify the contents of evidence.';

const ROOT_KEYS = ['schemaVersion', 'repository', 'milestones', 'tasks'];
const MILESTONE_KEYS = ['id', 'title', 'goal', 'exitCriteria', 'track'];
const TASK_KEYS = [
  'id', 'title', 'milestone', 'status', 'dependsOn', 'objective',
  'acceptanceCriteria', 'verification', 'affectedPaths', 'specs', 'evidence', 'blocker',
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isLocalPath(value) {
  return isText(value) &&
    !isAbsolute(value) &&
    !/[:\\\u0000-\u001f]/u.test(value) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function containedBy(root, path) {
  const fromRoot = relative(root, path);
  return fromRoot !== '..' && !fromRoot.startsWith('..' + sep) && !isAbsolute(fromRoot);
}

function checkKeys(value, keys, context, errors) {
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) errors.push(context + '.' + key + ' is required.');
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) errors.push(context + '.' + key + ' is unknown in schemaVersion 1.');
  }
}

function checkText(value, context, errors) {
  if (!isText(value)) errors.push(context + ' must be a nonempty string.');
}

function checkList(value, context, errors, { nonempty = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(context + ' must be an array.');
    return false;
  }
  if (nonempty && value.length === 0) errors.push(context + ' must not be empty.');
  value.forEach((item, index) => checkText(item, context + '[' + index + ']', errors));
  if (new Set(value).size !== value.length) errors.push(context + ' has duplicate entries.');
  return true;
}

function checkFile(value, context, root, errors) {
  if (!isLocalPath(value)) {
    errors.push(context + ' must be a repository-relative path without traversal.');
    return;
  }
  if (root === undefined) return;
  try {
    const target = resolve(root, value);
    if (!containedBy(realpathSync(root), realpathSync(target))) {
      errors.push(context + ' resolves outside the repository: ' + value);
    } else if (!statSync(target).isFile()) {
      errors.push(context + ' must reference a file: ' + value);
    }
  } catch {
    errors.push(context + ' references a missing or unreadable file: ' + value);
  }
}

// Iterative traversal keeps validation bounded by graph size without recursive stack growth.
function findCycle(tasks) {
  const color = new Map();
  for (const start of tasks.keys()) {
    if (color.get(start) === 2) continue;
    const stack = [{ id: start, index: 0 }];
    color.set(start, 1);
    while (stack.length > 0) {
      const frame = stack.at(-1);
      const dependencies = Array.isArray(tasks.get(frame.id).dependsOn)
        ? tasks.get(frame.id).dependsOn
        : [];
      if (frame.index === dependencies.length) {
        color.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const dependency = dependencies[frame.index++];
      if (!tasks.has(dependency) || color.get(dependency) === 2) continue;
      if (color.get(dependency) === 1) {
        const startIndex = stack.findIndex((entry) => entry.id === dependency);
        return [...stack.slice(startIndex).map((entry) => entry.id), dependency];
      }
      color.set(dependency, 1);
      stack.push({ id: dependency, index: 0 });
    }
  }
  return null;
}

/**
 * Validate schema and graph semantics. Pass root to check every referenced specification
 * and evidence file. An evidence entry is an existing observation, not a future destination.
 * affectedPaths are planned file or directory selectors and need not exist yet.
 */
export function validateRoadmap(roadmap, { root } = {}) {
  const errors = [];
  if (!isObject(roadmap)) return { valid: false, errors: ['Roadmap must be an object.'] };
  checkKeys(roadmap, ROOT_KEYS, 'roadmap', errors);
  if (roadmap.schemaVersion !== 1) errors.push('roadmap.schemaVersion must be 1.');
  if (roadmap.repository !== 'vmitsaras/raveldex') {
    errors.push('roadmap.repository must be vmitsaras/raveldex.');
  }
  if (!Array.isArray(roadmap.milestones) || roadmap.milestones.length === 0) {
    errors.push('roadmap.milestones must be a nonempty array.');
  }
  if (!Array.isArray(roadmap.tasks)) errors.push('roadmap.tasks must be an array.');

  const milestones = new Map();
  for (const [index, milestone] of (Array.isArray(roadmap.milestones) ? roadmap.milestones : []).entries()) {
    const context = 'milestones[' + index + ']';
    if (!isObject(milestone)) {
      errors.push(context + ' must be an object.');
      continue;
    }
    checkKeys(milestone, MILESTONE_KEYS, context, errors);
    for (const key of ['id', 'title', 'goal']) checkText(milestone[key], context + '.' + key, errors);
    if (!isText(milestone.id) || milestone.id !== milestone.id.trim() || !/^N[0-9]+$/u.test(milestone.id)) {
      errors.push(context + '.id must be N followed by digits.');
    }
    checkList(milestone.exitCriteria, context + '.exitCriteria', errors, { nonempty: true });
    if (!['release', 'optional'].includes(milestone.track)) {
      errors.push(context + '.track must be release or optional.');
    }
    if (isText(milestone.id)) {
      if (milestones.has(milestone.id)) errors.push('Duplicate milestone ID: ' + milestone.id);
      else milestones.set(milestone.id, milestone);
    }
  }

  const tasks = new Map();
  for (const [index, task] of (Array.isArray(roadmap.tasks) ? roadmap.tasks : []).entries()) {
    const context = 'tasks[' + index + ']';
    if (!isObject(task)) {
      errors.push(context + ' must be an object.');
      continue;
    }
    checkKeys(task, TASK_KEYS, context, errors);
    for (const key of ['id', 'title', 'milestone', 'objective']) {
      checkText(task[key], context + '.' + key, errors);
    }
    if (!isText(task.id) || task.id !== task.id.trim() || !/^RX-(?:[0-9]{4}|A[0-9]{3})$/u.test(task.id)) {
      errors.push(context + '.id must match RX-0000 or RX-A000.');
    }
    if (!TASK_STATUSES.includes(task.status)) errors.push(context + '.status is not a supported status.');
    if (!milestones.has(task.milestone)) errors.push(context + ' references unknown milestone ' + task.milestone);
    checkList(task.dependsOn, context + '.dependsOn', errors);
    for (const key of ['acceptanceCriteria', 'verification', 'affectedPaths', 'specs']) {
      checkList(task[key], context + '.' + key, errors, { nonempty: true });
    }
    checkList(task.evidence, context + '.evidence', errors);
    if (task.status === 'done' && (!Array.isArray(task.evidence) || task.evidence.length === 0)) {
      errors.push(context + ' is done but has no evidence.');
    }
    if (task.status === 'blocked' || task.status === 'needs_decision') {
      if (!isText(task.blocker)) errors.push(context + '.blocker must explain the block or decision.');
    } else if (task.blocker !== null) {
      errors.push(context + '.blocker must be null unless status is blocked or needs_decision.');
    }
    for (const key of ['specs', 'evidence']) {
      if (!Array.isArray(task[key])) continue;
      task[key].forEach((path, pathIndex) => {
        checkFile(path, context + '.' + key + '[' + pathIndex + ']', root, errors);
      });
    }
    if (isText(task.id)) {
      if (tasks.has(task.id)) errors.push('Duplicate task ID: ' + task.id);
      else tasks.set(task.id, task);
    }
  }

  for (const task of tasks.values()) {
    if (!Array.isArray(task.dependsOn)) continue;
    for (const dependency of task.dependsOn) {
      if (!tasks.has(dependency)) {
        errors.push(task.id + ' depends on unknown task ' + dependency);
      } else if (['done', 'in_progress'].includes(task.status) && tasks.get(dependency).status !== 'done') {
        errors.push(task.id + ' is ' + task.status + ' but dependency ' + dependency +
          ' is ' + tasks.get(dependency).status + '.');
      }
    }
  }
  const cycle = findCycle(tasks);
  if (cycle) errors.push('Dependency cycle: ' + cycle.join(' -> '));
  return { valid: errors.length === 0, errors };
}

export class RoadmapValidationError extends Error {
  constructor(errors) {
    super('Invalid roadmap:\n' + errors.map((error) => '- ' + error).join('\n'));
    this.name = 'RoadmapValidationError';
    this.errors = [...errors];
  }
}

/** Load and validate a roadmap without changing files, statuses, or external trackers. */
export function loadRoadmap(root = ROOT, { file = ROADMAP_FILE } = {}) {
  if (!isLocalPath(file)) throw new Error('Roadmap file must be a repository-relative path.');
  let content;
  try {
    content = readFileSync(resolve(root, file), 'utf8');
  } catch (error) {
    throw new Error('Cannot read ' + file + ': ' + error.message, { cause: error });
  }
  let roadmap;
  try {
    roadmap = JSON.parse(content);
  } catch (error) {
    throw new Error('Invalid JSON in ' + file + ': ' + error.message, { cause: error });
  }
  const result = validateRoadmap(roadmap, { root });
  if (!result.valid) throw new RoadmapValidationError(result.errors);
  return roadmap;
}

/**
 * Derive state from a validated roadmap. Array order is the priority order.
 * Optional milestones never enter automatic scheduling; promotion is an explicit plan edit.
 */
export function getStatus(roadmap) {
  const tasks = new Map(roadmap.tasks.map((task) => [task.id, task]));
  const tracks = new Map(roadmap.milestones.map((milestone) => [milestone.id, milestone.track]));
  const active = roadmap.tasks.filter((task) => tracks.get(task.milestone) === 'release');
  const optional = roadmap.tasks.filter((task) => tracks.get(task.milestone) === 'optional');
  const done = active.filter((task) => task.status === 'done');
  const unfinished = active.filter((task) => task.status !== 'done');
  const resume = active.filter((task) => task.status === 'in_progress');
  const ready = active.filter((task) =>
    task.status === 'planned' && task.dependsOn.every((id) => tasks.get(id).status === 'done'));
  const blocked = active.filter((task) => task.status === 'blocked');
  const decisions = active.filter((task) => task.status === 'needs_decision');
  const deferred = active.filter((task) => task.status === 'deferred');
  const dependencyBlocked = active
    .filter((task) => task.status === 'planned')
    .map((task) => ({ task, dependencies: task.dependsOn.map((id) => tasks.get(id)).filter((item) => item.status !== 'done') }))
    .filter((entry) => entry.dependencies.length > 0);
  const next = resume[0] ?? ready[0] ?? null;
  let state;
  if (resume.length > 0) state = 'in_progress';
  else if (ready.length > 0) state = 'ready';
  else if (unfinished.length === 0) state = 'complete';
  else if (blocked.length > 0) state = 'blocked';
  else if (decisions.length > 0) state = 'needs_decision';
  else if (deferred.length > 0) state = 'deferred';
  else state = 'dependency_blocked';
  return {
    state, next, active, done, unfinished, resume, ready, blocked,
    dependencyBlocked, decisions, deferred, optional,
  };
}

function taskLabel(task) {
  return task.id + ' — ' + task.title;
}

function section(lines, title, items, format = taskLabel) {
  if (items.length === 0) return;
  lines.push('', title + ' (' + items.length + '):');
  for (const item of items) lines.push('- ' + format(item));
}

/** Text presentation shared by the CLI and behavior tests. */
export function formatNext(status) {
  const headings = {
    in_progress: 'Resume in-progress release work: ' + (status.next ? taskLabel(status.next) : ''),
    ready: 'Next dependency-ready release task: ' + (status.next ? taskLabel(status.next) : ''),
    complete: 'Active release backlog complete.',
    blocked: 'No release task can start. Unfinished blocked work remains.',
    needs_decision: 'No release task can start. Owner decisions are pending.',
    deferred: 'No release task can start. Unfinished release work is deferred.',
    dependency_blocked: 'No release task can start. Unfinished work is waiting on dependencies.',
  };
  const lines = [headings[status.state]];
  section(lines, 'In-progress release work to resume', status.resume);
  section(lines, 'All dependency-ready release tasks', status.ready);
  section(lines, 'Explicitly blocked release work', status.blocked, (task) => taskLabel(task) + ': ' + task.blocker);
  section(lines, 'Release work waiting on dependencies', status.dependencyBlocked, ({ task, dependencies }) =>
    task.id + ' waits for ' + dependencies.map((dependency) => dependency.id + ' (' + dependency.status + ')').join(', '));
  section(lines, 'Pending owner decisions', status.decisions, (task) => taskLabel(task) + ': ' + task.blocker);
  section(lines, 'Deferred release work — not complete', status.deferred);
  section(lines, 'Optional backlog — never selected automatically', status.optional.filter((task) => task.status !== 'done'),
    (task) => taskLabel(task) + ' [' + task.status + ']');
  lines.push('', SCOPE_NOTE);
  return lines.join('\n');
}

export function formatStatus(roadmap) {
  const status = getStatus(roadmap);
  const lines = [
    'Raveldex roadmap',
    'Release progress: ' + status.done.length + '/' + status.active.length +
      ' done; ' + status.resume.length + ' in progress; ' + status.ready.length + ' ready.',
    '',
  ];
  for (const milestone of roadmap.milestones) {
    const tasks = roadmap.tasks.filter((task) => task.milestone === milestone.id);
    const done = tasks.filter((task) => task.status === 'done').length;
    const title = milestone.title.startsWith(milestone.id + ' — ')
      ? milestone.title
      : milestone.id + ' — ' + milestone.title;
    lines.push(title + ': ' + done + '/' + tasks.length +
      ' done [' + milestone.track + ']');
  }
  lines.push('', formatNext(status));
  return lines.join('\n');
}
