#!/usr/bin/env python3
"""Independent streaming retention audit; no extraction, engine, build or Git.

Run only after every archive writer has stopped. Reads all top-level RX-9005
raw inventories, declared tar shards and their actual original collector trees.
Writes retention-audit.json; stdout is the auditor's own compact progress log.
"""
from __future__ import annotations
import datetime
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile
import traceback

ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = ROOT / 'docs/evidence/RX-9005'
OUTPUT = Path(__file__).resolve().parent / 'retention-audit.json'
RAW_BASE = Path('/private/tmp/raveldex-rx9005-20261105').resolve()
SHA = re.compile(r'^[0-9a-f]{64}$')
CHUNK = 1024 * 1024


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest_stream(stream):
    digest = hashlib.sha256()
    count = 0
    while True:
        chunk = stream.read(CHUNK)
        if not chunk:
            break
        digest.update(chunk)
        count += len(chunk)
    return count, digest.hexdigest()


def digest_file(path):
    assert not path.is_symlink() and stat.S_ISREG(path.stat().st_mode), str(path)
    with path.open('rb') as stream:
        return digest_stream(stream)


def safe_name(value):
    assert isinstance(value, str) and value and '\\' not in value, value
    path = PurePosixPath(value)
    assert not path.is_absolute() and all(part not in ('', '.', '..') for part in value.split('/')), value
    assert str(path) == value, value
    return value


def read_json(path):
    with gzip.open(path, 'rt', encoding='utf-8') if path.suffix == '.gz' else path.open(encoding='utf-8') as source:
        return json.load(source)


report = {
    'kind': 'rx9005-independent-complete-retention-audit-v1',
    'status': 'Running', 'startedAt': now(),
    'scope': 'Every declared actual raw file in all eleven retained sets, all tar shards, compressed/archive and member hashes, and all existing original collector directories. No reconstruction-only sample or inferred file equivalence.',
    'method': 'Read-only streaming SHA-256 and exact safe unique tar-member paths/sizes; no extraction, source/runtime modification, engine/test/build/collector/Git/network execution.',
    'sets': [], 'active': None,
}
try:
    inventory_paths = sorted(EVIDENCE.glob('*-inventory.json*'))
    assert len(inventory_paths) == 11, [p.name for p in inventory_paths]
    all_archives = set()
    member_count = byte_count = archive_bytes = 0
    raw_files = raw_bytes = 0
    for inventory_path in inventory_paths:
        report['active'] = {'inventory': inventory_path.name}
        inventory_size, inventory_sha = digest_file(inventory_path)
        inventory = read_json(inventory_path)
        assert inventory['kind'] in ('rx9005-retained-actual-files-v1', 'rx9005-retained-actual-shards-v1')
        expected = {}
        for row in inventory['files']:
            name = safe_name(row['path'])
            assert name not in expected, ('duplicate inventory member', name)
            assert isinstance(row['bytes'], int) and row['bytes'] >= 0
            assert SHA.fullmatch(row['sha256'])
            expected[name] = row
        assert len(expected) == inventory['fileCount']
        assert sum(row['bytes'] for row in expected.values()) == inventory['uncompressedBytes']
        if inventory['kind'] == 'rx9005-retained-actual-files-v1':
            archives = [{'path': inventory['archive'], 'bytes': inventory['archiveBytes'], 'sha256': inventory['archiveSha256']}]
            assert all('archive' not in row for row in expected.values())
        else:
            archives = inventory['archives']
            descriptor_name = inventory_path.name.removesuffix('-inventory.json.gz') + '-retention.json'
            descriptor = EVIDENCE / descriptor_name
            assert descriptor.is_file(), descriptor
            assert read_json(descriptor) == {key: value for key, value in inventory.items() if key != 'files'}, ('descriptor differs', descriptor.name)
        archive_names = [safe_name(row['path']) for row in archives]
        assert len(archive_names) == len(set(archive_names))
        assert not all_archives.intersection(archive_names), 'one raw archive belongs to multiple inventories'
        all_archives.update(archive_names)
        if len(archives) > 1 or inventory['kind'] == 'rx9005-retained-actual-shards-v1':
            assert all(row['archive'] in archive_names for row in expected.values())
        seen = set()
        observed_bytes = 0
        archive_results = []
        for archive in archives:
            archive_path = EVIDENCE / archive['path']
            report['active'] = {'inventory': inventory_path.name, 'archive': archive['path']}
            actual_size, actual_sha = digest_file(archive_path)
            assert actual_size == archive['bytes'] and actual_sha == archive['sha256'], ('archive identity', archive_path.name)
            initial_stat = (archive_path.stat().st_size, archive_path.stat().st_mtime_ns)
            shard_members = shard_bytes = 0
            # Streaming mode never extracts an untrusted pathname or loads a whole tar.
            with tarfile.open(archive_path, mode='r|gz') as source:
                for member in source:
                    name = safe_name(member.name)
                    report['active'] = {'inventory': inventory_path.name, 'archive': archive['path'], 'member': name}
                    assert member.isfile() and not member.issym() and not member.islnk(), ('non-regular tar member', name, member.type)
                    assert name not in seen, ('duplicate tar member across shards', name)
                    assert name in expected, ('extra tar member', name)
                    row = expected[name]
                    if 'archive' in row:
                        assert row['archive'] == archive['path'], ('wrong shard', name)
                    assert member.size == row['bytes'], ('tar header size', name)
                    stream = source.extractfile(member)
                    assert stream is not None
                    count, digest = digest_stream(stream)
                    assert count == row['bytes'] and digest == row['sha256'], ('tar member bytes/hash', name)
                    seen.add(name)
                    shard_members += 1
                    shard_bytes += count
            assert initial_stat == (archive_path.stat().st_size, archive_path.stat().st_mtime_ns), ('archive changed during audit', archive_path.name)
            archive_results.append({'path': archive['path'], 'bytes': actual_size, 'sha256': actual_sha, 'members': shard_members, 'uncompressedBytes': shard_bytes})
            observed_bytes += shard_bytes
            archive_bytes += actual_size
        assert seen == set(expected), ('missing archive members', sorted(set(expected) - seen)[:10])
        assert observed_bytes == inventory['uncompressedBytes']
        original = Path(inventory['originalDirectory'])
        assert original.is_absolute() and original.resolve().is_relative_to(RAW_BASE), ('raw directory outside declared task tree', str(original))
        assert original.is_dir(), ('original raw directory unavailable', str(original))
        actual_paths = set()
        for path in original.rglob('*'):
            assert not path.is_symlink(), ('raw symlink', str(path))
            if path.is_dir():
                continue
            assert stat.S_ISREG(path.stat().st_mode), ('raw nonregular file', str(path))
            name = safe_name(path.relative_to(original).as_posix())
            assert name not in actual_paths
            actual_paths.add(name)
        assert actual_paths == set(expected), ('original directory path mismatch', {'missing': sorted(set(expected)-actual_paths)[:10], 'extra': sorted(actual_paths-set(expected))[:10]})
        for name, row in expected.items():
            report['active'] = {'inventory': inventory_path.name, 'originalFile': name}
            count, digest = digest_file(original / name)
            assert count == row['bytes'] and digest == row['sha256'], ('original raw member identity', name)
        assert digest_file(inventory_path) == (inventory_size, inventory_sha), ('inventory changed during audit', inventory_path.name)
        result = {'inventory': inventory_path.name, 'inventoryBytes': inventory_size, 'inventorySha256': inventory_sha,
                  'kind': inventory['kind'], 'archives': archive_results, 'fileCount': len(seen), 'uncompressedBytes': observed_bytes,
                  'originalDirectory': str(original), 'originalFilesVerified': len(actual_paths), 'originalBytesVerified': observed_bytes,
                  'status': 'Pass'}
        report['sets'].append(result)
        member_count += len(seen)
        byte_count += observed_bytes
        raw_files += len(actual_paths)
        raw_bytes += observed_bytes
        print(json.dumps({'inventory': inventory_path.name, 'status': 'Pass', 'archives': len(archives), 'members': len(seen), 'bytes': observed_bytes}), flush=True)
    actual_archives = {p.name for p in EVIDENCE.glob('*-raw*.tar.gz')}
    assert actual_archives == all_archives, ('unreferenced or missing raw archives', {'extra': sorted(actual_archives-all_archives), 'missing': sorted(all_archives-actual_archives)})
    report.update({'status': 'Pass', 'active': None, 'inventorySets': len(inventory_paths), 'archives': len(all_archives),
                   'archiveBytes': archive_bytes, 'memberFiles': member_count, 'uncompressedBytes': byte_count,
                   'originalRawFilesVerified': raw_files, 'originalRawBytesVerified': raw_bytes,
                   'missingMembers': [], 'extraMembers': [], 'duplicateMembers': [], 'nonRegularMembers': [],
                   'unreferencedRawArchives': [], 'sourceDirectoriesAllAvailable': True,
                   'limitations': ['Checks exact retention identity and safe regular-file membership, not semantic correctness, performance, engine heap or a new test/collector run.', 'Original raw trees and retained archives are read in place; no extraction or source mutation occurs.']})
except Exception as error:
    report['status'] = 'Fail'
    report['failure'] = {'type': type(error).__name__, 'message': str(error), 'stack': traceback.format_exc()}
    raise
finally:
    report['completedAt'] = now()
    OUTPUT.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: report[key] for key in ['status','inventorySets','archives','memberFiles','uncompressedBytes','archiveBytes','originalRawFilesVerified'] if key in report}), flush=True)
