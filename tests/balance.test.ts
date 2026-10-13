import { describe, it, expect } from 'vitest';
import { readBalance, balanceAllows } from '../scripts/dialogue-lib.mjs';

const reply = (status: number, body: unknown) => async () => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

describe('the real balance is read before a batch', () => {
  it('refuses a batch the account cannot cover', async () => {
    const b = await readBalance('k', reply(200, { tier: 'creator', character_count: 120_000, character_limit: 121_000 }) as never);
    expect(b).toMatchObject({ known: true, remaining: 1000 });
    expect(balanceAllows(b, 1500).ok).toBe(false);
    expect(balanceAllows(b, 900).ok).toBe(true);
  });
  it('without user_read, says so and falls back to the ledger and --budget', async () => {
    const b = await readBalance('k', reply(401, { detail: { status: 'missing_permissions', message: 'missing user_read' } }) as never);
    expect(b.known).toBe(false);
    const r = balanceAllows(b, 300);
    expect(r.ok).toBe(true);
    expect(r.note).toContain('user_read');
  });
  it('a network failure is not mistaken for a balance', async () => {
    const b = await readBalance('k', (async () => { throw new Error('offline'); }) as never);
    expect(b.known).toBe(false);
  });
});
