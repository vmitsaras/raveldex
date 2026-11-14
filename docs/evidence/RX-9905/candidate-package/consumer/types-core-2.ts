import { createRaveldex, type Raveldex } from '@vmitsaras/raveldex';
import {
  createSnapshots, createSnapshotRaveldex, currentNodeSnapshotEnvironment,
  SnapshotAdapterError, SNAPSHOT_REASONS,
  type Snapshots, type SnapshotRestoreResult, type NativeSnapshotQualification,
  type NodeSnapshotEnvironment, type SnapshotReason,
} from '@vmitsaras/raveldex/adapters/snapshots';

const environment: NodeSnapshotEnvironment = currentNodeSnapshotEnvironment();
const qualification: NativeSnapshotQualification = {
  profileId: 'typed-exact-runtime', scope: 'exact-node-runtime', environment,
  evidence: ['consumer qualification evidence reference'],
};
const ordinary = createRaveldex({ schema: { text: { body: {} } } });
const native: Raveldex = createSnapshotRaveldex({ schema: { text: { body: {} } } }, { nativeQualification: qualification });
const snapshots: Snapshots = createSnapshots(native, { maxEncodedBytes: 4096 });
const encoded: Promise<string> = snapshots.exportNative({ deadlineMs: 1000 });
const portable: Promise<string> = createSnapshots(ordinary).exportSource();
const restored: Promise<SnapshotRestoreResult> = snapshots.restore('{}');
const reason: SnapshotReason = SNAPSHOT_REASONS[0]!;
const error: SnapshotAdapterError = new SnapshotAdapterError(reason);
void encoded; void portable; void restored; void error;

// @ts-expect-error ordinary facade cannot expose adapter or private state methods
native.exportNative();
// @ts-expect-error snapshots are strings, not an unvalidated object graph
snapshots.restore({ format: 'raveldex-native' });
// @ts-expect-error snapshot selection does not silently qualify an ordinary owner
createSnapshots(ordinary, { nativeQualification: qualification });
// @ts-expect-error attestation needs concrete evidence references
createSnapshotRaveldex({ schema: { text: { body: {} } } }, { nativeQualification: { profileId: 'x', scope: 'exact-node-runtime', environment } });
// @ts-expect-error unqualified profiles cannot be selected as native qualification scope
const unqualified: NativeSnapshotQualification = { profileId: 'x', scope: 'same-host-unqualified', environment, evidence: ['x'] };
// @ts-expect-error environment is immutable captured identity
environment.version = 'replacement';
void unqualified;
