# Explicit text query syntax

`/addons/query-syntax` exports `createQuerySyntax`, `QuerySyntaxError`, `QUERY_SYNTAX_ERROR_CODES` and `QUERY_SYNTAX_POLICY` (`explicit-boolean-fields-v1`). It compiles an explicitly selected syntax to ordinary native query trees. It installs no engine capability or side state and changes neither ordinary string searches nor UI input handling.

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

`createQuerySyntax({ configuration, maxInputCodeUnits?, maxTokens?, maxDepth?, maxWorkUnits? })` returns a frozen `QuerySyntaxParser` with synchronous `parse(input: string): Query`. Supply the same configuration as the destination engine. The factory captures schema, limits, analyzer and declared capability handles without initializing participants; it cannot introspect an engine or prove live provider state. Returned raw query trees and arrays are deeply frozen. The destination engine admits/analyzes the raw tree again and retains its ordinary revision/work/cancellation contract.

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

Whitespace can surround operators, parentheses, colons and a terminal prefix star. Adjacent operands such as `red blue` are errors. Operators are uppercase whole unescaped words; lowercase `and` is a search term. Valid field names followed by a colon take precedence over reserved operator names, so a declared field named `NOT` can use `NOT:red`. Metadata fields are outside this grammar. Bare words can include dots, slashes, internal hyphens and Unicode; native token analysis still applies and may produce multiple required terms.

A backslash quotes the following complete code point literally, including whitespace or an operator letter. Inside quotes it permits embedded quotes/backslashes. It is not JSON/C escaping: backslash followed by `n` yields the letter `n`. Escaped words are neither operators nor field names. A trailing backslash, unmatched quote/group, missing operand/operator, unknown field or malformed UTF-16 is an explicit error, without a fallback to plain search. Empty/whitespace-only input returns `{ kind: 'none' }`, matching no records.

Only one terminal star after an unquoted word is supported. Embedded/repeated stars, wildcard-all, quoted/group postfix stars and the unescaped operator words `XOR`, `NAND`, `NOR`, `NEAR`, `WITHIN` reject. Operator-like punctuation `! & | ~ ^ [ ] { } = < > ?` and leading unescaped `+`/`-` reject; escape a character when it is intended as ordinary native text. No metadata/range, literal/infix, proximity, fuzzy, synonym or weighting syntax is added. Existing typed query APIs remain available separately.

The selected native admission/analyzer validates each complete output tree, including installed phrase capability presence. Native execution prepares selected provider fields and revision-bound state; execution-only failures remain ordinary native errors. A parser configured with a phrase provider for `body` can compile a `title` phrase tree, but that engine rejects the search when no selected `title` phrase provider exists. Parsing is not a search or a live capability probe.

Defaults/maxima are 2,048 raw UTF-16 units, 128 syntax tokens, nesting 16 and 100,000 work units; options only narrow. Captured lower core input/depth bounds apply. Syntax tokens include operators, fields, colons, parentheses, prefix stars and quoted/word operands; EOF is excluded. Nesting counts parentheses, field scopes and NOT from root zero. Native AST/node/token/group/lexical limits also apply independently. Every native-analysis iterator advance is charged even when a trusted analyzer yields zero work; overruns close cursors and return no partial tree. These are synchronous logical bounds, not elapsed-time or heap guarantees. Parsing has no async cancellation; executing the resulting query retains normal cancellation and deadlines.

Parsing throws `QuerySyntaxError`: fixed `code` and `message`, frozen `details.span = { start, end }` in original half-open UTF-16 units, and optional numeric `limit`/`actual` or whitelisted `nativeCode`. EOF errors may have a zero-width span. Native admission/analysis failures use `NATIVE_QUERY_ERROR` over the whole expression; syntax errors identify the offending token or unterminated construct. Missing operands take priority, including a standalone closing parenthesis or an empty opener at EOF; a trailing closing parenthesis is unexpected. An escaped word followed by colon is an invalid field attempt (`UNKNOWN_FIELD`). Diagnostics retain no input, arbitrary exception message/path or cause. Render diagnostic text with text APIs. Factory configuration/option failures retain existing typed `RaveldexError` behavior.

Exported readonly types are `QuerySyntaxOptions`, `QuerySyntaxParser`, `QuerySyntaxErrorCode`, `QuerySyntaxSpan` and `QuerySyntaxErrorDetails`. The fixed codes are `INVALID_INPUT`, `INVALID_UNICODE`, `UNEXPECTED_TOKEN`, `EXPECTED_OPERAND`, `EXPECTED_OPERATOR`, `UNKNOWN_FIELD`, `UNSUPPORTED_OPERATOR`, `UNTERMINATED_QUOTE`, `UNTERMINATED_GROUP`, `INVALID_ESCAPE`, `LIMIT_EXCEEDED`, `WORK_LIMIT_EXCEEDED` and `NATIVE_QUERY_ERROR`.

Workers receive the existing native AST envelope; no parser host registration or snapshot codec is needed. Snapshot/analyzer/provider compatibility remains native. Importing or creating the parser starts no host work and retains no corpus. Trusted callbacks are not sandboxed. Installed/package and logical cost evidence does not imply new manual AT/browser qualification or memory/copy peaks. See the [adopted grammar and bounds](../specs/QUERY_SYNTAX.md).
