import { getDocumentWindowState } from "../database/month-index";
import {
  BACKUP_COLLECTION_KEYS,
  type BackupDocument,
} from "../model/backup-document";

/**
 * Derived projections cached per committed document.
 *
 * Every commit produces a new immutable `BackupDocument`, so its object
 * identity is a free, exact version number: anything derived from it can be
 * computed once and shared by every screen, sheet and background sync that
 * receives the same document. Entries live in a WeakMap, so they are released
 * together with the document and are never an authoritative record store.
 *
 * The collection signature additionally guards against code that mutates a
 * document in place (tests, migrations): a replaced or resized collection or
 * a replaced `_local` invalidates every projection for that document.
 */
type MemoEntry = { signature: unknown[]; values: Map<string, unknown> };

const cache = new WeakMap<BackupDocument, MemoEntry>();
const MAX_VALUES_PER_DOCUMENT = 256;

function signatureOf(document: BackupDocument) {
  const local = document._local;
  const signature: unknown[] = [
    local,
    local?.selectedProfileId,
    local?.monthStartDay,
    local?.weekStartDay,
    local?.appLanguage,
  ];
  const inspectSmallCollections =
    !getDocumentWindowState(document) &&
    (document.transactions?.length ?? 0) <= 32;
  for (const key of BACKUP_COLLECTION_KEYS) {
    const collection = document[key];
    signature.push(collection, collection?.length);
    if (inspectSmallCollections && Array.isArray(collection) && collection.length <= 16) {
      for (let i = 0; i < collection.length; i++) {
        const item = collection[i] as Record<string, unknown> | null;
        if (item && typeof item === "object") {
          for (const prop of Object.keys(item)) {
            const val = item[prop];
            signature.push(val, Array.isArray(val) ? val.length : undefined);
          }
        }
      }
    }
  }
  return signature;
}

function sameSignature(a: unknown[], b: unknown[]) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++)
    if (!Object.is(a[index], b[index])) return false;
  return true;
}

/** Compute `build` once per committed document and key. */
export function memoizeForDocument<T>(
  document: BackupDocument,
  key: string,
  build: () => T,
): T {
  const signature = signatureOf(document);
  let entry = cache.get(document);
  if (!entry || !sameSignature(entry.signature, signature)) {
    entry = { signature, values: new Map() };
    cache.set(document, entry);
  }
  if (entry.values.has(key)) return entry.values.get(key) as T;
  const value = build();
  // Bounded so a long session browsing many months/days stays lightweight.
  if (entry.values.size >= MAX_VALUES_PER_DOCUMENT)
    entry.values.delete(entry.values.keys().next().value!);
  entry.values.set(key, value);
  return value;
}
