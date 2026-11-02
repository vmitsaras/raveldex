# Explicit text query syntax

Use this parser when your application should accept expressions such as `title:"atomic updates" AND body:replac*`. Parse the input yourself, then pass the resulting typed query to the engine. Ordinary string searches and the built-in UI do not enable this syntax automatically.

`/addons/query-syntax` exports `createQuerySyntax`, `QuerySyntaxError`, `QUERY_SYNTAX_ERROR_CODES` and `QUERY_SYNTAX_POLICY` (`explicit-boolean-fields-v1`). Run this example in an installed ESM application:

```js
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createQuerySyntax } from '@vmitsaras/raveldex/addons/query-syntax';

const configuration = {
  schema: { text: { title: {}, body: {} } },
  addons: [createSourceProvider({ fields: ['title'] }), createSourcePhrases({ fields: ['title'] })],
};
const parser = createQuerySyntax({ configuration });
const engine = createRaveldex(configuration);
try {
  await engine.add({ id: 'guide', text: { title: 'Atomic updates', body: 'Replace one complete record.' } });
  const query = parser.parse('title:"atomic updates" AND body:replac*');
  const page = await engine.search(query);
  console.log(page.total, page.hits[0].id); // 1 guide
} finally {
  await engine.dispose();
}
```

The example prints `1 guide`. The title matches the phrase `atomic updates`, and the body contains a term beginning with `replac`. Both conditions must match. The phrase providers are installed for `title`, where this example uses a phrase.

`createQuerySyntax({ configuration, maxInputCodeUnits?, maxTokens?, maxDepth?, maxWorkUnits? })` returns a frozen parser with synchronous `parse(input: string): Query`. Give it the same configuration as the engine. It copies the schema, limits, analyzer and declared capability handles, but does not initialize providers or inspect a live engine.

The returned query and arrays are deeply frozen. The engine still validates and analyzes that query when you submit it, using its normal revision, work, cancellation and deadline rules.

| Syntax | Native meaning |
| --- | --- |
| `red` | A native text leaf, retaining raw text for the selected analyzer. |
| `red AND blue` | Both operands required. Operators must be explicit. |
| `red OR blue AND green` | OR of red and the AND group; AND binds more tightly. |
| `NOT red` | Native complement; NOT binds most tightly and contributes no score. |
| `(red OR blue) AND green` | Parenthesized grouping. Same-level operator chains form n-ary native nodes. |
| `title:red` or `title:(red OR blue)` | Exact declared text-field scope; nearest nested field scope wins. |
| `"red blue"` | Existing strict `phrases` extension, version 1; no raw substring semantics. |
| `replac*` | Native prefix group, exact weight 1; native single-token/minimum-prefix limits apply. |

Write operators explicitly: `red blue` is an error, while `red AND blue` is valid. Operators are uppercase, whole, unescaped words; lowercase `and` is an ordinary search term. Whitespace may surround operators, parentheses, colons and a final prefix star.

A declared text-field name followed by a colon takes precedence over an operator name, so a text field named `NOT` can use `NOT:red`. Metadata fields are not part of this grammar. Bare words may include dots, slashes, internal hyphens and Unicode, but the selected analyzer still determines their terms and may require more than one.

A backslash quotes the following complete code point literally, including whitespace or an operator letter. Inside quotes it permits embedded quotes/backslashes. It is not JSON/C escaping: backslash followed by `n` yields the letter `n`. Escaped words are neither operators nor field names. A trailing backslash, unmatched quote/group, missing operand/operator, unknown field or malformed UTF-16 is an explicit error, without a fallback to plain search. Empty/whitespace-only input returns `{ kind: 'none' }`, matching no records.

Only one terminal star after an unquoted word is supported. Embedded/repeated stars, wildcard-all, quoted/group postfix stars and the unescaped operator words `XOR`, `NAND`, `NOR`, `NEAR`, `WITHIN` reject. Operator-like punctuation `! & | ~ ^ [ ] { } = < > ?` and leading unescaped `+`/`-` reject; escape a character when it is intended as ordinary native text. No metadata/range, literal/infix, proximity, fuzzy, synonym or weighting syntax is added. Existing typed query APIs remain available separately.

A successful parse does not prove that the engine can execute every requested field or capability. For example, the parser may compile a `title` phrase when only `body` has a phrase provider. The engine then rejects that search because `title` lacks the required provider. Parse errors and execution errors remain separate, so handle both.

Defaults/maxima are 2,048 raw UTF-16 units, 128 syntax tokens, nesting 16 and 100,000 work units; options only narrow. Captured lower core input/depth bounds apply. Syntax tokens include operators, fields, colons, parentheses, prefix stars and quoted/word operands; EOF is excluded. Nesting counts parentheses, field scopes and NOT from root zero. Native AST/node/token/group/lexical limits also apply independently. Every native-analysis iterator advance is charged even when a trusted analyzer yields zero work; overruns close cursors and return no partial tree. These are synchronous logical bounds, not elapsed-time or heap guarantees. Parsing has no async cancellation; executing the resulting query retains normal cancellation and deadlines.

Parsing throws `QuerySyntaxError`: fixed `code` and `message`, frozen `details.span = { start, end }` in original half-open UTF-16 units, and optional numeric `limit`/`actual` or whitelisted `nativeCode`. EOF errors may have a zero-width span. Native admission/analysis failures use `NATIVE_QUERY_ERROR` over the whole expression; syntax errors identify the offending token or unterminated construct. Missing operands take priority, including a standalone closing parenthesis or an empty opener at EOF; a trailing closing parenthesis is unexpected. An escaped word followed by colon is an invalid field attempt (`UNKNOWN_FIELD`). Diagnostics retain no input, arbitrary exception message/path or cause. Render diagnostic text with text APIs. Factory configuration/option failures retain existing typed `RaveldexError` behavior.

Exported readonly types are `QuerySyntaxOptions`, `QuerySyntaxParser`, `QuerySyntaxErrorCode`, `QuerySyntaxSpan` and `QuerySyntaxErrorDetails`. The fixed codes are `INVALID_INPUT`, `INVALID_UNICODE`, `UNEXPECTED_TOKEN`, `EXPECTED_OPERAND`, `EXPECTED_OPERATOR`, `UNKNOWN_FIELD`, `UNSUPPORTED_OPERATOR`, `UNTERMINATED_QUOTE`, `UNTERMINATED_GROUP`, `INVALID_ESCAPE`, `LIMIT_EXCEEDED`, `WORK_LIMIT_EXCEEDED` and `NATIVE_QUERY_ERROR`.

For a worker, parse on the calling side and send the resulting typed query through the ordinary query API. No parser registration or snapshot codec is needed on the host. Analyzer, provider and snapshot compatibility rules still apply. Creating the parser starts no host work and keeps no corpus; trusted callbacks are not sandboxed. See [query execution and errors](CORE.md#execution-errors-and-bounds).
