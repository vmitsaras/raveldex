
    import { runBrowserExample } from './docs-examples/browser.mjs';
    import { runWorkerExample } from './docs-examples/worker.mjs';
    window.runCandidateExamples = async () => ({
      browser: await runBrowserExample(document.querySelector('#example-root')),
      worker: await runWorkerExample(new URL('/worker-host-bundle.mjs', location.href)),
    });
  