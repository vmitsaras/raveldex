import type { MutationOptions } from '../../core/contracts/types.js';
import type { AdapterControl } from '../../core/execution/engine.js';
import { facadeFromExecutionOwner } from '../../core/execution/engine.js';
import { controlledSnapshots } from '../snapshots/snapshots.js';
import { serveWorkerWithSnapshots } from './host.js';
import type { WorkerHostHandle } from './host.js';
import type { WorkerHostOptions, WorkerScope } from './types.js';
export type { WorkerHostHandle, WorkerHostOptions, WorkerScope };
/** Consumer's explicit worker entry selects source snapshot codecs on its one owner. */
export function serveSnapshotRaveldexWorker(scope: WorkerScope, options: WorkerHostOptions = {}): WorkerHostHandle {
  return serveWorkerWithSnapshots(scope, options, owner => {
    const engine = facadeFromExecutionOwner(owner);
    return Object.freeze({
      exportSource: (options: MutationOptions, control: AdapterControl) => controlledSnapshots(engine, {}, control).exportSource(options),
      restore: (encoded: string, options: MutationOptions, control: AdapterControl) => controlledSnapshots(engine, {}, control).restore(encoded, options),
    });
  });
}
