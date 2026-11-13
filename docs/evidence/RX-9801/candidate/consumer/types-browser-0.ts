import { mountRaveldexDirectoryCards } from '@vmitsaras/raveldex/addons/ui/directory/cards';
import type { DirectoryCardDocument } from '@vmitsaras/raveldex/addons/ui/directory/cards';
import type { DirectoryHandle } from '@vmitsaras/raveldex/addons/ui/directory';
declare const controller: DirectoryHandle;
const documents: readonly DirectoryCardDocument[] = [{ id: 'one', title: 'Resource', url: '/resource/', excerpt: 'Description', category: 'Guide', breadcrumb: ['Library', 'Walking'], date: 'November 2026', fields: [{ name: 'Length', value: '5 km' }], image: { src: '/image.jpg', alt: '', width: 480, height: 320 } }];
const view = mountRaveldexDirectoryCards({ root: document.body, controller, documents, groups: [], presentation: { layout: 'grid', density: 'compact', images: false } });
view.setPresentation({ layout: 'cards' });
const presentation = view.getPresentation();
// @ts-expect-error presentation snapshots are readonly
presentation.images = true;
void view.search('word'); void view.clear(); view.destroy();
// @ts-expect-error arbitrary HTML renderers are not part of the display contract
mountRaveldexDirectoryCards({ root: document.body, controller, documents, groups: [], render: () => '<p>unsafe</p>' });
// @ts-expect-error each image must explicitly declare its alternative
const unnamed: DirectoryCardDocument = { id: 'one', title: 'One', url: '/', image: { src: '/image.png', width: 40, height: 30 } };
// @ts-expect-error view layouts are a finite semantic presentation choice
view.setPresentation({ layout: 'masonry' });
void unnamed;
