# Raveldex — three site design directions

Design exploration · 30 October 2026 · No direction selected

Later owner decision, 30 October 2026: Search Workbench was selected for implementation. The following exploration remains the original comparison; the [implementation contract](../specs/SITE_WORKBENCH.md) and canonical N6 tasks own the selected design.

Raveldex can have a recognizable identity without becoming a large marketing site. Three credible directions emerge from the material already available: **a field guide that teaches**, **a workbench that demonstrates**, and **an assembly manual that explains choices**. Each makes a different promise to the visitor and carries that promise through the homepage, documentation and demo.

This report covers concepts and directional visual ideas. It does not change the website, select a final design, or establish a new implementation task.

## The starting point

The current homepage explains local search, presents a working core example and links to common tasks. The site has useful plain-language documentation and an existing browser demo. These are stronger raw materials than a conventional feature grid or a decorative product illustration.

Direct inspection of the local homepage, Getting started page and loaded demo showed a white background, system typography, blue underlined links, horizontal rules and broad code panels. The documentation uses one simple template. The demo has a different opening structure, with documentation navigation in its footer. Long guides have headings but no persistent section navigation in the inspected template.

**Design inference:** the largest opportunity is a clearer relationship between understanding Raveldex, trying it and finding the next instruction. A shared visual language could make those paths recognizable while giving long-form reading a more deliberate rhythm. This is an interpretation of the existing pages, not a finding from user research.

Keep the direct language, working examples, visible links, explicit limitations and task-based guidance. Give them hierarchy and identity before commissioning new marketing content.

## Shared project frame

| Question | Working answer |
| --- | --- |
| Project | Documentation and demonstration site for a native, modular TypeScript local-search library. |
| Primary audience | Developers evaluating search for an application, then integrating it. Audience priority is inferred from the current content. |
| Secondary audience | Returning users looking up API details, optional capabilities and recovery behavior. |
| Essential message | Start with search over your own records; add the capabilities your application needs explicitly. |
| Desired transformation | From “What is this, and where do I start?” to understanding a small working integration and its next steps. |
| Primary outcome | Reach and understand a usable starting example. Each concept offers a different first step toward that outcome. |
| Desired perception | Approachable in explanation, precise in behavior, deliberate about complexity. |
| Central design question | How can the site make a technically capable search library feel understandable while retaining its explicit contracts and limits? |

The current packages are private and unpublished. Every direction must retain accurate local-artifact installation guidance. A registry-style installation command, public-release badge, customer logo wall or unsupported performance claim would communicate availability or evidence the project does not currently have.

## 1. The Field Guide

**Premise:** Raveldex is a dependable guide from a small search example to a capable integration.

The visitor arrives with a task and leaves knowing what to do next. The dominant mechanism is teaching through worked examples. The personality is thoughtful, warm and technically literate.

### How it could look

Think of a well-edited technical handbook: warm white surfaces, dark ink, a restrained botanical accent and occasional annotation marks. Typographic contrast would distinguish explanatory headings from practical prose and code. An index-tab motif could give guides, examples and reference pages a family resemblance without turning the interface into a literal book.

The distinctive graphic material would come from Raveldex itself: a query, its returned ID, the application record that ID refers to, and an annotation explaining the relationship. Code and expected output would feel like a single worked example. Avoid paper textures, ornamental handwriting and decorative library imagery.

### Experience through the site

| Moment | Visitor question | Direction |
| --- | --- | --- |
| Introduction | What does this add to my application? | A short explanation and an immediate route to Getting started. |
| First example | What do I supply, and what comes back? | Connect the real core example to its expected ID, total and application-owned display data. |
| Task index | What should I read next? | Lead with jobs such as adding a form, choosing snippets or integrating Astro. |
| Guide | Can I follow this without losing context? | Keep setup, explanation and expected outcome together; make the current topic and nearby sections clear. |
| Demo | Can I see this lesson in action? | Present the existing demo as a companion to the guides, with the same identity and an obvious return path. |

**Action path:** Get started → run the example → choose a task. The demo remains available from the beginning.

**Voice:** calm, concrete and generous with explanation. Headings name tasks; annotations explain consequences rather than repeat API names.

**Why it belongs:** the existing natural-language guides, small examples and task index already support this direction. It would amplify work the project has done.

**Responsive invariant:** each explanation stays with the code and outcome it explains. Side annotations become ordinary inline notes; a decorative margin can disappear without losing meaning.

**Interaction and motion:** direct links and optional section navigation do most of the work. No motion is essential. Reading and navigation remain usable without JavaScript.

**Feasibility: feasible.** Essential work is a coherent reading template, typographic hierarchy and a small family of annotations. New photography or illustration is unnecessary.

**Trade-off:** this is the strongest teaching proposition, but immediate product experimentation is secondary. Excessive editorial styling could also make a concise API lookup feel slow.

**Validate first:** can a first-time reader find installation, explain the example's result and choose the next guide? Can a returning reader reach a method without reading the introduction?

## 2. The Search Workbench

**Premise:** understand Raveldex by observing a real query and its results.

The visitor begins uncertain about the product and gains confidence through a bounded demonstration. The dominant mechanism is evidence through use. The personality is direct, precise and active.

### How it could look

Think of a clear working instrument: neutral reading surfaces, a concentrated graphite demonstration area and one bright, functional accent for the query or matched terms. Typography would feel crisp and practical; monospace would identify code and technical values without taking over the prose.

The visual signature is the relationship between a query, matching content and an explanation of the result. Real result titles and highlighted text provide the imagery. Avoid glowing terminal effects, fake activity, animated counters and a full page of dashboard panels.

### Experience through the site

| Moment | Visitor question | Direction |
| --- | --- | --- |
| Introduction | What does it actually do? | Pair a plain proposition with a short route into the real search demo. |
| Query | What should I try? | Offer a few clearly labeled sample searches from the existing corpus, while preserving manual entry and submission. |
| Result | Why is this useful? | Let visitors open the actual usage guide; show true result counts without turning them into speed claims. |
| Explanation | Why did this match? | Offer Inspector as a deliberate deeper action, after ordinary results are understandable. |
| Integration | How do I build this? | Connect the observed behavior to the existing UI recipe and Getting started instructions. |
| Reference | Where are the exact details? | Carry over the same query/result/code language, while keeping reference pages quiet and easy to scan. |

**Action path:** Try search → open a relevant guide → follow the integration example. Getting started remains directly accessible to visitors who want to skip the demo.

**Voice:** invitational and specific: try a query, observe an outcome, learn the relevant setup. Explain what a control changes before asking someone to use it.

**Why it belongs:** the existing demo already searches usage guides and offers results, categories, snippets and Inspector. The site can demonstrate the product with its own useful content.

**Responsive invariant:** query → results → explanation remains the order. Results need useful space before optional diagnostics; narrow screens must not become a stack of instrument panels.

**Interaction and motion:** real search is the central interaction. Preserve composition, focus, stale-response suppression and deliberate status announcements. Static explanation and guide links remain available while the demo loads or if JavaScript fails. Any transition between result states must be optional.

**Feasibility: feasible with constraints.** Linking prominently to the existing demo is the simpler expression. Embedding a working demo on the homepage needs a prototype to establish loading, failure states, lifecycle ownership and cost. A mock search box must never imply live behavior.

**Trade-off:** this makes the product tangible quickly, but adds interaction and maintenance pressure to the first impression. Advanced settings can overwhelm newcomers, and a small guide corpus cannot demonstrate general relevance or large-collection performance.

**Validate first:** can someone complete a sample search, understand the result and find the corresponding setup instructions? Do useful entry points survive slow loading, no results, failure and unavailable JavaScript?

## 3. The Assembly Manual

**Premise:** Raveldex gives applications a core search engine with explicit, understandable extensions.

The visitor arrives expecting a complicated bundle and leaves understanding what core supplies, what stays in the application and what an optional capability requires. The dominant mechanism is explaining parts and their relationships. The personality is systematic, restrained and confident.

### How it could look

Think of an engineering assembly manual: pale neutral surfaces, charcoal typography, fine rules and a single signal accent. Diagrams would use aligned labels and clearly named boundaries. Small technical captions could contrast with plain-language explanations.

The signature is an accurate relationship diagram: application records, the core index, returned IDs, and selected optional providers or hosts. Use visual grouping to explain ownership. Avoid decorative circuit boards, endless blueprint grids and diagrams suggesting that every add-on works without prerequisites.

### Experience through the site

| Moment | Visitor question | Direction |
| --- | --- | --- |
| Introduction | What is the smallest useful system? | Establish the core example and the application data it works with. |
| Ownership | What does the library retain or return? | Explain the distinction between index state, matching IDs and application-owned display records. |
| Capability | What changes when I need more? | Connect a desired outcome, such as snippets, to the documented provider requirements. |
| Host | Where does this run? | Show direct execution, workers and Astro as explicit integration choices. |
| Recipe | What should I implement? | Link to a complete existing recipe rather than inventing a visual configurator. |
| Limits | What should I plan for? | Make compatibility, operation bounds and recovery routes easy to locate. |

**Action path:** understand the core → identify a needed capability → open its recipe. The smallest example remains accessible before the architecture explanation.

**Voice:** explicit about ownership, prerequisites and consequences. Define technical terms before using them as navigation labels.

**Why it belongs:** the distinction between a useful standalone core and explicitly enabled capabilities is central to the documented architecture. Provider requirements and host boundaries supply meaningful graphic material.

**Responsive invariant:** every diagram has a readable text equivalent and a useful linear sequence. On small screens, ownership labels and relationships survive even if connecting lines disappear.

**Interaction and motion:** ordinary links and optional explanations are sufficient. Assembly animation is optional and never the only explanation. There is no drag-and-drop builder or generated configuration in this concept.

**Feasibility: feasible.** Essential work is a small set of reviewed diagrams and consistent capability explanations. A static diagram with a matching text description is the simpler expression.

**Trade-off:** this communicates architectural intent most strongly, but risks exposing too much terminology before visitors achieve a first success. A diagram-led identity also needs ongoing review as capabilities evolve.

**Validate first:** can a newcomer distinguish core from an optional feature, find the prerequisite for snippets and locate a complete example without treating the diagram as a mandatory decision tree?

## Compare the directions

These are qualitative design judgments, not usability-test results.

| Dimension | Field Guide | Search Workbench | Assembly Manual |
| --- | --- | --- | --- |
| First promise | You can learn this | You can see this work | You can understand the parts |
| Main evidence | Worked example and outcome | Real query and useful result | Accurate ownership and prerequisite relationships |
| Visual character | Warm, editorial, annotated | Crisp, concentrated, active | Restrained, technical, diagrammatic |
| Signature material | Code with explanation | Query, match and result | Core, providers and hosts |
| Story intensity | Light | Integrated around the demo | Light, supported by diagrams |
| Best fit | Onboarding and sustained reading | Product evaluation through use | Capability selection and architectural confidence |
| Relative delivery effort | Lower | Higher if embedded | Moderate |
| Main risk | Too quiet or bookish | Too much interface too early | Too much architecture too early |
| Static baseline | Strong | Strong for explanation; live search needs JavaScript | Strong with text equivalents |
| Recognizable on mobile through | Worked-example sequence | Query-to-result sequence | Explicit ownership and labels |

Choose **Field Guide** if the main priority is helping developers integrate Raveldex. Choose **Search Workbench** if the main priority is making its behavior immediately tangible. Choose **Assembly Manual** if the main priority is communicating modularity and control.

No winner is selected: the requested outcome is a set of alternatives. Choosing one dominant direction would make the next stage more coherent than combining all three visual metaphors. Useful shared conventions—readable code, clear navigation and honest status—belong in every option.

## Shared requirements and ideas to leave out

Every viable direction needs a recognizable route between home, guides, API, examples and demo; a readable long-form template; clear current location; and code examples with nearby setup and expected outcomes. Preserve existing deep links and explicit publishable content boundaries.

Accessibility remains part of the concept: semantic reading order, visible focus, keyboard and touch use, zoom/reflow, sufficient contrast, and meaning independent of color or motion. A section index must collapse into a usable small-screen form. Demo styling must preserve existing interaction contracts. These are design requirements, not claims that new designs have passed testing.

The following territories were considered and rejected:

- **A cinematic network of particles:** implies scale or intelligence without explaining the real product, and adds rendering and fallback work.
- **A terminal-only aesthetic:** provides atmosphere but makes prose and navigation carry unnecessary visual friction.
- **A generic SaaS launch page:** pricing, invented social proof and repeated feature cards do not fit the current content or package availability.
- **A documentation command palette as the main idea:** potentially useful navigation, but not a sufficiently distinct concept. The current demo searches five guides, not the entire public site; an all-site search promise would require separate indexing work.

## Evidence, uncertainty and next decision

**Evidence used:** current [homepage source at review](https://github.com/vmitsaras/raveldex/blob/ad42057/site/index.md), [layout](../../site/Layout.astro), [styles](../../site/styles.css), [public page inventory](../../site/pages.mjs), [Getting started](../api/GETTING_STARTED.md), [practical limits](../api/LIMITATIONS.md), [demo source](../../examples/docs-search/index.html), and [site build/publication instructions](../../site/README.md). Local browser inspection covered home, Getting started and the initialized demo. The existing preview on port 4174 was used; no deployment was performed.

**External content precedents:** Pagefind explains its search approach, lists capabilities and links to larger demonstrations; this is useful evidence for connecting explanation to trials. Lit pairs a concise proposition with code and several learning entry points. These are content references, not visual templates, equivalent architectures or evidence of Raveldex performance. Only their homepage text was retrieved for this report. [Pagefind](https://pagefind.app/), [Lit](https://lit.dev/).

**Workflow used:** creative-direction-orchestrator coordinated design-problem-framer and story-led-website-concept. Framing produced the shared brief; concept development was limited to the site's introduction and learning paths, with direct utility preserved for API lookup. Firecrawl retrieved the two external content references. No specialist council, user research or implemented-design validation was performed.

**Unverified assumptions:** developer audience priority, the relative importance of first-time onboarding versus repeat lookup, preferred brand character, and demand for a homepage demo. Existing content supports these as exploration topics, but does not settle them.

The next decision is which first impression should dominate: learning, demonstration or architectural clarity. After that choice, the smallest useful design pass is one homepage, one long guide and one demo view in desktop and narrow-screen form. It should establish a reusable visual grammar before extending across the site.

Proceed to implementation only after that pass shows that a new visitor can identify the offer and a next step, a returning visitor can reach an API topic directly, code and results remain legible at zoom, and the idea survives without optional motion. The workbench option additionally needs a working lifecycle/failure prototype if a homepage embed is chosen. Technical feasibility here is assessed from existing structure and documented behavior; it has not been proved by implementing any of these concepts.
