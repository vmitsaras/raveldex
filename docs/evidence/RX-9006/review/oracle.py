"""Independent literal-source/state/query oracle. No engine/JS-helper imports."""
from pathlib import Path
from collections import Counter
import hashlib, json, math, re, unicodedata

ROOT = Path(__file__).resolve().parents[4]
CORPUS_PATH = ROOT / 'test/fixtures/relevance/corpus.json'
CORPUS_SHA256 = 'd750399c6987c9dd6b6d2dd043604dd03bde0b36a71680daec77c8024f9949db'

def units(text):
    return len(text.encode('utf-16-le', 'surrogatepass')) // 2

def scan(text):
    found = []
    word = ''
    start = 0
    def emit(end):
        if word:
            found.append({'term': unicodedata.normalize('NFKC', word).lower(),
                          'start': units(text[:start]), 'end': units(text[:end]),
                          'position': len(found), 'positionLength': 1})
    for index, char in enumerate(text):
        category = unicodedata.category(char)[0]
        if category in 'LN' or word and category == 'M':
            if not word:
                start = index
            word += char
        elif word:
            emit(index)
            word = ''
    emit(len(text))
    return found

def records(family, size):
    raw_corpus = CORPUS_PATH.read_bytes()
    assert hashlib.sha256(raw_corpus).hexdigest() == CORPUS_SHA256
    seeds = json.loads(raw_corpus)['records']
    result = []
    for index in range(size):
        seed = seeds[index % len(seeds)]
        original = seed['text']['title'] + '\n' + seed['text']['body']
        if units(original) > 512:
            head = original.encode('utf-16-le', 'surrogatepass')[:1024].decode('utf-16-le', 'surrogatepass')
            boundary = re.search(r'\s+\S*$', head)
            assert boundary and boundary.start() > 0
            original = head[:boundary.start()]
        body = original
        if family != 'real-docs':
            key = f'n9key{index:06d}'
            controls = f'n9common {"n9rare" if index % 997 == 7 else ""} {"n9left" if index % 3 == 0 else ""} {key}a {key}b {key}c'
            phrase = 'n9red n9blue' if index % 3 == 0 else 'n9red n9gap n9blue'
            body = original + '\nCatalog ' + controls + ' ' + phrase if family == 'high-cardinality' else (
                [controls + ' n9echo n9echo n9echo n9echo', 'n9red', 'n9blue'] if index % 3 == 2
                else controls + ' n9echo n9echo n9echo n9echo ' + phrase)
        result.append({'id': f'{family}:{index:05d}', 'text': {'body': body}, 'metadata': {'group': f'g{index % 5}'}})
    return result

def materialize(input_records):
    docs, sources, positions, terms = {}, {}, {}, {}
    totals = Counter()
    for record in input_records:
        body = record['text']['body']
        values = body if isinstance(body, list) else [body]
        by_value = [scan(value) for value in values]
        frequency = Counter(item['term'] for value in by_value for item in value)
        length = sum(frequency.values())
        code_units = sum(units(value) for value in values)
        doc = {'id': record['id'], 'metadata': record.get('metadata', {}), 'textCodeUnits': code_units,
               'fields': {'body': {'length': length, 'terms': dict(frequency)}} if length else {}}
        docs[record['id']] = doc
        sources[record['id']] = {'text': {'body': values}, 'retainedEntries': 2 + len(values), 'textCodeUnits': code_units}
        position_values = []
        retained, occurrence_count, term_entries, term_code_units = 2 + len(values), 0, 0, 0
        for value in by_value:
            mapped = {}
            for item in value:
                term = item['term']
                if term not in mapped:
                    mapped[term] = []
                    retained += 1
                    term_entries += 1
                    term_code_units += units(term)
                mapped[term].append({key: item[key] for key in ['position', 'positionLength', 'start', 'end']})
                retained += 3
                occurrence_count += 1
            position_values.append({'tokenCount': len(value), 'terms': mapped})
        positions[record['id']] = {'positions': {'body': position_values}, 'retainedEntries': retained,
                                   'occurrenceCount': occurrence_count, 'offsetCount': occurrence_count,
                                   'termEntries': term_entries, 'termCodeUnits': term_code_units}
        for term, tf in frequency.items():
            entry = terms.setdefault(term, {'df': 0, 'frequency': 0, 'postings': {}})
            entry['df'] += 1
            entry['frequency'] += tf
            entry['postings'][record['id']] = tf
        totals.update({'tokens': length, 'textCodeUnits': code_units, 'postingEntries': len(frequency),
                       'fieldDocuments': int(length > 0), 'sourceEntries': 2 + len(values),
                       'positionEntries': retained, 'occurrences': occurrence_count,
                       'termEntries': term_entries, 'termCodeUnits': term_code_units, 'sourceValues': len(values)})
    return {'documents': docs, 'sources': sources, 'positions': positions, 'terms': terms, 'totals': totals, 'records': input_records}

def verify_root(root, model, variant):
    if isinstance(root, str):
        root = json.loads(root)
    if 'canonical' in root:
        root = json.loads(root['canonical'])
    totals, docs, terms = model['totals'], model['documents'], model['terms']
    assert root['documents'] == docs, 'complete reverse/source-derived TF or metadata'
    assert root['counts'] == {'documents': len(docs), 'tokens': totals['tokens'], 'textCodeUnits': totals['textCodeUnits'],
                              'dictionaryEntries': len(terms), 'postingEntries': totals['postingEntries']}, 'core counters'
    assert set(root['fields']) == {'body'}
    field = root['fields']['body']
    assert field['documents'] == totals['fieldDocuments'] and field['length'] == totals['tokens']
    assert field['terms'] == terms, 'complete DF/frequency/postings'
    if 'order' in field:
        assert field['order'] == sorted(terms), 'ordered dictionary'
    source = root['participants']['source']
    assert source['kind'] == 'raveldex-source-v1' and source['revision'] == 0
    assert source['fields'] == ['body']
    assert source['records'] == model['sources'], 'complete literal source'
    assert source['retainedEntries'] == totals['sourceEntries'] and source['textCodeUnits'] == totals['textCodeUnits']
    assert set(root['participants']) == ({'source'} if variant == 'source' else {'source', 'positions'})
    if variant == 'positions-offsets':
        position = root['participants']['positions']
        assert position['kind'] == 'raveldex-positions-v1' and position['revision'] == 0
        assert position['fields'] == ['body'] and position['offsetFields'] == ['body']
        assert position['records'] == model['positions'], 'every value-local position and original UTF-16 offset'
        for key, name in [('retainedEntries', 'positionEntries'), ('occurrenceCount', 'occurrences'),
                          ('offsetCount', 'occurrences'), ('termEntries', 'termEntries'), ('termCodeUnits', 'termCodeUnits')]:
            assert position[key] == totals[name], ('position counter', key)
    return {'records': len(docs), 'terms': len(terms), 'postings': totals['postingEntries'],
            'sourceValues': totals['sourceValues'], 'offsets': totals['occurrences'] if variant == 'positions-offsets' else 0}

def expected_hits(model, query):
    docs, terms, totals = model['documents'], model['terms'], model['totals']
    N, length_sum = totals['fieldDocuments'], totals['tokens']
    def bm(doc, term):
        field = doc['fields'].get('body', {'terms': {}, 'length': 0})
        tf = field['terms'].get(term, 0)
        if not tf:
            return 0
        df = terms[term]['df']
        return math.log(1 + (N - df + .5) / (df + .5)) * (tf * 2.2 / (tf + 1.2 * (.25 + .75 * field['length'] / (length_sum / N))))
    def evaluate(node, doc, record):
        field = doc['fields'].get('body', {'terms': {}})
        if isinstance(node, str):
            words = [item['term'] for item in scan(node)]
            assert len(words) == 1, 'selected text oracle accepts only declared single-term queries'
            present = any(word in field['terms'] for word in words)
            return present, sum(bm(doc, word) for word in sorted(set(words)))
        kind = node['kind']
        if kind == 'all':
            return True, 0
        if kind == 'text':
            return evaluate(node['text'], doc, record)
        if kind == 'group':
            candidates = set()
            for alternative in node['variants']:
                word = alternative['text']
                candidates.update(term for term in field['terms'] if term.startswith(word)) if alternative.get('match') == 'prefix' else candidates.add(word)
            selected = [term for term in candidates if term in field['terms']]
            return bool(selected), max((bm(doc, term) for term in selected), default=0)
        if kind == 'extension' and node['capability'] == 'phrases':
            phrase = [item['term'] for item in scan(node['payload']['text'])]
            body = record['text']['body']
            values = body if isinstance(body, list) else [body]
            token_values = [[item['term'] for item in scan(value)] for value in values]
            matched = any(any(tokens[index:index + len(phrase)] == phrase for index in range(len(tokens))) for tokens in token_values)
            return matched, sum(bm(doc, term) for term in sorted(set(phrase)))
        raise AssertionError(('unsupported independently replayed query', node))
    result = []
    for record in model['records']:
        doc = docs[record['id']]
        matched, score = evaluate(query, doc, record)
        if matched:
            result.append({'id': record['id'], 'score': score})
    return sorted(result, key=lambda item: (-item['score'], item['id']))

def close(actual, expected):
    assert math.isfinite(actual) and math.isfinite(expected)
    assert abs(actual - expected) <= max(1e-12, abs(expected) * 1e-12), (actual, expected)

def verify_result(result, hits, revision=None, offset=0, limit=20):
    assert result['model'] == 'raveldex-bm25-v1' and result['completeness'] == 'complete'
    if revision is not None:
        assert result['revision'] == revision
    assert result['total'] == len(hits)
    wanted = hits[offset:offset + limit]
    assert [hit['id'] for hit in result['hits']] == [hit['id'] for hit in wanted]
    for actual, expected in zip(result['hits'], wanted):
        close(actual['score'], expected['score'])
    return len(wanted)
