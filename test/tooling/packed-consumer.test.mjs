import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePackedMetadata } from '../../scripts/lib/packed-consumer.mjs';

const metadata = {
  name: '@vmitsaras/raveldex', filename: 'vmitsaras-raveldex-0.0.0.tgz',
  integrity: 'sha512-fixture', size: 123, unpackedSize: 456, files: [{ path: 'dist/index.js', size: 12 }],
};

test('packed consumer preserves legacy npm pack array metadata', () => {
  assert.deepEqual(parsePackedMetadata(JSON.stringify([metadata])), metadata);
});

test('packed consumer preserves npm 12 package-keyed metadata', () => {
  assert.deepEqual(parsePackedMetadata(JSON.stringify({ '@vmitsaras/raveldex': metadata })), metadata);
});

test('packed consumer rejects missing, ambiguous or unexpected package metadata', () => {
  for (const value of [null, [], {}, [metadata, metadata]]) {
    assert.throws(() => parsePackedMetadata(JSON.stringify(value)), /exactly one package/);
  }
  assert.throws(() => parsePackedMetadata(JSON.stringify([{ ...metadata, name: 'another-package' }])), /must describe Raveldex/);
  assert.throws(() => parsePackedMetadata(JSON.stringify([{ ...metadata, filename: undefined }])), /tarball filename/);
});
