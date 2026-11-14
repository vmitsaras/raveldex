import { createDirectory, connectDirectoryURL } from '@vmitsaras/raveldex/addons/ui/directory';
import type { DirectoryState, DirectoryURLHost } from '@vmitsaras/raveldex/addons/ui/directory';
import type { Raveldex } from '@vmitsaras/raveldex';
declare const engine: Raveldex;
declare const host: DirectoryURLHost;
const directory = createDirectory({ engine, groups: [{ field: 'kind', values: ['', 'guide'] }] });
const state: DirectoryState = { text: '', filters: { kind: ['guide'] }, page: 1 };
void directory.restore(state);
void directory.update({ filters: { kind: [] } });
void directory.setPage(2);
directory.subscribe(snapshot => {
  const total: number | undefined = snapshot.result?.total;
  void total;
  // @ts-expect-error snapshots are immutable
  snapshot.state.page = 9;
  // @ts-expect-error selected arrays are readonly
  snapshot.state.filters.kind?.push('guide');
});
const binding = connectDirectoryURL({ controller: directory, host, parameters: { query: 'q', page: 'page', filters: { kind: 'kind' } } });
void binding.read(); binding.write(); binding.destroy(); directory.destroy();
// @ts-expect-error string values only
void directory.update({ filters: { kind: [null] } });
// @ts-expect-error mode is explicit
createDirectory({ engine, mode: 'phrase' });
// @ts-expect-error URL host cannot be discovered implicitly
connectDirectoryURL({ controller: directory, parameters: { query: 'q', page: 'p', filters: {} } });
