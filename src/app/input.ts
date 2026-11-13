import * as THREE from 'three';
import { clamp } from '../core/math';
import type { TextItem } from '../world/WallText';
import { wallClock } from '../world/writePlan';
import { stageAt } from '../state/OpeningScore';
import { Director } from '../state/Director';
import { PHRASE_BY_ID } from '../content/phrases';
import { SCENE_BY_PHRASE } from '../content/memories';
import { voicesEnd, voicesStart } from '../content/memory-voices';
import { CLASS } from '../ui/dom';
import type { AppContext, Peers } from './context';

/**
 * What the visitor does with the room: looking, walking, touching, turning to the next writing
 * (keyboard, mouse with pointer lock, touch), and what each means to the room.
 */
export class Input {
  /** Which of the visible writings Tab last turned to. */
  private cycleIndex = 0;

  constructor(
    private readonly ctx: AppContext,
    private readonly peers: Peers,
  ) {}

  interact() {
    if (this.ctx.mode !== 'room' || this.ctx.inside.locked) return;
    const d = this.ctx.rig.distanceToChair();
    if (this.ctx.rig.kneeling) {
      this.ctx.rig.setKneel(false);
      return;
    }
    // (Writing on a wall being looked at is touched, even close to the chair: a click on a line
    // offered there knelt instead. QA, 2026-11-06.)
    const wallLine = !!this.ctx.gazeId && !this.ctx.gazeChair && ['north', 'east', 'south', 'west'].includes(this.ctx.text.items.get(this.ctx.gazeId)?.placement.surface ?? '');
    if (this.ctx.gazeChair || (d < 1.2 && !wallLine)) {
      if (d < 1.5) this.ctx.rig.setKneel(true);
      else this.ctx.rig.attend(this.ctx.chair.group.position.clone().setY(0.35), 0.95);
      return;
    }
    this.attendGaze();
  }

  /** Looking: the room's, or (inside a living memory) the memory's. */
  lookBy(dx: number, dy: number) {
    if (!this.ctx.inside.look(dx, dy)) this.ctx.rig.look(dx, dy);
  }

  attendGaze() {
    if (this.ctx.gazeChair) {
      this.ctx.rig.attend(this.ctx.chair.group.position.clone().setY(0.35), 0.95);
      return;
    }
    if (this.ctx.gazeId) {
      const c = this.ctx.text.centreOf(this.ctx.gazeId);
      const it = this.ctx.text.items.get(this.ctx.gazeId);
      const pid = this.ctx.text.phraseOf(this.ctx.gazeId);
      this.ctx.lastTappedKey = this.ctx.gazeId;
      if (pid) this.ctx.director.tapped({ phraseId: pid });
      this.ctx.text.press(this.ctx.gazeId);
      if (c && it) {
        const s = it.placement.surface;
        // (Touched again while the room lets them go: a touch never walks them on. The words drift
        // as the room's scale breathes, so the walk to them is never quite over, and walking on
        // toward the wall is what leaves. QA, PR #56.)
        if (pid === Director.EXIT && this.ctx.director.lettingGo) this.ctx.rig.faceToward(c);
        else if (s === 'floor') this.ctx.rig.attend(c, 0.8);
        else if (s === 'ceiling') this.ctx.rig.faceToward(c);
        else this.ctx.rig.attend(c, 1.25);
      }
    }
  }

  private cyclePhrase(dir: 1 | -1) {
    const cam = this.ctx.rig.camera.position;
    // (What is written there, wherever it came from: a phrase, a recalled line, the visitor's own words.)
    const vis: { centre: THREE.Vector3; words?: string; where: string }[] = [...this.ctx.text.items.values()]
      .filter((i) => i.vis > 0.5 && i.purpose !== 'drawing' && i.uniforms.uOpacity.value > 0.2 && i.placement.surface !== 'ceiling')
      .map((i) => ({
        centre: i.centre,
        words: i.phrase?.text ?? (i.source ? PHRASE_BY_ID.get(i.source)?.text : undefined) ?? ((i.mesh.userData.text as string) || undefined),
        where: i.placement.surface === 'floor' ? 'On the floor' : 'On the wall',
      }));
    const air = this.ctx.text.airWriting.centre;
    const airKey = this.ctx.text.airWriting.state?.key.replace(/^air:/, '');
    if (air) vis.push({ centre: air, words: (airKey && PHRASE_BY_ID.get(airKey)?.text) || 'words written in the air', where: 'In the air' });
    if (!vis.length) return;
    vis.sort((a, b) => {
      const aa = Math.atan2(-(a.centre.x - cam.x), -(a.centre.z - cam.z));
      const bb = Math.atan2(-(b.centre.x - cam.x), -(b.centre.z - cam.z));
      return aa - bb;
    });
    this.cycleIndex = (this.cycleIndex + dir + vis.length) % vis.length;
    this.ctx.rig.faceToward(vis[this.cycleIndex].centre);
    // Without sight, the writing turned to is read out (the way out among it: QA, 2026-11-06).
    const { words, where } = vis[this.cycleIndex];
    if (words) this.ctx.announce(`${where}: ${words}`);
  }

  /** Listen: keys, mouse, touch, and the opening's own taps. Once, when the room is built. */
  bind() {
    const canvas = this.ctx.renderer.domElement;
    const typing = () =>
      this.ctx.mode === 'contribute' || document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT' || !!(document.activeElement as HTMLElement | null)?.closest?.('#tune');

    addEventListener('keydown', (e) => {
      if (!this.ctx.isPlaying()) return;
      // Held keys repeat: walking keys are tracked as held, everything else acts once.
      if (e.repeat && !e.code.startsWith('Arrow') && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(e.code)) return;
      const opening = this.peers.opening.active;
      if (e.code === 'Escape' && opening && this.ctx.mode === 'room') {
        // During the opening, Esc is the way out of it (settings come afterwards; Esc inside
        // settings or the writing field closes them as usual).
        this.peers.opening.skipOpening();
        e.preventDefault();
        return;
      }
      if (opening && opening.score.name === 'first' && stageAt(opening.score, wallClock() - opening.start) === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        this.peers.opening.advanceTitle();
        e.preventDefault();
        return;
      }
      // Before the visitor can walk, the room's keys (write, approach, turn to the chair, kneel,
      // turn to writing) wait: they would act in the dark, or queue for later.
      if (opening && !this.ctx.rig.walk && ['KeyT', 'KeyF', 'KeyC', 'Space', 'Tab', 'Enter'].includes(e.code)) {
        e.preventDefault();
        return;
      }
      if (e.code === 'Escape') {
        if (this.ctx.mode === 'contribute') this.peers.menus.closeContribute();
        else if (this.ctx.mode === 'settings') this.peers.menus.closeSettings();
        else this.peers.menus.openSettings();
        e.preventDefault();
        return;
      }
      if (typing() || this.ctx.mode !== 'room') return;
      // Inside a living memory: a new turn or step is the visitor's way out (Inside.ts); the
      // room's other keys wait.
      if (this.ctx.inside.locked) {
        if (e.code === 'KeyM') this.peers.menus.setPref('muted', !this.ctx.prefs.muted);
        if (!e.repeat) this.ctx.inside.freshKeys.add(e.code);
        this.ctx.rig.keys.add(e.code);
        if (e.code.startsWith('Arrow') || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
        return;
      }
      if (e.code === 'Tab') {
        this.cyclePhrase(e.shiftKey ? -1 : 1);
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyT') {
        this.peers.menus.openContribute();
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyF') this.attendGaze();
      if (e.code === 'KeyC') this.ctx.rig.faceToward(this.ctx.chair.group.position.clone().setY(0.35));
      if (e.code === 'Space' || e.code === 'Enter') {
        this.interact();
        e.preventDefault();
      }
      if (e.code === 'KeyK') this.ctx.rig.setKneel(!this.ctx.rig.kneeling);
      if (e.code === 'KeyM') this.peers.menus.setPref('muted', !this.ctx.prefs.muted);
      this.ctx.rig.keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.ctx.rig.keys.delete(e.code);
      this.ctx.inside.freshKeys.delete(e.code);
    });
    addEventListener('blur', () => {
      this.ctx.rig.keys.clear();
      this.ctx.inside.freshKeys.clear();
    });

    // Mouse: pointer lock where possible, drag-to-look otherwise.
    let dragging = false;
    let dragInside = false;
    let lastX = 0, lastY = 0, downX = 0, downY = 0, downT = 0;
    let lockWanted = false;
    let lockFresh = false;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.ctx.mode !== 'room') return;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
      downT = performance.now();
      if (e.pointerType === 'mouse') {
        if (document.pointerLockElement === canvas) {
          this.interact();
          return;
        }
        dragging = true;
        dragInside = this.ctx.inside.locked;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.ctx.mode !== 'room') return;
      if (document.pointerLockElement === canvas) {
        // (The first move once the mouse is taken can carry the pointer's jump to the lock as
        // movement: Chromium reported the cursor's whole offset from the corner, a turn of 80°
        // nobody made, and a memory begun by that click was looked away from and lost. However
        // small the jump, the first move is dropped: it is a few pixels of a real move at most.)
        const fresh = lockFresh;
        lockFresh = false;
        if (fresh) return;
        this.lookBy(e.movementX, e.movementY);
      } else if (dragging && e.pointerType === 'mouse') {
        // (A drag begun before a living memory took the view isn't a turn away from it.)
        if (!this.ctx.inside.locked || dragInside) this.lookBy((e.clientX - lastX) * 1.2, (e.clientY - lastY) * 1.2);
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse' || !dragging) return;
      dragging = false;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved < 5 && performance.now() - downT < 350 && this.ctx.mode === 'room') {
        // A click: try to take the mouse; if refused, a click still interacts. A click on what is in
        // the middle of the view (the words being looked at, the chair) is also that touch: the
        // first click on writing used to do nothing but take the mouse (docs/reviews/2026-11-core-loop.md).
        if (!this.ctx.touch && canvas.requestPointerLock) {
          const r = canvas.getBoundingClientRect();
          const centre = Math.abs(e.clientX - (r.left + r.width / 2)) < r.width * 0.12 && Math.abs(e.clientY - (r.top + r.height / 2)) < r.height * 0.14;
          if (centre) this.interact();
          lockWanted = true;
          // (Refused, the click still acts — once: not again if it already has.)
          try {
            const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            r?.catch?.(() => !centre && this.interact());
          } catch {
            if (!centre) this.interact();
          }
        } else this.interact();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      lockFresh = document.pointerLockElement === canvas;
      if (document.pointerLockElement !== canvas && lockWanted && this.ctx.mode === 'room') {
        lockWanted = false;
        this.peers.menus.openSettings();
      }
    });

    // Touch: left half walks (vertical) and turns (horizontal); right half looks; tap goes to things.
    const touches = new Map<number, { side: 'L' | 'R'; x: number; y: number; sx: number; sy: number; t: number; inside: boolean }>();
    canvas.addEventListener('pointerdown', (e) => {
      // Touching the room while writing means: keep it to yourself after all.
      if (this.ctx.mode === 'contribute' && !this.ctx.dom.contributeInput.value.trim()) this.peers.menus.closeContribute();
      if (e.pointerType === 'mouse' || this.ctx.mode !== 'room') return;
      canvas.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, { side: e.clientX < innerWidth / 2 ? 'L' : 'R', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp, inside: this.ctx.inside.locked });
      // A thumb put down to walk while inside a living memory is a way out (one already down isn't).
      if (e.clientX < innerWidth / 2 && this.ctx.inside.locked) this.ctx.inside.freshThumb = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      const t = touches.get(e.pointerId);
      if (!t || this.ctx.mode !== 'room') return;
      if (Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > 14) this.ctx.dragged = true;
      // A half-screen swipe turns about 65° on a narrow phone, as on a wide screen.
      // (A drag begun before a living memory took the view isn't a turn away from it.)
      if (t.side === 'R') {
        if (!this.ctx.inside.locked || t.inside) this.lookBy((e.clientX - t.x) * 1.6 * clamp(640 / innerWidth, 1, 1.8), (e.clientY - t.y) * 1.6);
      }
      else {
        // Walking: a thumb pushing up drifts sideways a little; that shouldn't turn the body.
        const dx = e.clientX - t.sx;
        // And a thumb meant to turn drifts up or down a little: that shouldn't walk.
        const dy = -(e.clientY - t.sy);
        this.ctx.rig.touchMove.set(clamp((Math.sign(dx) * Math.max(0, Math.abs(dx) - 20)) / 80, -1, 1), clamp((Math.sign(dy) * Math.max(0, Math.abs(dy) - 10)) / 90, -1, 1));
      }
      t.x = e.clientX;
      t.y = e.clientY;
    });
    const endTouch = (e: PointerEvent) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      touches.delete(e.pointerId);
      if (t.side === 'L') {
        this.ctx.rig.touchMove.set(0, 0);
        this.ctx.inside.freshThumb = false;
      }
      if (e.type === 'pointerup' && this.ctx.mode === 'room' && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) < 14 && e.timeStamp - t.t < 450) this.tapAt(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', endTouch);
    canvas.addEventListener('pointercancel', endTouch);

    // The corner buttons stay out of sight until the pointer goes looking for them.
    const corners = [this.ctx.dom.menuBtn, this.ctx.dom.writeBtn];
    let cornerTimer = 0;
    const away = () => corners.forEach((b) => b.classList.add(CLASS.away));
    away();
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || document.pointerLockElement) return;
      if (e.clientY > innerHeight - 120 && (e.clientX < 140 || e.clientX > innerWidth - 140)) {
        corners.forEach((b) => b.classList.remove(CLASS.away));
        clearTimeout(cornerTimer);
        cornerTimer = window.setTimeout(away, 2500);
      }
    });

    canvas.addEventListener('touchend', () => {
      if (this.ctx.audio && this.ctx.mode === 'room' && this.ctx.audio.ctx.state !== 'running') void this.ctx.audio.resume();
    }, { passive: true });

    this.ctx.dom.skip.addEventListener('click', () => this.peers.opening.skipOpening());
    canvas.addEventListener('pointerdown', () => {
      const o = this.peers.opening.active;
      // (Not the tap that went in: a moment's grace against a double tap.)
      if (o && wallClock() - o.start > 1.2 && stageAt(o.score, wallClock() - o.start) === 'title') this.peers.opening.advanceTitle();
    });
  }

  /**
   * A tap is aimed with a finger, not a cursor: writing counts if the tap lands within a
   * little of its on-screen extent, the chair if it lands near it. Touching writing is
   * attention (the room is told), and turns and walks the visitor closer to read it.
   */
  private tapAt(x: number, y: number) {
    // Inside a living memory a touch does nothing (leaving is turning away, or a step).
    if (this.ctx.inside.locked) return;
    const cam = this.ctx.rig.camera;
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.ctx.raycaster.setFromCamera(ndc, cam);
    const toScreen = (v: THREE.Vector3) => {
      const p = v.clone().project(cam);
      return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, front: p.z < 1 };
    };
    // During a living memory, a touch on the painting or its line means "I'm staying"; a touch
    // anywhere else lets it go, then does what it would have done.
    const l = this.ctx.living;
    if (l && !l.held && (l.memory.state === 'emerging' || l.memory.state === 'active')) {
      const onWindow = this.ctx.raycaster.intersectObject(this.ctx.memoryWindow.mesh, false).length > 0;
      // (While someone in it is speaking, a stray touch is staying too: a phone visitor steadying
      // themselves never cuts a sentence: interaction review, 2026-10-27.)
      // (From its first line to its last, the pause between them included: QA, 2026-10-27.)
      const pv = l.memory.prepared.voices, pos = l.memory.controller.frame?.position ?? 0;
      const speaking = !!pv && ((l.memory.prepared.audio?.voicesUntil ?? 0) > (this.ctx.audio?.ctx.currentTime ?? Infinity) ||
        (pos >= voicesStart(l.id, l.memory.prepared.variant, pv.version) && pos < voicesEnd(l.id, l.memory.prepared.variant, pv.version)));
      if (onWindow || speaking) {
        l.awayFor = 0;
        return;
      }
      this.peers.living.endLivingMemory('interrupt');
    }
    const chairAt = toScreen(this.ctx.chair.group.position.clone().setY(0.4));
    const chairHit = this.ctx.raycaster.intersectObject(this.ctx.chair.hit, false).length > 0 || (chairAt.front && Math.hypot(chairAt.x - x, chairAt.y - y) < 56);
    if (chairHit) {
      this.ctx.touched = true;
      this.ctx.director.tapped({ chair: true });
      if (this.ctx.rig.distanceToChair() < 1.5) this.ctx.rig.setKneel(!this.ctx.rig.kneeling);
      else this.ctx.rig.attend(this.ctx.chair.group.position.clone().setY(0.35), 0.95);
      return;
    }
    const pad = 24;
    let best: { it: TextItem; d: number } | null = null;
    const box = new THREE.Box3();
    const corner = new THREE.Vector3();
    const inView = new THREE.Vector3();
    for (const it of this.ctx.text.items.values()) {
      // Only writing that can actually be seen: present, legible from here, in front of the eye.
      if (it.vis < 0.4 || !it.mesh.visible || it.uniforms.uOpacity.value < 0.15) continue;
      // Drawings are found by looking, not things to touch: a tap goes to the writing.
      if (it.purpose === 'drawing') continue;
      const c = toScreen(it.centre);
      if (!c.front || c.x < -pad || c.x > innerWidth + pad || c.y < -pad || c.y > innerHeight + pad) continue;
      box.setFromObject(it.mesh);
      if (box.isEmpty()) continue;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        // A corner behind the eye projects to nonsense: such an item is too close to judge by its box.
        if (inView.copy(corner).applyMatrix4(cam.matrixWorldInverse).z > -cam.near) behind = true;
        const p = toScreen(corner);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      if (behind) {
        x0 = c.x - 60; x1 = c.x + 60; y0 = c.y - 30; y1 = c.y + 30;
      }
      if (x < x0 - pad || x > x1 + pad || y < y0 - pad || y > y1 + pad) continue;
      // Facing away (seen from behind the wall) never counts.
      if (it.normal.dot(it.centre.clone().sub(cam.position)) > 0) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (!best || d < best.d) best = { it, d };
    }
    if (!best) {
      // Nothing there to read: go toward where the finger pointed (floor), or up to that wall.
      const frames = Object.entries(this.ctx.room.frames).filter(([s]) => s !== 'ceiling').map(([s, f]) => ({ s, mesh: f.mesh }));
      const hit = this.ctx.raycaster.intersectObjects(frames.map((f) => f.mesh), false)[0];
      if (hit) {
        const s = frames.find((f) => f.mesh === hit.object)!.s;
        this.ctx.rig.attend(hit.point.clone(), s === 'floor' ? 0.3 : 1.25);
      }
      return;
    }
    const it = best.it;
    this.ctx.touched = true;
    const pid = this.ctx.text.phraseOf(it.key);
    this.ctx.lastTappedKey = it.key;
    if (pid) this.ctx.director.tapped({ phraseId: pid });
    // The ink takes a touch from a finger as from a click.
    this.ctx.text.press(it.key);
    const c = it.centre;
    // A line that opens into a memory: stop where its painting is seen whole (on a portrait
    // phone 1.25 m shows only about a metre of wall).
    let stop = 1.25;
    if (pid && SCENE_BY_PHRASE.has(pid)) {
      const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
      const w = THREE.MathUtils.clamp(it.placement.w * 0.95, 0.8, 1.3);
      stop = Math.max(1.25, (1.15 * w) / (2 * Math.tan(hfov / 2)));
    }
    // (For a memory's line, aim a little below the words, at the painting that forms under them.)
    const aim = stop > 1.25 || (pid && SCENE_BY_PHRASE.has(pid)) ? c.clone().setY(c.y - 0.2) : c;
    // (Touched again while the room lets them go: never a walk on, which would be leaving; see attendGaze.)
    if (it.placement.surface === 'ceiling' || (pid === Director.EXIT && this.ctx.director.lettingGo)) this.ctx.rig.faceToward(c);
    else this.ctx.rig.attend(aim, it.placement.surface === 'floor' ? 0.8 : stop);
  }
}
