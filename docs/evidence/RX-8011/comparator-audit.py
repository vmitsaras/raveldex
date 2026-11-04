#!/usr/bin/env python3
"""RX-8011 independent read-only comparator review. No collector or scorer calls.

Run from the repository root. Python computes memberships, quantiles and relevance
metrics independently; Node is used only to load the frozen JS data module and
serialize JSON/hash captured objects using JavaScript's number representation.
"""
import collections
import hashlib
import itertools
import json
import math
import pathlib
import re
import subprocess
import tarfile
import unicodedata

ROOT = pathlib.Path.cwd()
BASE = ROOT / 'docs/evidence/RX-8010'
OUT = ROOT / 'docs/evidence/RX-8011/comparator-audit.json'
checks = collections.Counter()


def check(value, message):
    assert value, message
    checks[message.split(':')[0]] += 1


def read(path):
    return json.loads(path.read_text())


def sha(value):
    if not isinstance(value, bytes):
        value = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
    return hashlib.sha256(value).hexdigest()


def tokens(value):
    found, current = [], ''
    for char in value:
        category = unicodedata.category(char)[0]
        if category in 'LN' or (current and category == 'M'):
            current += char
        elif current:
            found.append(unicodedata.normalize('NFKC', current).lower())
            current = ''
    if current:
        found.append(unicodedata.normalize('NFKC', current).lower())
    return found


def selected_values(record, fields):
    return [value for field in fields for value in (
        record['text'].get(field, []) if isinstance(record['text'].get(field, []), list)
        else [record['text'][field]])]


def qualifies(record, query):
    if isinstance(query, str):
        query = {'kind': 'text', 'text': query}
    kind = query['kind']
    if kind == 'extension':
        check(query['capability'] == 'phrases', 'known extension')
        query = {'kind': 'phrase', **query['payload']}
        kind = 'phrase'
    fields = query.get('fields', list(record['text']))
    values = [tokens(value) for value in selected_values(record, fields)]
    terms = set(itertools.chain.from_iterable(values))
    if kind == 'text':
        wanted = tokens(query['text'])
        return bool(wanted) and all(term in terms for term in wanted)
    if kind == 'group':
        return any(any(term.startswith(wanted) if variant['match'] == 'prefix'
                       else term == wanted for term in terms)
                   for variant in query['variants'] for wanted in tokens(variant['text']))
    if kind == 'phrase':
        wanted = tokens(query['text'])
        return bool(wanted) and any(words[i:i+len(wanted)] == wanted
                                   for words in values for i in range(len(words)))
    if kind in ['and', 'or']:
        return (all if kind == 'and' else any)(qualifies(record, child) for child in query['children'])
    if kind == 'not':
        return not qualifies(record, query['child'])
    if kind == 'eq':
        return record.get('metadata', {}).get(query['field']) == query['value']
    raise AssertionError('unsupported review query kind ' + kind)


def quantile(values, probability):
    return sorted(values)[math.ceil(len(values) * probability)-1]


report = read(BASE / 'node/report.json')
check(report['modulesBefore'] == report['modulesAfter'], 'installed inventory before after')
inventory = {entry['path']: entry for entry in report['modulesBefore']}
archive_rows = read(BASE / 'setup/archives.json')
identities = read(BASE / 'package-identities.json')
archive_names = {
    'raveldex': 'vmitsaras-raveldex-0.1.0-rc.0.tgz',
    'minisearch': 'minisearch-7.2.0.tgz', 'flexsearch': 'flexsearch-0.8.212.tgz',
    'orama': 'orama-orama-3.1.18.tgz', 'lunr': 'lunr-2.3.9.tgz',
    'fuse': 'fuse.js-7.5.0.tgz', 'pagefind': 'pagefind-1.6.0.tgz',
}
for archive in archive_rows:
    data = (BASE / 'setup' / archive['file']).read_bytes()
    check(len(data) == archive['bytes'] and sha(data) == archive['sha256'], 'archive identity:' + archive['file'])
for identity in identities:
    marker = 'node_modules/'
    entry = identity['entry'].split(marker)[-1]
    member = entry[len(identity['name'])+1:]
    with tarfile.open(BASE / 'setup' / archive_names[identity['engine']]) as archive:
        metadata = archive.extractfile('package/package.json').read()
        code = archive.extractfile('package/' + member).read()
    manifest = json.loads(metadata)
    check((manifest['name'], manifest['version']) == (identity['name'], identity['version']), 'package metadata identity:' + identity['engine'])
    check(sha(metadata) == identity['metadataSha256'] and sha(code) == identity['entrySha256'], 'selected archive member identity:' + identity['engine'])
    check(inventory[entry]['sha256'] == sha(code), 'selected recorded installed identity:' + identity['engine'])
    installed = pathlib.Path(report['consumer']) / 'node_modules' / entry
    check(installed.exists() and sha(installed.read_bytes()) == sha(code), 'selected surviving installed identity:' + identity['engine'])
for pin in report['harness']:
    check(sha((ROOT / pin['path']).read_bytes()) == pin['sha256'], 'current measured harness identity:' + pin['path'])
    frozen = BASE / 'measurement' / pathlib.Path(pin['path']).name
    if frozen.exists():
        check(sha(frozen.read_bytes()) == pin['sha256'], 'saved measured harness identity:' + pin['path'])
check(sha((BASE / 'measurement/resume.mjs').read_bytes()) == report['resumeSourceSha256'], 'resume source identity')
manifest = read(ROOT / 'package.json')
foreign_names = {'minisearch', 'flexsearch', '@orama/orama', 'lunr', 'fuse.js', 'pagefind'}
check(not foreign_names.intersection(manifest.get('dependencies', {})), 'no foreign runtime dependencies')
check(not foreign_names.intersection(manifest.get('devDependencies', {})), 'no foreign root tooling dependencies')
for path in [ROOT / 'src/index.ts', *(ROOT / 'src/core').rglob('*.ts')]:
    imports = re.findall(r'(?:from\s*|import\s*\()\s*[\'\"]([^\'\"]+)[\'\"]', path.read_text())
    check(all(name.startswith('.') and '/addons/' not in name and '/adapters/' not in name and '/integrations/' not in name and '/bench/' not in name for name in imports), 'core stays on relative core graph')

corpus_path = ROOT / 'test/fixtures/relevance/corpus.json'
corpus = read(corpus_path)
freeze = read(ROOT / 'test/fixtures/relevance/freeze.json')
for name, digest in freeze['files'].items():
    check(sha((ROOT / 'test/fixtures/relevance' / name).read_bytes()) == digest, 'frozen relevance file identity:' + name)
workload_freeze = read(ROOT / 'test/fixtures/n9/freeze.json')
workloads = {}
for family, size in itertools.product(report['method']['families'], report['method']['sizes']):
    records, labels = [], []
    for i in range(size):
        index = i % len(corpus['records'])
        source, section = corpus['records'][index], corpus['sections'][index]
        original = source['text']['title'] + '\n' + source['text']['body']
        if len(original) > 512:
            head = original[:512]
            match = re.search(r'\s+\S*$', head)
            check(match is not None, 'excerpt boundary')
            original = head[:match.start()]
        body = original
        if family != 'real-docs':
            key = f'n9key{i:06}'
            controls = f'n9common {"n9rare" if i % 997 == 7 else ""} {"n9left" if i % 3 == 0 else ""} {key}a {key}b {key}c'
            phrase = 'n9red n9blue' if i % 3 == 0 else 'n9red n9gap n9blue'
            body = (original + '\nCatalog ' + controls + ' ' + phrase) if family == 'high-cardinality' else (
                [controls + ' n9echo n9echo n9echo n9echo', 'n9red', 'n9blue'] if i % 3 == 2
                else controls + ' n9echo n9echo n9echo n9echo ' + phrase)
        record_id = f'{family}:{i:05}'
        records.append({'id': record_id, 'text': {'body': body}, 'metadata': {'group': f'g{i%5}'}})
        labels.append({'id': record_id, 'sourceId': source['id'], 'sourcePath': source['metadata']['sourcePath'], 'sourceUrl': section['sourceUrl'], 'repetition': i // len(corpus['records']), 'retainedExcerpt': family != 'adversarial', 'excerptSha256': None if family == 'adversarial' else sha(original.encode())})
    expected_identity = next(row for row in workload_freeze['workloads'] if row['family'] == family and row['size'] == size)
    check(sha(records) == expected_identity['corpusSha256'], 'independent corpus reconstruction:' + family + str(size))
    check(sha(labels) == expected_identity['labelsSha256'], 'independent label reconstruction:' + family + str(size))
    workloads[(family, size)] = (records, expected_identity)

expected_matrix = set(itertools.product(report['method']['engines'], report['method']['families'], report['method']['sizes'], range(report['method']['owners'])))
actual_matrix = [(run['engine'], run['family'], run['size'], run['owner']) for run in report['runs']]
check(len(actual_matrix) == len(set(actual_matrix)) and set(actual_matrix) == expected_matrix, 'complete accepted Cartesian matrix')
raws = [read(BASE / 'node' / run['file']) for run in report['runs']]
groups = collections.defaultdict(list)
statuses, errors = collections.Counter(), collections.Counter()
membership_cache = {}
for run, raw in zip(report['runs'], raws):
    check(raw['status'] == 'Collected' and run['exitCode'] == 0, 'accepted child outcome')
    check(tuple(raw[key] for key in ['engine', 'family', 'size', 'owner']) == tuple(run[key] for key in ['engine', 'family', 'size', 'owner']), 'raw child identity')
    records, expected_identity = workloads[(raw['family'], raw['size'])]
    check(raw['identity'] == expected_identity, 'raw frozen workload identity')
    projected = [{'id': r['id'], 'body': '\n'.join(r['text']['body']) if isinstance(r['text']['body'], list) else r['text']['body']} for r in records]
    check(raw['projectedInputSha256'] == sha(projected), 'projected input identity')
    check(len(raw['queries']) == 8 and len(set(q['id'] for q in raw['queries'])) == 8, 'all eight query rows')
    for query in raw['queries']:
        key = (raw['family'], raw['size'], query['id'])
        if key not in membership_cache:
            membership_cache[key] = sorted(r['id'] for r in records if qualifies(r, query['query']))
        wanted = membership_cache[key]
        check(query['expectedTotal'] == len(wanted) and query['expectedIdsSha256'] == sha(wanted), 'independent complete expected membership')
        statuses[(raw['engine'], query['status'])] += 1
        if query['status'] == 'Refused':
            check(raw['engine'] == 'raveldex' and query['error']['name'] == 'RaveldexError', 'refusals are native typed errors')
            if query['expectedError']:
                check(query['error']['code'] == 'LIMIT_EXCEEDED' and query['error']['details'] == {'path': 'expansions.group', 'limit': 256, 'actual': 257}, 'exact expansion refusal facts')
            else:
                check((raw['family'], raw['size'], query['id']) == ('real-docs', 10000, 'broad-prefix') and query['error']['code'] == 'WORK_LIMIT_EXCEEDED' and query['error']['details'] == {'path': 'work'}, 'exact work refusal facts')
            errors[(raw['family'], raw['size'], query['id'], query['error']['code'])] += 1
            continue
        if query.get('capture') and raw['engine'] != 'raveldex':
            capture = query['capture']
            check(capture['total'] == len(capture['ids']) == len(set(capture['ids'])), 'complete unique foreign output')
            matches = sorted(capture['ids']) == wanted
            check((query['status'] == 'Equivalent membership') == matches or raw['engine'] == 'fuse', 'foreign membership status')
            check(query['actualIdsSha256'] == sha(sorted(capture['ids'])), 'foreign actual IDs identity')
        if query.get('completeIds') is not None:
            complete = query['completeIds']
            if query['completeMembership']['status'] == 'Equivalent membership':
                check(sorted(complete) == wanted and len(complete) == len(set(complete)), 'independent native full pages')
    for sample in raw['samples']:
        key = tuple(raw[x] for x in ['engine', 'family', 'size']) + tuple(sample[x] for x in ['operation', 'phase', 'outcome'])
        groups[key].append(sample)
        check(all(math.isfinite(sample[field]) and sample[field] >= 0 for field in ['wallMs', 'cpuUserMs', 'cpuSystemMs']), 'finite nonnegative cost')
for summary in report['summaries']:
    key = tuple(summary[x] for x in ['engine', 'family', 'size', 'operation', 'phase', 'outcome'])
    samples = groups.pop(key)
    check(summary['count'] == len(samples), 'quantile observation denominator')
    for raw_key, summary_key in [('wallMs', 'wallP50Ms'), ('cpuUserMs', 'cpuUserP50Ms'), ('cpuSystemMs', 'cpuSystemP50Ms')]:
        check(summary[summary_key] == quantile([s[raw_key] for s in samples], .5), 'independent nearest rank p50')
    expected = quantile([s['wallMs'] for s in samples], .95) if len(samples) >= 100 else None
    check(summary['wallP95Ms'] == expected, 'independent nearest rank p95 threshold')
check(not groups, 'all summary groups retained')
capture_checks = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', '''
import fs from 'node:fs'; import crypto from 'node:crypto'; import assert from 'node:assert/strict';
const base='docs/evidence/RX-8010/node/'; const report=JSON.parse(fs.readFileSync(base+'report.json'));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'); let captures=0,samples=0;
for(const run of report.runs){const raw=JSON.parse(fs.readFileSync(base+run.file));
 for(const [key,value] of Object.entries(raw.captures)){assert.equal(hash(value),key);captures++;}
 for(const sample of raw.samples){if(sample.operation.startsWith('query:')&&sample.outcome==='Pass'){
  const q=raw.queries.find(q=>sample.operation==='query:'+q.id); assert.equal(sample.resultSha256,hash(q.capture));
  assert.deepEqual(raw.captures[sample.resultSha256],q.capture);samples++;}}
}console.log(JSON.stringify({captures,samples}));
'''], cwd=ROOT))
check(len(report['failedAttempts']) == 1, 'one separately retained failed build')
failed_run = report['failedAttempts'][0]
failed = read(BASE / 'node' / failed_run['file'])
retry = next(run for run in report['runs'] if run.get('retryOf') == failed_run['file'])
check(failed['status'] == 'Fail' and failed['queries'] == [] and len(failed['samples']) == 1, 'failed build has no fabricated queries')
check(failed['samples'][0]['error']['code'] == 'DEADLINE_EXCEEDED' and failed['samples'][0]['outcome'] == 'Refused', 'typed failed build deadline')
check(report['attemptSummaries'][0]['wallP50Ms'] == failed['samples'][0]['wallMs'] and report['attemptSummaries'][0]['count'] == 1, 'failed attempt summary separate')
check(read(BASE / 'node' / retry['file'])['identity'] == failed['identity'], 'retry frozen identity')

# Load data only, without the implementation scorer/tokenizer/metrics/oracle.
judgments = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', 'import {RELEVANCE_JUDGMENTS as j} from "./test/fixtures/relevance/judgments.mjs"; console.log(JSON.stringify(j));'], cwd=ROOT))
relevance = read(BASE / 'relevance.json')
judgment_by_id = {row['id']: row for row in judgments}
native_by_id = {row['id']: row for row in relevance['engines'][0]['rows']}
relevance_counts = []


def verify_metrics(engine, included, rows, metrics):
    ranked, empties, row_metrics = [], [], []
    for judgment in included:
        result = rows[judgment['id']]['result']
        ids = result['ids']
        acceptable = set(judgment['acceptableIds'])
        rank = next((i+1 for i, record_id in enumerate(ids) if record_id in acceptable), None)
        relevant_top = sum(record_id in acceptable for record_id in ids[:10])
        item = {'id': judgment['id'], 'expectation': judgment['expectation'], 'firstAcceptableRank': rank,
                'top1': rank == 1, 'top3': rank is not None and rank <= 3, 'reciprocalRank': 1/rank if rank else 0,
                'recall10': relevant_top/len(acceptable) if acceptable else None, 'knownRelevantInTop10': relevant_top,
                'knownRelevantCount': len(acceptable), 'mustFindMissingFromCompleteResults': [x for x in judgment['mustFindIds'] if x not in ids],
                'knownIrrelevantInTop10': [x for x in ids[:10] if x in judgment['knownIrrelevantIds']],
                'intendedEmpty': judgment['expectation'] == 'intended-empty', 'returnedEmpty': result['total'] == 0,
                'retrievalCutoff': 100, 'completeRanking': result['total'] <= 100 and len(ids) == result['total']}
        row_metrics.append(item)
        (empties if item['intendedEmpty'] else ranked).append(item)
    check(metrics['rows'] == row_metrics, 'independent relevance per query:' + engine)
    check((metrics['queryCount'], metrics['rankingDenominator'], metrics['intendedEmptyDenominator']) == (len(included), len(ranked), len(empties)), 'relevance denominators:' + engine)
    for metric, numerator, denominator in [
        ('top1', sum(x['top1'] for x in ranked), len(ranked)), ('top3', sum(x['top3'] for x in ranked), len(ranked)),
        ('recall10Micro', sum(x['knownRelevantInTop10'] for x in ranked), sum(x['knownRelevantCount'] for x in ranked)),
        ('correctIntendedEmpty', sum(x['returnedEmpty'] for x in empties), len(empties)),
        ('unintendedEmpty', sum(x['returnedEmpty'] for x in ranked), len(ranked)),
        ('unexpectedNonempty', sum(not x['returnedEmpty'] for x in empties), len(empties))]:
        check(metrics[metric] == {'numerator': numerator, 'denominator': denominator, 'value': numerator/denominator if denominator else None}, 'independent relevance aggregate:' + engine + metric)
    for metric, field, term in [('mrr', 'reciprocalRankSum', 'reciprocalRank'), ('recall10Macro', 'recallSum', 'recall10')]:
        value = sum(x[term] for x in ranked)
        check(metrics[metric] == {field: value, 'denominator': len(ranked), 'value': value/len(ranked) if ranked else None}, 'independent relevance aggregate:' + engine + metric)


for evaluated in relevance['engines']:
    rows = {row['id']: row for row in evaluated['rows']}
    check(set(rows) == set(judgment_by_id) and len(evaluated['rows']) == 76, 'all frozen relevance rows:' + evaluated['engine'])
    for row in rows.values():
        check(row['query'] == (judgment_by_id[row['id']]['query'] if isinstance(judgment_by_id[row['id']]['query'], dict) else {'kind': 'text', 'text': judgment_by_id[row['id']]['query']}), 'relevance query identity')
        if 'result' in row:
            wanted = sorted(r['id'] for r in corpus['records'] if qualifies(r, judgment_by_id[row['id']]['query']))
            check(sorted(row['expectedIds']) == wanted, 'independent relevance lexical membership')
            check(row['result']['total'] == len(set(row['result']['ids'])) == len(row['result']['ids']), 'relevance complete result')
    included = [j for j in judgments if rows[j['id']]['status'] == 'Equivalent membership' or (evaluated['engine'] == 'fuse' and 'result' in rows[j['id']])]
    check((evaluated['included'], evaluated['omitted']) == (len(included), 76-len(included)), 'included omitted reconciliation')
    verify_metrics(evaluated['engine'], included, rows, evaluated['metrics'])
    if evaluated['engine'] not in ['raveldex', 'fuse']:
        verify_metrics('native same subset for ' + evaluated['engine'], included, native_by_id, evaluated['nativeSameSubsetMetrics'])
    relevance_counts.append({'engine': evaluated['engine'], 'included': len(included), 'rankingDenominator': evaluated['metrics']['rankingDenominator'], 'intendedEmptyDenominator': evaluated['metrics']['intendedEmptyDenominator']})

pagefind_totals = collections.Counter()
for path in sorted((BASE / 'pagefind').glob('*/report.json')):
    raw = read(path)
    check(raw['status'] == 'Collected' and raw['comparability'] == 'Not comparable', 'separate Pagefind track')
    with tarfile.open(path.parent / 'assets.tar.gz') as archive:
        members = {member.name.removeprefix('./'): member for member in archive if member.isfile()}
        for recorded in raw['files']:
            name = recorded['path']
            member = members.get(name) or members.get(name.removeprefix('pagefind/'))
            check(member is not None, 'Pagefind generated member present')
            data = archive.extractfile(member).read()
            check(len(data) == recorded['bytes'] and sha(data) == recorded['sha256'], 'Pagefind generated member identity')
    pagefind_totals['generatedFiles'] += len(raw['files'])
    records, _ = workloads[(raw['workload']['family'], raw['workload']['size'])]
    known_ids = {r['id'] for r in records}
    for query in raw['queries']:
        if query['status'] != 'Collected':
            continue
        check(query['comparability'] == 'Not comparable', 'Pagefind never promoted')
        check(query['total'] == len(query['hydrated']) == len(set(row['sourceId'] for row in query['hydrated'])), 'complete Pagefind hydration')
        check(all(row['sourceId'] in known_ids for row in query['hydrated']), 'known Pagefind IDs')
        wanted = membership_cache[(raw['workload']['family'], raw['workload']['size'], query['id'])]
        check(query['nativeMembershipEqual'] == (sorted(row['sourceId'] for row in query['hydrated']) == wanted), 'Pagefind membership coincidence status')
        check(query['p50WallMs'] == quantile(query['wallMs'], .5) and query['p95WallMs'] is None and len(query['wallMs']) == 10, 'independent Pagefind quantiles')
        pagefind_totals['samples'] += len(query['wallMs'])
        pagefind_totals['warmups'] += len(query['warmupWallMs'])
        pagefind_totals['hydratedIDs'] += len(query['hydrated'])

output = {'kind': 'rx8011-independent-comparator-review-v1', 'status': 'Pass',
          'basisHead': '1dfbff1', 'checks': dict(checks), 'acceptedChildren': len(raws),
          'acceptedSamples': sum(len(raw['samples']) for raw in raws), 'independentCaptureHashChecks': capture_checks,
          'queryStatusCounts': [{'engine': key[0], 'status': key[1], 'count': count} for key, count in sorted(statuses.items())],
          'refusedProbeCounts': [{'family': key[0], 'size': key[1], 'query': key[2], 'code': key[3], 'count': count} for key, count in sorted(errors.items())],
          'failedBuild': {'file': failed_run['file'], 'wallMs': failed['samples'][0]['wallMs'], 'retryFile': retry['file']},
          'relevanceDenominators': relevance_counts, 'pagefind': dict(pagefind_totals),
          'limitations': ['Read-only audit of retained measurements; no new timing or browser/AT observations.', 'Selected archive/installed entry identities plus all generated Pagefind members verified; no external registry attestation.', 'No population inference from owner-shared samples or incomplete relevance labels.']}
OUT.write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'status': output['status'], 'checks': sum(checks.values()), 'acceptedChildren': len(raws), 'acceptedSamples': output['acceptedSamples'], 'output': str(OUT)}))
