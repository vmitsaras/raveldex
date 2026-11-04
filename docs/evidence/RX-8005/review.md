# RX-8005 independent review

Read-only reviewer inspected actual source, index lifecycle, snapshot wire paths and measurement harnesses; no tests/builds/timing run by reviewer. Separate parent/test/harness ownership prevents shared runtime edits.

No blocking runtime defect found after review. Correct AVL updates/rotations/traversal; immutable path copies; posting-only sharing; construction/empty/clear/mutation/native/source restore integration; charged UTF16 comparisons and ownership cleanup. Required live-index native-export validation is present. Concrete public-query reduced-limit example confirms sorted encounter order can alter group/query error precedence; provisional H+1 seek followed by no-side-effect legacy scan is sound.

Method review confirms isolated normal/diagnostic owners, sequential rotated fresh-process collection, verified excluded warmups, exact native result/error/receipt guards and inventories. It requested sample-count wording correction (18querysamples versus3build/mutation observations), retained initial report/source and corrected rerun. It also requested untimed prior-target source bytes before/after any refused restore; recovery probe now enforces this alongside queries/revision.

Claims require actual raw adjudication: examined-node counter includes revisits+legacy fallback; full labeled narrow controls contain10records; query medians are descriptive18calls/3owners, other costs3observations. No p95, heap, broad speedup, cross-host Unicode or10krestorecapacity claim. Final raw-report review is recorded below.

Independent raw audit passes:24fresh query children plus8fresh recovery children, all zero exit; official harness pins, eight staged child copies, normal/diagnostic package inventories, nine runtime source pins and tarball member hashes match. Each query size has174result equalities/50exacterror equalities including canonical/warmup observations; complete narrow/overlap hitsets are independently labeled10records and absent0. Actual recovery32operations all succeed, encoded source/native byte lengths173314/843201 and SHA identities match, with zero transitions. Refusal checks are not actual refusal observations here.

Confirmed scoped gains and tradeoffs:10k narrow61.206→3.191ms, absent21.803→0.050ms, overlap58.495→3.112ms; build6544.593→7752.476ms, broad-refusal median1.148→2.624ms, replace-original4.140→5.827ms. Narrow examined visits30007→75/work301247→26018; broad visits257→784 with identical257error. All four1k snapshot medians increase, no10kcapacity claim. Coregzip21457→22037.

Paired report SHA-256 `5ad69c842b2605da3d5a9aaad0b9ce3605d320686bcf21f9265cf8d39cd4a331`; recovery `697b0b0b2cc087b0eac0277e1643e4a36cf11c18913849502b907f2b537fcedb`. No remaining source/method/raw-evidence blocker within reviewer scope. Full regression is parent-owned and recorded separately.

Final documentation review found no material factual/method/provenance correction. Parent separately records successful full1198test/installed/site/oracle checks and reconciles provisional status language. No tests/builds/timing were run by the independent reviewer.
