/**
 * The artist's panel (?tune only, never for visitors): sliders on the room's light, the grade,
 * and the memory's light, a way to call the memory up now, and the values to paste back into
 * the source. It changes only presentation (light levels, uniforms), never the Director's state
 * or timing. Nothing is stored: a value is kept by copying it into the code.
 */
export interface TuneControl {
  group: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get(): number;
  set(v: number): void;
}

export function mountTune(controls: TuneControl[], actions: { label: string; run(): void; pressed?(): boolean }[]) {
  const el = document.createElement('div');
  el.id = 'tune';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Tuning');
  el.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:14;max-height:80vh;overflow:auto;width:min(260px,70vw);padding:8px 10px;' +
    'background:rgba(250,249,246,.92);color:#222;font:12px/1.4 system-ui,sans-serif;border-radius:6px;box-shadow:0 1px 6px rgba(0,0,0,.15)';
  const head = document.createElement('button');
  head.textContent = 'tune';
  head.style.cssText = 'background:none;border:0;padding:2px 0;cursor:pointer;font:600 12px system-ui,sans-serif;display:block;margin-bottom:4px';
  const body = document.createElement('div');
  body.id = 'tune-body';
  head.setAttribute('aria-controls', body.id);
  const fold = (hidden: boolean) => {
    body.hidden = hidden;
    head.setAttribute('aria-expanded', String(!hidden));
    if (!hidden) refresh();
  };
  head.onclick = () => fold(!body.hidden);
  el.append(head, body);
  const rows: { c: TuneControl; input: HTMLInputElement; out: HTMLElement }[] = [];
  // The sliders show what the room is now (it changes under them: the opening, the dims).
  const refresh = () => {
    for (const r of rows) {
      if (document.activeElement === r.input) continue;
      r.input.value = String(r.c.get());
      r.out.textContent = r.c.get().toFixed(2);
    }
  };
  // Each group is a fieldset, so a slider is named with its group ("look: key", not just "key").
  let group = '';
  let set: HTMLFieldSetElement = body as unknown as HTMLFieldSetElement;
  for (const c of controls) {
    if (c.group !== group) {
      group = c.group;
      set = document.createElement('fieldset');
      set.style.cssText = 'border:0;margin:6px 0 0;padding:0';
      const g = document.createElement('legend');
      g.textContent = group;
      g.style.cssText = 'padding:0;opacity:.6;text-transform:uppercase;font-size:10px;letter-spacing:.05em';
      set.append(g);
      body.append(set);
    }
    const row = document.createElement('label');
    row.style.cssText = 'display:grid;grid-template-columns:70px 1fr 38px;gap:6px;align-items:center';
    const input = Object.assign(document.createElement('input'), { type: 'range', min: String(c.min), max: String(c.max), step: String(c.step), value: String(c.get()) });
    const out = document.createElement('span');
    out.textContent = c.get().toFixed(2);
    input.oninput = () => {
      c.set(Number(input.value));
      out.textContent = Number(input.value).toFixed(2);
    };
    input.setAttribute('aria-label', `${c.group}: ${c.label}`);
    row.append(Object.assign(document.createElement('span'), { textContent: c.label }), input, out);
    set.append(row);
    rows.push({ c, input, out });
  }
  // On a phone the panel starts folded: thumbs are for looking.
  fold(matchMedia('(pointer: coarse)').matches);
  setInterval(() => !body.hidden && refresh(), 1000);
  const values = () => JSON.stringify(Object.fromEntries(controls.map((c) => [`${c.group}.${c.label}`, +c.get().toFixed(3)])), null, 1);
  const copy = { label: 'copy values', run: () => void navigator.clipboard?.writeText(values()).catch(() => {}) };
  const toggles: [HTMLButtonElement, () => boolean][] = [];
  const pressed = () => {
    for (const [b, p] of toggles) b.setAttribute('aria-pressed', String(p()));
  };
  for (const a of [...actions, copy] as { label: string; run(): void; pressed?(): boolean }[]) {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.style.cssText = 'margin:6px 6px 0 0;font:inherit';
    if (a.pressed) toggles.push([b, a.pressed]);
    b.onclick = (e) => {
      e.stopPropagation();
      a.run();
      pressed();
      refresh();
    };
    body.append(b);
  }
  pressed();
  // Clicks on the panel are the panel's (not a look, not pointer lock).
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'click'] as const) el.addEventListener(t, (e) => e.stopPropagation());
  document.body.append(el);
  return el;
}
