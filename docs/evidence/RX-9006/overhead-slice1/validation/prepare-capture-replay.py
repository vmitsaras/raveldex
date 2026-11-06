"""Independent literal-fixture/source/root validation over saved data only."""
from collections import Counter
from pathlib import Path
import copy
import datetime
import gzip
import hashlib
import importlib.util
import json
import math
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
RAW = Path(sys.argv[1] if len(sys.argv) > 1 else '/private/tmp/raveldex-rx9006-20261105/recovery-full-01').resolve()
oracle_path = ROOT / 'docs/evidence/RX-9006/review/oracle.py'
spec = importlib.util.spec_from_file_location('rx9006_independent_literal_oracle', oracle_path)
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
def fnv(text):
    value = 2166136261
    raw = text.encode('utf-16-le', 'surrogatepass')
    for i in range(0, len(raw), 2):
        value = ((value ^ (raw[i] | raw[i + 1] << 8)) * 16777619) & 0xffffffff
    return f'{value:08x}'
def population(label):
    if label in ['donor', 'donor-export-refused'] or label.endswith('-restored'):
        return 'donor'
    if label.endswith('-before') or label.endswith('-preserved'):
        return 'prior'
    if label.endswith('-recovery-write'):
        return 'priorAfterWrite'
    if label.endswith('-later-write'):
        return 'donorAfterWrite'
    raise AssertionError(('unknown actual capture label', label))

report_path = RAW / 'report.json'
report_sha = sha(report_path)
report = json.loads(report_path.read_text())
assert report['finishedAt'] and report['outcome'] == 'Fail'
assert report['planned'] == 204 and len(report['runs']) == 146
prior = [{'id': 'prior-state', 'text': {'body': 'n9oldstate'}, 'metadata': {'group': 'prior'}}]
fixtures, models, ledger, counts = {}, {}, [], Counter()
for descriptor in report['runs']:
    path = RAW / descriptor['file']
    assert sha(path) == descriptor['sha256']
    row = json.loads(path.read_text())
    job = descriptor['job']
    assert row['job'] == job and row['outcome'] == row['exercise']['outcome'] == 'Collected'
    key = f"{job['family']}:{job['size']}"
    if key not in fixtures:
        donor = oracle.records(job['family'], job['size'])
        def changed(values):
            return [{'id': values[0]['id'], 'text': {'body': 'n10afterwrite n9red n9blue'}, 'metadata': {'group': 'after'}}, *copy.deepcopy(values[1:])]
        fixtures[key] = {'donor': donor, 'prior': prior, 'donorAfterWrite': changed(donor), 'priorAfterWrite': changed(prior)}
    pins = {}
    def walk(value):
        if isinstance(value, dict):
            if isinstance(value.get('artifact'), str):
                name = value['artifact']
                assert name not in pins and '/' not in name and '\\' not in name
                assert name.endswith(('.snapshot.json', '.state.json'))
                pins[name] = value
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    walk(row)
    captures = []
    for name, meta in pins.items():
        path = RAW / name
        blob = path.read_bytes()
        assert len(blob) == meta['bytes'] and hashlib.sha256(blob).hexdigest() == meta['sha256']
        suffix = '.snapshot.json' if name.endswith('.snapshot.json') else '.state.json'
        rest = name.removeprefix(job['key'] + '-')
        counter, label = rest.split('-', 1)
        assert counter.isdigit() and label.endswith(suffix)
        label = label[:-len(suffix)]
        selected = population(label)
        expected_records = fixtures[key][selected]
        revision = math.ceil(job['size'] / 256) if label in ['donor', 'donor-export-refused'] else 1 if selected == 'prior' else 2 if selected in ['donor', 'priorAfterWrite'] else 3
        value = json.loads(blob)
        if suffix == '.snapshot.json':
            assert set(value) == {'format', 'formatVersion', 'codec', 'body', 'integrity'}
            assert value['format'] == 'raveldex-source' and value['formatVersion'] == 1
            assert value['codec'] == {'id': 'raveldex-json-v1', 'version': 1}
            assert set(value['body']) == {'header', 'payload'}
            assert value['body']['header']['originRevision'] == revision
            assert value['integrity'] == {'algorithm': 'fnv1a32-utf16', 'value': fnv(canonical(value['body']))}
            literal = sorted([{'id': record['id'], 'text': {'body': record['text']['body'] if isinstance(record['text']['body'], list) else [record['text']['body']]}, 'metadata': record.get('metadata', {})} for record in expected_records], key=lambda item: item['id'])
            assert value['body']['payload'] == {'records': literal}, 'complete source values, metadata and value order'
            counts['sourceCaptures'] += 1
            counts['sourceRecordAssertions'] += len(literal)
        else:
            model_key = (key, selected)
            if model_key not in models:
                models[model_key] = oracle.materialize(expected_records)
            assert value['revision'] == revision
            facts = oracle.verify_root(value, models[model_key], job['variant'])
            counts['privateCaptures'] += 1
            counts['privateRecordAssertions'] += facts['records']
            counts['originalOffsetAssertions'] += facts['offsets']
        captures.append({'file': name, 'kind': 'source' if suffix == '.snapshot.json' else 'root', 'label': label, 'population': selected, 'revision': revision, 'bytes': meta['bytes'], 'sha256': meta['sha256']})
    ledger.append({'job': job, 'fixtureKey': key, 'descriptorFile': descriptor['file'], 'descriptorSha256': descriptor['sha256'], 'captures': captures})
    counts['contexts'] += 1
    print('independent captured-data replay', job['index'], dict(counts), flush=True)
assert counts['sourceCaptures'] == 1280 and counts['privateCaptures'] == 970
assert counts['sourceRecordAssertions'] == 1210916
assert counts['privateRecordAssertions'] == 998692 and counts['originalOffsetAssertions'] == 5323456
assert len({x['file'] for group in ledger for x in group['captures']}) == 2250
assert sha(report_path) == report_sha

# The historical online exercise omits the membership model check. Its existing
# independent replay enforces model/completeness/ids/scores; preserve that layer.
base = {'revision': 1, 'model': 'raveldex-bm25-v1', 'completeness': 'complete', 'total': 1, 'hits': [{'id': 'fixture', 'score': 1.0}]}
negative_mutations = {
    'model': lambda value: value.update(model='wrong'),
    'completeness': lambda value: value.update(completeness='partial'),
    'revision': lambda value: value.update(revision=2),
    'total': lambda value: value.update(total=0),
    'id': lambda value: value['hits'][0].update(id='wrong'),
    'score': lambda value: value['hits'][0].update(score=float('nan')),
}
for name, mutate in negative_mutations.items():
    value = copy.deepcopy(base)
    mutate(value)
    try:
        oracle.verify_result(value, [{'id': 'fixture', 'score': 1.0}], revision=1)
    except AssertionError:
        counts['independentMembershipNegatives'] += 1
    else:
        raise AssertionError(('independent membership mutation accepted', name))
data = {'kind': 'rx9006-slice1-independent-capture-input-v1', 'rawDirectory': str(RAW), 'reportSha256': report_sha, 'fixtures': fixtures, 'contexts': ledger}
with gzip.open(HERE / 'capture-input.json.gz', 'wt') as output:
    json.dump(data, output, ensure_ascii=False, separators=(',', ':'))
summary = {'status': 'Pass', 'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'counts': dict(counts), 'captureInputSha256': sha(HERE / 'capture-input.json.gz'), 'sourcePins': {str(path.relative_to(ROOT)): sha(path) for path in [oracle_path, Path(__file__).resolve(), ROOT / 'test/fixtures/relevance/corpus.json', ROOT / 'docs/evidence/RX-9006/overhead-slice1/v1/bench/n10/host-recovery-case.mjs', ROOT / 'docs/evidence/RX-9006/overhead-slice1/v1/bench/n9/bulk-verify.mjs']}, 'originalReport': {'path': str(report_path), 'sha256': report_sha, 'outcome': report['outcome'], 'acceptedPerformanceEvidence': report['acceptedPerformanceEvidence']}, 'scope': 'Saved completed-prefix data and independent literal fixture replay only. No engine calls, probes, canaries, benchmarks or product-performance claim. Missing original contexts remain missing.'}
(HERE / 'independent-capture-replay.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
