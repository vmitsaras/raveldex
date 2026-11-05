# RX-9003 independent artifact and source review

5 November 2026. This review reads the actual archives and source bytes independently of the production implementation author. The [reproducible audit](audit.py) performs no build, installation, collector or network request. The [machine result](audit.json) and [complete inventories/diffs](inventory.json) distinguish retained-artifact checks from the parent-owned fresh candidate verification.

All 194 runtime/package/integration source paths match both the RX-9001 immutable inventory and current `6100770f3498c8f03897caf1378f131cf48f2d42` source blobs, with no extra or missing paths. All sixteen compiler/build configuration and helper inputs match HEAD. All nine frozen RX-9001 method/harness files retain their exact hashes. All 371 test and N9 harness inputs captured by RX-9002's actual full-run guard still match; its full-check log and installed-candidate report hashes also match their recorded pins. This does not reclassify predecessor tests as newly executed tests.

Every original archived member of pre-N9, accepted-N9, reviewed-current and RX-9001 current matches its original SHA-256 and inventory. The current candidate's 345 `dist/` implementation members are byte-identical to accepted-N9, reviewed-current and RX-9001 current: 169 JavaScript, 169 declarations, six CSS and one license file. Package metadata stays private `0.1.0-rc.0`, with no runtime dependencies. There are zero production member differences versus the reviewed current control.

| Comparison to verified candidate | Implementation differences | Other differences |
| --- | --- | --- |
| Accepted N9 | None | `README.md`, `docs/api/LIMITATIONS.md`, `docs/release/CANDIDATE.md`, `docs/release/PUBLICATION_STATUS.md` |
| Reviewed current RX-8011 | None | `docs/release/PUBLICATION_STATUS.md` |
| Frozen RX-9001 measurement current | None | `docs/release/PUBLICATION_STATUS.md` |
| RX-9001 closing verified | None | None |
| RX-9002 closing verified | None | None |

Complete textual changes are retained in the inventory; none change implementation or package dependencies. The 380-member verified predecessor archive SHA-256 is `4dd0f8333ff95d0c7e50f2a91a028e41122bdf127f5fadf92dd1104eb4589b0c`. The older frozen measurement current archive retains its distinct `e5626334…` identity and is never silently relabeled as this verified archive. The same-runtime accepted/current comparison remains a method control, not a new optimization.

The historical temporary RX-9001 installed consumer directories no longer exist. Retained archives do exist and pass their original pins. RX-9004 must reinstall those original archives into new isolated consumers and capture the resulting absolute paths in a new run identity manifest, preserving RX-9001's immutable manifest/method. Missing ephemeral directories are preparation work, not a contract violation or reason to change the frozen measurement recipe. No performance collector was executed during this review.

An initial audit script path error is preserved in [attempts](attempts.json): it looked for a nonexistent predecessor archive/validation basename. Inspection found the actual retained `closing-core.tar.gz`; correcting the audit path passes. This is an audit-fixture mistake, not a runtime or candidate defect.

The parent supplied the fresh RX-9003 archive and its actual installed consumer after the guarded full candidate check. The final audit passes against the fresh durable archive and all 380 installed package members. Its complete archive is byte-identical to both RX-9001 and RX-9002 closing verified archives; SHA-256 remains `4dd0f8333ff95d0c7e50f2a91a028e41122bdf127f5fadf92dd1104eb4589b0c`. Final reproduction: `python3 docs/evidence/RX-9003/identity/audit.py --candidate docs/evidence/RX-9003/verification/verified-core.tar.gz --consumer /tmp/raveldex-rx9003-20261105/verification/candidate/consumer/node_modules/@vmitsaras/raveldex`. The [raw final output](final-output.txt) and inventory bind this actual candidate; the earlier [retained-candidate result](initial-audit.json) remains separate.

**Pass, no actionable artifact or source drift finding.** This is independent AC04 identity evidence; the parent records the separate full-check result. No clean-head, remote-CI, new speed gain, future environment equivalence or retained/peak heap claim follows.
