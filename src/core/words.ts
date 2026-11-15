const STOP = new Set(
  'the a an and or but if then so to of in on at by for with from as is are was were be been am i me my you your we our they them it its this that there here not no do did does have has had just very really what who why how when where all some any one'.split(' '),
);

/** The word that survives: the longest word that carries something. */
export function keptWord(text: string): string {
  const words = text.toLowerCase().replace(/[’']/g, "'").match(/[a-z']+/g) ?? [];
  const content = words.map((w) => w.replace(/^'+|'+$/g, '')).filter((w) => w.length > 1 && !STOP.has(w));
  const pool = content.length ? content : words;
  let best = pool[0] ?? '';
  for (const w of pool) if (w.length > best.length) best = w;
  return best;
}
