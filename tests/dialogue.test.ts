import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import dialogue from '../src/content/dialogue.json';
import { PHRASE_BY_ID } from '../src/content/phrases';
import {
  applyBudget, buildManifest, classifyFailure, emptyLedger, mp3Info, performanceHash, planJobs, runJobs, spokenTags, validateDirection, wordErrorRate,
} from '../scripts/dialogue-lib.mjs';

const ROOT = join(__dirname, '..');
const direction = dialogue as any;
const ledger = JSON.parse(readFileSync(join(ROOT, 'scripts/dialogue-ledger.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/voices/manifest.json'), 'utf8'));
const real = (f: string) => readFileSync(join(ROOT, 'public/voices', f));

describe('voice direction', () => {
  it('matches the authored corpus exactly (captions stay the authored words)', () => {
    expect(validateDirection(direction, (id) => PHRASE_BY_ID.get(id)?.text)).toEqual([]);
  });
  it('covers the required phrases, with several performances of the most important', () => {
    const ids = new Set(direction.performances.map((p: any) => p.phraseId));
    for (const id of ['stay', 'closer', 'afraid-leave', 'if-closer', 'why-understand', 'love-go-away', 'two-cups', 'laugh-breathe', 'understood-minute', 'crumbs', 'remember-me', 'glad-came'])
      expect(ids.has(id), id).toBe(true);
    expect(ids.size).toBeGreaterThanOrEqual(18);
    expect(ids.size).toBeLessThanOrEqual(24);
    const count = (id: string) => direction.performances.filter((p: any) => p.phraseId === id && !p.retired && !p.audition).length;
    expect(count('stay')).toBeGreaterThanOrEqual(3);
    expect(count('closer')).toBeGreaterThanOrEqual(2);
  });
  it('directs a range of feeling, not one hushed register', () => {
    const fresh = direction.performances.filter((p: any) => p.generation === 2);
    expect(fresh.length).toBeGreaterThanOrEqual(15);
    // Not everything whispered or sad: at most a third may be whisper-fitted.
    expect(fresh.filter((p: any) => p.fits.includes('whisper')).length / fresh.length).toBeLessThan(0.34);
    // Laughter, anger and warmth are all present as directions.
    const inputs = fresh.map((p: any) => p.input.toLowerCase()).join(' ');
    for (const w of ['laugh', 'angry', 'frustrated', 'warm', 'embarrassed', 'confused', 'grief', 'tender']) expect(inputs).toContain(w);
    // Three clearly different readings of each of the three central lines, in different voices or settings.
    for (const id of ['stay', 'love-go-away', 'happy-then']) {
      const takes = fresh.filter((p: any) => p.phraseId === id && !p.audition);
      expect(takes.length).toBe(3);
      expect(new Set(takes.map((p: any) => p.interpretation)).size).toBe(3);
      expect(new Set(takes.map((p: any) => `${p.voice}:${JSON.stringify(p.context)}`)).size).toBe(3);
    }
  });

  it('keeps retired takes out of the room but not out of the ledger', () => {
    const retired = direction.performances.filter((p: any) => p.retired);
    expect(retired.length).toBeGreaterThan(0);
    const l = emptyLedger();
    for (const p of direction.performances) l.entries[p.id] = { status: 'validated', hash: performanceHash(p, direction) };
    const m = buildManifest({}, direction, l);
    for (const p of retired) expect(m[`phrase:${p.phraseId}`] ?? []).not.toContain(p.file);
    l.entries[retired[0].id].review = 'approved';
    expect(buildManifest({}, direction, l)[`phrase:${retired[0].phraseId}`]).toContain(retired[0].file);
  });
  it('every voiced phrase can actually be spoken by the room', () => {
    for (const p of direction.performances) expect(PHRASE_BY_ID.get(p.phraseId)?.voice, p.phraseId).toBeTruthy();
  });
});

describe('generation planning', () => {
  it('never repeats an identical generation, and never overwrites an approved one', () => {
    const l = emptyLedger();
    const perf = direction.performances.find((p: any) => !p.retired);
    l.entries[perf.id] = { status: 'validated', hash: performanceHash(perf, direction) };
    expect(planJobs(direction, l, { only: [perf.id] }).jobs).toHaveLength(0);
    // A changed direction (different input) is a different request.
    const changed = { ...direction, performances: [{ ...perf, input: perf.text }] };
    expect(planJobs(changed, l, { only: [perf.id] }).jobs).toHaveLength(1);
    // Approved: only an explicit regeneration replaces it.
    l.entries[perf.id].review = 'approved';
    expect(planJobs(changed, l, { only: [perf.id] }).jobs).toHaveLength(0);
    expect(planJobs(changed, l, { only: [perf.id], regenerate: [perf.id] }).jobs).toHaveLength(1);
    // A missing file is regenerated.
    l.entries[perf.id].review = 'pending';
    expect(planJobs(direction, l, { only: [perf.id], fileExists: () => false }).jobs).toHaveLength(1);
  });
  it('never regenerates a retired take unless asked to', () => {
    const r = direction.performances.find((p: any) => p.retired);
    expect(planJobs(direction, emptyLedger(), { only: [r.id] }).jobs).toHaveLength(0);
    expect(planJobs(direction, emptyLedger(), { only: [r.id], regenerate: [r.id] }).jobs).toHaveLength(1);
  });
  it('the real ledger is fully up to date: re-running would bill nothing', () => {
    const exists = (f: string) => existsSync(join(ROOT, 'public/voices', f));
    expect(planJobs(direction, ledger, { fileExists: exists }).jobs).toHaveLength(0);
  });
  it('keeps to a budget and leaves the rest queued', () => {
    const { jobs } = planJobs(direction, emptyLedger());
    const { run, queued, estimate } = applyBudget(jobs, 100);
    expect(estimate).toBeLessThanOrEqual(100);
    expect(run.length + queued.length).toBe(jobs.length);
    expect(queued.length).toBeGreaterThan(0);
  });
});

describe('API failure handling', () => {
  it('classifies the failures this account actually returns', () => {
    expect(classifyFailure(401, JSON.stringify({ detail: { code: 'missing_permissions', message: 'missing the permission user_read' } }))).toMatchObject({ kind: 'auth', stop: true });
    expect(classifyFailure(402, JSON.stringify({ detail: { code: 'paid_plan_required', message: 'Free users cannot use library voices via the API.' } }))).toMatchObject({ kind: 'plan', stop: false });
    expect(classifyFailure(403, JSON.stringify({ detail: { code: 'feature_not_available', message: 'Creating a voice through the API is only available on a paid plan.' } }))).toMatchObject({ kind: 'auth' });
    expect(classifyFailure(404, JSON.stringify({ detail: { code: 'voice_not_found' } }))).toMatchObject({ kind: 'invalid-voice', stop: false });
    expect(classifyFailure(429, '{}')).toMatchObject({ retry: true });
    expect(classifyFailure(401, JSON.stringify({ detail: { code: 'quota_exceeded', message: 'This request exceeds your quota' } }))).toMatchObject({ kind: 'quota', stop: true });
  });

  const mp3 = new Uint8Array(real('dialogue/crumbs.mp3'));
  const ok = () => ({ ok: true, status: 200, headers: new Map([['character-cost', '34'], ['request-id', 'r1']]), arrayBuffer: async () => mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength), json: async () => ({ text: "You've got crumbs on you" }) });
  const fail = (status: number, code: string, message = '') => ({ ok: false, status, headers: new Map(), text: async () => JSON.stringify({ detail: { code, message } }) });
  const harness = (responses: any[]) => {
    const calls: string[] = [];
    const fetch = async (url: string) => {
      calls.push(url);
      if (url.includes('speech-to-text')) return ok();
      return responses.shift() ?? ok();
    };
    const files: string[] = [];
    return { calls, files, fetch, writeFile: async (f: string) => void files.push(f), saveLedger: async () => {}, sleep: async () => {} };
  };
  const jobsFor = (ids: string[]) => planJobs(direction, emptyLedger(), { only: ids }).jobs;

  it('retries a rate limit, then bills exactly once', async () => {
    const h = harness([fail(429, 'too_many_requests'), ok()]);
    const l = emptyLedger();
    const r = await runJobs({ ...h, jobs: jobsFor(['crumbs']), direction, ledger: l, key: 'test-key' });
    expect(r.generated).toBe(1);
    expect(h.calls.filter((u) => u.includes('text-to-speech')).length).toBe(2);
    expect(l.spent.credits).toBe(34);
    expect(l.entries.crumbs.status).toBe('validated');
  });
  it('records an invalid voice and carries on with the next line', async () => {
    const h = harness([fail(404, 'voice_not_found'), ok()]);
    const l = emptyLedger();
    const r = await runJobs({ ...h, jobs: jobsFor(['closer--quiet', 'crumbs']), direction, ledger: l, key: 'k' });
    expect(l.entries['closer--quiet']).toMatchObject({ status: 'failed', lastError: { kind: 'invalid-voice' } });
    expect(r.generated).toBe(1);
  });
  it('stops at a quota or permission failure and leaves the rest queued, unbilled', async () => {
    const h = harness([fail(401, 'quota_exceeded', 'exceeds your quota')]);
    const l = emptyLedger();
    const r = await runJobs({ ...h, jobs: jobsFor(['closer--quiet', 'crumbs', 'glad-came']), direction, ledger: l, key: 'k' });
    expect(r.stopped).toMatch(/quota/);
    expect(h.calls.filter((u) => u.includes('text-to-speech')).length).toBe(1);
    expect(l.entries.crumbs.status).toBe('queued');
    expect(l.spent.credits).toBe(0);
  });
  it('rejects a response that is not audio', async () => {
    const h = harness([{ ...ok(), arrayBuffer: async () => new TextEncoder().encode('{"oops":true}').buffer }]);
    const l = emptyLedger();
    await runJobs({ ...h, jobs: jobsFor(['crumbs']), direction, ledger: l, key: 'k' });
    expect(l.entries.crumbs.status).toBe('invalid');
    expect(h.files).toHaveLength(0);
  });
  it('flags a recording whose words do not match, or that speaks its tag aloud', async () => {
    const h = harness([]);
    h.fetch = async (url: string) => (url.includes('speech-to-text') ? { ...ok(), json: async () => ({ text: "Nervously. Please don't come any closer." }) } : ok());
    const l = emptyLedger();
    await runJobs({ ...h, jobs: jobsFor(['closer--quiet']), direction, ledger: l, key: 'k' });
    expect(l.entries['closer--quiet'].status).toBe('needs-review');
    expect(l.entries['closer--quiet'].spokenTags).toEqual(['nervously']);
    // A single added word is enough to hold a take back for a person to hear.
    const h2 = harness([]);
    h2.fetch = async (url: string) => (url.includes('speech-to-text') ? { ...ok(), json: async () => ({ text: "You've got crumbs on you, love" }) } : ok());
    const l2 = emptyLedger();
    await runJobs({ ...h2, jobs: jobsFor(['crumbs']), direction, ledger: l2, key: 'k' });
    expect(l2.entries.crumbs).toMatchObject({ status: 'needs-review', extraWords: ['love'] });
  });
  it('transcript comparison tolerates punctuation and quotes', () => {
    expect(wordErrorRate("I still say 'we' by accident.", 'I still say "we" by accident')).toBe(0);
    expect(wordErrorRate('Was it me?', 'Was it him?')).toBeGreaterThan(0.2);
    expect(spokenTags({ input: '[laughs softly] I love you.', text: 'I love you.' }, 'I love you')).toEqual([]);
  });
});

describe('recordings and manifest', () => {
  it('every generated recording is valid audio of a sensible length', () => {
    for (const p of direction.performances) {
      const e = ledger.entries[p.id];
      expect(e?.status, p.id).toBe('validated');
      const info = mp3Info(new Uint8Array(real(p.file)));
      expect(info.valid, p.id).toBe(true);
      expect(info.seconds).toBeGreaterThan(0.6);
      expect(info.seconds).toBeLessThan(6);
      expect(Math.abs(info.seconds - e.seconds)).toBeLessThan(0.05);
      expect(e.wer, `${p.id}: heard "${e.transcript}"`).toBeLessThanOrEqual(0.25);
      expect(e.spokenTags).toEqual([]);
    }
  });
  it('the manifest lists phrase recordings in the existing convention and keeps everything else', () => {
    for (const [k, files] of Object.entries(manifest) as [string, string[]][]) {
      for (const f of files) expect(existsSync(join(ROOT, 'public/voices', f)), f).toBe(true);
      if (k.startsWith('phrase:')) expect(PHRASE_BY_ID.has(k.slice(7)), k).toBe(true);
    }
    for (const k of ['vf-laugh-next-room', 'vf-breath', 'style:whisper', 'sfx:door']) expect(manifest[k]?.length, k).toBeGreaterThan(0);
    // The three directed readings, plus any older take the artist approved back in after listening.
    for (const f of ['dialogue/stay--breaking.mp3', 'dialogue/stay--abandoned.mp3', 'dialogue/stay--asking.mp3']) expect(manifest['phrase:stay']).toContain(f);
    for (const p of direction.performances) if (ledger.entries[p.id]?.review === 'rejected') expect(manifest[`phrase:${p.phraseId}`] ?? []).not.toContain(p.file);
    expect(buildManifest(manifest, direction, ledger)).toEqual(manifest);
  });
  it('rejected or doubtful recordings never reach the manifest', () => {
    const l = JSON.parse(JSON.stringify(ledger));
    l.entries['stay--breaking'].review = 'rejected';
    l.entries['crumbs'].status = 'needs-review';
    l.entries['crumbs--laughing'].status = 'needs-review';
    const m = buildManifest(manifest, direction, l);
    expect(m['phrase:stay']).not.toContain('dialogue/stay--breaking.mp3');
    expect(m['phrase:crumbs']).toBeUndefined();
  });
});

describe('credentials', () => {
  it('no API key appears anywhere in the source tree, assets or ledger', () => {
    const scan = (dir: string): string[] =>
      readdirSync(dir).flatMap((f: string) => {
        const p = join(dir, f);
        if (['node_modules', 'dist', '.git', 'test-output'].includes(f)) return [];
        if (statSync(p).isDirectory()) return scan(p);
        if (!/\.(ts|mjs|mts|js|json|md|html|css)$/.test(f)) return [];
        return /sk_[a-f0-9]{24,}|[a-f0-9]{64}/.test(readFileSync(p, 'utf8')) ? [p] : [];
      });
    expect(scan(ROOT)).toEqual([]);
  });
  it('the browser code never talks to ElevenLabs', () => {
    const scan = (dir: string): string[] =>
      readdirSync(dir).flatMap((f: string) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? scan(p) : /api\.elevenlabs\.io|xi-api-key/i.test(readFileSync(p, 'utf8')) ? [p] : [];
      });
    expect(scan(join(ROOT, 'src'))).toEqual([]);
  });
});
