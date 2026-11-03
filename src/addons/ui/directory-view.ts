import type { DirectoryViewHandle, DirectoryViewOptions } from './directory-view-types.js';
import { captureDirectoryView } from './directory-view-options.js';
import { mountDirectoryView } from './directory-view-mount.js';
export type { DirectoryViewGroup, DirectoryViewMessages, DirectoryViewOptions, DirectoryViewHandle } from './directory-view-types.js';

/** Stable native controls over an explicitly supplied, borrowed directory. */
export function mountRaveldexDirectory(options: DirectoryViewOptions): DirectoryViewHandle {
  return mountDirectoryView(captureDirectoryView(options));
}
