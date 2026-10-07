# GitHub tracking

The [milestone list](https://github.com/vmitsaras/raveldex/milestones) and [issues](https://github.com/vmitsaras/raveldex/issues) mirror stable IDs from `roadmap.json`.

## Structure

- Six milestones: N0 native design, N1 core alpha, N2 modular product, N3 hosts/migration, N4 qualification, N5 deferred enhancements.
- Six milestone overview issues with linked task checklists, deliberately not assigned to any GitHub milestone.
- Twenty-one release-track task issues and ten deferred optional-task issues.
- Type, track, and status labels expose ready, waiting, in-progress, blocked, needs-decision, deferred, and done states.

Every task issue includes its objective, prerequisite links, measurable acceptance checklist, governing specs, expected paths, verification method, and actual evidence links when complete. No arbitrary dates or assignees are inferred.

## Milestone membership and progress

Only managed `RX-*` task issues are assigned to their corresponding GitHub milestone. The `N0` through `N5` overview issues summarize their tasks but are not additional work items. They must have `milestone: null`, including when their associated milestone is already complete. Keep their checklist links, labels, human notes, and normal completion rules; do not delete or prematurely close them to change a progress bar.

For the current roadmap, the managed task membership is N0: 2, N1: 6, N2: 6, N3: 4, N4: 3, and N5: 10. For example, two accepted N2 tasks mean 2/6 task progress, not 2/7 including the overview. Derive live counts from the manifest and the actual issue inventory; these examples are not stored completion percentages.

GitHub's milestone display includes associated issues and pull requests, not just our managed task IDs. Unrelated items can therefore change its denominator. Do not detach unrelated issues or pull requests automatically. The overview checklist continues to report accepted manifest tasks only.

### Synchronizer invariants

- For a task, send its resolved GitHub milestone number. For an overview, send explicit `milestone: null`. Omitting the property on an update does not remove an old association.
- Normalize both the pre-update comparison and final read-back comparison with `(issue.milestone?.number ?? null)`. Otherwise an unassigned overview can trigger repeated writes or a false mismatch between `undefined` and `null`.
- Discover and update existing overview issues through their stable managed markers. The first run after this repair removes legacy milestone associations; it must not recreate issues, change task acceptance, reopen completed tasks, or reset milestone completion.
- A second run with an unchanged manifest and remote inventory performs zero writes. Keep existing ownership/collision protections and preserve human notes and unrelated labels.

### Verification and Codex maintenance

Before changing tracking behavior, inspect `test/tooling/tracking.test.mjs`. Its in-memory REST boundary should represent an unassigned issue as `milestone: null`, rather than only `{ number: null }`, when testing GitHub's actual response shape.

Required regression scenarios are fresh overview creation without milestone membership; migration of an already-assigned overview; unchanged task assignments and closed states; zero-write repeat synchronization; and rejection when read-back still assigns an overview despite a successful PATCH response. Preserve the existing rule that an overview and its milestone close only when all their manifest tasks are done.

Run the focused tracking tests, `npm run check`, and `npm run tracking:preview` before accepting a change. After the accepted change reaches `main`, inspect the `Sync roadmap tracking` workflow and its final issue read-back. Verify the overview's absent association and every managed task's expected milestone, including closed tasks. Do not change `roadmap.json` merely to repair these associations; regenerate roadmap documents only when the manifest actually changes.

GitHub owns the rendered progress bar; this script does not write a percentage. If the UI still disagrees with verified memberships, completed issue states, and API counts after refresh, record the discrepancy as a separate GitHub display/counter issue. Do not promise that detaching an overview will repair GitHub's cache, or reopen/reclose genuine tasks just to force a display refresh.

## Source of truth

Update `docs/planning/roadmap.json` and regenerate the documents before changing a task's status. The `Sync roadmap tracking` GitHub Actions workflow runs on relevant accepted `main` changes or by manual dispatch on `main`. It validates the repository first, then uses only `contents: read` and `issues: write` on this repository.

The workflow creates missing owned labels/milestones/issues, updates managed issue sections, preserves human notes outside issue markers and unrelated labels, and reads back the result. Milestone titles/descriptions/state are generated as a whole from the roadmap; put human discussion in the overview issue's notes or comments. Stable HTML markers prevent duplicates across repeated runs. It does not create a GitHub Project board, post discussion comments, publish a package, or modify code.

If a tracked issue is manually closed while its manifest task remains unfinished, synchronization fails clearly instead of reopening it. Reconcile the manifest/evidence or explicitly reopen the mistaken closure. Duplicate markers, unmanaged title collisions, or missing evidence also require explicit repair; they are not silently adopted.

## Commands

```sh
npm run tracking:preview
```

Preview is local and makes no network calls. Applying synchronization is an explicit remote write:

```sh
npm run tracking:sync
```

The hosted workflow supplies temporary `GITHUB_TOKEN` and `GITHUB_REPOSITORY`; no personal token, custom secret, or credential file is needed. A maintainer running it locally must supply an authorized repository token without committing or logging it.

## Completion rules

Only manifest tasks marked `done` with existing evidence may be reflected as closed. Milestone overviews and milestones close when every contained task is done. N5 stays open/deferred until separately selected. Closing an overview does not implement or verify its tasks.

The bootstrap creates real tracking items as part of initialization. Links and workflow verification are recorded in `docs/evidence/BOOTSTRAP_VERIFICATION.md` after remote read-back. The workflow job summary also contains a linked table and logs a nonsecret `TRACKING_JSON` mapping of IDs to issue/milestone numbers.

## API references

The implementation follows GitHub's [milestone endpoints](https://docs.github.com/en/rest/issues/milestones), [issue endpoints](https://docs.github.com/en/rest/issues/issues), [label endpoints](https://docs.github.com/en/rest/issues/labels), and [workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions). Sync requests use the versioned REST API and serialized writes; failed mutations are not blindly retried.

## Verified GitHub locations

| Milestone | Milestone page | Overview issue |
| --- | --- | --- |
| N0 | [N0](https://github.com/vmitsaras/raveldex/milestone/1) | [#1](https://github.com/vmitsaras/raveldex/issues/1) |
| N1 | [N1](https://github.com/vmitsaras/raveldex/milestone/2) | [#2](https://github.com/vmitsaras/raveldex/issues/2) |
| N2 | [N2](https://github.com/vmitsaras/raveldex/milestone/3) | [#3](https://github.com/vmitsaras/raveldex/issues/3) |
| N3 | [N3](https://github.com/vmitsaras/raveldex/milestone/4) | [#4](https://github.com/vmitsaras/raveldex/issues/4) |
| N4 | [N4](https://github.com/vmitsaras/raveldex/milestone/5) | [#5](https://github.com/vmitsaras/raveldex/issues/5) |
| N5 | [N5](https://github.com/vmitsaras/raveldex/milestone/6) | [#6](https://github.com/vmitsaras/raveldex/issues/6) |

Task links below are recorded from actual created issues. Live state is governed by the canonical roadmap and issue read-back, not a duplicated status table.

| Task | GitHub issue |
| --- | --- |
| RX-0001 | [#7](https://github.com/vmitsaras/raveldex/issues/7) |
| RX-0002 | [#8](https://github.com/vmitsaras/raveldex/issues/8) |
| RX-1001 | [#9](https://github.com/vmitsaras/raveldex/issues/9) |
| RX-1002 | [#10](https://github.com/vmitsaras/raveldex/issues/10) |
| RX-1003 | [#11](https://github.com/vmitsaras/raveldex/issues/11) |
| RX-1004 | [#12](https://github.com/vmitsaras/raveldex/issues/12) |
| RX-1005 | [#13](https://github.com/vmitsaras/raveldex/issues/13) |
| RX-1006 | [#14](https://github.com/vmitsaras/raveldex/issues/14) |
| RX-2001 | [#15](https://github.com/vmitsaras/raveldex/issues/15) |
| RX-2002 | [#16](https://github.com/vmitsaras/raveldex/issues/16) |
| RX-2003 | [#17](https://github.com/vmitsaras/raveldex/issues/17) |
| RX-2004 | [#18](https://github.com/vmitsaras/raveldex/issues/18) |
| RX-2005 | [#19](https://github.com/vmitsaras/raveldex/issues/19) |
| RX-2006 | [#20](https://github.com/vmitsaras/raveldex/issues/20) |
| RX-3001 | [#21](https://github.com/vmitsaras/raveldex/issues/21) |
| RX-3002 | [#22](https://github.com/vmitsaras/raveldex/issues/22) |
| RX-3003 | [#23](https://github.com/vmitsaras/raveldex/issues/23) |
| RX-3004 | [#24](https://github.com/vmitsaras/raveldex/issues/24) |
| RX-4001 | [#25](https://github.com/vmitsaras/raveldex/issues/25) |
| RX-4002 | [#26](https://github.com/vmitsaras/raveldex/issues/26) |
| RX-4003 | [#27](https://github.com/vmitsaras/raveldex/issues/27) |
| RX-A010 | [#28](https://github.com/vmitsaras/raveldex/issues/28) |
| RX-A020 | [#29](https://github.com/vmitsaras/raveldex/issues/29) |
| RX-A030 | [#30](https://github.com/vmitsaras/raveldex/issues/30) |
| RX-A040 | [#31](https://github.com/vmitsaras/raveldex/issues/31) |
| RX-A050 | [#32](https://github.com/vmitsaras/raveldex/issues/32) |
| RX-A060 | [#33](https://github.com/vmitsaras/raveldex/issues/33) |
| RX-A070 | [#34](https://github.com/vmitsaras/raveldex/issues/34) |
| RX-A080 | [#35](https://github.com/vmitsaras/raveldex/issues/35) |
| RX-A090 | [#36](https://github.com/vmitsaras/raveldex/issues/36) |
| RX-A100 | [#37](https://github.com/vmitsaras/raveldex/issues/37) |

`github-links.json` records verified issue numbers for direct links in generated docs. New tasks fall back to issue search until their created numbers are recorded; synchronization itself discovers owned issues from stable markers.
