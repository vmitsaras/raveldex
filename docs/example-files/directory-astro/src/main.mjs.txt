import '@vmitsaras/raveldex/addons/ui/directory.css';
import './style.css';
import { loadStaticSearch } from '@vmitsaras/raveldex-astro/client';
import { configuration } from '../configuration.mjs';
import { createDirectorySearch } from './search.mjs';
const root=document.querySelector('[data-directory-root]');
const options={root,status:document.querySelector('[data-directory-status]'),retry:document.querySelector('[data-directory-retry]'),urlStatus:document.querySelector('[data-directory-url-status]'),urlRetry:document.querySelector('[data-directory-url-retry]'),load:async signal=>{
  const owned=await loadStaticSearch({manifestUrl:new URL(import.meta.env.BASE_URL+'raveldex/manifest.json',location.origin).href,expectedBuildId:root.dataset.buildId,configuration:configuration(),signal});
  try{const documents=await owned.loadDocuments({signal});return{engine:owned.engine,documents,dispose:()=>owned.dispose()};}catch(error){await owned.dispose();throw error;}
}};
let search,epoch=0,stopped=Promise.resolve();
function initialize(){search=createDirectorySearch(options);}
initialize();
window.addEventListener('pagehide',()=>{epoch++;const previous=search;search=undefined;stopped=Promise.all([stopped,previous?.destroy()]);});
window.addEventListener('pageshow',event=>{if(event.persisted){const ticket=++epoch;void stopped.then(()=>{if(ticket===epoch)initialize();});}});
