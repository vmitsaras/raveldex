import { createDirectory, connectDirectoryURL } from '@vmitsaras/raveldex/addons/ui/directory';
import { mountRaveldexDirectoryCards } from '@vmitsaras/raveldex/addons/ui/directory/cards';
import { groups, labels, settings } from './configuration.mjs';

// This application owns only owners transferred by load(signal). The view itself
// borrows the controller, and the controller borrows that owner's engine.
export function createCardSearch({ root, status, retry, load, urlStatus, urlRetry, urlState = settings.urlState, presentationControls, layout, density, images }) {
  let owner, controller, view, binding, unobserve, pending, ended = false, epoch = 0, disposal;
  const presentation = () => ({ layout:layout?.value??settings.presentation.layout,density:density?.value??settings.presentation.density,images:images?.checked??settings.presentation.images });
  if(layout)layout.value=settings.presentation.layout;if(density)density.value=settings.presentation.density;if(images)images.checked=settings.presentation.images;
  if(presentationControls)presentationControls.disabled=true;
  const updatePresentation=()=>{ if(!ended&&view)view.setPresentation(presentation()); };
  for(const control of [layout,density,images])control?.addEventListener('change',updatePresentation);
  const say = text => { status.textContent = text; };
  function showURL(connected) {
    if (ended || !connected) return;
    const snapshot=connected.getSnapshot();
    const text=snapshot.status==='error' ? 'Search works, but the address could not be updated. Try updating the search link.'
      : snapshot.issues.length ? 'Some search link values were reset. The current filters are shown.' : '';
    if (urlStatus) { urlStatus.hidden=!text; if (urlStatus.textContent!==text) urlStatus.textContent=text; }
    if (!ended && urlRetry) urlRetry.hidden=snapshot.status!=='error';
  }
  function start() {
    if (ended || owner) return Promise.resolve();
    if (pending) return pending.promise;
    const ticket = ++epoch, abort = new AbortController();
    const job = { cancel: () => abort.abort(), promise: undefined };
    pending = job;
    job.promise = Promise.resolve().then(async () => {
      let candidate, directory, mounted, connected, observe, failed = false;
      const cancelViews = () => { observe?.(); observe=undefined; mounted?.destroy(); connected?.destroy(); directory?.destroy(); };
      job.cancel = () => { abort.abort(); cancelViews(); };
      try {
        if (ended || ticket !== epoch) return;
        retry.hidden = true; say('Loading directory. You can browse the resources below.');
        if (ended || ticket !== epoch) return;
        candidate = await load(abort.signal);
        if (ended || ticket !== epoch) return;
        directory = createDirectory({ engine:candidate.engine,groups,pageSize:settings.pageSize,mode:settings.mode });
        mounted = mountRaveldexDirectoryCards({ root,controller:directory,documents:candidate.documents,groups:labels,debounceMs:settings.debounceMs,presentation:presentation(),
          messages:{label:'Search walking resources',placeholder:'Try maps or weather'} });
        if (ended || ticket !== epoch) return;
        if (urlState) connected = connectDirectoryURL({ controller:directory,host:root.ownerDocument.defaultView,parameters:settings.parameters,history:settings.history });
        if (ended || ticket !== epoch) return;
        if (connected) await connected.read(); else await directory.refresh();
        if (ended || ticket !== epoch) return;
        if (connected) {
          const host=root.ownerDocument.defaultView;
          const update=()=>{ if (!ended && ticket===epoch) showURL(connected??binding); };
          const off=directory.subscribe(update);
          observe=()=>{ off();host.removeEventListener('popstate',update); };
          host.addEventListener('popstate',update);
        }
        // Publish every resource before authored status callbacks can destroy.
        owner=candidate;controller=directory;view=mounted;binding=connected;unobserve=observe;
        candidate=directory=mounted=connected=observe=undefined;
        if(presentationControls)presentationControls.disabled=false;
        showURL(binding);
        if (!ended && ticket===epoch) say('Directory is ready.');
      } catch { failed=true; }
      finally {
        cancelViews();
        await candidate?.dispose();
        if (pending === job) pending=undefined;
        if (failed && !ended && ticket===epoch) {
          retry.textContent='Retry loading directory';
          say('Directory could not load. Retry, or browse the resources below.');
          if (!ended && ticket===epoch) retry.hidden=false;
        }
      }
    });
    return job.promise;
  }
  const click = () => { void start(); };
  const retryURL=()=>{ if (!ended && binding) { binding.write();showURL(binding); } };
  retry.addEventListener('click',click);
  urlRetry?.addEventListener('click',retryURL);
  if (urlStatus) urlStatus.hidden=true;
  if (urlRetry) urlRetry.hidden=true;
  retry.hidden=false;retry.textContent='Enable directory';
  say('Browse the resources below, or enable the directory.');
  function destroy() {
    if (disposal) return disposal;
    let finish, fail; disposal=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
    ended=true;epoch++;
    const previous=owner, previousView=view, previousBinding=binding, previousController=controller, stopObserve=unobserve, work=pending;
    owner=controller=view=binding=unobserve=undefined;
    for(const control of [layout,density,images])control?.removeEventListener('change',updatePresentation);
    if(presentationControls)presentationControls.disabled=true;
    retry.removeEventListener('click',click);urlRetry?.removeEventListener('click',retryURL);stopObserve?.();work?.cancel();previousView?.destroy();previousBinding?.destroy();previousController?.destroy();
    if (urlStatus) urlStatus.hidden=true;
    if (urlRetry) urlRetry.hidden=true;
    retry.hidden=true;say('Directory is closed. Browse the resources below.');
    Promise.all([work?.promise,Promise.resolve().then(()=>previous?.dispose())]).then(finish,fail);
    return disposal;
  }
  return Object.freeze({start,destroy});
}
