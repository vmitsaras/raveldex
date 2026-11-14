import { createDirectory, connectDirectoryURL } from '@vmitsaras/raveldex/addons/ui/directory';
import type { DirectoryURLHost } from '@vmitsaras/raveldex/addons/ui/directory';
import type { Raveldex } from '@vmitsaras/raveldex';
declare const engine: Raveldex;
const host: DirectoryURLHost = window;
const controller = createDirectory({ engine });
const binding = connectDirectoryURL({ controller, host, history: 'push', parameters: { query: 'q', page: 'page', filters: {} } });
void binding.read(); binding.destroy();
// @ts-expect-error no implicit history policy beyond push/replace
connectDirectoryURL({ controller, host, history: 'automatic', parameters: { query: 'q', page: 'p', filters: {} } });
