// Build the pilot's blocking page: the reel (pilot.py's MP4 and WebM) inline with a film-frame counter
// and steps, jumps to its key moments, the key drawings, the exposure sheet and the questions.
// Usage: node scripts/fable/build_pilot_page.mjs DIR TEMPLATE OUT
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, template, out] = process.argv.slice(2);
const xs = JSON.parse(readFileSync(join(dir, 'xsheet.json'), 'utf8'));
const uri = (file, type) => `data:${type};base64,${readFileSync(join(dir, file)).toString('base64')}`;
const [first, last] = xs.frames;
const fails = xs.motionBudget.fails;

const data = {
  key: 'reel-1',
  first,
  count: last - first + 1,
  fps: xs.fps,
  sources: [
    { type: 'video/mp4; codecs="avc1.640028, mp4a.40.2"', uri: uri('pilot.mp4', 'video/mp4') },
    { type: 'video/webm; codecs="vp9, opus"', uri: uri('pilot.webm', 'video/webm') },
  ],
  strip: uri('strip.jpg', 'image/jpeg'),
  jumps: [
    { label: 'Hiding', frame: 3080 },
    { label: 'The push', frame: 3099 },
    { label: 'The reach', frame: 3123 },
    { label: 'The fall', frame: 3164 },
    { label: 'Contact', frame: xs.contact },
    { label: 'The exhale', frame: 3266 },
    { label: 'Sunk', frame: 3310 },
  ],
  labels: [
    { from: 3080, to: 3098, name: 'hiding' },
    { from: 3099, to: 3122, name: 'the push' },
    { from: 3123, to: 3163, name: 'the reach' },
    { from: 3164, to: 3168, name: 'the fall, on ones' },
    { from: 3169, to: 3169, name: 'contact' },
    { from: 3170, to: 3175, name: 'the overshoot settles' },
    { from: 3176, to: 3265, name: 'the held breath' },
    { from: 3266, to: 3290, name: 'the exhale' },
    { from: 3291, to: 3406, name: 'sunk' },
  ],
  sheet: [
    ['3080–3098', 'Hiding under the branch, lying on the bank, the paw that drew it over still on it. Quick shallow breaths.', 'Her disc low on the water; the leaves\' shadows on him.'],
    ['3099–3122', 'He presses against the branch; it springs up and away, overshoots and settles.', 'Her light finds him as it goes.'],
    ['3123–3163', 'The reach: he sits up leaning back, then stretches out to his limit, his paw on an arc after her.', 'The moon rises; her disc moves down the water.'],
    ['3164–3168', 'The fall, on ones: he tips and his paw drops.', ''],
    ['3169–3175', 'Contact: the touch, 3° over, settled by 3175.', 'The first ring; her warm light on him breaks.'],
    ['3176–3265', 'He holds his breath. His weight settles once (3200–3226).', 'Strips break outward one per drawing from 3171; rings at 3178, 3190, 3204; her light dies on the sound\'s decay.'],
    ['3266–3290', 'The exhale: sunk, sitting back, his paw drawn back from the water.', 'Only the cold light is left.'],
    ['3291–3406', 'Slow breaths; his head lowers (3310–3358).', 'The last glints go out by "still," (3347); the moon stops on "hill" (3376).'],
  ],
  asks: [
    { key: 'ground', title: 'Is he on the ground now, through the whole shot?', short: 'On the ground',
      options: [{ value: 'yes', label: 'Yes', keep: true }, { value: 'nearly', label: 'Nearly' }, { value: 'no', label: 'No' }] },
    { key: 'timing', title: 'The poses on the soundtrack?', short: 'Timing',
      options: [{ value: 'right', label: 'Right', keep: true }, { value: 'some early or late (see notes)', label: 'Some early or late' }] },
    { key: 'touch', title: 'The touch against its sound?', short: 'The touch',
      options: [{ value: 'in sync', label: 'In sync', keep: true }, { value: 'picture early', label: 'Picture early' }, { value: 'picture late', label: 'Picture late' }] },
    { key: 'next', title: 'Next?', short: 'Next',
      options: [{ value: 'in-betweens and the rig', label: 'In-betweens and the rig', keep: true }, { value: 'change the blocking first', label: 'Change the blocking first' }] },
  ],
  copyTitle: 'The touch, blocked (reel 1)',
};

const lede = 'The pilot shot\'s first pass on the soundtrack (mix 1): 13.6 seconds, from his hiding place under the branch to sitting back after the touch, every pose standing on the new bank.';
const budget = fails.length
  ? `The motion budget (no 2 s without him moving 3 px) fails at ${fails.map(([a, b, m]) => `${a}–${b} (${m} px)`).join(', ')}.`
  : 'The motion budget holds: no 2 s anywhere without him moving at least 3 px.';
const notes = [
  'This is blocking, the first pass of stop-motion: the key poses held and stepped on the soundtrack, to set the timing before anything moves in between. He jumps from pose to pose on purpose. The in-betweens come next, timed from this.',
  'Every drawing stands on the new bank: lying under the branch, sitting up into the reach, his paw in the water at the touch, and sitting back sunk with his paw drawn back, as you chose.',
  'Inside each pose he moves as one piece about his hind feet: quick shallow breaths under the branch, the stretch of the reach, the tip of the fall, an overshoot at contact, the held breath, the exhale, slow breaths. ' + budget,
  `His paw meets the water on film frame ${xs.contact}. The touch sound in mix 1 starts 1.2 frames later (50 ms), so the picture leads the sound very slightly, as in life. Step to ${xs.contact} with the frame buttons to see it.`,
  'Around him: the branch springs away, the moon rises and stops on "hill", her path breaks strip by strip from 3171 and dies with the sound, four rings spread from his paw, and her warm light leaves his face.',
  'Not in it yet: his ears, head and eyes move only with his whole body until the rig cuts them free; his paw jumps back between the reach and the touch, which the foreleg\'s in-betweens will carry; the branch\'s leaves don\'t trail behind it yet.',
];
const html = readFileSync(template, 'utf8')
  .replace('__TITLE__', () => 'Touch Blocking Reel')
  .replace('__HEADING__', () => 'The reach and the touch, blocked')
  .replace('__LEDE__', () => lede)
  .replace('<!--NOTES-->', () => notes.map((n) => `      <li>${n}</li>`).join('\n'))
  .replace('/*DATA*/{}', () => JSON.stringify(data));
writeFileSync(out, html);
console.log(out, (html.length / 1048576).toFixed(2), 'MB');
