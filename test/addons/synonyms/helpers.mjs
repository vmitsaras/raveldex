import { createSynonyms } from '../../../dist/addons/synonyms/index.js';
import { setup as base, drain, search, schema } from '../typo/helpers.mjs';
export { drain, search, schema };
export const mappings = [{from:'backup',to:'snapshot'},{from:'checkpoint',to:'snapshot'},{from:'snapshot',to:'archive'},{from:'archive',to:'snapshot'}];
export const options = {fields:['title','body'],vocabularyVersion:'test-v1',mappings};
export const synonyms = (text, fields=['title']) => ({kind:'extension',capability:'synonyms',version:1,payload:{text,fields}});
export const setup = (overrides={}) => base({addons:[createSynonyms(options)],...overrides});
