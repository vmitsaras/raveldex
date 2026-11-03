import '@vmitsaras/raveldex/addons/ui/directory.css';
import '@vmitsaras/raveldex/addons/ui/directory-cards.css';
import './theme.css';
import { createCardSearch } from './controller.mjs';
import { loadResources } from './load.mjs';
const base=new URL('../',import.meta.url), options={root:document.querySelector('[data-directory-root]'),status:document.querySelector('[data-directory-status]'),
  retry:document.querySelector('[data-directory-retry]'),urlStatus:document.querySelector('[data-directory-url-status]'),urlRetry:document.querySelector('[data-directory-url-retry]'),presentationControls:document.querySelector('[data-card-controls]'),layout:document.querySelector('[data-card-layout]'),density:document.querySelector('[data-card-density]'),images:document.querySelector('[data-card-images]'),load:signal=>loadResources(new URL('content.json',base),signal)};
let search,epoch=0,stopped=Promise.resolve();
function initialize(){search=createCardSearch(options);void search.start();}
initialize();
window.addEventListener('pagehide',()=>{epoch++;const previous=search;search=undefined;stopped=Promise.all([stopped,previous?.destroy()]);});
window.addEventListener('pageshow',event=>{if(event.persisted){const ticket=++epoch;void stopped.then(()=>{if(ticket===epoch)initialize();});}});
