import { analyzeValue, BASIC_ANALYZER } from './basic.js';
import type { AnalysisStep } from './basic.js';
import type { AnalyzerDescriptor, OwnedConfiguration } from '../contracts/types.js';
import { scanUnicode } from '../contracts/data.js';
import { bound, invalid } from '../errors/error.js';
import type { ErrorCode } from '../errors/error.js';
import type { Limits } from '../limits/limits.js';
import { WorkBudget } from '../limits/work.js';
import { runIdentifierAnalysis } from './identifier.js';

export type AnalysisMode = 'index' | 'query' | 'phrase';
export type AnalysisRunner = (value: string, valueIndex: number, limits: Limits, code?: ErrorCode, mode?: AnalysisMode) => Generator<AnalysisStep>;

/** One scope per complete operation, reused by every value/provider reanalysis.
 * Core owns segmentation, dense positions and original coordinates. Optional
 * code transforms one normalized term and cannot synthesize source positions. */
export function createAnalysis(configuration: OwnedConfiguration, check?: () => void): AnalysisRunner {
  if (configuration.analyzer.id === BASIC_ANALYZER.id) return analyzeValue;
  const registration = configuration.capabilities?.providers[`analyzer:${configuration.analyzer.id}`];
  if (!registration?.analyzer || registration.analyzer.id !== configuration.analyzer.id) invalid('MISSING_CAPABILITY', 'analysis.analyzer');
  const handle = registration.analyzer, budget = new WorkBudget(registration.manifest.limits.maxWorkUnits);
  if (handle.kind === 'identifier-tokenizer') return (value, valueIndex, limits, code = 'INVALID_RECORD', mode = 'index') =>
    runIdentifierAnalysis(handle, budget, value, valueIndex, limits, code, mode, check);
  return function* (value, valueIndex, limits, code = 'INVALID_RECORD') {
    for (const step of analyzeValue(value, valueIndex, limits, code)) {
      if (!step.token) { yield step; continue; }
      yield { workUnits: step.workUnits };
      const cursor = handle.transform(step.token.term);
      let term: string;
      try {
        for (;;) {
          const transformed = cursor.next();
          check?.();
          if (transformed.done) { term = transformed.value; break; }
          budget.charge(transformed.value.workUnits); yield transformed.value;
        }
      } finally { try { cursor.return(''); } catch { /* Preserve operation failure/stop. */ } }
      if (typeof term !== 'string' || !term.length) invalid('INCOMPATIBLE_CAPABILITY', 'analysis.term');
      bound(term.length, limits.maxTermCodeUnits, 'analysis.term');
      for (const scan of scanUnicode(term, 'INCOMPATIBLE_CAPABILITY', 'analysis.term')) { budget.charge(scan.workUnits); yield scan; }
      const units = term.length * 2 + 1; budget.charge(units); yield { workUnits: units };
      // Validate canonical text, never stem/re-tokenize an already analyzed term.
      if (term.normalize('NFKC').toLowerCase() !== term) invalid('INCOMPATIBLE_CAPABILITY', 'analysis.term');
      yield { workUnits: 1, token: Object.freeze({ ...step.token, term }) };
    }
  };
}

/** Backward-compatible private fixture contexts can omit the basic runner.
 * A selected optional analyzer always requires its actual operation handle. */
export function requireAnalysis(context: { readonly analyzer: AnalyzerDescriptor; readonly analyze?: AnalysisRunner }): AnalysisRunner {
  if (context.analyze) return context.analyze;
  if (context.analyzer.id === BASIC_ANALYZER.id) return analyzeValue;
  return invalid('INCOMPATIBLE_CAPABILITY', 'analysis.context');
}
