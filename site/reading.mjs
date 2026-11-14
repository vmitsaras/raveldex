import { satteriCreateHighlightFn } from '@astrojs/markdown-satteri';

// Presentation only. The original Markdown remains the package/index source.
export function readingMarkdown(markdown, source, coreRecipe) {
  const insert = (before, addition) => {
    if (markdown.split(before).length !== 2) throw new Error(`Reading section drift: ${source}: ${before}`);
    markdown = markdown.replace(before, addition + before);
  };
  if (source === 'docs/api/GETTING_STARTED.md' || source === 'docs/api/HOSTS.md') {
    const gettingStarted = source.endsWith('GETTING_STARTED.md');
    const steps = gettingStarted ? [
      ['Choose an interface', '/raveldex/examples/'], ['Install Raveldex', '#install-the-package'],
      ['Prepare public records', '#prepare-your-records'], ['Run your first search', '#smallest-core-example'],
    ] : [
      ['Try an interface', '/raveldex/examples/'], ['Prepare public records', '/raveldex/guide/overview/#prepare-your-records'],
      ['Mount a consumer search form', '#mount-a-consumer-search-form'], ['Check ownership and adoption', '#starter-adoption-and-local-checks'],
    ];
    const firstSection = gettingStarted ? '## Choose your search experience' : '## Consumer search interfaces';
    insert(firstSection, `## ${gettingStarted ? 'Start with a working search' : 'Add search to your application'}\n\n<ol data-reading-steps>\n${steps.map(([label, url]) => `<li><a href="${url}">${label}</a></li>`).join('\n')}\n</ol>\n\n`);
  }
  if (source === 'docs/api/CORE.md') {
    insert('Create an engine with', '### Create an engine\n\n');
    insert('| Type / property |', '### Parameters and defaults\n\n');
    insert('You may omit a declared text field', '### Records and retained data\n\n');
    insert('## Methods and results', `### Minimal use\n\nThis complete installed recipe creates an engine, indexes one record, returns its native result and disposes its owner.\n\n\`\`\`js\n${coreRecipe}\`\`\`\n\n### Related recipes\n\n[Copy the core module](/raveldex/example-files/core.mjs), or [choose a complete interface](/raveldex/examples/).\n\n`);
    insert('| Method | Behavior |', '### Signatures\n\n');
    insert('Updates return', '### Returns\n\n');
    insert('Pass `MutationOptions`', '### Options and defaults\n\n');
    insert('## Query shapes', '### Failures and recovery\n\nAn update refusal preserves the prior state. See [execution, errors and bounds](#execution-errors-and-bounds) for error codes, queue order, deadlines and cancellation.\n\n');
  }
  return markdown;
}

const element = (tagName, properties = {}, children = []) => ({ type: 'element', tagName, properties, children });
const text = value => ({ type: 'text', value });
const literal = node => node.type === 'text' ? node.value : (node.children ?? []).map(literal).join('');
const highlight = satteriCreateHighlightFn('shiki', { theme: 'github-light-high-contrast' });
const languages = { js: 'JavaScript', javascript: 'JavaScript', sh: 'Shell', bash: 'Shell', html: 'HTML', css: 'CSS', ts: 'TypeScript', json: 'JSON', text: 'Text' };
export const readingCodePlugin = {
  name: 'reading-code',
  element: {
    filter: ['h2', 'h3', 'pre'],
    async visit(node, ctx) {
      const route = ctx.data.astro?.frontmatter?.route ?? '';
      if (!route.startsWith('guide') && !route.startsWith('reference')) return;
      if (node.tagName !== 'pre') { ctx.data.readingHeading = ctx.textContent(node); return; }
      const code = node.children?.find(child => child.type === 'element' && child.tagName === 'code');
      if (!code) return;
      const original = ctx.textContent(code), lang = code.data?.lang ?? 'text';
      const index = ctx.data.readingCodeIndex = (ctx.data.readingCodeIndex ?? 0) + 1;
      const label = `${ctx.data.readingHeading ?? ctx.data.astro?.frontmatter?.title ?? 'Example'} · ${languages[lang] ?? lang} ${index}`;
      const pre = await (await highlight)(original, lang);
      // Refuse normalization drift. Copy includes the exact Markdown fence bytes.
      const rendered = literal(pre), suffix = original.slice(rendered.length);
      if (!original.startsWith(rendered) || !/^\n*$/.test(suffix)) throw new Error(`Reading code differs: ${label}`);
      const highlightedCode = pre.children.find(child => child.tagName === 'code');
      if (suffix) highlightedCode.children.push(text(suffix));
      pre.properties = { ...pre.properties, tabIndex: 0, role: 'region', 'aria-label': label };
      return element('figure', { className: ['reading-code'], 'data-code-panel': '', 'data-code-text': original }, [
        element('figcaption', {}, [text(label)]),
        element('button', { type: 'button', hidden: true, 'data-copy-code': '', 'aria-label': `Copy ${label}` }, [text('Copy code')]),
        element('button', { type: 'button', hidden: true, 'data-select-code': '' }, [text('Select source')]),
        element('p', { role: 'status', 'aria-live': 'polite', 'data-copy-status': '' }), pre,
      ]);
    },
  },
};
