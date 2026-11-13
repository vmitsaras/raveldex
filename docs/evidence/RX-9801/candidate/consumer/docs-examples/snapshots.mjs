import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createSnapshots, createSnapshotRaveldex } from '@vmitsaras/raveldex/adapters/snapshots';

const configuration = () => ({
  schema: { text: { title: {} } },
  addons: [createSourceProvider({ fields: ['title'] })],
});

// nativeQualification is the application's exact-runtime evidence declaration.
// Reading the running version alone does not supply that evidence.
export async function runSnapshotsExample(nativeQualification) {
  const sourceOwner = createRaveldex(configuration());
  let nativeOwner;
  try {
    nativeOwner = createSnapshotRaveldex(configuration(), { nativeQualification });
    await sourceOwner.add({ id: 'a', text: { title: 'Atomic updates' } });
    const source = createSnapshots(sourceOwner);
    const sourceBytes = await source.exportSource();
    await sourceOwner.clear();
    const sourceRestore = await source.restore(sourceBytes);
    await nativeOwner.add({ id: 'a', text: { title: 'Atomic updates' } });
    const native = createSnapshots(nativeOwner);
    const nativeBytes = await native.exportNative();
    await nativeOwner.clear();
    const nativeRestore = await native.restore(nativeBytes);
    return {
      sourceRestore, nativeRestore,
      sourcePage: await sourceOwner.search('atomic'),
      nativePage: await nativeOwner.search('atomic'),
    };
  } finally {
    await sourceOwner.dispose();
    await nativeOwner?.dispose();
  }
}
