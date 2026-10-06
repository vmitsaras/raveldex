import { Admission, has, keysOnly, ownArray, ownObject, scanUnicode, stringValue } from './data.js';
import { bound, invalid } from '../errors/error.js';
import { analyzeValue } from '../analyzer/basic.js';
import type { AnalysisStep } from '../analyzer/basic.js';
import { captureScalar } from './record.js';
import type { Limits } from '../limits/limits.js';
import type { OwnedSchema, Query, Variant } from './types.js';

export type OwnedQuery = Exclude<Query, { readonly kind: 'extension' }>;

/** Own raw query data now; content analysis/canonical evaluation happen later. */
export function captureQuery(input: unknown, schema: OwnedSchema, limits: Limits, admission = new Admission(limits.maxAdmissionEntries)): OwnedQuery {
  let nodes = 0;
  let lexicalUnits = 0;
  let stringUnits = 0;
  const ancestors = new Set<object>();
  function string(value: unknown, lexical: boolean, path: string): string {
    const text = stringValue(value, limits.maxQueryCodeUnits, 'INVALID_QUERY', path);
    stringUnits += text.length;
    bound(stringUnits, limits.maxQueryCodeUnits, 'query.strings');
    if (lexical) {
      lexicalUnits += text.length;
      bound(lexicalUnits, limits.maxQueryLexicalCodeUnits, 'query.lexical');
    }
    return text;
  }
  function fields(value: unknown, path: string): readonly string[] {
    const names = ownArray(value, limits.maxTextFields, 'INVALID_QUERY', path, admission);
    if (!names.length) invalid('INVALID_QUERY', path);
    const seen = new Set<string>();
    return Object.freeze(names.map((name) => {
      const selected = string(name, false, path);
      if (!has(schema.text, selected) || seen.has(selected)) invalid('INVALID_QUERY', path);
      seen.add(selected);
      return selected;
    }));
  }
  function node(value: unknown, depth: number, path: string): OwnedQuery {
    bound(++nodes, limits.maxQueryNodes, 'query.nodes');
    bound(depth, limits.maxQueryDepth, 'query.depth');
    const data = ownObject(value, 'INVALID_QUERY', path, admission);
    if (ancestors.has(value as object)) invalid('INVALID_QUERY', path);
    ancestors.add(value as object);
    const kind = string(data.kind, false, `${path}.kind`);
    let result: OwnedQuery;
    switch (kind) {
      case 'text': {
        keysOnly(data, ['kind', 'text', 'operator', 'fields'], 'INVALID_QUERY', path);
        const operator = has(data, 'operator') ? string(data.operator, false, `${path}.operator`) : 'and';
        if (operator !== 'and' && operator !== 'or') invalid('INVALID_QUERY', `${path}.operator`);
        result = { kind, text: string(data.text, true, `${path}.text`), operator,
          ...(has(data, 'fields') ? { fields: fields(data.fields, `${path}.fields`) } : {}) };
        break;
      }
      case 'group': {
        keysOnly(data, ['kind', 'variants', 'fields'], 'INVALID_QUERY', path);
        const variants = ownArray(data.variants, limits.maxVariantsPerGroup, 'INVALID_QUERY', `${path}.variants`, admission);
        if (!variants.length) invalid('INVALID_QUERY', `${path}.variants`);
        const owned: Variant[] = variants.map((variant, i) => {
          const variantPath = `${path}.variants[${i}]`;
          const item = ownObject(variant, 'INVALID_QUERY', variantPath, admission);
          keysOnly(item, ['text', 'match', 'weight'], 'INVALID_QUERY', variantPath);
          const match = string(item.match, false, `${variantPath}.match`);
          if (match !== 'exact' && match !== 'prefix') invalid('INVALID_QUERY', `${variantPath}.match`);
          const weight = has(item, 'weight') ? item.weight : 1;
          if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0 || weight > 1) invalid('INVALID_QUERY', `${variantPath}.weight`);
          return Object.freeze({ text: string(item.text, true, `${variantPath}.text`), match, weight });
        });
        result = { kind, variants: Object.freeze(owned), ...(has(data, 'fields') ? { fields: fields(data.fields, `${path}.fields`) } : {}) };
        break;
      }
      case 'and': case 'or': {
        keysOnly(data, ['kind', 'children'], 'INVALID_QUERY', path);
        const children = ownArray(data.children, limits.maxQueryNodes, 'INVALID_QUERY', `${path}.children`, admission);
        if (!children.length) invalid('INVALID_QUERY', `${path}.children`);
        result = { kind, children: Object.freeze(children.map((child, i) => node(child, depth + 1, `${path}.children[${i}]`))) };
        break;
      }
      case 'not':
        keysOnly(data, ['kind', 'child'], 'INVALID_QUERY', path);
        result = { kind, child: node(data.child, depth + 1, `${path}.child`) };
        break;
      case 'eq': {
        keysOnly(data, ['kind', 'field', 'value'], 'INVALID_QUERY', path);
        const name = string(data.field, false, `${path}.field`);
        const field = schema.metadata[name];
        if (!field) invalid('INVALID_QUERY', `${path}.field`);
        const scalar = captureScalar(data.value, field, limits, 'INVALID_QUERY', `${path}.value`);
        if (typeof scalar === 'string') string(scalar, false, `${path}.value`);
        result = { kind, field: name, value: scalar };
        break;
      }
      case 'all': case 'none':
        keysOnly(data, ['kind'], 'INVALID_QUERY', path);
        result = { kind };
        break;
      case 'extension':
        keysOnly(data, ['kind', 'capability', 'version', 'payload'], 'INVALID_QUERY', path);
        if (typeof data.capability !== 'string' || !data.capability.length || !Number.isSafeInteger(data.version) || (data.version as number) < 1 || !has(data, 'payload')) invalid('INVALID_QUERY', path);
        return invalid('MISSING_CAPABILITY', path);
      default: return invalid('INVALID_QUERY', path);
    }
    ancestors.delete(value as object);
    return Object.freeze(result);
  }
  // A primitive shorthand has no input object properties to inspect/capture.
  if (typeof input === 'string') {
    bound(1, limits.maxQueryNodes, 'query.nodes');
    bound(1, limits.maxQueryDepth, 'query.depth');
    return Object.freeze({ kind: 'text', text: string(input, true, 'query'), operator: 'and' });
  }
  return node(input, 1, 'query');
}

export interface QueryStep extends AnalysisStep { readonly leaf?: OwnedQuery; readonly variantIndex?: number }

/** Validate lexical contents using basic-v1; no retrieval or Boolean evaluator. */
export function* analyzeQuery(query: OwnedQuery, schema: OwnedSchema, limits: Limits): Generator<QueryStep> {
  let tokens = 0;
  const groups = new Set<string>();
  const queryLimits = { ...limits, maxTextCodeUnitsPerValue: limits.maxQueryLexicalCodeUnits };
  function groupKey(fields: readonly string[] | undefined, variants: readonly (readonly [string, string, number])[]): string {
    const names = [...(fields ?? Object.keys(schema.text))].sort();
    const alternatives = [...new Set(variants.map((variant) => JSON.stringify(variant)))].sort();
    return JSON.stringify([names, alternatives]);
  }
  function addGroup(key: string): void {
    groups.add(key);
    bound(groups.size, limits.maxQueryGroups, 'query.groups');
  }
  function* walk(leaf: OwnedQuery): Generator<QueryStep> {
    switch (leaf.kind) {
      case 'text':
        for (const step of analyzeValue(leaf.text, 0, queryLimits, 'INVALID_QUERY')) {
          if (step.token) {
            bound(++tokens, limits.maxQueryTokens, 'query.tokens');
            addGroup(groupKey(leaf.fields, [[step.token.term, 'exact', 1]]));
          }
          yield { ...step, leaf };
        }
        break;
      case 'group': {
        const variants: (readonly [string, string, number])[] = [];
        for (let i = 0; i < leaf.variants.length; i++) {
          const variant = leaf.variants[i]!;
          let count = 0;
          for (const step of analyzeValue(variant.text, 0, queryLimits, 'INVALID_QUERY')) {
            if (step.token) {
              bound(++tokens, limits.maxQueryTokens, 'query.tokens');
              if (++count > 1) invalid('INVALID_QUERY', 'query.variants');
              if (variant.match === 'prefix' && [...step.token.term].length < limits.minPrefixCodePoints) invalid('INVALID_QUERY', 'query.prefix');
              variants.push([step.token.term, variant.match, variant.weight ?? 1]);
            }
            yield { ...step, leaf, variantIndex: i };
          }
          if (count !== 1) invalid('INVALID_QUERY', 'query.variants');
        }
        addGroup(groupKey(leaf.fields, variants));
        break;
      }
      case 'and': case 'or': for (const child of leaf.children) yield* walk(child as OwnedQuery); break;
      case 'not': yield* walk(leaf.child as OwnedQuery); break;
      case 'eq': if (typeof leaf.value === 'string') yield* scanUnicode(leaf.value, 'INVALID_QUERY', 'query.value'); break;
      case 'all': case 'none': break;
    }
  }
  yield* walk(query);
}
