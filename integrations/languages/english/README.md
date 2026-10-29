# Raveldex English analyzer

This private ESM artifact independently packages Raveldex's explicit English
Porter 1980 analyzer. It has no runtime dependency or import of the core package;
the exact-version core peer supplies the public TypeScript registration type.
The prepared JavaScript bundle contains the language rules and required bounded
helpers. It exports only `createEnglishAnalyzer` and `ENGLISH_ANALYZER`.

Build the repository first, then prepare a new local artifact directory with
`npm run language:pack -- --output /tmp/raveldex-english-candidate`. Preparation
retains the private tarball, a verification log and `english-package.json` with
source, declaration, import-graph and artifact identities. Existing files,
directories and output symlinks are refused. Preparation does not publish.

Install the prepared tarball alongside the exact private core candidate:

```js
import { createRaveldex } from '@vmitsaras/raveldex';
import { createEnglishAnalyzer, ENGLISH_ANALYZER } from '@vmitsaras/raveldex-english';

const engine = createRaveldex({
  schema: { text: { title: {} } },
  analyzer: ENGLISH_ANALYZER,
  addons: [createEnglishAnalyzer()],
});
try {
  await engine.add({ id: 'guide', text: { title: 'Indexed documents' } });
  const result = await engine.search('indexing document');
  console.log(result.hits.map(hit => hit.id));
} finally { await engine.dispose(); }
```

Importing or registering the pack does not select it automatically. Explicit
selection applies basic token boundaries and NFKC/lowercase, followed by the
original-paper Porter 1980 rules on ASCII alphabetic tokens longer than two
letters. Unicode/digit-containing and short normalized tokens pass through.
Every original token keeps one position and its full original UTF-16 span.
There are no stop-word holes, multiword graphs or retained corpus side index.
Constant algorithm tables and registration identity are retained code/data.

Stemming intentionally merges some distinct words and is not semantic language
understanding. Original spellings are not preserved as additional exact terms;
query/phrase/evidence analysis must use the selected analyzer. Workers need the
same semantic pack identity. Snapshots enforce analyzer, pack and environment
compatibility. Exact-runtime local qualification does not imply cross-host or
all-Unicode equivalence. The core convenience subpath is another packaging of
the same factory and descriptor, not a second analyzer policy.

The analyzer implements the original 1980 algorithm described at
https://snowballstem.org/algorithms/porter/stemmer.html. It is not Porter2 or the
later BLI/LOGI variant. No external stemmer implementation is included.
