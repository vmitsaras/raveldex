import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRoadmap } from './lib/roadmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LABELS = [
  ['type:task', '1d76db', 'A bounded implementation or qualification task'],
  ['type:milestone', '5319e7', 'Milestone overview and linked task checklist'],
  ['track:release', '0052cc', 'Native candidate roadmap'],
  ['track:optional', 'c5def5', 'Deferred optional capability'],
  ['status:ready', '0e8a16', 'Dependencies complete; eligible for the next instruction'],
  ['status:planned', 'bfd4f2', 'Planned work'],
  ['status:waiting', 'fbca04', 'Waiting for incomplete dependencies'],
  ['status:in-progress', '1d76db', 'Implementation in progress'],
  ['status:blocked', 'b60205', 'Explicit blocker recorded in roadmap'],
  ['status:needs-decision', 'd93f0b', 'A specific unresolved decision is recorded'],
  ['status:deferred', 'eeeeee', 'Not in the automatically selected backlog'],
  ['status:done', '0e8a16', 'Accepted task with evidence recorded'],
];
const MANAGED_LABELS = new Set(LABELS.map(([name]) => name));
const marker = (id, edge) => `<!-- raveldex:${id}:${edge} -->`;
const count = (text, value) => text.split(value).length - 1;
const baseUrl = (roadmap) => `https://github.com/${roadmap.repository}`;
const issueLink = (roadmap, id, index) => index.get(id)
  ? `[${id}](${baseUrl(roadmap)}/issues/${index.get(id).number})`
  : `[${id}](${baseUrl(roadmap)}/issues?q=${encodeURIComponent(`is:issue [${id}]`)})`;
const fileLink = (roadmap, path) => `[${path}](${baseUrl(roadmap)}/blob/main/${path})`;

export function mergeManagedBody(existing, id, section) {
  const start = marker(id, 'start');
  const end = marker(id, 'end');
  const managed = `${start}\n${section.trim()}\n${end}`;
  if (!existing) return `${managed}\n\n## Maintainer notes\n\nDiscussion and notes outside the managed block are preserved by synchronization.\n`;
  if (count(existing, start) !== 1 || count(existing, end) !== 1 || existing.indexOf(end) < existing.indexOf(start)) {
    throw new Error(`Issue ${id} has missing, duplicate, or reversed managed markers; refusing to overwrite it.`);
  }
  return existing.slice(0, existing.indexOf(start)) + managed + existing.slice(existing.indexOf(end) + end.length);
}

export function taskState(task, roadmap) {
  if (task.status === 'planned') {
    if (roadmap.milestones.find((milestone) => milestone.id === task.milestone)?.track === 'optional') return 'planned';
    const completed = new Set(roadmap.tasks.filter((t) => t.status === 'done').map((t) => t.id));
    return task.dependsOn.every((id) => completed.has(id)) ? 'ready' : 'waiting';
  }
  return task.status.replaceAll('_', '-');
}

export function taskSection(roadmap, task, index) {
  const milestone = roadmap.milestones.find((m) => m.id === task.milestone);
  const checked = task.status === 'done' ? 'x' : ' ';
  return [
    `**Task:** ${task.id} · **Milestone:** ${issueLink(roadmap, milestone.id, index)} · **Status:** ${taskState(task, roadmap)}`,
    '', '**Objective**', '', task.objective,
    '', '**Dependencies**', '', task.dependsOn.length ? task.dependsOn.map((id) => issueLink(roadmap, id, index)).join(', ') : 'None.',
    '', '**Acceptance criteria**', '', ...task.acceptanceCriteria.map((ac) => `- [${checked}] ${ac}`),
    '', '**Verification**', '', ...task.verification.map((v) => `- ${v}`),
    '', '**Expected affected paths**', '', ...task.affectedPaths.map((p) => `- \`${p}\``),
    '', '**Governing specifications**', '', ...task.specs.map((p) => `- ${fileLink(roadmap, p)}`),
    '', '**Recorded evidence**', '', ...(task.evidence.length ? task.evidence.map((p) => `- ${fileLink(roadmap, p)}`) : ['No completion evidence recorded.']),
    ...(task.blocker ? ['', '**Blocker / decision**', '', task.blocker] : []),
    '', `Canonical state: ${fileLink(roadmap, 'docs/planning/roadmap.json')}. Update it and regenerate the plan before closing the issue.`,
    '', milestone.track === 'optional' ? 'Deferred optional work; do not automatically activate it or expand the release scope.' : 'Dependency eligibility is not proof of implementation. Native direction is already adopted; publication remains a separate owner action.',
  ].join('\n');
}

export function milestoneSection(roadmap, milestone, index) {
  const tasks = roadmap.tasks.filter((t) => t.milestone === milestone.id);
  return [
    milestone.goal,
    '', `**Track:** ${milestone.track}. **Progress:** ${tasks.filter((t) => t.status === 'done').length}/${tasks.length} tasks accepted.`,
    '', '**Exit criteria**', '', ...milestone.exitCriteria.map((c) => `- ${c}`),
    '', '**Task checklist**', '', ...tasks.map((t) => `- [${t.status === 'done' ? 'x' : ' '}] ${issueLink(roadmap, t.id, index)} — ${t.title}`),
    '', `Roadmap: ${fileLink(roadmap, 'ROADMAP.md')}. Task detail: ${fileLink(roadmap, 'IMPLEMENTATION_TASKS.md')}.`,
    '', 'Closing this overview alone does not complete its tasks. Completion requires accepted evidence in the canonical roadmap.',
  ].join('\n');
}

async function allPages(request, endpoint) {
  const rows = [];
  for (let page = 1; page <= 50; page++) {
    const result = await request('GET', `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(result)) throw new Error(`Expected list response from ${endpoint}.`);
    rows.push(...result);
    if (result.length < 100) return rows;
  }
  throw new Error(`Pagination bound exceeded for ${endpoint}; no truncated inventory may be used.`);
}

function indexIssues(issues, ids) {
  const index = new Map();
  const owners = new Map();
  for (const id of ids) {
    const matches = issues.filter((issue) => (issue.body || '').includes(marker(id, 'start')));
    if (matches.length > 1) throw new Error(`Duplicate managed issues for ${id}; reconcile before syncing.`);
    const collisions = issues.filter((issue) => issue.title.startsWith(`[${id}]`) && !matches.includes(issue));
    if (collisions.length) throw new Error(`Unmanaged or duplicate title for ${id}; refusing to adopt or duplicate it.`);
    if (matches[0]) {
      const previous = owners.get(matches[0].number);
      if (previous) throw new Error(`Issue #${matches[0].number} claims multiple roadmap IDs (${previous}, ${id}); reconcile before syncing.`);
      owners.set(matches[0].number, id);
      mergeManagedBody(matches[0].body, id, 'validation only');
      index.set(id, matches[0]);
    }
  }
  return index;
}

/** Synchronize only this roadmap's owned metadata; request is injected for behavioral tests. */
export async function synchronize(roadmap, request, log = () => {}) {
  const prefix = `/repos/${roadmap.repository}`;
  const [labels, milestones, inventory] = await Promise.all([
    allPages(request, `${prefix}/labels`),
    allPages(request, `${prefix}/milestones?state=all`),
    allPages(request, `${prefix}/issues?state=all`),
  ]);
  const issues = inventory.filter((issue) => !issue.pull_request);
  const index = indexIssues(issues, [...roadmap.milestones, ...roadmap.tasks].map((x) => x.id));
  const milestoneIndex = new Map();
  const milestoneOwners = new Map();
  for (const milestone of roadmap.milestones) {
    const tag = `<!-- raveldex:milestone:${milestone.id} -->`;
    const matches = milestones.filter((m) => (m.description || '').includes(tag));
    if (matches.length > 1 || (matches[0] && count(matches[0].description, tag) !== 1) || milestones.some((m) => m.title === milestone.title && !matches.includes(m))) {
      throw new Error(`Duplicate or unmanaged milestone ${milestone.id}; refusing to overwrite it.`);
    }
    if (matches[0]) {
      const previous = milestoneOwners.get(matches[0].number);
      if (previous) throw new Error(`Milestone #${matches[0].number} claims multiple roadmap IDs (${previous}, ${milestone.id}); reconcile before syncing.`);
      milestoneOwners.set(matches[0].number, milestone.id);
      milestoneIndex.set(milestone.id, matches[0]);
    }
  }
  // Respect manually closed issues instead of silently resetting their state.
  for (const item of [...roadmap.milestones, ...roadmap.tasks]) {
    const done = item.id.startsWith('RX-') ? item.status === 'done'
      : roadmap.tasks.filter((t) => t.milestone === item.id).every((t) => t.status === 'done');
    if (index.get(item.id)?.state === 'closed' && !done) {
      throw new Error(`${item.id} is closed on GitHub but unfinished in the manifest. Reconcile state explicitly; no automatic reopen.`);
    }
  }
  for (const [name, color, description] of LABELS) {
    if (!labels.some((label) => label.name === name)) {
      await request('POST', `${prefix}/labels`, { name, color, description });
      log(`Created label ${name}`);
    }
  }
  for (const milestone of roadmap.milestones) {
    if (!milestoneIndex.has(milestone.id)) {
      const value = await request('POST', `${prefix}/milestones`, {
        title: milestone.title,
        description: `<!-- raveldex:milestone:${milestone.id} -->\n${milestone.goal}`,
        state: 'open',
      });
      milestoneIndex.set(milestone.id, value);
      log(`Created milestone ${milestone.id}: ${value.html_url}`);
    }
  }
  const items = [
    ...roadmap.milestones.map((m) => ({ id: m.id, milestone: m, type: 'milestone', title: `[${m.id}] ${m.title.replace(/^N\d+\s*[—–-]\s*/, '')}` })),
    ...roadmap.tasks.map((t) => ({ id: t.id, milestone: roadmap.milestones.find((m) => m.id === t.milestone), type: 'task', task: t, title: `[${t.id}] ${t.title}` })),
  ];
  function properties(item) {
    const related = roadmap.tasks.filter((t) => t.milestone === item.milestone.id);
    const done = item.task ? item.task.status === 'done' : related.every((t) => t.status === 'done');
    const status = item.task ? taskState(item.task, roadmap) : done ? 'done'
      : item.milestone.track === 'optional' ? 'deferred'
      : related.some((t) => t.status === 'in_progress') ? 'in-progress'
      : related.some((t) => taskState(t, roadmap) === 'ready') ? 'ready' : 'waiting';
    const existing = index.get(item.id);
    const manualLabels = (existing?.labels || []).map((l) => typeof l === 'string' ? l : l.name).filter((l) => !MANAGED_LABELS.has(l));
    return {
      title: item.title,
      body: mergeManagedBody(existing?.body, item.id, item.task ? taskSection(roadmap, item.task, index) : milestoneSection(roadmap, item.milestone, index)),
      labels: [...new Set([...manualLabels, `type:${item.type}`, `track:${item.milestone.track}`, `status:${status}`])].sort(),
      // Overview issues summarize tasks; counting them would inflate milestone progress.
      // Explicit null also removes the association left by older sync runs.
      milestone: item.task ? milestoneIndex.get(item.milestone.id).number : null,
      state: done ? 'closed' : 'open',
      ...(done ? { state_reason: 'completed' } : {}),
    };
  }
  for (const item of items) {
    if (!index.has(item.id)) {
      const { state, state_reason, ...create } = properties(item);
      const issue = await request('POST', `${prefix}/issues`, create);
      index.set(item.id, issue);
      log(`Created ${item.id}: ${issue.html_url}`);
    }
  }
  for (const item of items) {
    const desired = properties(item);
    const existing = index.get(item.id);
    const currentLabels = (existing.labels || []).map((l) => typeof l === 'string' ? l : l.name).sort();
    if (existing.title !== desired.title || existing.body !== desired.body || existing.state !== desired.state || (existing.milestone?.number ?? null) !== desired.milestone || JSON.stringify(currentLabels) !== JSON.stringify(desired.labels)) {
      const updated = await request('PATCH', `${prefix}/issues/${existing.number}`, desired);
      index.set(item.id, updated);
      log(`Updated ${item.id}: ${updated.html_url}`);
    }
  }
  function milestoneProperties(milestone) {
    const state = roadmap.tasks.filter((t) => t.milestone === milestone.id).every((t) => t.status === 'done') ? 'closed' : 'open';
    const description = `<!-- raveldex:milestone:${milestone.id} -->\n${milestone.goal}\n\nTracking: ${baseUrl(roadmap)}/issues/${index.get(milestone.id).number}`;
    return { title: milestone.title, description, state };
  }
  for (const milestone of roadmap.milestones) {
    const existing = milestoneIndex.get(milestone.id);
    const desired = milestoneProperties(milestone);
    if (existing.title !== desired.title || existing.state !== desired.state || existing.description !== desired.description) {
      milestoneIndex.set(milestone.id, await request('PATCH', `${prefix}/milestones/${existing.number}`, desired));
    }
  }
  // Read back the entire final inventory. A successful POST alone is not verification.
  const [finalIssues, finalMilestones] = await Promise.all([
    allPages(request, `${prefix}/issues?state=all`), allPages(request, `${prefix}/milestones?state=all`),
  ]);
  const readback = indexIssues(finalIssues.filter((i) => !i.pull_request), items.map((i) => i.id));
  for (const item of items) {
    const actual = readback.get(item.id);
    const desired = properties(item);
    if (!actual || actual.title !== desired.title || actual.body !== desired.body || actual.state !== desired.state || (actual.milestone?.number ?? null) !== desired.milestone || JSON.stringify((actual.labels || []).map((l) => typeof l === 'string' ? l : l.name).sort()) !== JSON.stringify(desired.labels)) {
      throw new Error(`Read-back mismatch for ${item.id}; synchronization is incomplete.`);
    }
  }
  const result = { repository: roadmap.repository, sourceCommit: process.env.GITHUB_SHA || null, milestones: {}, issues: {} };
  for (const m of roadmap.milestones) {
    const expected = milestoneIndex.get(m.id);
    const desired = milestoneProperties(m);
    const actual = finalMilestones.find((x) => x.number === expected.number);
    if (!actual || actual.title !== desired.title || actual.state !== desired.state || actual.description !== desired.description) throw new Error(`Read-back mismatch for milestone ${m.id}.`);
    result.milestones[m.id] = { number: actual.number, url: actual.html_url, state: actual.state };
  }
  for (const [id, issue] of readback) result.issues[id] = { number: issue.number, url: issue.html_url, state: issue.state };
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--dry-run', '--apply'].includes(args[0])) throw new Error('Usage: node scripts/sync-github.mjs --dry-run | --apply');
  const roadmap = loadRoadmap(ROOT);
  if (args[0] === '--dry-run') {
    console.log(`Preview only: ${roadmap.repository}; no network requests or remote mutations.`);
    console.log(`${roadmap.milestones.length} milestones; ${roadmap.milestones.length} overview issues; ${roadmap.tasks.length} task issues.`);
    for (const task of roadmap.tasks) console.log(`${task.id} [${taskState(task, roadmap)}] ${task.title}`);
    return;
  }
  if (roadmap.repository !== 'vmitsaras/raveldex' || process.env.GITHUB_REPOSITORY !== roadmap.repository) throw new Error('GITHUB_REPOSITORY must match the authorized vmitsaras/raveldex manifest.');
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required for explicit tracking synchronization.');
  const request = async (method, path, body) => {
    if (!path.startsWith(`/repos/${roadmap.repository}/`)) throw new Error('Request left the authorized repository.');
    const response = await fetch(`https://api.github.com${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path.split('?')[0]} returned HTTP ${response.status}; no blind mutation retry. Rerun after inspecting the cause.`);
    const data = await response.json();
    if (method !== 'GET') await new Promise((resolveWait) => setTimeout(resolveWait, 1100));
    return data;
  };
  const result = await synchronize(roadmap, request, console.log);
  console.log(`TRACKING_JSON=${JSON.stringify(result)}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `# Roadmap tracking verified\n\n${Object.keys(result.milestones).length} milestones and ${Object.keys(result.issues).length} issues.\n\n| ID | GitHub | State |\n| --- | --- | --- |\n${Object.entries(result.issues).map(([id, value]) => `| ${id} | [#${value.number}](${value.url}) | ${value.state} |`).join('\n')}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
