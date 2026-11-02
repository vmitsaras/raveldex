# Raveldex English analyzer

Use this package to match English word forms such as `indexed`, `indexing` and `index`. It exports `createEnglishAnalyzer` and `ENGLISH_ANALYZER`, using the original Porter 1980 stemming rules.

The JavaScript bundle contains its language rules and helpers, with no runtime import of core. Its TypeScript declarations use public core types through an exact-version peer dependency.

## Install

In an ESM application with Node `>=22`, install matching local files:

```sh
npm install --offline --ignore-scripts --no-audit --no-fund /absolute/artifacts/core/vmitsaras-raveldex-0.1.0-rc.0.tgz /absolute/artifacts/english/vmitsaras-raveldex-english-0.1.0-rc.0.tgz
```

Replace both absolute paths with your local files. The command installs core and the English package, which must both be version `0.1.0-rc.0`. To build them from a checkout, compile with `npm run build`, pack core with `npm pack --ignore-scripts`, then run `node scripts/pack-english.mjs --output NEW_DIRECTORY`.

## Search English word forms

Save this as an `.mjs` file in your installed application and run it with Node. Set both `analyzer` and the add-on registration to select English analysis:

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

The example prints `[ 'guide' ]`: `indexing document` finds the title **Indexed documents**. The engine is disposed when it finishes.

## Matching rules

Importing or registering the pack alone does not select it. When selected, it uses basic token boundaries and NFKC/lowercase, then applies the original Porter 1980 rules to ASCII alphabetic tokens longer than two letters. Short terms and normalized terms containing non-ASCII characters or digits pass through.

Every original token keeps one position and its full original UTF-16 span. Stop words are not removed, and no multiword graphs or extra corpus index are created. The constant rules and registration identity remain part of the package.

Stemming can join distinct words, so check your application's vocabulary and expected results. It does not understand meaning or preserve original spellings as extra exact terms. Queries, phrases and evidence all use the selected analyzer.

## Workers and snapshots

Use the same language-pack identity in the worker. Snapshots check analyzer, pack and environment compatibility. Source snapshots rebuild at the receiver; native snapshots require an exact, application-qualified Node environment. The convenience subpath in core exports the same factory and descriptor, so choose one import path rather than registering both.

The analyzer implements the original 1980 algorithm described at
[the original algorithm description](https://snowballstem.org/algorithms/porter/stemmer.html). It is not Porter2 or the
later BLI/LOGI variant. No external stemmer implementation is included.
