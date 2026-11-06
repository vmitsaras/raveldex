#!/usr/bin/env python3
"""Describe a stopped RX-9006 original full recovery collection, including a prefix.

Usage: python3 recovery-prefix.py --raw DIRECTORY --output FRESH_DIRECTORY

DO NOT run while a collector is active. A final report.json with finishedAt is
required; progress.json never substitutes for it. Prefer a byte-identical,
postcollection raw/prepared.json copy, otherwise use report.prepared. Both are
checked against the original report.preparedSha256. Inputs are read-only.

This program imports no engine, tokenizer, scorer, collector or JavaScript. Its
204-slot recipe is independently stated below. It binds the final report,
sealed preparation, collector-referenced rows, raw configuration/process files
and every source/state artifact referenced by those rows. It does not re-run
semantic/source/offset/scoring verification, execute the preparation, rehash all
external installed-package assets, or independently re-observe native receipts.
Those require the separate identity and semantic replay gates.

Only valid completed collector descriptors contribute to distributions. Raw
rows without accepted descriptors are retained separately and never pooled.
Missing/interrupted contexts are not native Not-run operations and acquire no
invented attempt count, CPU value or zero latency. A build window aggregates a
sequence of public addMany calls, not one atomic native operation. Empirical nearest-rank p50 values are
descriptive observations within exact lane/host/configuration/deadline/outcome
cells; there are no speed classifications, ratios, p95 or population claims.
Diagnostic logical counters, startup observations, harness-owned resources and
unforced process samples remain separate from normal operation timings and
from unmeasured retained/peak/exclusive/browser heap or physical input/paint.
"""
from __future__ import annotations

import argparse
import collections
import datetime
import hashlib
import json
import math
import pathlib
import sys

EXPECTED_CONTEXTS = 204
ORIGINAL_BUDGET_MS = 10_800_000
CONTEXT_BOUND_MS = 300_000
OPERATIONS = ["build", "exportSource", "restoreSource", "deadlineRestore", "abortedRestore"]
PRIOR = {"id": "prior-state", "text": {"body": "n9oldstate"}, "metadata": {"group": "prior"}}
OUTCOMES = {"Pass", "Refused", "Cancelled", "Unknown", "Not run"}
TIMING_FIELDS = ("wallMs", "invocationToReturnMs", "returnToSettlementMs")
CPU_FIELDS = ("cpuUserMs", "cpuSystemMs")
COUNTER_FIELDS = ("emittedSteps", "emittedWorkUnits", "hostYields", "continuationsScheduled",
                  "deadlineCallbacks", "maxStepWorkUnits")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def actual_integer(value, minimum=0):
    return type(value) is int and value >= minimum


def sha_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def descriptive_p50(values):
    """Frozen empirical nearest rank: sorted(values)[ceil(0.5*n)-1]."""
    require(values and all(finite_number(value) for value in values), "actual finite p50 observations required")
    ordered = sorted(values)
    return ordered[math.ceil(0.5 * len(ordered)) - 1]


def json_key(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def expected_jobs():
    """Independently reconstruct the original 180 primary + 24 control slots."""
    jobs = []
    for owner in range(3):
        deadlines = ["explicit60s", "default30s"] if owner % 2 else ["default30s", "explicit60s"]
        roles = ["current", "acceptedN9", "preN9"] if owner % 2 else ["preN9", "acceptedN9", "current"]
        for deadline in deadlines:
            for size in (1000, 10000):
                for host in ("Node-direct", "browser-direct", "browser-real-module-worker"):
                    for variant in ("source", "positions-offsets"):
                        for role in roles:
                            if size == 10000 and role == "acceptedN9":
                                continue
                            jobs.append(dict(family="adversarial", size=size, host=host, variant=variant,
                                             role=role, deadline=deadline,
                                             deadlineOptions={} if deadline == "default30s" else {"deadlineMs": 60000},
                                             owner=owner, mode="normal" if owner < 2 else "diagnostic", control=False))
    for owner in range(3):
        deadlines = ["explicit60s", "default30s"] if owner % 2 else ["default30s", "explicit60s"]
        roles = ["current", "preN9"] if owner % 2 else ["preN9", "current"]
        for deadline in deadlines:
            for family in ("real-docs", "high-cardinality"):
                for role in roles:
                    jobs.append(dict(family=family, size=10000, host="Node-direct", variant="source",
                                     role=role, deadline=deadline,
                                     deadlineOptions={} if deadline == "default30s" else {"deadlineMs": 60000},
                                     owner=owner, mode="normal" if owner < 2 else "diagnostic", control=True))
    require(len(jobs) == EXPECTED_CONTEXTS, "independent recipe context count")
    require(sum(not job["control"] for job in jobs) == 180, "independent primary count")
    require(sum(job["control"] for job in jobs) == 24, "independent control count")
    for index, job in enumerate(jobs):
        job["index"] = index
        job["key"] = "-".join(str(job[field]) for field in
                              ("index", "family", "size", "host", "variant", "role", "deadline", "owner", "mode"))
    require(len({job["key"] for job in jobs}) == EXPECTED_CONTEXTS, "independent recipe unique slots")
    return jobs


class Inputs:
    def __init__(self, raw):
        self.raw = raw
        self.files = {}

    def bind(self, path, expected_sha=None, expected_bytes=None, purpose=None):
        path = pathlib.Path(path).resolve(strict=True)
        require(path.is_file(), "input is not a regular file: " + str(path))
        size, digest = path.stat().st_size, sha_file(path)
        if expected_sha is not None:
            require(digest == expected_sha, "referenced file SHA mismatch: " + str(path))
        if expected_bytes is not None:
            require(size == expected_bytes, "referenced file byte-count mismatch: " + str(path))
        existing = self.files.get(str(path))
        if existing:
            require((size, digest) == (existing["bytes"], existing["sha256"]), "input changed during analysis: " + str(path))
            if purpose and purpose not in existing["purposes"]:
                existing["purposes"].append(purpose)
            return existing
        result = {"path": str(path), "bytes": size, "sha256": digest, "purposes": [purpose] if purpose else []}
        self.files[str(path)] = result
        return result

    def raw_path(self, relative):
        require(isinstance(relative, str) and relative, "referenced raw path must be nonempty text")
        part = pathlib.PurePosixPath(relative)
        require(not part.is_absolute() and "\\" not in relative and
                all(piece not in ("", ".", "..") for piece in relative.split("/")), "unsafe raw path: " + relative)
        path = self.raw.joinpath(*part.parts)
        require(not path.is_symlink(), "raw reference is a symlink: " + relative)
        resolved = path.resolve(strict=True)
        require(resolved.is_relative_to(self.raw), "raw reference escapes collection: " + relative)
        return resolved

    def raw_json(self, relative, expected_sha=None, purpose=None):
        path = self.raw_path(relative)
        binding = self.bind(path, expected_sha=expected_sha, purpose=purpose)
        return json.loads(path.read_text()), binding

    def artifact_references(self, value, purpose):
        """Bind actual artifact+sha256+bytes triples; do not interpret source data."""
        found = []
        if isinstance(value, dict):
            if isinstance(value.get("artifact"), str) and "sha256" in value and "bytes" in value:
                require(isinstance(value["sha256"], str) and len(value["sha256"]) == 64, "artifact SHA declaration")
                require(actual_integer(value["bytes"]), "artifact byte-count declaration")
                path = self.raw_path(value["artifact"])
                bound = self.bind(path, expected_sha=value["sha256"], expected_bytes=value["bytes"], purpose=purpose)
                found.append({"artifact": value["artifact"], "binding": bound})
            for child in value.values():
                if isinstance(child, (dict, list)):
                    found.extend(self.artifact_references(child, purpose))
        elif isinstance(value, list):
            for child in value:
                if isinstance(child, (dict, list)):
                    found.extend(self.artifact_references(child, purpose))
        return found

    def verify_stable(self):
        for entry in list(self.files.values()):
            self.bind(entry["path"], expected_sha=entry["sha256"], expected_bytes=entry["bytes"])


def check_original_method(method):
    require(isinstance(method, dict), "recorded method required")
    for field, expected in {"kind": "rx9006-recovery-v1", "normalOwners": 2, "diagnosticOwners": 1,
                            "contexts": EXPECTED_CONTEXTS, "budgetMs": ORIGINAL_BUDGET_MS,
                            "perContextWatchdogMs": CONTEXT_BOUND_MS, "priorReceiver": PRIOR,
                            "tailEstimates": False}.items():
        require(method.get(field) == expected, "original frozen method field mismatch: " + field)


def completed_operations(row, job, prepared, prepared_sha):
    """Structural/measurement checks, explicitly not semantic acceptance."""
    require(row.get("job") == job, "completed row job identity mismatch")
    require(row.get("outcome") == "Collected", "descriptor row is not completed")
    require(row.get("preparedSha256") == prepared_sha, "completed row preparation binding mismatch")
    package = prepared["packages"][job["role"] + "-" + job["mode"]]
    require(row.get("artifactSha256") == package["artifactSha256"], "completed row archive binding mismatch")
    require(row.get("identity") == prepared["workloads"][job["family"] + "-" + str(job["size"])]["identity"],
            "completed row workload identity mismatch")
    exercise = row.get("exercise")
    require(isinstance(exercise, dict) and exercise.get("outcome") == "Collected", "exercise is not completed")
    require(exercise.get("priorRecord") == PRIOR, "literal prior receiver mismatch")
    require(exercise.get("deadlineOptions") == job["deadlineOptions"], "exercise deadline cohort mismatch")
    require((exercise.get("mode"), exercise.get("variant"), exercise.get("size")) ==
            (job["mode"], job["variant"], job["size"]), "exercise configuration mismatch")
    operations = exercise.get("samples" if job["mode"] == "normal" else "observations")
    hidden = exercise.get("observations" if job["mode"] == "normal" else "samples")
    require(isinstance(operations, list) and hidden == [], "normal/diagnostic lane separation")
    require([op.get("operation") for op in operations] == OPERATIONS, "completed operation coverage/order")
    if job["host"] == "Node-direct":
        require(actual_integer(row.get("pid"), 1), "actual Node process id required")
    else:
        require(row.get("pageErrors") == [] and row.get("externalRequests") == [], "recorded browser errors/requests")
        require(row.get("browserVersion") == "149.0.7827.55", "frozen Chromium version mismatch")
    for operation in operations:
        outcome = operation.get("outcome")
        require(outcome in OUTCOMES, "unexpected completed operation outcome")
        if outcome == "Not run":
            require(type(operation.get("attempts")) is int and operation["attempts"] == 0, "Not-run must have actual zero attempts")
            require(isinstance(operation.get("reason"), str) and operation["reason"], "Not-run reason required")
            require(operation.get("dependencyOutcome") in {"Refused", "Cancelled", "Unknown"}, "Not-run dependency outcome")
            for field in (*TIMING_FIELDS, *CPU_FIELDS, "counters", "result", "error", "processSamples"):
                require(field not in operation, "Not-run contains a fabricated observation: " + field)
            continue
        require(type(operation.get("attempts")) is int and operation["attempts"] == 1, "actual operation-window attempt required")
        require(all(finite_number(operation.get(field)) and operation[field] >= 0 for field in TIMING_FIELDS), "actual finite timing boundaries required")
        require(abs(operation["wallMs"] - operation["invocationToReturnMs"] - operation["returnToSettlementMs"]) < 1e-6,
                "operation timing boundaries do not sum")
        expected_options = {"deadlineMs": 1} if operation["operation"] == "deadlineRestore" else job["deadlineOptions"]
        require(operation.get("deadlineOptions") == expected_options, "actual operation deadline options mismatch")
        if job["host"] == "Node-direct":
            require(all(finite_number(operation.get(field)) and operation[field] >= 0 for field in CPU_FIELDS), "actual Node CPU pair required")
        else:
            require(all(field not in operation for field in CPU_FIELDS), "browser CPU must remain unmeasured")
        if job["mode"] == "normal":
            require("counters" not in operation and "processSamples" not in operation, "diagnostics in normal timing lane")
        else:
            require(isinstance(operation.get("counters"), dict), "actual diagnostic counters required")
            for field in COUNTER_FIELDS[:4]:
                require(actual_integer(operation["counters"].get(field)), "actual nonnegative diagnostic counter required: " + field)
        if outcome != "Pass":
            require(isinstance(operation.get("error"), dict), "actual typed operation error required")
            if outcome == "Unknown":
                require(operation.get("oldSourceBytesPreserved") is not True and operation.get("oldRemoved") is not True,
                        "Unknown must not be promoted to rollback or commit")
    return operations


def summarize_cells(groups):
    cells = []
    for key in sorted(groups):
        group = groups[key]
        owners = collections.defaultdict(list)
        for sample in group["samples"]:
            owners[sample["owner"]].append(sample)
        metrics = {}
        for field in (*TIMING_FIELDS, *CPU_FIELDS, "cpuTotalMs"):
            values = [sample[field] for sample in group["samples"] if field in sample]
            if values:
                metrics[field] = {"actualValues": values, "observations": len(values),
                                  "descriptiveP50": descriptive_p50(values),
                                  "quantileRecipe": "Empirical nearest-rank p50: sorted(values)[ceil(0.5*n)-1]; even n selects the lower middle observation."}
        counters = {}
        for field in COUNTER_FIELDS:
            values = [sample["logicalCounters"][field] for sample in group["samples"]
                      if field in sample.get("logicalCounters", {})]
            if values:
                counters[field] = {"actualValues": values, "observations": len(values),
                                   "descriptiveP50": descriptive_p50(values),
                                   "quantileRecipe": "Empirical nearest-rank p50: sorted(values)[ceil(0.5*n)-1]; even n selects the lower middle observation.", "scope": "Logical diagnostic work; not CPU or allocations."}
        cells.append({**group["identity"], "windowRecords": len(group["samples"]),
                      "operationWindowAttempts": sum(sample["attempts"] for sample in group["samples"]),
                      "observedOwners": len(owners), "ownerNumbers": sorted(owners),
                      "expectedOwnersForThisLane": 2 if group["identity"]["mode"] == "normal" else 1,
                      "perOwner": [{"owner": owner, "samples": owners[owner]} for owner in sorted(owners)],
                      "metrics": metrics, "logicalCounters": counters,
                      "cpuScope": "Actual Node process samples include harness/Promise work." if group["identity"]["host"] == "Node-direct" else "Not measured in browser.",
                      "interpretation": "Descriptive observed values only; no absent-owner imputation, speed classification or tail estimate."})
    return cells


def analyze(raw, output):
    require(raw.is_dir(), "raw collection directory required")
    require(not output.exists(), "output directory already exists")
    require(not output.is_relative_to(raw) and not raw.is_relative_to(output), "output must be outside the read-only raw tree")
    inputs = Inputs(raw)
    report, report_binding = inputs.raw_json("report.json", purpose="actual final collector report")
    require(report.get("kind") == "rx9006-recovery-collection-v1" and report.get("profile") == "full", "original full recovery report required")
    require(report.get("outcome") in {"Collected", "Fail"} and isinstance(report.get("finishedAt"), str) and report["finishedAt"],
            "collector must be stopped with a final report; do not analyze active progress")
    check_original_method(report.get("method"))
    require(report.get("planned") == EXPECTED_CONTEXTS, "full report must declare the frozen 204 slots")
    require(report.get("effectiveCollectionBudgetMs", ORIGINAL_BUDGET_MS) == ORIGINAL_BUDGET_MS, "owner retained only the original 180-minute collection")
    require(report.get("collectionBudget", {}).get("effectiveBudgetMs", ORIGINAL_BUDGET_MS) == ORIGINAL_BUDGET_MS,
            "owner retained only the original 180-minute collection")
    prepared_sha = report.get("preparedSha256")
    require(isinstance(prepared_sha, str) and len(prepared_sha) == 64, "actual preparation SHA required")
    prepared_candidates = [raw / "prepared.json"]
    if isinstance(report.get("prepared"), str):
        prepared_candidates.append(pathlib.Path(report["prepared"]))
    available = [candidate.resolve() for candidate in prepared_candidates if candidate.is_file()]
    require(available, "sealed prepared.json missing; supply its byte-identical postcollection raw/prepared.json copy")
    for candidate in available:
        inputs.bind(candidate, expected_sha=prepared_sha, purpose="sealed preparation, including any matching portable copy")
    prepared = json.loads(available[0].read_text())
    require(prepared.get("kind") == "rx9006-recovery-preparation-v1", "actual sealed recovery preparation required")
    check_original_method(prepared.get("method"))
    jobs = expected_jobs()
    require(prepared.get("jobs") == jobs, "sealed preparation does not match independently rebuilt 204-slot recipe")
    descriptors = report.get("runs")
    require(isinstance(descriptors, list), "actual completed run-descriptor array required")
    findings, accepted, rejected, unaccepted, groups, startup_observations, resources = [], {}, [], [], {}, [], []
    descriptor_keys, duplicate_keys = set(), set()
    for descriptor in descriptors:
        key = descriptor.get("job", {}).get("key") if isinstance(descriptor, dict) else None
        if key in descriptor_keys:
            duplicate_keys.add(key)
        descriptor_keys.add(key)
    by_key = {job["key"]: job for job in jobs}
    for descriptor in descriptors:
        key = descriptor.get("job", {}).get("key") if isinstance(descriptor, dict) else None
        try:
            require(key in by_key and key not in duplicate_keys, "unknown/duplicate completed descriptor")
            job = by_key[key]
            require(descriptor.get("job") == job and descriptor.get("outcome") == "Collected", "completed descriptor identity/outcome")
            elapsed = descriptor.get("contextElapsedMs")
            require(finite_number(elapsed) and 0 <= elapsed <= CONTEXT_BOUND_MS, "completed descriptor context bound")
            require(descriptor.get("file") == job["key"] + ".json", "completed descriptor row path mismatch")
            require(isinstance(descriptor.get("sha256"), str) and len(descriptor["sha256"]) == 64, "actual row SHA required")
            row, binding = inputs.raw_json(descriptor["file"], descriptor["sha256"], "completed collector row")
            operations = completed_operations(row, job, prepared, prepared_sha)
            artifacts = inputs.artifact_references(row, "source/state artifact referenced by completed row " + key)
            config, config_binding = inputs.raw_json(key + ".config.json", purpose="actual context configuration")
            require(config.get("job") == job and config.get("preparedSha256") == prepared_sha,
                    "actual configuration job/preparation binding")
            require(config.get("artifactSha256") == row.get("artifactSha256") and config.get("identity") == row.get("identity"),
                    "actual configuration archive/workload binding")
            process_binding = None
            if job["host"] == "Node-direct":
                process_record, process_binding = inputs.raw_json(key + ".process.json", purpose="actual Node child process result")
                require(process_record.get("pid") == row.get("pid") and process_record.get("code") == 0 and
                        process_record.get("timedOut") is False, "actual completed Node process result")
            accepted[key] = {"job": job, "descriptor": descriptor, "binding": binding,
                             "configurationBinding": config_binding, "processBinding": process_binding,
                             "artifactBindings": artifacts, "rowPid": row.get("pid"),
                             "operations": operations, "startup": row["exercise"].get("startup", []),
                             "resources": row["exercise"].get("resources", [])}
        except (ValueError, KeyError, TypeError, OSError, json.JSONDecodeError) as error:
            finding = {"jobKey": key, "descriptor": descriptor, "error": str(error)}
            findings.append(finding)
            rejected.append(finding)
    # A process id cannot represent two fresh native contexts. Do not silently
    # retain one of a repeated-PID pair as an accepted fresh-owner observation.
    pid_keys = collections.defaultdict(list)
    for key, value in accepted.items():
        if value["job"]["host"] == "Node-direct":
            pid_keys[value["rowPid"]].append(key)
    for pid, keys in pid_keys.items():
        if len(keys) > 1:
            for key in keys:
                accepted.pop(key, None)
                findings.append({"jobKey": key, "error": "duplicate native process id", "pid": pid, "allKeys": keys})
    active_key = report.get("activeJob", {}).get("key") if isinstance(report.get("activeJob"), dict) else None
    failed_context = report.get("failedContext") if isinstance(report.get("failedContext"), dict) else None
    failed_key = failed_context.get("job", {}).get("key") if failed_context else None
    failure_artifact = None
    if failed_context and isinstance(failed_context.get("file"), str):
        try:
            failure_artifact, failure_binding = inputs.raw_json(failed_context["file"], purpose="actual failed-context orchestration report")
        except (ValueError, OSError, json.JSONDecodeError) as error:
            findings.append({"jobKey": failed_key, "error": "failed-context file unavailable or invalid: " + str(error)})
    slots = []
    for job in jobs:
        key = job["key"]
        markers = [suffix for suffix in (".json", ".config.json", ".process.json", ".failure.json")
                   if (raw / (key + suffix)).is_file()]
        if key in accepted:
            value = accepted[key]
            slots.append({"job": job, "status": "Collected", "descriptor": value["descriptor"],
                          "rowBinding": value["binding"], "configurationBinding": value["configurationBinding"],
                          "processBinding": value["processBinding"], "artifactBindings": value["artifactBindings"]})
        else:
            interrupted = bool(markers or key in descriptor_keys or key == active_key or key == failed_key)
            slot = {"job": job, "status": "Interrupted" if interrupted else "Not collected",
                    "availableRawMarkers": [key + suffix for suffix in markers],
                    "scope": "No native attempt/latency/CPU is inferred for this missing accepted context."}
            if interrupted:
                slot["reason"] = "No valid completed collector descriptor; raw setup/partial/failure markers remain separate."
            slots.append(slot)
            for suffix in markers:
                try:
                    inputs.bind(inputs.raw_path(key + suffix), purpose="unaccepted/interrupted context marker")
                except (ValueError, OSError) as error:
                    findings.append({"jobKey": key, "error": str(error)})
    # Only completed accepted descriptors enter metric distributions. The
    # following raw rows may contain real observations but are never pooled.
    candidate_files = {raw / (job["key"] + ".json") for job in jobs if job["key"] not in accepted}
    for candidate in raw.glob("*.json"):
        if candidate.name in {"report.json", "progress.json", "prepared.json"} or any(candidate.name.endswith(suffix) for suffix in
              (".state.json", ".snapshot.json", ".config.json", ".process.json", ".failure.json")):
            continue
        if candidate.name not in {job["key"] + ".json" for job in jobs}:
            candidate_files.add(candidate)
    for candidate in sorted(candidate_files):
        if not candidate.is_file():
            continue
        try:
            actual, binding = inputs.raw_json(candidate.name, purpose="raw row outside completed accepted descriptors")
            if not isinstance(actual, dict) or not isinstance(actual.get("job"), dict):
                continue
            exercise = actual.get("exercise") if isinstance(actual.get("exercise"), dict) else {}
            recorded_exercise = exercise.get("partial") if isinstance(exercise.get("partial"), dict) else exercise
            operation_facts = []
            for lane in ("samples", "observations"):
                for operation in recorded_exercise.get(lane, []) if isinstance(recorded_exercise.get(lane), list) else []:
                    operation_facts.append({"lane": lane, "operation": operation.get("operation"),
                                            "reportedOutcome": operation.get("outcome"),
                                            **({"reportedAttempts": operation["attempts"]} if "attempts" in operation else {}),
                                            **({"reportedWallMs": operation["wallMs"]} if "wallMs" in operation else {}),
                                            **({"reportedError": operation["error"]} if "error" in operation else {})})
            artifact_bindings, artifact_error = [], None
            try:
                artifact_bindings = inputs.artifact_references(actual, "unaccepted-row artifact " + candidate.name)
            except (ValueError, OSError, TypeError) as error:
                artifact_error = str(error)
                findings.append({"file": candidate.name, "error": "unaccepted-row artifact binding: " + artifact_error})
            unaccepted.append({"file": candidate.name, "binding": binding, "job": actual["job"],
                               "reportedOutcome": actual.get("outcome"), "reportedExerciseOutcome": exercise.get("outcome"),
                               "reportedPartialExerciseOutcome": recorded_exercise.get("outcome") if recorded_exercise is not exercise else None,
                               "reportedOperationFacts": operation_facts,
                               "artifactBindings": artifact_bindings, "artifactBindingError": artifact_error,
                               "scope": "Actual raw row, not accepted into completed prefix; no pooling into distributions."})
        except (ValueError, OSError, TypeError, json.JSONDecodeError) as error:
            findings.append({"file": candidate.name, "error": "unaccepted row could not be bound: " + str(error)})
            unaccepted.append({"file": candidate.name, "binding": inputs.files.get(str(candidate.resolve())),
                               "reportedOutcome": "Unparsed", "error": str(error),
                               "scope": "Unaccepted raw file retained; no native outcome, attempt count or timing inferred."})
    lane_counts = {mode: {"collectedContexts": 0, "productWindowRecords": 0, "operationWindowAttempts": 0,
                         "actualNotRunProductOperations": 0, "outcomes": collections.Counter(),
                         "operations": {name: collections.Counter() for name in OPERATIONS}}
                   for mode in ("normal", "diagnostic")}
    for key in sorted(accepted, key=lambda key: accepted[key]["job"]["index"]):
        value, job = accepted[key], accepted[key]["job"]
        counts = lane_counts[job["mode"]]
        counts["collectedContexts"] += 1
        for operation in value["operations"]:
            counts["productWindowRecords"] += 1
            counts["operationWindowAttempts"] += operation["attempts"]
            counts["actualNotRunProductOperations"] += int(operation["outcome"] == "Not run")
            counts["outcomes"][operation["outcome"]] += 1
            counts["operations"][operation["operation"]][operation["outcome"]] += 1
            identity = {field: job[field] for field in ("family", "size", "host", "variant", "role", "deadline", "mode", "control")}
            identity.update(operation=operation["operation"], outcome=operation["outcome"],
                            actualDeadlineOptions=operation.get("deadlineOptions"))
            group = groups.setdefault(json_key(identity), {"identity": identity, "samples": []})
            sample = {"owner": job["owner"], "contextIndex": job["index"], "jobKey": key,
                      "sourceRow": value["binding"], "attempts": operation["attempts"]}
            for field in (*TIMING_FIELDS, *CPU_FIELDS):
                if field in operation:
                    sample[field] = operation[field]
            if all(field in operation for field in CPU_FIELDS):
                sample["cpuTotalMs"] = sum(operation[field] for field in CPU_FIELDS)
            if "error" in operation:
                sample["reportedError"] = operation["error"]
            if "reason" in operation:
                sample["reportedReason"] = operation["reason"]
            if "counters" in operation:
                sample["logicalCounters"] = {field: operation["counters"][field] for field in COUNTER_FIELDS
                                             if field in operation["counters"] and actual_integer(operation["counters"][field])}
            group["samples"].append(sample)
            if "processSamples" in operation:
                resources.append({"job": job, "operation": operation["operation"], "sourceRow": value["binding"],
                                  "actualProcessSamples": operation["processSamples"],
                                  "scope": "Actual unforced process samples, separately retained; not retained/peak/exclusive engine heap."})
        for startup in value["startup"]:
            startup_observations.append({"job": job, "sourceRow": value["binding"], "actualStartupObservation": startup,
                                         "scope": "Actual factory/startup/worker initialization window; no cross-host subtraction or isolated transport inference."})
        if value["resources"]:
            resources.append({"job": job, "sourceRow": value["binding"], "actualOwnedResourceObservations": value["resources"],
                              "scope": "Harness-owned counters only as actually reported; no missing zero counts, native heap or release inference."})
    slot_counts = collections.Counter(slot["status"] for slot in slots)
    complete = len(accepted) == EXPECTED_CONTEXTS
    input_program = inputs.bind(pathlib.Path(__file__), purpose="actual pure-Python analysis source")
    inputs.verify_stable()
    result = {
        "kind": "rx9006-stopped-recovery-prefix-v1",
        "status": "Coverage complete" if complete else "Incomplete",
        "coverageStatus": "Complete 204 recorded contexts" if complete else "Incomplete original frozen matrix",
        "semanticVerification": "Not performed by this parser; independent replay remains separate.",
        "performanceAcceptance": "Not established; this is descriptive raw-coverage accounting only.",
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "analysisProgram": input_program,
        "rawDirectory": str(raw), "rawReportBinding": report_binding,
        "sealedPreparation": {"declaredPath": report.get("prepared"), "declaredSha256": prepared_sha,
                              "actualMatchingPaths": [str(path) for path in available]},
        "actualCollectorFacts": {field: report.get(field) for field in
             ("profile", "outcome", "guards", "guardFailure", "failure", "budgetExceeded", "elapsedMs",
              "startedAt", "finishedAt", "acceptedPerformanceEvidence", "activeJob", "failedContext")},
        "failureScope": "Runner/watchdog/budget/guard failure is not a native deadline, cancellation, Unknown or rollback. Native outcomes appear only where actual operation records report them.",
        "actualFailedContextArtifact": failure_artifact,
        "method": {"expectedContexts": EXPECTED_CONTEXTS, "originalBudgetMs": ORIGINAL_BUDGET_MS,
                   "perContextWatchdogMs": CONTEXT_BOUND_MS, "normalOwnersPerCompleteCell": 2, "diagnosticOwnersPerCompleteCell": 1,
                   "missingContexts": "No fabricated native attempts, zero latencies, CPU, or Not-run product rows.",
                   "buildGranularity": "One measured build window is a sequence of public addMany calls in batches of up to 256; not one atomic native mutation.",
                   "quantileRecipe": "Frozen empirical nearest-rank p50: sorted(values)[ceil(0.5*n)-1]; never average the two middle observations for even n.",
                   "statistics": "Descriptive nearest-rank p50 and actual owner arrays only; outcomes, normal/diagnostic lanes and exact host/provider/deadline/role cells remain separate. No p95, speed verdict, pooling or population claim.",
                   "scope": "Complete membership/source/offset/receipt/scoring and archive/source identities require their independent replay/identity gates; binding raw bytes alone does not prove those properties."},
        "denominators": {"expectedContexts": EXPECTED_CONTEXTS, "collectedContexts": slot_counts.get("Collected", 0),
                         "interruptedContexts": slot_counts.get("Interrupted", 0), "notCollectedContexts": slot_counts.get("Not collected", 0),
                         "rawDescriptorRecords": len(descriptors), "rejectedDescriptorRecords": len(rejected),
                         "unacceptedRawRows": len(unaccepted)},
        "lanes": lane_counts,
        "slots": slots,
        "operationCells": summarize_cells(groups),
        "startupObservations": startup_observations,
        "separateResourceObservations": resources,
        "unacceptedRawRows": unaccepted,
        "rejectedDescriptors": rejected,
        "inputIntegrity": {"status": "Findings" if findings else "Bound stable input bytes",
                           "findings": findings, "files": sorted(inputs.files.values(), key=lambda value: value["path"]),
                           "externalPreparedAssets": "Declared in SHA-bound sealed preparation; not re-executed or independently rehashed by this prefix parser."},
    }
    output.mkdir(parents=True, exist_ok=False)
    (output / "recovery-prefix.json").write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    text = ["RX-9006 stopped original recovery collection", "", "Status: " + result["status"],
            "Recorded collector outcome/guards: " + str(report.get("outcome")) + " / " + str(report.get("guards")),
            "Contexts: " + str(len(accepted)) + "/204 collected; " + str(slot_counts.get("Interrupted", 0)) +
            " interrupted; " + str(slot_counts.get("Not collected", 0)) + " not collected.",
            "", "Missing contexts are absent evidence, never zero native calls or Not-run product operations.",
            "Only completed descriptor-bound observations enter the following denominators."]
    for mode, counts in lane_counts.items():
        text.append(mode + ": " + str(counts["collectedContexts"]) + " contexts; " +
                    str(counts["operationWindowAttempts"]) + " actual operation-window attempts; " +
                    str(counts["actualNotRunProductOperations"]) + " actual zero-attempt dependent product operations.")
        text.append("  Recorded outcomes: " + json.dumps(counts["outcomes"], sort_keys=True))
    text += ["", "Build windows aggregate ordered addMany calls; p50 is descriptive empirical nearest-rank: sorted(values)[ceil(0.5*n)-1], including the lower middle observation for even n.",
             "No speed verdict, p95, semantic acceptance, retained/peak heap or physical-input claim.",
             "Input integrity findings: " + str(len(findings)),
             "See recovery-prefix.json for all 204 slots, actual owner arrays, adverse/unknown/refused outcomes and bound files."]
    (output / "recovery-prefix.txt").write_text("\n".join(text) + "\n")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", required=True, type=pathlib.Path)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    args = parser.parse_args()
    raw, output = args.raw.resolve(), args.output.resolve()
    result = analyze(raw, output)
    print(json.dumps({"status": result["status"], "denominators": result["denominators"],
                      "inputIntegrityFindings": len(result["inputIntegrity"]["findings"]),
                      "output": str(output)}, indent=2))
    return 2 if result["inputIntegrity"]["findings"] else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError, TypeError, OSError, json.JSONDecodeError) as error:
        print("Recovery prefix analysis refused: " + str(error), file=sys.stderr)
        sys.exit(2)
