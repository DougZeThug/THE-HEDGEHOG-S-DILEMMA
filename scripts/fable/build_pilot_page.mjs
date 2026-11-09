// Build the pilot's review page: the reel (pilot.py's MP4 and WebM) inline with a film-frame counter
// and steps, jumps to its key moments, the key drawings, the exposure sheet and the questions.
// Usage: node scripts/fable/build_pilot_page.mjs DIR TEMPLATE OUT
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, template, out] = process.argv.slice(2);
const xs = JSON.parse(readFileSync(join(dir, 'xsheet.json'), 'utf8'));
const uri = (file, type) => `data:${type};base64,${readFileSync(join(dir, file)).toString('base64')}`;
const [first, last] = xs.frames;
const fails = xs.motionBudget.fails;
const [hop, cut] = [xs.swaps['hide->touch'], xs.swaps['touch->sunk']];

const data = {
  key: 'reel-2',
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
    { label: 'Out from under', frame: 3110 },
    { label: 'The reach', frame: 3136 },
    { label: 'The fall', frame: 3164 },
    { label: 'Contact', frame: xs.contact },
    { label: 'The exhale', frame: 3266 },
    { label: 'Sunk', frame: 3300 },
  ],
  labels: [
    { from: 3080, to: 3098, name: 'hiding under the bough' },
    { from: 3099, to: 3109, name: 'the push' },
    { from: 3110, to: 3116, name: 'out from under it' },
    { from: 3117, to: 3119, name: 'the hop, in the air' },
    { from: 3120, to: 3124, name: 'he lands and sits up' },
    { from: 3125, to: 3163, name: 'the reach' },
    { from: 3164, to: 3168, name: 'the fall, on ones' },
    { from: 3169, to: 3169, name: 'contact' },
    { from: 3170, to: 3175, name: 'the overshoot settles' },
    { from: 3176, to: 3265, name: 'the held breath' },
    { from: 3266, to: 3290, name: 'the exhale' },
    { from: 3291, to: 3406, name: 'sunk' },
  ],
  sheet: [
    ['3080–3098', 'Lying under the bough, quick shallow breaths, his raised paw on its stem holding it down over him, trembling a little.', 'The bough strains up against his paw, bowed; her disc low on the water; the leaves\' shadows on him.'],
    ['3099–3109', 'The push: he eases the bough up off him; at 3107 his paw slips off it.', 'The bough whips back up to where it grows, overshoots and settles, its tip a beat behind.'],
    ['3110–3124', `Out from under it: his paw comes down, he gathers and lunges forward, changes drawing inside the lunge (${hop}), is in the air for three frames, lands on his feet at 3120 (they stay put from there), and sits up leaning back, looking out.`, 'Her light finds him.'],
    ['3125–3163', 'The reach: he leans out, his head lifting toward her and his paw going out after her on an arc, to his limit, trembling there; his eyes drop just before his paw does.', 'The moon rises; her disc moves down the water.'],
    ['3164–3168', 'The fall, on ones: he tips and his paw drops.', ''],
    ['3169–3175', 'Contact: the paw in the water (the approved still); his weight drives on a frame after the strike, then settles by 3175.', 'The first ring; her warm light on him breaks.'],
    ['3176–3265', 'He holds his breath: no breathing, his head alive by a hair, his weight settling once.', 'Her reflection breaks as a front runs out from his paw: 22 strips, nearest first, each torn into two or three pieces pushed apart; rings at 3178, 3190, 3204; her light dies on the sound\'s decay.'],
    ['3266–3290', `The exhale: he draws his paw back out of the water, sits back and draws in on himself; at ${cut} the sunk drawing takes over, its head where the touch drawing left his, going on down.`, 'Only the cold light is left.'],
    ['3291–3406', 'Sunk: slow breaths; his head keeps lowering (3310–3358).', 'The last glints go out by "still," (3347); the moon stops on "hill" (3376).'],
  ],
  asks: [
    { key: 'flow', title: 'Does he move now, instead of cutting?', short: 'Moves',
      options: [{ value: 'yes', label: 'Yes', keep: true }, { value: 'mostly (see notes)', label: 'Mostly' }, { value: 'no', label: 'No' }] },
    { key: 'bough', title: 'Does the bough read as growing from something?', short: 'The bough',
      options: [{ value: 'yes', label: 'Yes', keep: true }, { value: 'not yet', label: 'Not yet' }] },
    { key: 'changes', title: `The two changes of drawing (${hop}, ${cut})?`, short: 'Changes of drawing',
      options: [{ value: 'both fine', label: 'Fine', keep: true }, { value: 'the hop jars', label: 'Hop jars' },
        { value: 'the sit-back jars', label: 'Sit-back jars' }, { value: 'both jar', label: 'Both jar' }] },
    { key: 'next', title: 'Next?', short: 'Next',
      options: [{ value: 'ears, blinks and polish', label: 'Ears, blinks, polish', keep: true }, { value: 'change the acting first (see notes)', label: 'Change the acting first' }] },
  ],
  copyTitle: 'The touch, animated (reel 2)',
};

const lede = 'Reel 2: the same shot, on mix 1 and on the timing you kept from reel 1, now moving through every frame. He is a puppet cut from the drawings into pinned paper pieces, and the bough grows from off the left edge.';
const budget = fails.length
  ? `The motion budget (no 2 s without him moving 3 px) fails at ${fails.map(([a, b, m]) => `${a}–${b} (${m} px)`).join(', ')}.`
  : 'The motion budget holds: no 2 s anywhere without him moving at least 3 px.';
const notes = [
  'He is now a paper puppet cut from the drawings themselves: his head on a pin behind the ear, the foreleg\'s upper card on the shoulder pin and its lower leg on the elbow pin, his tail on its root. Each piece moves on its own curve, so he goes from pose to pose through every frame. Moves are on ones, holds on twos, and each frame re-seats the pieces by a hair, as hands do in stop-motion.',
  'The bough grows from off the left edge of the frame and never leaves that root. His raised paw is on its stem, holding it down over him, and you can see it strain up against him, bowed. He eases it up, his paw slips off, and it whips back up to where it hangs, overshooting and settling, its tip a beat behind its base.',
  `He changes drawing twice, each time inside a move. Out from under the bough he goes from the lying drawing to the sitting one in the middle of the lunge (${hop}): that frame is the heaviest smear, he is in the air for three frames, and he lands on his feet at 3120. As he sits back after the touch, the sunk drawing takes over on a clean cut (${cut}), its head where the touch drawing left his, on the same feet. Step through both with the frame buttons.`,
  `Contact is still film frame ${xs.contact}, on the touch sound: his paw is clear of the water on 3168. Every pose sits where reel 1 put it. ` + budget,
  'An independent cinematic review of the first render of this reel shaped it: the landing, the bough held down from above, the clean cut into sunk in place of a dissolve, the weight driving on after the strike, his head lifting toward her in the reach, and the bigger break of her reflection.',
  'Not in it yet: his ears move only with his head (they are part of the head piece), he does not blink, and his far foreleg moves with the near one.',
];
const html = readFileSync(template, 'utf8')
  .replace('__TITLE__', () => 'Touch Animation Reel')
  .replace('__HEADING__', () => 'The reach and the touch, animated')
  .replace('__LEDE__', () => lede)
  .replace('<!--NOTES-->', () => notes.map((n) => `      <li>${n}</li>`).join('\n'))
  .replace('/*DATA*/{}', () => JSON.stringify(data));
writeFileSync(out, html);
console.log(out, (html.length / 1048576).toFixed(2), 'MB');
