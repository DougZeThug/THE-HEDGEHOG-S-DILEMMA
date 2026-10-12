/**
 * Offline dialogue generation: pure planning/validation logic plus a job runner whose
 * network and filesystem are injected (so it can be tested without spending credits).
 * Nothing here is bundled into the browser, and nothing here ever logs the API key.
 */
import { createHash } from 'node:crypto';

export const API = 'https://api.elevenlabs.io';

/** Credits per input character, by model (ElevenLabs pricing; tags count as characters). */
export const MODEL_RATES = { eleven_v3: 1, eleven_multilingual_v2: 1, eleven_flash_v2_5: 0.5, eleven_turbo_v2_5: 0.5 };

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
    .update(JSON.stringify({ voiceId: v?.voiceId, model: perf.model ?? direction.model, input: perf.input, stability: perf.stability ?? v?.stability, seed: perf.seed, format: direction.outputFormat }))
    .digest('hex')
    .slice(0, 16);
}

export function estimateCredits(perf, direction) {
  const rate = MODEL_RATES[perf.model ?? direction.model] ?? 1;
  return Math.ceil(perf.input.length * rate);
}

/** Words of a line, normalised for comparison (case, punctuation, quotes, bracketed tags). */
export function words(s) {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

/** Word error rate of a transcript against the authored text. */
export function wordErrorRate(reference, hypothesis) {
  const r = words(reference), h = words(hypothesis);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return r.length ? d[r.length][h.length] / r.length : 0;
}

/** Tag words that were spoken aloud (present in the transcript but not in the authored text). */
export function spokenTags(perf, transcript) {
  const tagWords = [...perf.input.matchAll(/\[([^\]]+)\]/g)].flatMap((m) => words(m[1]));
  const text = new Set(words(perf.text));
  const heard = new Set(words(transcript));
  return tagWords.filter((w) => !text.has(w) && heard.has(w));
}

/** Validate an authored direction file. Returns a list of problems (empty = valid). */
export function validateDirection(direction, phraseText) {
  const problems = [];
  const ids = new Set(), files = new Set();
  for (const p of direction.performances) {
    if (ids.has(p.id)) problems.push(`${p.id}: duplicate id`);
    ids.add(p.id);
    if (files.has(p.file)) problems.push(`${p.id}: duplicate file`);
    files.add(p.file);
    if (!direction.voices[p.voice]) problems.push(`${p.id}: unknown voice ${p.voice}`);
    if (!((p.model ?? direction.model) in MODEL_RATES)) problems.push(`${p.id}: unknown model`);
    const authored = phraseText(p.phraseId);
    if (authored === undefined) problems.push(`${p.id}: unknown phrase ${p.phraseId}`);
    else if (authored !== p.text) problems.push(`${p.id}: text differs from the authored phrase`);
    if (words(p.input).join(' ') !== words(p.text).join(' ')) problems.push(`${p.id}: input words differ from the text`);
    if ((p.input.match(/\[/g) ?? []).length > 1) problems.push(`${p.id}: more than one audio tag`);
    if (!/^dialogue\/[a-z0-9-]+\.mp3$/.test(p.file)) problems.push(`${p.id}: bad file name`);
  }
  return problems;
}

/**
 * Decide what needs generating. Identical requests are never repeated; approved
 * recordings are never overwritten unless explicitly named for regeneration.
 */
export function planJobs(direction, ledger, opts = {}) {
  const { only, regenerate = [], pilot = false, fileExists = () => true } = opts;
  const want = pilot ? PILOT : only;
  const jobs = [], skipped = [];
  for (const perf of direction.performances) {
    if (want && !want.includes(perf.id)) continue;
    const entry = ledger.entries[perf.id];
    const hash = performanceHash(perf, direction);
    const forced = regenerate.includes(perf.id);
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
    (out[`phrase:${perf.phraseId}`] ??= []).push(perf.file);
  }
  return out;
}

/**
 * Run generation jobs one at a time. Every outcome is written to the ledger as it
 * happens, so an interrupted run loses nothing and never pays twice.
 */
export async function runJobs({ jobs, direction, ledger, key, fetch, writeFile, saveLedger, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {}, stt = true, now = () => new Date().toISOString(), maxRetries = 3 }) {
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
    const body = { text: perf.input, model_id: model, voice_settings: { stability: perf.stability ?? v.stability }, seed: perf.seed };
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
    await writeFile(perf.file, audio);
    entry.status = 'validated';
    if (stt) {
      const tr = await transcribe({ fetch, key, audio });
      if (tr.ok) {
        entry.transcript = tr.text;
        entry.wer = +wordErrorRate(perf.text, tr.text).toFixed(2);
        entry.spokenTags = spokenTags(perf, tr.text);
        ledger.spent.sttSeconds += info.seconds;
        if (entry.wer > 0.25 || entry.spokenTags.length) entry.status = 'needs-review';
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
  fd.append('tag_audio_events', 'false');
  fd.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'line.mp3');
  const r = await fetch(`${API}/v1/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': key }, body: fd });
  if (!r.ok) return { ok: false, code: classifyFailure(r.status, await r.text()).code };
  const j = await r.json();
  return { ok: true, text: String(j.text ?? '').trim() };
}
