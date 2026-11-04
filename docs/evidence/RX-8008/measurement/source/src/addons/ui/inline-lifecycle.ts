/** Private preset seam; it is deliberately absent from the inline entry exports. */
export interface InlinePresentation {
  readonly suspend: (reset: boolean) => void;
  readonly resume: () => void;
  readonly focus: () => void;
}
export interface InlineParts {
  readonly shell: HTMLElement;
  readonly form: HTMLFormElement;
  readonly facets: HTMLElement;
  readonly feedback: readonly HTMLElement[];
  readonly input: HTMLInputElement;
}
interface InlineHost {
  readonly active: () => boolean;
  readonly layout: (parts: InlineParts) => void;
  readonly connect: (presentation: InlinePresentation) => void;
}
const hosts = new WeakMap<HTMLElement, InlineHost>();

export function prepareInlineHost(root: HTMLElement, host: InlineHost): () => void {
  hosts.set(root, host);
  return () => { if (hosts.get(root) === host) hosts.delete(root); };
}
export function inlineHost(root: HTMLElement): InlineHost | undefined { return hosts.get(root); }
