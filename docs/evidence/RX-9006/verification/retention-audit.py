#!/usr/bin/env python3
"""Independent RX-9006 retained-file audit, after archive creation has finished.

No creator imports, extraction, engine calls, builds or tests. Stream every tar
regular member, verify its path/size/content against the recorded inventory and
independently enumerated original source tree, and bind all index/archive bytes.
The 40 MiB limit applies to summed original member payloads, not gzip bytes or
tar headers/padding. A larger payload shard is allowed only for one explicitly
reported oversized original file. Empty failed preparations remain audited sets.
This proves retained file equivalence only, not measurement/semantic acceptance,
filesystem metadata preservation, retained/peak heap, or recovery completeness.
"""
from __future__ import annotations

import datetime
import gzip
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import sys
import tarfile
import traceback

HERE = pathlib.Path(__file__).resolve().parent
TASK = HERE.parent
PAYLOAD_LIMIT = 40 * 1024 * 1024
REQUIRED_LABELS = {
    "browser-prepared", "browser-prepared-02", "browser-prepared-03",
    "recovery-prepared", "recovery-prepared-02", "recovery-prepared-03", "recovery-prepared-04",
    "consumers", "browser-probe-01", "browser-full-01", "recovery-probe-01", "recovery-probe-02",
    "recovery-full-01", "queue-diagnostic-01", "transport-diagnostic-01", "recovery-prefix-fresh",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest_file(path):
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def valid_path(name):
    require(isinstance(name, str) and name and "\x00" not in name and "\\" not in name,
            "unsafe/empty archive or index member path: " + repr(name))
    require(not pathlib.PurePosixPath(name).is_absolute(), "absolute member path: " + name)
    require(all(piece not in ("", ".", "..") for piece in name.split("/")), "traversal/noncanonical member path: " + name)
    require(pathlib.PurePosixPath(name).as_posix() == name, "noncanonical member path: " + name)
    return name


def regular_file(path):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not path.is_symlink(), "not a safe regular file: " + str(path))
    return info


def bind(path, bindings, purpose):
    path = pathlib.Path(path)
    info = regular_file(path)
    key = str(path.resolve())
    observed = {"path": key, "bytes": info.st_size, "sha256": digest_file(path), "purposes": [purpose]}
    if key in bindings:
        existing = bindings[key]
        require((existing["bytes"], existing["sha256"]) == (observed["bytes"], observed["sha256"]),
                "bound input changed during audit: " + key)
        if purpose not in existing["purposes"]:
            existing["purposes"].append(purpose)
        return existing
    bindings[key] = observed
    return observed


def inventory_digest(rows):
    encoded = json.dumps(sorted(rows, key=lambda row: row["path"]), sort_keys=True,
                         separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(encoded).hexdigest()


def source_tree(source):
    require(source.exists() and source.is_dir() and not source.is_symlink(), "original source directory missing/unsafe: " + str(source))
    rows, directories = {}, []
    for current, dirs, files in os.walk(source, followlinks=False):
        current = pathlib.Path(current)
        for name in dirs:
            path = current / name
            require(stat.S_ISDIR(path.lstat().st_mode) and not path.is_symlink(), "linked/special source directory: " + str(path))
            directories.append(str(path.relative_to(source)))
        for name in files:
            path = current / name
            info = regular_file(path)
            rel = valid_path(path.relative_to(source).as_posix())
            require(rel not in rows, "duplicate independently enumerated source path: " + rel)
            rows[rel] = {"path": rel, "bytes": info.st_size, "sha256": digest_file(path)}
    return rows, sorted(directories)


def audit_set(item, execution, bindings, emit):
    label, source = item["label"], pathlib.Path(item["source"])
    require(re.fullmatch(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*", label), "unsafe retention label")
    require(source.is_absolute() and source.resolve() == source, "source must be its actual absolute directory")
    summary_path, index_path = TASK / (label + "-retention.json"), TASK / (label + "-inventory.json.gz")
    summary_binding = bind(summary_path, bindings, "retention summary " + label)
    index_binding = bind(index_path, bindings, "compressed detailed inventory " + label)
    summary = json.loads(summary_path.read_text())
    with gzip.open(index_path, "rb") as handle:
        index_bytes = handle.read()  # Reading through EOF also validates gzip CRC.
    index = json.loads(index_bytes)
    require(index.get("kind") == "rx9006-retained-actual-shards-v1", "inventory kind: " + label)
    require(summary == {key: value for key, value in index.items() if key != "files"}, "summary/detail-index mismatch: " + label)
    require(index.get("originalDirectory") == str(source), "wrong original source directory: " + label)
    execution_log = TASK / "identity" / (label + "-retention-output.txt")
    log_binding = bind(execution_log, bindings, "actual archive-creation log " + label)
    require(log_binding["sha256"] == execution["logSha256"], "creation log SHA mismatch: " + label)
    require(json.loads(execution_log.read_text()) == summary, "actual creation log and summary differ: " + label)
    original, original_dirs = source_tree(source)
    files, archives = index.get("files"), index.get("archives")
    require(isinstance(files, list) and isinstance(archives, list), "inventory arrays required: " + label)
    indexed, archive_defs = {}, {}
    for number, archive in enumerate(archives, 1):
        expected_name = label + "-raw-" + str(number).zfill(3) + ".tar.gz"
        require(archive.get("path") == expected_name and expected_name not in archive_defs, "missing/duplicate/noncanonical archive sequence: " + label)
        require(type(archive.get("bytes")) is int and archive["bytes"] > 0, "archive byte count: " + label)
        require(isinstance(archive.get("sha256"), str) and re.fullmatch(r"[0-9a-f]{64}", archive["sha256"]), "archive SHA declaration: " + label)
        archive_defs[expected_name] = archive
    for row in files:
        name = valid_path(row.get("path"))
        require(name not in indexed, "duplicate indexed member: " + label + "/" + name)
        require(type(row.get("bytes")) is int and row["bytes"] >= 0, "index original byte count")
        require(isinstance(row.get("sha256"), str) and re.fullmatch(r"[0-9a-f]{64}", row["sha256"]), "index original SHA declaration")
        require(row.get("archive") in archive_defs, "indexed member references missing archive: " + name)
        indexed[name] = row
    require(set(indexed) == set(original), "original source/index file sets differ: " + label)
    for name, actual in original.items():
        require((indexed[name]["bytes"], indexed[name]["sha256"]) == (actual["bytes"], actual["sha256"]),
                "original source/index bytes or SHA differ: " + label + "/" + name)
    total_payload = sum(row["bytes"] for row in original.values())
    require(index.get("fileCount") == len(original) and index.get("uncompressedBytes") == total_payload,
            "index totals disagree with original source tree: " + label)
    if not original:
        require(files == [] and archives == [], "empty failed preparation must have an explicit zero-file inventory and no fabricated archive")
    else:
        require(archives, "nonempty original tree has no retained archive")
    observed, archive_results, oversized = {}, [], []
    for name, declared in archive_defs.items():
        path = TASK / name
        bound = bind(path, bindings, "whole retained archive " + label)
        require((bound["bytes"], bound["sha256"]) == (declared["bytes"], declared["sha256"]), "whole archive identity mismatch: " + name)
        member_rows, payload_bytes, last_data_end = [], 0, 0
        with tarfile.open(path, mode="r:gz") as archive:
            for member in archive:
                member_name = valid_path(member.name)
                require(member.type in (tarfile.REGTYPE, tarfile.AREGTYPE) and member.isreg(), "link/directory/special tar member: " + name + ":" + member_name)
                require(not member.linkname and not getattr(member, "sparse", None) and
                        not any(key.startswith("GNU.sparse") for key in member.pax_headers), "linked/sparse tar member: " + member_name)
                require(member_name not in observed, "duplicate member across archive shards: " + label + "/" + member_name)
                require(member_name in indexed and indexed[member_name]["archive"] == name, "extra/wrong-shard member: " + member_name)
                expected = indexed[member_name]
                require(member.size == expected["bytes"], "tar member size differs: " + member_name)
                stream = archive.extractfile(member)
                require(stream is not None, "regular member stream unavailable")
                digest, actual_bytes = hashlib.sha256(), 0
                with stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(chunk)
                        actual_bytes += len(chunk)
                require(actual_bytes == expected["bytes"] and digest.hexdigest() == expected["sha256"], "actual tar member payload differs: " + label + "/" + member_name)
                actual = {"path": member_name, "bytes": actual_bytes, "sha256": digest.hexdigest()}
                require(actual == original[member_name], "actual source/tar regular file differs: " + member_name)
                observed[member_name] = actual
                member_rows.append(actual)
                payload_bytes += actual_bytes
                last_data_end = max(last_data_end, member.offset_data + ((member.size + 511) // 512) * 512)
            # Reject hidden appended headers/data after logical EOF. Read the
            # entire gzip tail so its checksum is validated, allowing only zero
            # tar EOF/record padding, never uninspected trailing file headers.
            archive.fileobj.seek(last_data_end)
            trailing_zero_bytes = 0
            for chunk in iter(lambda: archive.fileobj.read(1024 * 1024), b""):
                require(not any(chunk), "nonzero hidden trailing tar data: " + name)
                trailing_zero_bytes += len(chunk)
        require(member_rows, "empty archive shard is not a retained source file")
        if payload_bytes > PAYLOAD_LIMIT:
            require(len(member_rows) == 1 and member_rows[0]["bytes"] > PAYLOAD_LIMIT,
                    "archive exceeds 40 MiB payload target without one oversized original file: " + name)
            oversized.append({"archive": name, "member": member_rows[0], "archiveCompressedBytes": bound["bytes"]})
        archive_results.append({"path": name, "binding": bound, "regularMembers": len(member_rows),
                                "memberPayloadBytes": payload_bytes, "tarContainerUncompressedBytes": last_data_end + trailing_zero_bytes,
                                "validatedTrailingZeroBytes": trailing_zero_bytes,
                                "oversizedSingleOriginalFile": payload_bytes > PAYLOAD_LIMIT,
                                "memberInventorySha256": inventory_digest(member_rows)})
    require(set(observed) == set(original), "missing/extra retained regular members: " + label)
    require(inventory_digest(list(observed.values())) == inventory_digest(list(original.values())), "full original/retained inventory mismatch: " + label)
    # Re-enumerate/re-hash originals after every archive has been consumed. This
    # catches source additions/removals or edits during the independent audit.
    after, after_dirs = source_tree(source)
    require(after == original and after_dirs == original_dirs, "original source tree changed during audit: " + label)
    emit(label + ": " + str(len(original)) + " actual files, " + str(len(archives)) + " archives, " + str(total_payload) + " payload bytes verified")
    return {"label": label, "originalDirectory": str(source), "status": "Pass",
            "sourceFiles": len(original), "sourcePayloadBytes": total_payload,
            "emptyOriginalDirectory": not original, "originalSubdirectories": len(original_dirs),
            "originalInventorySha256": inventory_digest(list(original.values())),
            "indexBinding": index_binding, "decodedIndexBytes": len(index_bytes),
            "decodedIndexSha256": hashlib.sha256(index_bytes).hexdigest(), "summaryBinding": summary_binding,
            "creationLogBinding": log_binding, "archives": archive_results, "oversizedSingleFiles": oversized,
            "fileEquivalence": "Every independently enumerated original file equals exactly one safe actual tar regular member and its indexed archive/path/bytes/SHA; no extraction performed.",
            "directoryScope": "Original directory existence and subdirectory list were observed; tar retention covers files, not directory/permission/xattr metadata."}


def audit(emit):
    bindings = {}
    plan_path, execution_path = TASK / "identity/retention-plan.json", TASK / "identity/retention-execution.json"
    plan_binding = bind(plan_path, bindings, "actual complete retention plan")
    execution_binding = bind(execution_path, bindings, "actual completed archive-creation execution")
    plan, execution = json.loads(plan_path.read_text()), json.loads(execution_path.read_text())
    require(execution.get("status") == "Pass", "archive creation is not complete; do not audit while it is active")
    sources, executions = plan.get("sources"), execution.get("results")
    require(isinstance(sources, list) and isinstance(executions, list), "plan/execution arrays")
    require(len(sources) == len(executions) == execution.get("sources") == 16, "all 16 preparations/probes/full/partial/diagnostic sets are required")
    require({item["label"] for item in sources} == REQUIRED_LABELS, "required failed/empty/probe/partial/preparation labels missing or extra")
    require(len({item["label"] for item in sources}) == len(sources), "duplicate plan label")
    require(len({item["source"] for item in sources}) == len(sources), "duplicate original source tree")
    require([(item["label"], item["source"]) for item in executions] == [(item["label"], item["source"]) for item in sources], "execution omitted/reordered/changed a source")
    for item in executions:
        require(item.get("exitCode") == 0 and item.get("startedAt") and item.get("finishedAt"), "failed/incomplete archive creation: " + item["label"])
    # Independently check that no additional task-owned experiment directory was
    # silently excluded from the 16-source plan; only its explicit cache/build
    # exclusions are allowed, and are disclosed rather than called retained.
    roots = {pathlib.Path(item["source"]).parent for item in sources}
    require(len(roots) == 1, "expected one original task temporary parent")
    temporary_parent = next(iter(roots))
    actual_directories = {path.name for path in temporary_parent.iterdir() if path.is_dir()}
    planned_directories = {pathlib.Path(item["source"]).name for item in sources}
    exclusions = set(plan.get("exclusions", {}))
    require(actual_directories - planned_directories - exclusions == set(), "unplanned original task directories: " + repr(sorted(actual_directories - planned_directories - exclusions)))
    results = [audit_set(item, executions[index], bindings, emit) for index, item in enumerate(sources)]
    archive_names = [archive["path"] for result in results for archive in result["archives"]]
    require(len(archive_names) == len(set(archive_names)), "archive listed in more than one retained set")
    actual_archive_names = {path.name for path in TASK.glob("*.tar.gz")}
    require(actual_archive_names == set(archive_names), "missing/unreferenced extra root-level archives: " + repr(sorted(actual_archive_names ^ set(archive_names))))
    for entry in list(bindings.values()):
        actual = bind(pathlib.Path(entry["path"]), bindings, "final stable-input recheck")
        require(actual["sha256"] == entry["sha256"] and actual["bytes"] == entry["bytes"], "audit input changed")
    all_archives = [archive for result in results for archive in result["archives"]]
    largest_compressed = max(all_archives, key=lambda value: value["binding"]["bytes"])
    largest_payload = max(all_archives, key=lambda value: value["memberPayloadBytes"])
    return {"kind": "rx9006-independent-actual-retention-audit-v1", "status": "Pass",
            "completedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "planBinding": plan_binding, "executionBinding": execution_binding,
            "auditorSource": {"path": str(pathlib.Path(__file__).resolve()), "sha256": digest_file(pathlib.Path(__file__))},
            "totals": {"retainedSets": len(results), "emptyOriginalSets": sum(result["emptyOriginalDirectory"] for result in results),
                       "archives": len(all_archives), "regularFiles": sum(result["sourceFiles"] for result in results),
                       "originalPayloadBytes": sum(result["sourcePayloadBytes"] for result in results),
                       "compressedArchiveBytes": sum(archive["binding"]["bytes"] for archive in all_archives),
                       "tarContainerUncompressedBytes": sum(archive["tarContainerUncompressedBytes"] for archive in all_archives)},
            "payloadTargetBytes": PAYLOAD_LIMIT, "largestCompressedArchive": largest_compressed,
            "largestMemberPayloadArchive": largest_payload,
            "oversizedSingleOriginalFiles": [item for result in results for item in result["oversizedSingleFiles"]],
            "sets": results, "bindings": sorted(bindings.values(), key=lambda entry: entry["path"]),
            "disclosedPlanExclusions": plan.get("exclusions", {}),
            "indexScope": "Index SHA/bytes and decoded JSON SHA/bytes measured independently, summary/log cross-checked, all bound inputs rehashed after the member audit; no pre-existing index SHA is invented.",
            "scope": "Independent source/index/archive regular-file retention equivalence only; every failed/probe/partial/preparation and empty failed set included. No semantic/performance/full-matrix acceptance or directory metadata/heap claim."}


def main():
    report_path, log_path = HERE / "retention-audit.json", HERE / "retention-audit.txt"
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    for path in (report_path, log_path):
        if path.exists():
            previous = path.with_name(path.stem + "-previous-" + stamp + path.suffix)
            require(not previous.exists(), "previous audit attempt destination already exists")
            shutil.copyfile(path, previous)
            path.unlink()
    with log_path.open("x") as log:
        def emit(message):
            print(message, flush=True)
            log.write(message + "\n")
            log.flush()
        try:
            result = audit(emit)
            report_path.write_text(json.dumps(result, indent=2) + "\n")
            emit(json.dumps({"status": result["status"], "totals": result["totals"],
                             "largestCompressedArchiveBytes": result["largestCompressedArchive"]["binding"]["bytes"],
                             "largestPayloadArchiveBytes": result["largestMemberPayloadArchive"]["memberPayloadBytes"],
                             "oversizedSingleFiles": len(result["oversizedSingleOriginalFiles"])}, indent=2))
            return 0
        except Exception as error:
            result = {"kind": "rx9006-independent-actual-retention-audit-v1", "status": "Fail",
                      "completedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                      "error": str(error), "traceback": traceback.format_exc(),
                      "auditorSourceSha256": digest_file(pathlib.Path(__file__))}
            report_path.write_text(json.dumps(result, indent=2) + "\n")
            emit(result["traceback"])
            return 1


if __name__ == "__main__":
    sys.exit(main())
