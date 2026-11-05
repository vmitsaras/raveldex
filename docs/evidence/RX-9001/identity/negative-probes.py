#!/usr/bin/env python3
"""Finite identity-freezer checks; no engine, build or benchmark execution."""
import io
import json
import runpy
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODULE = runpy.run_path(str(HERE / "freeze.py"))
capture = MODULE["archive"]
CURRENT = HERE / "current-core.tar.gz"
PIN = "e562633424a3b6b37692d5c1a21bfeadb3b399dc6fff2ba9d33aba87f98b96b6"
SOURCE = {"commit": "6100770f3498c8f03897caf1378f131cf48f2d42", "scope": "negative identity probe"}


class IdentityGuards(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="rx9001-identity-negative-")
        self.directory = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup)

    def tar(self, entries):
        path = self.directory / "probe.tar.gz"
        with tarfile.open(path, "w:gz") as tar:
            for info, data in entries:
                tar.addfile(info, io.BytesIO(data) if data is not None else None)
        return path

    def rewrite(self, target, change):
        rows = []
        with tarfile.open(CURRENT, "r:gz") as tar:
            for member in tar:
                if not member.isfile():
                    continue
                data = tar.extractfile(member).read()
                if member.name == "package/" + target:
                    data = change(data)
                info = tarfile.TarInfo(member.name)
                info.size = len(data)
                rows.append((info, data))
        return self.tar(rows)

    def test_retained_positive_control_has_all_members_and_semantic_pins(self):
        result = capture(CURRENT, "current", SOURCE, PIN)
        self.assertEqual(len(result["members"]), 380)
        self.assertEqual(result["model"]["k1"], 1.2)
        self.assertEqual(result["model"]["b"], 0.75)
        self.assertEqual(result["deadlineSemantics"]["ordinaryOmittedMs"], 30000)

    def test_wrong_archive_pin_fails_before_interpretation(self):
        with self.assertRaisesRegex(AssertionError, "archive pin drift"):
            capture(CURRENT, "preN9", SOURCE, "0" * 64)

    def test_changed_raw_archive_bytes_fail_the_original_pin(self):
        changed = self.directory / "changed.tar.gz"
        changed.write_bytes(CURRENT.read_bytes() + b"unexpected trailing bytes")
        with self.assertRaisesRegex(AssertionError, "archive pin drift"):
            capture(changed, "current", SOURCE, PIN)

    def test_wrong_candidate_private_metadata_is_rejected(self):
        def change(data):
            metadata = json.loads(data)
            metadata["private"] = False
            return json.dumps(metadata).encode()
        with self.assertRaises(AssertionError):
            capture(self.rewrite("package.json", change), "current", SOURCE)

    def test_runtime_dependencies_are_rejected(self):
        def change(data):
            metadata = json.loads(data)
            metadata["dependencies"] = {"unexpected-runtime": "1.0.0"}
            return json.dumps(metadata).encode()
        with self.assertRaises(AssertionError):
            capture(self.rewrite("package.json", change), "current", SOURCE)

    def test_traversal_paths_are_rejected_without_extraction(self):
        info = tarfile.TarInfo("package/../outside")
        info.size = 1
        with self.assertRaises(AssertionError):
            capture(self.tar([(info, b"x")]), "current", SOURCE)
        self.assertFalse((self.directory / "outside").exists())

    def test_symbolic_links_are_rejected_without_following(self):
        info = tarfile.TarInfo("package/package.json")
        info.type = tarfile.SYMTYPE
        info.linkname = "../../outside"
        with self.assertRaisesRegex(AssertionError, "non-file archive entry"):
            capture(self.tar([(info, None)]), "current", SOURCE)

    def test_duplicate_paths_are_rejected(self):
        info = tarfile.TarInfo("package/package.json")
        info.size = 2
        with self.assertRaisesRegex(AssertionError, "duplicate member"):
            capture(self.tar([(info, b"{}"), (info, b"{}")]), "current", SOURCE)

    def test_changed_ordinary_deadline_is_rejected(self):
        changed = self.rewrite("dist/core/contracts/options.js", lambda data: data.replace(b"Math.min(30_000, limits.maxDeadlineMs)", b"Math.min(40_000, limits.maxDeadlineMs)"))
        with self.assertRaises(AssertionError):
            capture(changed, "current", SOURCE)

    def test_changed_bm25_coefficient_is_rejected(self):
        changed = self.rewrite("dist/core/ranking/bm25.js", lambda data: data.replace(b"1.2 * (1 - 0.75", b"1.3 * (1 - 0.75"))
        with self.assertRaises(AssertionError):
            capture(changed, "current", SOURCE)

    def test_selected_old_source_ref_cannot_masquerade_as_current_worktree(self):
        with self.assertRaisesRegex(AssertionError, "runtime/package worktree differs"):
            MODULE["source_identity"]("919c9ed")

    def test_existing_manifest_is_not_overwritten(self):
        before = (HERE / "artifacts.json").read_bytes()
        result = subprocess.run(["python3", str(HERE / "freeze.py"), "--output", str(HERE / "artifacts.json")], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"output must be a new file", result.stderr)
        self.assertEqual((HERE / "artifacts.json").read_bytes(), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
