/**
 * What the simulation batteries (scripts/arc.ts, scripts/experiment.ts) share: capturing what is
 * printed so `REPORT=file` can also write it (the guard forbids redirecting a script's output), and
 * reading the arms to compare from `ARMS='base;A1=approachManner'`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Director } from '../../src/state/Director';

const printed: string[] = [];
const log = console.log;

/** Start keeping what is printed (it still prints) so `writeReport` can also write it. Call once, first. */
export function startCapture(): void {
  console.log = (...xs: unknown[]) => {
    printed.push(xs.join(' '));
    log(...xs);
  };
}

/** Stop keeping it (what was kept stays for `writeReport`). */
export function stopCapture(): void {
  console.log = log;
}

/** Write what has been printed to `REPORT`, if it is set; and `data` to `OUT`, if there is one and it is. */
export function writeReport(data?: unknown): void {
  stopCapture();
  const { OUT, REPORT } = process.env;
  if (OUT && data !== undefined) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(data));
  }
  if (REPORT) {
    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, printed.join('\n') + '\n');
  }
}

/** `ARMS='base;A1=approachManner,airLine'`: each arm a name and the experiments it switches on. */
export function readArms(): { name: string; experiments: string[] }[] {
  const arms = (process.env.ARMS ?? 'base').split(';').map((a) => {
    const [name, list] = a.includes('=') ? a.split('=') : [a, ''];
    return { name, experiments: list.split(',').filter(Boolean) };
  });
  // An arm naming an experiment the Director doesn't define would run the same code as the others.
  const unknown = [...new Set(arms.flatMap((a) => a.experiments))].filter((e) => !Director.EXPERIMENTS.includes(e));
  if (unknown.length) throw new Error(`no such experiment: ${unknown.join(', ')} (defined: ${Director.EXPERIMENTS.join(', ') || 'none'})`);
  return arms;
}
