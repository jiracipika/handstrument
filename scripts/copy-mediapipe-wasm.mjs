// Copies the MediaPipe tasks-vision WASM fileset from node_modules into public/
// so the app serves its JS glue and WASM from the same package version. Runs on
// postinstall; a stale public copy from an older package version is replaced.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = join(root, 'public', 'mediapipe', 'wasm');

try {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log('[copy-mediapipe-wasm] synced', src, '->', dest);
} catch (err) {
  console.warn('[copy-mediapipe-wasm] failed:', err);
}
