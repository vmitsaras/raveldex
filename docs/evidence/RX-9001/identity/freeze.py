#!/usr/bin/env python3
"""Read-only source/archive identity capture; optional offline tarball consumers.

No build, test, benchmark, registry request, Git mutation or publication occurs.
Output files and optional fresh consumer directories are the only writes.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import platform
import re
import subprocess
import tarfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[4]
ROLES = {
    "preN9": ("docs/evidence/RX-8001/head-919c9ed/core.tar.gz",
              "3f4f31eb03951f13366256dd019710f0bd5c58b29d7ae687d8a96f0ea5ecec11", "919c9ed",
              "Original exact committed-head baseline archive; original source record is RX-8001/head-919c9ed/source.json."),
    "acceptedN9": ("docs/evidence/RX-8008/verification/closing-core.tar.gz",
                   "1d7dab63dbbd9bee7dd67394dd6893c227711caad471d448a02e704c91225fbe", "6d00200",
                   "Archive was produced during the accepted RX-8008 worktree. This is a later commit containing the accepted runtime, not a claim the original archive was built from a clean commit."),
    "reviewedCurrent": ("docs/evidence/RX-8011/verification/closing-core.tar.gz",
                        "45747067b227db1f2238381241997e9ea3dfb687dcb1daa91196927be6494f3b", "5b40646",
                        "Reviewed closing archive; post-N9 remote artifact payload equality was independently checked. The commit identifies the reviewed runtime, not a claim of identical gzip bytes."),
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def command(args, cwd=ROOT, timeout=30):
    return subprocess.check_output(args, cwd=cwd, timeout=timeout, stderr=subprocess.PIPE)


def git(*args) -> str:
    return command(["git", *args]).decode().strip()


def optional_command(args):
    try:
        return {"status": "Observed", "value": command(args).decode().strip()}
    except (OSError, subprocess.SubprocessError) as error:
        return {"status": "Unavailable", "reason": str(error).splitlines()[0]}


def executable_identity(path):
    original = Path(path)
    try:
        actual = original.resolve(strict=True)
        return {"status": "Observed", "path": str(original), "realPath": str(actual),
                "bytes": actual.stat().st_size, "sha256": sha(actual.read_bytes()),
                "scope": "Executed CLI entrypoint file only; application/framework resources are not inventoried."}
    except OSError as error:
        return {"status": "Unavailable", "path": str(original), "reason": str(error).splitlines()[0]}


def environment():
    node = json.loads(command(["node", "-e", "const os=require('node:os');process.stdout.write(JSON.stringify({node:process.version,execPath:process.execPath,versions:process.versions,platform:process.platform,arch:process.arch,hardware:{cpuModels:[...new Set(os.cpus().map(x=>x.model))],logicalCpuCount:os.cpus().length,totalMemoryBytes:os.totalmem()}}))"]))
    node["executable"] = executable_identity(node["execPath"])
    browsers = {}
    chrome = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    browsers["chrome"] = {"path": str(chrome), **optional_command([str(chrome), "--version"]), "executable": executable_identity(chrome)}
    try:
        executable = command(["node", "--input-type=module", "-e", "import {chromium} from 'playwright-core';process.stdout.write(chromium.executablePath())"]).decode()
        browsers["chromium"] = {"path": executable, **optional_command([executable, "--version"]), "executable": executable_identity(executable)}
    except (OSError, subprocess.SubprocessError) as error:
        browsers["chromium"] = {"status": "Unavailable", "reason": str(error).splitlines()[0]}
    uname = platform.uname()._asdict()
    return {"node": node, "npm": command(["npm", "--version"]).decode().strip(),
            "python": platform.python_version(), "os": platform.platform(), "uname": {key: value for key, value in uname.items() if key != "node"},
            "logicalCpuCount": os.cpu_count(), "cpu": optional_command(["sysctl", "-n", "machdep.cpu.brand_string"]),
            "memoryBytes": optional_command(["sysctl", "-n", "hw.memsize"]), "browsers": browsers,
            "scope": "Identity observations only; no browser/engine workload was run."}


def archive(path: Path, role: str, source, expected=None):
    path = path.resolve(strict=True)
    actual = sha(path.read_bytes())
    if expected is not None:
        assert actual == expected, (role, "archive pin drift", actual, expected)
    rows, payload = [], {}
    with tarfile.open(path, "r:gz") as tar:
        for member in tar:
            if member.isdir():
                continue
            assert member.isfile(), (role, "non-file archive entry", member.name)
            name = PurePosixPath(member.name)
            assert name.parts[0] == "package" and len(name.parts) > 1
            assert not name.is_absolute() and ".." not in name.parts and "\\" not in member.name
            relative = "/".join(name.parts[1:])
            assert relative not in payload, (role, "duplicate member", relative)
            data = tar.extractfile(member).read()
            assert len(data) == member.size
            payload[relative] = data
            rows.append({"path": relative, "bytes": member.size, "sha256": sha(data)})
    rows.sort(key=lambda item: item["path"])
    metadata = json.loads(payload["package.json"])
    assert metadata["name"] == "@vmitsaras/raveldex"
    assert metadata["private"] is True and metadata["version"] == "0.1.0-rc.0"
    assert metadata.get("dependencies", {}) == {}
    runtime = [row for row in rows if row["path"].startswith("dist/")]
    assert runtime
    limits_text = payload["dist/core/limits/limits.js"].decode()
    body = re.search(r"DEFAULT_LIMITS = Object.freeze\(\{(.*?)\}\)", limits_text, re.S)
    assert body, "could not identify default-limit literal"
    limits = {name: int(value.replace("_", "")) for name, value in re.findall(r"(\w+):\s*([\d_]+)", body.group(1))}
    assert limits["maxDeadlineMs"] == 60_000 and limits["maxDocuments"] == 10_000
    options = payload["dist/core/contracts/options.js"].decode()
    assert "Math.min(30_000, limits.maxDeadlineMs)" in options
    assert "basic-v1" in payload["dist/core/analyzer/basic.js"].decode()
    assert "work-v1" in payload["dist/core/limits/work.js"].decode()
    assert "raveldex-bm25-v1" in payload["dist/core/query/search.js"].decode()
    ranking = payload["dist/core/ranking/bm25.js"].decode()
    assert "1.2 * (1 - 0.75 + 0.75 * length / avgLength)" in ranking
    semantic_paths = ["dist/core/limits/limits.js", "dist/core/contracts/options.js", "dist/core/analyzer/basic.js",
                      "dist/core/limits/work.js", "dist/core/ranking/bm25.js", "dist/core/query/search.js"]
    record = {"role": role, "archive": str(path), "sha256": actual, "archiveBytes": path.stat().st_size,
              "source": source, "package": {key: metadata[key] for key in ["name", "version", "private"]},
              "runtimeDependencies": metadata.get("dependencies", {}), "members": rows,
              "payloadDigest": sha(canonical(rows)), "runtimeDigest": sha(canonical(runtime)),
              "runtimeMembers": len(runtime), "defaultLimits": limits,
              "semanticPins": {p: sha(payload[p]) for p in semantic_paths},
              "model": {"analyzer": "basic-v1", "environmentProfile": "unqualified", "ranking": "raveldex-bm25-v1", "k1": 1.2, "b": 0.75, "work": "work-v1"},
              "deadlineSemantics": {"ordinaryOmittedMs": 30_000, "maximumMs": 60_000,
                                    "scope": "Verified captured-option expression and default-limit literal; lower configured maxima remain possible."}}
    return record


def source_identity(ref: str):
    commit = git("rev-parse", ref)
    inventory = []
    for raw in command(["git", "ls-tree", "-r", "-z", commit, "--", "src", "integrations", "package.json", "package-lock.json"]).split(b"\0"):
        if not raw:
            continue
        meta, name = raw.split(b"\t", 1)
        mode, kind, oid = meta.decode().split()
        assert kind == "blob" and mode in ["100644", "100755"]
        path = name.decode()
        data = command(["git", "cat-file", "blob", oid])
        worktree = ROOT / path
        assert worktree.is_file() and worktree.read_bytes() == data, ("runtime/package worktree differs from selected immutable source", path)
        inventory.append({"path": path, "bytes": len(data), "gitBlob": oid, "sha256": sha(data)})
    assert inventory
    inventory.sort(key=lambda row: row["path"])
    comparisons = []
    for other in ["5b40646", "6d00200"]:
        full = git("rev-parse", other)
        changed = git("diff", "--name-only", full, commit, "--", "src", "integrations", "package.json", "package-lock.json").splitlines()
        assert not changed, ("source runtime identity claim failed", full, commit, changed)
        comparisons.append({"before": full, "after": commit, "scope": ["src/", "integrations/", "package.json", "package-lock.json"], "changedPaths": changed})
    lock = next(row for row in inventory if row["path"] == "package-lock.json")
    return {"head": commit, "tree": git("rev-parse", commit + "^{tree}"), "worktree": str(ROOT),
            "status": git("status", "--porcelain=v1", "--untracked-files=all"),
            "scope": "Immutable Git source/package inventory checked byte-for-byte against current worktree; dirty planning/evidence/benchmark files are separate. This is not a new clean-HEAD candidate-verification claim.",
            "runtimeSourceInventory": inventory, "runtimeSourceDigest": sha(canonical(inventory)),
            "lockfile": lock, "comparisons": comparisons}


def verify_consumer(record, consumer: Path):
    assert consumer.resolve(strict=True) == consumer
    package = consumer / "node_modules/@vmitsaras/raveldex"
    assert package.resolve() == package and package.is_dir()
    actual = []
    for path in sorted(package.rglob("*")):
        assert not path.is_symlink(), ("installed symbolic link", path)
        if path.is_file():
            data = path.read_bytes()
            actual.append({"path": path.relative_to(package).as_posix(), "bytes": len(data), "sha256": sha(data)})
    assert actual == record["members"], (record["role"], "installed member drift")
    tree = json.loads(command(["npm", "ls", "--omit=dev", "--all", "--json"], cwd=consumer))
    assert set(tree["dependencies"]) == {"@vmitsaras/raveldex"}
    assert tree["dependencies"]["@vmitsaras/raveldex"].get("dependencies", {}) == {}
    record["consumer"] = str(consumer.resolve())
    record["installedPayloadDigest"] = sha(canonical(actual))
    return tree


def install(record, root: Path):
    consumer = root / record["role"]
    consumer.mkdir()
    (consumer / "package.json").write_text(json.dumps({"name": "rx9001-" + record["role"].lower(), "private": True, "type": "module"}) + "\n")
    args = ["npm", "install", record["archive"], "--offline", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", "--cache", str(consumer / ".npm-cache")]
    result = subprocess.run(args, cwd=consumer, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    (consumer / "install.log").write_bytes(result.stdout)
    assert result.returncode == 0, (record["role"], "offline install failed", result.stdout.decode()[-1000:])
    tree = verify_consumer(record, consumer)
    record["install"] = {"command": args, "exitCode": result.returncode,
                         "logSha256": sha(result.stdout), "dependencyTree": tree}


def difference(a, b, runtime=False):
    left = {row["path"]: row for row in a["members"] if not runtime or row["path"].startswith("dist/")}
    right = {row["path"]: row for row in b["members"] if not runtime or row["path"].startswith("dist/")}
    names = sorted(left.keys() | right.keys())
    return [name for name in names if left.get(name) != right.get(name)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--current-candidate", type=Path)
    parser.add_argument("--install-root", type=Path)
    parser.add_argument("--reuse-consumers-from", type=Path)
    parser.add_argument("--source-ref", default="6100770")
    args = parser.parse_args()
    assert not (args.install_root and args.reuse_consumers_from), "choose fresh installation or verified reuse"
    output = args.output.resolve()
    assert not output.exists(), "output must be a new file"
    source = source_identity(args.source_ref)
    records = []
    for role, (relative, expected, revision, provenance) in ROLES.items():
        records.append(archive(ROOT / relative, role, {"commit": git("rev-parse", revision), "provenance": provenance}, expected))
    control = next(row for row in records if row["role"] == "reviewedCurrent")
    current_path = args.current_candidate or Path(control["archive"])
    current = archive(current_path, "current", {"commit": source["head"],
                      "provenance": "Actual newly prepared candidate associated with this immutable runtime source; preparation/worktree guard is recorded separately." if args.current_candidate else "Provisional reuse of the reviewed closing archive; not a fresh current candidate and not accepted for the final pilot."})
    records.append(current)
    baseline = next(row for row in records if row["role"] == "preN9")
    accepted = next(row for row in records if row["role"] == "acceptedN9")
    assert not difference(accepted, control, runtime=True)
    assert not difference(control, current, runtime=True), "fresh candidate changes native runtime/declarations/CSS"
    assert all(row["defaultLimits"] == baseline["defaultLimits"] and row["model"] == baseline["model"] for row in records)
    if args.install_root:
        install_root = args.install_root.resolve()
        install_root.mkdir(exist_ok=False)
        for record in records:
            if record["role"] != "reviewedCurrent":
                install(record, install_root)
    if args.reuse_consumers_from:
        prior = json.loads(args.reuse_consumers_from.read_text())
        assert prior["kind"] == "rx9001-artifacts-v1" and prior["freshCurrentCandidate"] and not prior["provisional"]
        known = {record["role"]: record for record in prior["artifacts"]}
        for record in records:
            if record["role"] == "reviewedCurrent":
                continue
            original = known[record["role"]]
            assert original["sha256"] == record["sha256"] and original["members"] == record["members"], "reused artifact identity drift"
            consumer = Path(original["consumer"])
            tree = verify_consumer(record, consumer)
            assert tree == original["install"]["dependencyTree"], "reused dependency tree drift"
            assert sha((consumer / "install.log").read_bytes()) == original["install"]["logSha256"]
            record["install"] = original["install"]
            record["reusedConsumerVerification"] = {"status": "Pass", "priorManifest": str(args.reuse_consumers_from.resolve()),
                                                     "priorManifestSha256": sha(args.reuse_consumers_from.read_bytes()),
                                                     "scope": "Every installed package member, package tree and retained original install log rechecked; no reinstall."}
    data = {"kind": "rx9001-artifacts-v1", "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "source": source, "environment": environment(), "artifacts": records,
            "provisional": args.current_candidate is None,
            "freshCurrentCandidate": args.current_candidate is not None,
            "comparisons": {"acceptedToReviewedRuntimeChangedPaths": difference(accepted, control, True),
                            "reviewedToCurrentRuntimeChangedPaths": difference(control, current, True),
                            "reviewedToCurrentAllChangedPaths": difference(control, current),
                            "preN9ToCurrentRuntimeChangedPaths": difference(baseline, current, True),
                            "acceptedToReviewedAllChangedPaths": difference(accepted, control)},
            "freezer": {"path": str(Path(__file__).resolve()), "sha256": sha(Path(__file__).read_bytes())},
            "limits": ["No workload, build, test or timing collector was run by this freezer.",
                       "Archive/member bytes are not retained or peak heap; browser version discovery is not a browser behavior observation.",
                       "Git runtime/package identity does not assert an unmodified planning worktree or new exact-head CI."]}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"output": str(output), "source": source["head"], "provisional": data["provisional"],
                      "roles": [{"role": row["role"], "members": len(row["members"]), "sha256": row["sha256"], "consumer": row.get("consumer")} for row in records],
                      "runtimeChanged": data["comparisons"]["reviewedToCurrentRuntimeChangedPaths"]}, indent=2))


if __name__ == "__main__":
    main()
