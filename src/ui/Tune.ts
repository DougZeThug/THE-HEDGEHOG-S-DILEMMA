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

export function mountTune(controls: TuneControl[], actions: { label: string; run(): void }[]) {
  const el = document.createElement('div');
  el.id = 'tune';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Tuning');
  el.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:50;max-height:80vh;overflow:auto;width:min(260px,70vw);padding:8px 10px;' +
    'background:rgba(250,249,246,.92);color:#222;font:12px/1.4 system-ui,sans-serif;border-radius:6px;box-shadow:0 1px 6px rgba(0,0,0,.15)';
  const head = document.createElement('button');
  head.textContent = 'tune ▾';
  head.style.cssText = 'all:unset;cursor:pointer;font-weight:600;display:block;margin-bottom:4px';
  const body = document.createElement('div');
  head.onclick = () => (body.hidden = !body.hidden);
  // On a phone the panel starts folded: thumbs are for looking.
  body.hidden = matchMedia('(pointer: coarse)').matches;
  el.append(head, body);
  let group = '';
  for (const c of controls) {
    if (c.group !== group) {
      group = c.group;
      const g = document.createElement('div');
      g.textContent = group;
      g.style.cssText = 'margin-top:6px;opacity:.6;text-transform:uppercase;font-size:10px;letter-spacing:.05em';
      body.append(g);
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
    row.append(Object.assign(document.createElement('span'), { textContent: c.label }), input, out);
    body.append(row);
  }
  const values = () => JSON.stringify(Object.fromEntries(controls.map((c) => [`${c.group}.${c.label}`, +c.get().toFixed(3)])), null, 1);
  const copy = { label: 'copy values', run: () => void navigator.clipboard?.writeText(values()).catch(() => {}) };
  for (const a of [...actions, copy]) {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.style.cssText = 'margin:6px 6px 0 0;font:inherit';
    b.onclick = (e) => {
      e.stopPropagation();
      a.run();
    };
    body.append(b);
  }
  // Clicks on the panel are the panel's (not a look, not pointer lock).
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'click'] as const) el.addEventListener(t, (e) => e.stopPropagation());
  document.body.append(el);
  return el;
}
