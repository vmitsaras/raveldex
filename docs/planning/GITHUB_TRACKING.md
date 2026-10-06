# GitHub tracking

The [milestone list](https://github.com/vmitsaras/raveldex/milestones) and [issues](https://github.com/vmitsaras/raveldex/issues) mirror stable IDs from `roadmap.json`.

## Structure

- Six milestones: N0 native design, N1 core alpha, N2 modular product, N3 hosts/migration, N4 qualification, N5 deferred enhancements.
- Six milestone overview issues with linked task checklists.
- Twenty-one release-track task issues and ten deferred optional-task issues.
- Type, track, and status labels expose ready, waiting, in-progress, blocked, needs-decision, deferred, and done states.

Every task issue includes its objective, prerequisite links, measurable acceptance checklist, governing specs, expected paths, verification method, and actual evidence links when complete. No arbitrary dates or assignees are inferred.

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
