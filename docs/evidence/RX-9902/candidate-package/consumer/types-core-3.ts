import { createRaveldex } from '@vmitsaras/raveldex';
import { convertLocalSearchSnapshot, MigrationError, MIGRATION_ERROR_CODES } from '@vmitsaras/raveldex/integrations/localsearch';
import type { LocalSearchMigration, MigrationErrorCode } from '@vmitsaras/raveldex/integrations/localsearch';
const migration: LocalSearchMigration = await convertLocalSearchSnapshot(new Uint8Array([1]));
const engine = createRaveldex(migration.configuration);
for (const record of migration.records) await engine.add(record);
const revision: string | null = migration.sourceRevision;
const code: MigrationErrorCode = new MigrationError('INVALID_BYTES', 'shape').code;
const supported: readonly MigrationErrorCode[] = MIGRATION_ERROR_CODES;
void revision; void code; void supported;
// @ts-expect-error Owned plan is immutable.
migration.records.push({ id: 'changed', text: {} });
// @ts-expect-error Source values cannot be pushed.
migration.records[0]!.text['body']!.push('changed');
// @ts-expect-error Legacy origin is readonly and is not native revision.
migration.origin.generation = 0;
// @ts-expect-error Only bytes are admitted, not arbitrary index objects.
convertLocalSearchSnapshot({ documentCount: 1 });
// @ts-expect-error There is no implicit engine mutation or load.
engine.importCompanionSnapshot(new Uint8Array([1]));
