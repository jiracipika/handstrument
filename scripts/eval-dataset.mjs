// Evaluate the REAL handstrument classifier over real HaGRID landmarks.
//
// Requires the family dataset extract (NOT committed): 1,080 landmark rows at
// /Volumes/ADATA/datasets/asl-templates/raw-hagrid.jsonl (HaGRID 60 imgs/class
// via HF mirror, MediaPipe hand_landmarker). See README "Dataset grounding".
//   npx tsx scripts/eval-dataset.mjs
import { readFileSync } from 'node:fs';
import { extractFeatures, classifyGesture } from '../src/handTracking/gestureRecognizer';

const RAW = '/Volumes/ADATA/datasets/asl-templates/raw-hagrid.jsonl';

// HaGRID class -> the handstrument gesture a correct classifier should output
// (null = skip: HaGRID "mute" has no honest handstrument target).
const EXPECT = {
  palm: 'openPalm', stop: 'openPalm', stop_inverted: 'openPalm',
  fist: 'fist',
  peace: 'peace', peace_inverted: 'peace',
  two_up: 'peace', two_up_inverted: 'peace',
  one: 'point',
  ok: 'ok',
  like: 'thumbUp', dislike: 'thumbDown',
  rock: 'rock', call: 'rock',
  three2: 'three',
  four: 'four',
  three: null, // mirror-label quirk: rows show the i/m/r pattern (= our "three"), 100% hit — still skipped to stay strict
  mute: null,
};

const rows = readFileSync(RAW, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const perClass = {};
let hit = 0, total = 0;
for (const r of rows) {
  const want = EXPECT[r.letter];
  if (want === null || want === undefined) continue;
  const lm = r.lm.map(([x, y]) => ({ x, y }));
  const got = classifyGesture(extractFeatures(lm)).gesture;
  perClass[r.letter] ??= { hit: 0, total: 0, got: {} };
  perClass[r.letter].total++;
  perClass[r.letter].got[got] = (perClass[r.letter].got[got] || 0) + 1;
  if (got === want) { hit++; perClass[r.letter].hit++; }
  total++;
}
console.log(`TOTAL: ${hit}/${total} = ${((hit / total) * 100).toFixed(1)}%`);
console.log('\nPer class:');
for (const [cls, s] of Object.entries(perClass)) {
  console.log(`  ${cls.padEnd(16)} ${String(s.hit).padStart(2)}/${s.total}  got: ${JSON.stringify(s.got)}`);
}
