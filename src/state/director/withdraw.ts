import type { RuleHost } from './host';

export class Withdraw {
  constructor(private readonly h: RuleHost) {}

  private lastSeenWithdraw = -Infinity;

  /** Stepping back. */
  tick() {
    const v = this.h.visitor;
    if (v.lastWithdrawAt <= this.lastSeenWithdraw) return;
    this.lastSeenWithdraw = v.lastWithdrawAt;
    if (!this.h.scheduler.ready('withdraw', this.h.now, 25)) return;
    this.h.scheduler.mark('withdraw', this.h.now);
    const f = this.h.field.v;
    if (this.h.memory.strength.hesitation > 0.5) {
      const p = this.h.selector.select(this.h.ctx(), {
        exclude: this.h.hiddenExcluding(),
        tiers: ['familiar', 'contradiction', 'arrival'],
        bias: (x) => ((x.keywords ?? []).some((k) => /stay|close|leave|come/.test(k)) ? 0.5 : 0),
      });
      if (p) this.h.reveal(p.id, 1, 'withdraw-hesitant', 'emerge', 6);
    } else if (f.relief > 0.3) {
      const p = this.h.selector.select(this.h.ctx(), {
        exclude: this.h.hiddenExcluding(),
        surfaces: [this.h.facing],
        bias: (x) => (x.dims.relief ?? 0) * 0.5,
      });
      if (p) this.h.reveal(p.id, 1.5, 'withdraw-relief', 'emerge', 8);
    }
  }
}
