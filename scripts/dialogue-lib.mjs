/**
 * Offline dialogue generation: pure planning/validation logic plus a job runner whose
 * network and filesystem are injected (so it can be tested without spending credits).
 * Nothing here is bundled into the browser, and nothing here ever logs the API key.
 */
import { createHash } from 'node:crypto';

export const API = 'https://api.elevenlabs.io';

/** Credits per input character, by model (ElevenLabs pricing; tags count as characters). */
export const MODEL_RATES = { eleven_v4: 1, eleven_v3: 1, eleven_multilingual_v2: 1, eleven_flash_v2_5: 0.5, eleven_turbo_v2_5: 0.5 };

/** Models that accept unspoken scene context (previous_text / next_text). Context is not billed. */
export const SCENE_MODELS = new Set(['eleven_v4', 'eleven_multilingual_v2']);

/** Most delivery tags a directed input may carry. Tags shape the performance; they are never words of the line. */
export const MAX_TAGS = 4;

/** Three sharply different first takes. */
export const PILOT = ['stay--tender', 'crumbs', 'why-understand--frustrated'];

/** Statuses that mean a usable file exists. */
const USABLE = new Set(['validated', 'approved']);
const PRESENT = new Set(['validated', 'approved', 'needs-review']);

export function emptyLedger() {
  return { version: 1, spent: { credits: 0, sttSeconds: 0 }, entries: {}, runs: [] };
}

export function performanceHash(perf, direction) {
  const v = direction.voices[perf.voice];
  return createHash('sha256')
    // Fields absent from older takes are left out of the JSON, so their hashes are unchanged.
    .update(JSON.stringify({
      voiceId: v?.voiceId, model: perf.model ?? direction.model, input: perf.input, stability: perf.stability ?? v?.stability, seed: perf.seed, format: direction.outputFormat,
      similarity: perf.similarity, before: perf.scene?.before, after: perf.scene?.after, leadIn: perf.leadIn,
    }))
    .digest('hex')
    .slice(0, 16);
}

export function estimateCredits(perf, direction) {
  const rate = MODEL_RATES[perf.model ?? direction.model] ?? 1;
  return Math.ceil(((perf.leadIn ? perf.leadIn.length + 1 : 0) + perf.input.length) * rate);
}

/** Spellings a transcript may use for the same spoken word (so "OK" is not a misread "Okay"). */
const SAME_WORD = { ok: 'okay', yea: 'yeah', yeh: 'yeah', alright: 'alright', 'all-right': 'alright' };

/** Words of a line, normalised for comparison (case, punctuation, quotes, bracketed tags). */
export function words(s) {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
    .map((w) => SAME_WORD[w] ?? w);
}

/** Directions the vignettes never use: they are where the room learns to sound ordinary. */
export const BANNED_TAGS = /\[[^\]]*(whisper|crying|cries|sob|tears|voice cracking|breaking|trembling)[^\]]*\]/i;

/** Word error rate of a transcript against the authored text. */
export function wordErrorRate(reference, hypothesis) {
  const r = words(reference), h = words(hypothesis);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return r.length ? d[r.length][h.length] / r.length : 0;
}

/** Words heard that the authored line does not contain (ignoring audio events). */
export function extraWords(text, transcript) {
  const want = words(text);
  const left = [...want];
  const extra = [];
  for (const w of words(transcript)) {
    const i = left.indexOf(w);
    if (i >= 0) left.splice(i, 1);
    else extra.push(w);
  }
  return extra;
}

/** Tag words that were spoken aloud (present in the transcript but not in the authored text). */
export function spokenTags(perf, transcript) {
  const tagWords = [...perf.input.matchAll(/\[([^\]]+)\]/g)].flatMap((m) => words(m[1]));
  const text = new Set(words(perf.text));
  const heard = new Set(words(transcript));
  return tagWords.filter((w) => !text.has(w) && heard.has(w));
}

/**
 * Validate an authored direction file. Returns a list of problems (empty = valid).
 * `phraseText(phraseId, perf)` gives the authored words a take must say (for a vignette's take,
 * from its vignette and line). `opts.ordinary`: refuse crying and whispering directions.
 */
export function validateDirection(direction, phraseText, opts = {}) {
  const problems = [];
  const ids = new Set(), files = new Set();
  for (const p of direction.performances) {
    if (ids.has(p.id)) problems.push(`${p.id}: duplicate id`);
    ids.add(p.id);
    if (files.has(p.file)) problems.push(`${p.id}: duplicate file`);
    files.add(p.file);
    if (!direction.voices[p.voice]) problems.push(`${p.id}: unknown voice ${p.voice}`);
    if (!((p.model ?? direction.model) in MODEL_RATES)) problems.push(`${p.id}: unknown model`);
    const authored = phraseText(p.phraseId, p);
    if (authored === undefined) problems.push(`${p.id}: unknown ${p.vignette ? `line ${p.vignette}/${p.line}` : `phrase ${p.phraseId}`}`);
    else if (authored !== p.text) problems.push(`${p.id}: text differs from the authored phrase`);
    if (words(p.input).join(' ') !== words(p.text).join(' ')) problems.push(`${p.id}: input words differ from the text`);
    if (p.leadIn !== undefined && !/\w/.test(p.leadIn)) problems.push(`${p.id}: empty lead-in`);
    if ((p.input.match(/\[/g) ?? []).length > MAX_TAGS) problems.push(`${p.id}: more than ${MAX_TAGS} audio tags`);
    if (p.scene && !SCENE_MODELS.has(p.model ?? direction.model)) problems.push(`${p.id}: scene context needs a model that accepts it`);
    if (!/^(dialogue|lab|vignettes)\/[a-z0-9-]+\.mp3$/.test(p.file)) problems.push(`${p.id}: bad file name`);
    if (opts.ordinary && BANNED_TAGS.test(p.input)) problems.push(`${p.id}: crying or whispering direction (the vignettes sound ordinary)`);
  }
  return problems;
}

/**
 * Decide what needs generating. Identical requests are never repeated; approved
 * recordings are never overwritten unless explicitly named for regeneration.
 */
export function planJobs(direction, ledger, opts = {}) {
  const { only, regenerate = [], pilot = false, proposed = false, fileExists = () => true } = opts;
  const want = pilot ? PILOT : only;
  const jobs = [], skipped = [];
  for (const perf of direction.performances) {
    if (want && !want.includes(perf.id)) continue;
    const entry = ledger.entries[perf.id];
    const hash = performanceHash(perf, direction);
    const forced = regenerate.includes(perf.id);
    // A proposed take is direction written for the next batch: generated only when asked for.
    if (perf.proposed && !proposed && !forced && !(only ?? []).includes(perf.id)) {
      skipped.push({ id: perf.id, reason: 'proposed (use --proposed to generate)' });
      continue;
    }
    // A designed voice not yet saved to the account can't be asked for (saving it is the artist's call).
    if (!direction.voices[perf.voice]?.voiceId) {
      skipped.push({ id: perf.id, reason: `voice ${perf.voice} not saved to the account yet` });
      continue;
    }
    if (perf.retired && !forced) {
      skipped.push({ id: perf.id, reason: 'retired (use --regenerate to replace)' });
      continue;
    }
    if (entry?.review === 'approved' && !forced) {
      skipped.push({ id: perf.id, reason: 'approved (use --regenerate to replace)' });
      continue;
    }
    if (!forced && entry && entry.hash === hash && PRESENT.has(entry.status) && fileExists(perf.file)) {
      skipped.push({ id: perf.id, reason: 'up to date' });
      continue;
    }
    jobs.push({ perf, hash, estimate: estimateCredits(perf, direction) });
  }
  return { jobs, skipped };
}

/** Keep jobs within a credit budget; the rest stay queued. */
export function applyBudget(jobs, budget) {
  const run = [], queued = [];
  let total = 0;
  for (const j of jobs) {
    if (total + j.estimate <= budget) {
      run.push(j);
      total += j.estimate;
    } else queued.push(j);
  }
  return { run, queued, estimate: total };
}

/** Parse MP3 frames: validity and duration, without decoding. */
export function mp3Info(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let i = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let frames = 0, seconds = 0;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3;
    const bri = (b[i + 2] >> 4) & 15, sri = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) {
      i++;
      continue;
    }
    const sr = SR[ver][sri];
    const br = (ver === 3 ? BR1 : BR2)[bri] * 1000;
    const len = Math.floor(((ver === 3 ? 144 : 72) * br) / sr) + pad;
    if (len < 24) {
      i++;
      continue;
    }
    frames++;
    seconds += (ver === 3 ? 1152 : 576) / sr;
    i += len;
  }
  return { valid: frames >= 5, frames, seconds: +seconds.toFixed(2) };
}

/** Classify an API failure. `stop` means no further jobs should be attempted in this run. */
export function classifyFailure(status, body) {
  let code = '', message = '';
  try {
    const j = JSON.parse(body);
    code = j.detail?.code ?? j.detail?.status ?? '';
    message = j.detail?.message ?? '';
  } catch {
    message = String(body).slice(0, 160);
  }
  if (status === 429) return { kind: 'rate-limited', code: code || 'too_many_requests', message, retry: true, stop: false };
  if (status >= 500) return { kind: 'server', code: code || String(status), message, retry: true, stop: false };
  if (status === 404) return { kind: 'invalid-voice', code: code || 'not_found', message, retry: false, stop: false };
  if (status === 422 || status === 400) return { kind: 'invalid-request', code: code || 'invalid', message, retry: false, stop: false };
  if (/quota|credit|limit/i.test(code + message)) return { kind: 'quota', code, message, retry: false, stop: true };
  if (status === 402) return { kind: 'plan', code, message, retry: false, stop: false };
  if (status === 401 || status === 403) return { kind: 'auth', code, message, retry: false, stop: true };
  return { kind: 'unknown', code: code || String(status), message, retry: false, stop: false };
}

/** Rebuild the `phrase:<id>` entries of a manifest from the ledger; other entries are kept. */
export function buildManifest(manifest, direction, ledger, fileExists = () => true) {
  const out = {};
  for (const [k, v] of Object.entries(manifest)) if (!k.startsWith('phrase:')) out[k] = v;
  for (const perf of direction.performances) {
    const e = ledger.entries[perf.id];
    if (!e || e.review === 'rejected' || !USABLE.has(e.status) || !fileExists(perf.file)) continue;
    // A retired take stays on disk and in the ledger; it returns only if someone approves it.
    if ((perf.retired || perf.audition) && e.review !== 'approved') continue;
    (out[`phrase:${perf.phraseId}`] ??= []).push(perf.file);
  }
  return out;
}

/**
 * Rebuild the vignettes' `vig:<vignette>:<line>` entries: only takes the artist has kept
 * (approved after listening), never one that merely validated. Other entries are kept.
 */
export function buildVignetteManifest(manifest, direction, ledger, fileExists = () => true) {
  const out = {};
  for (const [k, v] of Object.entries(manifest)) if (!k.startsWith('vig:')) out[k] = v;
  for (const perf of direction.performances) {
    const e = ledger.entries[perf.id];
    if (!e || e.review !== 'approved' || !USABLE.has(e.status) || !fileExists(perf.file)) continue;
    (out[`vig:${perf.vignette}:${perf.line}`] ??= []).push(perf.file);
  }
  return out;
}

/**
 * For the artist's previews only (`?vignette=<id>` in the room): every vignette take generated
 * and not turned down, under the same `vig:` keys, so a vignette can be heard in place before
 * anything is kept. The room's own choice of what visitors meet reads the manifest, never this.
 */
export function buildVignettePreview(direction, ledger, fileExists = () => true) {
  const out = {};
  for (const perf of direction.performances) {
    const e = ledger.entries[perf.id];
    if (!e || e.review === 'rejected' || !PRESENT.has(e.status) || !fileExists(perf.file)) continue;
    (out[`vig:${perf.vignette}:${perf.line}`] ??= []).push(perf.file);
  }
  return out;
}

/**
 * Run generation jobs one at a time. Every outcome is written to the ledger as it
 * happens, so an interrupted run loses nothing and never pays twice.
 */
export async function runJobs({ jobs, direction, ledger, key, fetch, writeFile, saveLedger, trim, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {}, stt = true, now = () => new Date().toISOString(), maxRetries = 3 }) {
  const run = { at: now(), credits: 0, generated: 0, failed: 0, queued: 0, stopped: null };
  for (let n = 0; n < jobs.length; n++) {
    const { perf, hash, estimate } = jobs[n];
    if (run.stopped) {
      ledger.entries[perf.id] = { ...(ledger.entries[perf.id] ?? {}), status: ledger.entries[perf.id]?.status && PRESENT.has(ledger.entries[perf.id].status) ? ledger.entries[perf.id].status : 'queued', queuedReason: run.stopped };
      run.queued++;
      continue;
    }
    const v = direction.voices[perf.voice];
    const model = perf.model ?? direction.model;
    // A lead-in gives a short line somewhere to come from; it is cut away before the file is kept.
    const body = { text: perf.leadIn ? `${perf.leadIn} ${perf.input}` : perf.input, model_id: model, voice_settings: { stability: perf.stability ?? v.stability }, seed: perf.seed };
    if (perf.similarity !== undefined) body.voice_settings.similarity_boost = perf.similarity;
    // The scene around the line: shapes how it is said, is never spoken, and is not billed.
    if (perf.scene?.before) body.previous_text = perf.scene.before;
    if (perf.scene?.after) body.next_text = perf.scene.after;
    let res, attempt = 0;
    for (;;) {
      res = await fetch(`${API}/v1/text-to-speech/${v.voiceId}?output_format=${direction.outputFormat}`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) break;
      const text = await res.text();
      const f = classifyFailure(res.status, text);
      if (f.retry && attempt < maxRetries) {
        attempt++;
        log(`  ${perf.id}: ${f.kind} (${f.code}); retrying in ${2 ** attempt}s`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      const prev = ledger.entries[perf.id] ?? {};
      ledger.entries[perf.id] = { ...prev, status: f.retry ? 'queued' : PRESENT.has(prev.status) ? prev.status : 'failed', lastError: { kind: f.kind, code: f.code, message: f.message, at: now() } };
      if (f.retry) run.stopped = `${f.kind}: ${f.code}`;
      if (f.stop) run.stopped = `${f.kind}: ${f.code} ${f.message}`.trim();
      run.failed += f.retry ? 0 : 1;
      if (f.retry) run.queued++;
      log(`  ${perf.id}: FAILED ${f.kind} ${f.code} ${f.message}`);
      await saveLedger(ledger);
      res = null;
      break;
    }
    if (!res) continue;
    const audio = new Uint8Array(await res.arrayBuffer());
    const cost = Number(res.headers.get('character-cost') ?? estimate);
    run.credits += cost;
    ledger.spent.credits += cost;
    const info = mp3Info(audio);
    const entry = {
      status: 'invalid', hash, estimate, cost, requestId: res.headers.get('request-id') ?? null, bytes: audio.length, seconds: info.seconds,
      voice: perf.voice, model, generatedAt: now(), review: 'pending',
    };
    if (!info.valid || info.seconds < 0.3) {
      ledger.entries[perf.id] = { ...entry, lastError: { kind: 'invalid-audio', code: 'invalid_audio', message: `frames=${info.frames}`, at: now() } };
      run.failed++;
      await saveLedger(ledger);
      continue;
    }
    let kept = audio;
    if (perf.leadIn) {
      // Find where the authored words begin, and keep only them.
      const tr0 = await transcribe({ fetch, key, audio });
      const at = tr0.ok ? lineStart(tr0.words, perf.text) : null;
      if (at === null || !trim) {
        ledger.entries[perf.id] = { ...entry, status: 'needs-review', lastError: { kind: 'lead-in', code: 'not_found', message: tr0.ok ? `heard: ${tr0.text}` : tr0.code, at: now() } };
        await writeFile(perf.file.replace(/\.mp3$/, '.untrimmed.mp3'), audio);
        run.failed++;
        await saveLedger(ledger);
        continue;
      }
      ledger.spent.sttSeconds += info.seconds;
      try {
        kept = await trim(audio, Math.max(0, at - 0.14));
      } catch (e) {
        // The take is paid for: keep it and its record, untrimmed, for a person to deal with.
        await writeFile(perf.file.replace(/\.mp3$/, '.untrimmed.mp3'), audio);
        ledger.entries[perf.id] = { ...entry, status: 'needs-review', lastError: { kind: 'trim', code: 'trim_failed', message: String(e).slice(0, 160), at: now() } };
        run.failed++;
        await saveLedger(ledger);
        continue;
      }
      entry.trimmedAt = +at.toFixed(2);
      entry.seconds = mp3Info(kept).seconds;
      entry.bytes = kept.length;
    }
    await writeFile(perf.file, kept);
    entry.status = 'validated';
    if (stt) {
      const tr = await transcribe({ fetch, key, audio: kept });
      if (tr.ok) {
        entry.transcript = tr.text;
        if (tr.events.length) entry.events = tr.events;
        // Words the performance added (a context line spoken aloud, a stammer): never acceptable.
        const extra = extraWords(perf.text, tr.text);
        if (extra.length) entry.extraWords = extra;
        entry.wer = +wordErrorRate(perf.text, tr.text).toFixed(2);
        entry.spokenTags = spokenTags(perf, tr.text);
        ledger.spent.sttSeconds += info.seconds;
        if (entry.wer > 0.25 || entry.spokenTags.length || (entry.extraWords?.length ?? 0) >= 1) entry.status = 'needs-review';
      } else entry.transcript = `(transcription unavailable: ${tr.code})`;
    }
    ledger.entries[perf.id] = entry;
    run.generated++;
    log(`  ${perf.id}: ${entry.status} ${info.seconds}s, ${cost} credits${entry.transcript ? ` — heard: "${entry.transcript}"` : ''}`);
    await saveLedger(ledger);
  }
  ledger.runs.push(run);
  await saveLedger(ledger);
  return run;
}

/** Speech-to-text check of a recording (ElevenLabs Scribe), so the words can be verified without listening. */
export async function transcribe({ fetch, key, audio }) {
  const fd = new FormData();
  fd.append('model_id', 'scribe_v1');
  fd.append('language_code', 'eng');
  // Audio events (laughter, sighs, breaths) are tagged, so a directed laugh can be checked for.
  fd.append('tag_audio_events', 'true');
  fd.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'line.mp3');
  const r = await fetch(`${API}/v1/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': key }, body: fd });
  if (!r.ok) return { ok: false, code: classifyFailure(r.status, await r.text()).code };
  const j = await r.json();
  const all = j.words ?? [];
  const events = all.filter((w) => w.type === 'audio_event').map((w) => w.text);
  const spoken = all.filter((w) => w.type === 'word').map((w) => ({ text: w.text, start: w.start, end: w.end }));
  return { ok: true, text: String(j.text ?? '').trim(), events, words: spoken };
}

/** Time the authored line begins in a transcript (its first words, last occurrence), or null. */
export function lineStart(heard, text) {
  const want = words(text).slice(0, 3);
  const got = heard.map((w) => ({ w: words(w.text)[0], start: w.start })).filter((x) => x.w);
  for (let i = got.length - want.length; i >= 0; i--) {
    if (want.every((w, k) => got[i + k]?.w === w)) return got[i].start;
  }
  return null;
}

/**
 * The account's real balance, read before a batch (needs the key's `user_read` permission).
 * Returns { known: true, remaining, limit, used, resetsAt } or { known: false, reason }.
 * A batch whose estimate is more than what remains must not run.
 */
export async function readBalance(key, fetchFn = fetch) {
  try {
    const res = await fetchFn(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': key } });
    if (!res.ok) {
      let code = String(res.status);
      try {
        const body = JSON.parse(await res.text());
        code = body?.detail?.status ?? body?.detail?.code ?? code;
      } catch {}
      return { known: false, reason: code === 'missing_permissions' ? 'the key lacks the user_read permission' : `the balance could not be read (${code})` };
    }
    const s = await res.json();
    const used = s.character_count ?? 0, limit = s.character_limit ?? 0;
    return { known: true, used, limit, remaining: Math.max(0, limit - used), tier: s.tier, resetsAt: s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000).toISOString() : undefined };
  } catch (e) {
    return { known: false, reason: `the balance could not be read (${e?.message ?? e})` };
  }
}

/** Whether a batch may run against the balance: refuses one the account cannot cover. */
export function balanceAllows(balance, estimate) {
  if (!balance.known) return { ok: true, note: `${balance.reason}; relying on the ledger and --budget` };
  if (estimate > balance.remaining) return { ok: false, note: `estimate ~${estimate} is more than the ${balance.remaining} credits left this period` };
  return { ok: true, note: `${balance.remaining} of ${balance.limit} credits left this period${balance.resetsAt ? ` (resets ${balance.resetsAt.slice(0, 10)})` : ''}; this batch ~${estimate}` };
}
