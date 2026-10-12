import * as THREE from 'three';
import { Room } from './world/Room';
import { Chair } from './world/Chair';
import { Lighting } from './world/Lighting';
import { WallText } from './world/WallText';
import { CameraRig } from './world/CameraRig';
import { Post } from './world/Post';
import { FONTS_TO_LOAD } from './world/textures';
import { ROOM } from './world/layout';
import { Director } from './state/Director';
import type { Cue, VoicePosition } from './state/cues';
import type { Surface } from './content/types';
import { PHRASES } from './content/phrases';
import { THRESHOLD_LINES } from './content/relations';
import { AudioEngine } from './audio/AudioEngine';
import { Ambience } from './audio/Ambience';
import { Music } from './audio/Music';
import { Voices, type VoicePlacement } from './audio/Voices';
import { Captions } from './ui/Captions';
import { loadPrefs, savePrefs, readVisits, writeVisits, forgetVisits, type Prefs } from './ui/prefs';
import { LocalInterpreter } from './interpret/LocalInterpreter';
import type { Interpreter } from './interpret/Interpreter';
import { clamp, smoothstep } from './core/math';
import { hashString } from './core/rng';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type Mode = 'threshold' | 'room' | 'settings' | 'contribute' | 'departed';

export class App {
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  room!: Room;
  chair!: Chair;
  lighting!: Lighting;
  text!: WallText;
  rig!: CameraRig;
  post!: Post;
  director!: Director;
  audio: AudioEngine | null = null;
  ambience: Ambience | null = null;
  music: Music | null = null;
  voices: Voices | null = null;
  captions = new Captions($('captions'));
  interpreter: Interpreter = new LocalInterpreter();
  prefs: Prefs = loadPrefs();
  mode: Mode = 'threshold';
  visits = readVisits();
  private clock = new THREE.Clock();
  private time = 0;
  private enteredAt = 0;
  private gazeId: string | null = null;
  private gazeChair = false;
  private raycaster = new THREE.Raycaster();
  private debugEl = $('debug');
  private debug = new URLSearchParams(location.search).has('debug');
  private fps = 60;
  private lastDebug = 0;
  private hintShown = false;
  private touch = matchMedia('(pointer: coarse)').matches;
  private tabIndex = 0;
  private departTimer = 0;

  async boot() {
    const params = new URLSearchParams(location.search);
    const seedParam = Number(params.get('seed'));
    const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : 1000 + (this.visits + 1) * 7919;
    $('threshold-line').textContent = THRESHOLD_LINES[Math.min(THRESHOLD_LINES.length - 1, this.visits)];

    await Promise.race([
      Promise.all(FONTS_TO_LOAD.map((f) => document.fonts.load(f).catch(() => null))),
      new Promise((r) => setTimeout(r, 4000)),
    ]);

    this.setupRenderer();
    this.room = new Room();
    this.chair = new Chair();
    this.lighting = new Lighting(this.prefs.quality);
    this.text = new WallText(this.room, 4242);
    this.scene.add(this.room.group, this.chair.group, this.lighting.group);
    this.scene.background = new THREE.Color(0xf3f2ef);
    this.rig = new CameraRig(innerWidth / innerHeight);
    const forced = params.get('situations')?.split(',').map((s) => s.trim()).filter(Boolean);
    this.director = new Director({
      seed,
      visits: this.visits + 1,
      situations: forced,
      // Where each piece of writing is, for situations that relate place to memory.
      geometry: (id) => {
        const it = this.text.items.get(id);
        return it ? { surface: it.placement.surface, x: it.centre.x, y: it.centre.y, z: it.centre.z } : undefined;
      },
    });
    for (const [id, st] of this.director.visible) if (st.base) this.text.setShown(id);

    const samples = this.prefs.quality === 'high' ? 4 : this.prefs.quality === 'medium' ? 2 : 0;
    this.post = new Post(this.renderer, this.scene, this.rig.camera, samples);
    this.applyPrefs();
    this.onResize();
    addEventListener('resize', () => this.onResize());
    this.bindInput();
    this.bindUI();
    if (this.debug) this.debugEl.hidden = false;
    (window as unknown as { __hedgehog: unknown }).__hedgehog = this;

    // Warm up: render a frame of the (white-out) room behind the threshold.
    this.post.white = 1;
    this.rig.update(0.016, this.room, this.chair.group.position);
    this.post.render();
    const enter = $<HTMLButtonElement>('enter');
    enter.disabled = false;
    enter.textContent = this.visits > 0 ? 'go in again' : 'go in';
    enter.focus();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    $('stage').appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = -1;
  }

  private pixelRatio() {
    const dpr = devicePixelRatio || 1;
    return this.prefs.quality === 'low' ? Math.min(dpr, 1) : this.prefs.quality === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  }

  private onResize() {
    const w = innerWidth, h = innerHeight;
    const pr = this.pixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.post.setSize(w, h, pr);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
  }

  // ─────────────────────────────── entering ───────────────────────────────

  async enter() {
    if (this.mode !== 'threshold') return;
    this.mode = 'room';
    this.visits++;
    writeVisits(this.visits);
    try {
      this.audio = new AudioEngine();
      await this.audio.resume();
      this.ambience = new Ambience(this.audio);
      this.ambience.start();
      this.music = new Music(this.audio);
      this.voices = new Voices(this.audio);
      void this.voices.loadManifest().then(() => this.voices!.preload());
    } catch (e) {
      console.warn('[hedgehog] audio unavailable; continuing in silence', e);
      this.audio = null;
    }
    this.applyPrefs();
    $('threshold').classList.add('leaving');
    setTimeout(() => ($('threshold').hidden = true), 2500);
    $('menu-btn').hidden = false;
    $('write-btn').hidden = false;
    this.enteredAt = this.time;
    this.renderer.domElement.focus();
  }

  // ─────────────────────────────── frame ───────────────────────────────

  private frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.time += dt;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    const running = this.mode === 'room' || this.mode === 'contribute';

    // Arrival: from white to the room, slowly; the hum before the words.
    if (this.mode !== 'threshold') {
      const since = this.time - this.enteredAt;
      const dur = this.prefs.reducedMotion ? 3.5 : 8;
      this.post.white = 1 - smoothstep(0.6, dur, since);
      if (this.ambience) this.ambience.fade = clamp(since / 4);
      if (!this.hintShown && since > dur + 1) this.showHint();
    }

    this.rig.enabled = this.mode === 'room';
    this.rig.update(dt, this.room, this.chair.group.position);

    // Attention.
    const cam = this.rig.camera;
    this.gazeId = this.text.attention(cam);
    const gazePhrase = this.text.phraseOf(this.gazeId);
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    this.gazeChair = this.raycaster.intersectObject(this.chair.hit, false).length > 0 && this.rig.distanceToChair() < 6;

    if (running && this.post.white < 0.6) {
      const input = {
        x: this.rig.pos.x - this.chair.group.position.x,
        z: this.rig.pos.z - this.chair.group.position.z,
        yaw: this.rig.yaw,
        pitch: this.rig.pitch,
        gazePhraseId: gazePhrase,
        gazeChair: this.gazeChair,
        nearSurface: this.room.nearWall(this.rig.pos.x, this.rig.pos.z),
        kneeling: this.rig.kneeling,
      };
      const cues = this.director.tick(dt, input, this.room.facing(this.rig.yaw));
      for (const c of cues) this.apply(c.cue);
    }

    const env = this.director.env;
    const v = this.director.visitor;
    const scaleTarget = this.prefs.reducedMotion ? 1 + (env.roomScale - 1) * 0.3 : env.roomScale;
    this.room.setScale(this.room.scale + (scaleTarget - this.room.scale) * (1 - Math.exp(-dt / 6)));
    this.lighting.update(dt, env, this.time, this.chair.group.position);
    this.text.update(dt, this.time, cam, env, this.gazeId, v.gazeId === gazePhrase ? v.gazeFor : 0);
    this.post.update(dt, env, this.time);

    if (this.audio) {
      const p = cam.position;
      const f = cam.getWorldDirection(new THREE.Vector3());
      this.audio.updateListener(p.x, p.y, p.z, f.x, f.y, f.z);
      this.ambience?.update(dt, env, this.time);
    }

    this.post.render();
    if (this.debug && this.time - this.lastDebug > 0.25) this.updateDebug();
  }

  // ─────────────────────────────── cues ───────────────────────────────

  private apply(cue: Cue) {
    switch (cue.type) {
      case 'reveal':
        this.text.reveal(cue.phraseId, cue.seconds * (this.prefs.reducedMotion ? 0.7 : 1));
        break;
      case 'hide':
        this.text.hide(cue.phraseId, cue.seconds);
        break;
      case 'write': {
        const c = this.chair.group.position;
        const near = cue.nearPoint && cue.surface === 'floor'
          ? { u: c.x + cue.nearPoint.x + ROOM.halfW, v: c.z + cue.nearPoint.z + ROOM.halfD }
          : cue.surface && !cue.beside ? this.viewPointOn(cue.surface) : undefined;
        const ok = this.text.write({ key: cue.key, text: cue.text, hand: cue.hand, size: cue.size, beside: cue.beside, surface: cue.surface, near, purpose: cue.purpose, ttl: cue.ttl, now: this.time, source: cue.source });
        if (ok && cue.strike) this.text.strike(cue.strike, this.time, cue.ttl);
        if (!ok) this.director.writeFailed(cue.key);
        break;
      }
      case 'link':
        this.text.link(cue.a, cue.b, cue.ttl, this.time);
        break;
      case 'voice':
        void this.playVoice(cue);
        break;
      case 'music':
        if (this.music && this.audio) {
          if (cue.melody?.length) this.music.playMelody(cue.melody, cue.stopAt);
          else this.music.play(cue.mood, cue.notes, cue.truncate);
        }
        break;
      case 'sound':
        if (this.voices && this.audio) void this.voices.sound(cue.kind, this.place(cue.position), cue.gain);
        break;
      case 'stopVoice':
        this.voices?.stop(cue.tag, cue.fade);
        break;
      case 'glow': {
        const c = this.chair.group.position;
        this.lighting.leaveResidue(c.x + cue.x, c.z + cue.z, cue.amount * (this.prefs.intensity === 'gentle' ? 0.6 : 1), cue.seconds, this.time);
        break;
      }
      case 'chairTurn': {
        const c = this.chair.group.position;
        this.chair.turnToward(c.x + cue.x, c.z + cue.z, cue.amount);
        break;
      }
      case 'erode':
        this.text.erode(cue.key, cue.keep, this.time);
        break;
      case 'silence':
        this.audio?.silence(cue.depth * (this.prefs.intensity === 'gentle' ? 0.8 : 1), cue.seconds);
        break;
      case 'chairNudge':
        this.chair.nudge(cue.dx, cue.dz, cue.dyaw);
        break;
      case 'flash':
        this.lighting.triggerFlash(cue.kind, cue.amount * (this.prefs.intensity === 'gentle' ? 0.5 : 1), cue.seconds, this.time);
        break;
    }
  }

  /** Where the centre of view meets a surface, in layout (u, v) coordinates. */
  private viewPointOn(surface: Surface): { u: number; v: number } | undefined {
    const frame = this.room.frames[surface];
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.rig.camera);
    const hit = this.raycaster.intersectObject(frame.mesh, false)[0];
    if (!hit) return undefined;
    const local = frame.group.worldToLocal(hit.point.clone());
    const s = this.room.scale;
    if (surface === 'floor') return { u: local.x / s + frame.size.w / 2, v: frame.size.h / 2 - local.y / s };
    if (surface === 'ceiling') return { u: local.x / s + frame.size.w / 2, v: local.y / s + frame.size.h / 2 };
    return { u: local.x / s + frame.size.w / 2, v: local.y + frame.size.h / 2 };
  }

  private place(p: VoicePosition): VoicePlacement {
    const c = this.chair.group.position;
    const cam = this.rig.camera.position;
    switch (p.kind) {
      case 'chair':
        return { from: [c.x, 0.45, c.z] };
      case 'behind': {
        const f = this.rig.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
        return { from: [cam.x - f.x * 1.1, cam.y, cam.z - f.z * 1.1] };
      }
      case 'nowhere':
        return { nowhere: true };
      case 'beyond': {
        const hw = this.room.halfW, hd = this.room.halfD;
        const r = (hashString(String(this.time)) % 100) / 100 - 0.5;
        const pts = {
          north: [r * 4, 1.5, -hd - 2],
          south: [r * 4, 1.5, hd + 2],
          east: [hw + 2, 1.5, r * 4],
          west: [-hw - 2, 1.5, r * 4],
          floor: [0, -2, 0],
          ceiling: [0, ROOM.height + 2, 0],
        }[p.surface] as [number, number, number];
        return { from: pts, muffled: true };
      }
      case 'surface': {
        const w = this.text.centreOf(p.phraseId);
        return w ? { from: [w.x, w.y, w.z] } : { from: [c.x, 0.5, c.z] };
      }
      case 'approach': {
        const sx = cam.x > 0 ? -1 : 1, sz = cam.z > 0 ? -1 : 1;
        return { from: [sx * this.room.halfW * 0.9, 1.5, sz * this.room.halfD * 0.9], to: [c.x, 0.6, c.z] };
      }
    }
  }

  private async playVoice(cue: Extract<Cue, { type: 'voice' }>) {
    let dur = 3;
    if (this.voices && this.audio) {
      const assetKey = cue.assetId ?? (cue.phraseId ? `phrase:${cue.phraseId}` : undefined);
      dur = await this.voices.play(cue.kind, cue.text, { ...this.place(cue.position), tag: cue.tag }, cue.gain, assetKey, { melody: cue.melody, synth: cue.synth });
    }
    if (dur > 0) this.captions.show(cue.caption, dur, cue.text === null);
  }

  // ─────────────────────────────── input ───────────────────────────────

  private interact() {
    if (this.mode !== 'room') return;
    const d = this.rig.distanceToChair();
    if (this.rig.kneeling) {
      this.rig.setKneel(false);
      return;
    }
    if (this.gazeChair || d < 1.2) {
      if (d < 1.5) this.rig.setKneel(true);
      else this.rig.attend(this.chair.group.position.clone().setY(0.35), 0.95);
      return;
    }
    this.attendGaze();
  }

  private attendGaze() {
    if (this.gazeChair) {
      this.rig.attend(this.chair.group.position.clone().setY(0.35), 0.95);
      return;
    }
    if (this.gazeId) {
      const c = this.text.centreOf(this.gazeId);
      const it = this.text.items.get(this.gazeId);
      if (c && it) {
        const s = it.placement.surface;
        if (s === 'floor') this.rig.attend(c, 0.8);
        else if (s === 'ceiling') this.rig.faceToward(c);
        else this.rig.attend(c, 1.25);
      }
    }
  }

  private cyclePhrase(dir: 1 | -1) {
    const cam = this.rig.camera.position;
    const vis = [...this.text.items.values()].filter((i) => i.vis > 0.5 && i.uniforms.uOpacity.value > 0.2 && i.placement.surface !== 'ceiling');
    if (!vis.length) return;
    vis.sort((a, b) => {
      const aa = Math.atan2(-(a.centre.x - cam.x), -(a.centre.z - cam.z));
      const bb = Math.atan2(-(b.centre.x - cam.x), -(b.centre.z - cam.z));
      return aa - bb;
    });
    this.tabIndex = (this.tabIndex + dir + vis.length) % vis.length;
    this.rig.faceToward(vis[this.tabIndex].centre);
  }

  private bindInput() {
    const canvas = this.renderer.domElement;
    const typing = () => this.mode === 'contribute' || document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT';

    addEventListener('keydown', (e) => {
      if (this.mode === 'threshold' || this.mode === 'departed') return;
      if (e.code === 'Escape') {
        if (this.mode === 'contribute') this.closeContribute();
        else if (this.mode === 'settings') this.closeSettings();
        else this.openSettings();
        e.preventDefault();
        return;
      }
      if (typing() || this.mode !== 'room') return;
      if (e.code === 'Tab') {
        this.cyclePhrase(e.shiftKey ? -1 : 1);
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyT') {
        this.openContribute();
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyF') this.attendGaze();
      if (e.code === 'KeyC') this.rig.faceToward(this.chair.group.position.clone().setY(0.35));
      if (e.code === 'Space' || e.code === 'Enter') {
        this.interact();
        e.preventDefault();
      }
      if (e.code === 'KeyK') this.rig.setKneel(!this.rig.kneeling);
      if (e.code === 'KeyM') this.setPref('muted', !this.prefs.muted);
      this.rig.keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.rig.keys.delete(e.code));
    addEventListener('blur', () => this.rig.keys.clear());

    // Mouse: pointer lock where possible, drag-to-look otherwise.
    let dragging = false;
    let lastX = 0, lastY = 0, downX = 0, downY = 0, downT = 0;
    let lockWanted = false;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'room') return;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
      downT = performance.now();
      if (e.pointerType === 'mouse') {
        if (document.pointerLockElement === canvas) {
          this.interact();
          return;
        }
        dragging = true;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.mode !== 'room') return;
      if (document.pointerLockElement === canvas) this.rig.look(e.movementX, e.movementY);
      else if (dragging && e.pointerType === 'mouse') {
        this.rig.look((e.clientX - lastX) * 1.2, (e.clientY - lastY) * 1.2);
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse' || !dragging) return;
      dragging = false;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved < 5 && performance.now() - downT < 350 && this.mode === 'room') {
        // A click: try to take the mouse; if refused, a click still interacts.
        if (!this.touch && canvas.requestPointerLock) {
          lockWanted = true;
          try {
            const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            r?.catch?.(() => this.interact());
          } catch {
            this.interact();
          }
        } else this.interact();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && lockWanted && this.mode === 'room') {
        lockWanted = false;
        this.openSettings();
      }
    });

    // Touch: left half walks (vertical) and turns (horizontal); right half looks; tap goes to things.
    const touches = new Map<number, { side: 'L' | 'R'; x: number; y: number; sx: number; sy: number; t: number }>();
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || this.mode !== 'room') return;
      canvas.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, { side: e.clientX < innerWidth / 2 ? 'L' : 'R', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    });
    canvas.addEventListener('pointermove', (e) => {
      const t = touches.get(e.pointerId);
      if (!t || this.mode !== 'room') return;
      if (t.side === 'R') this.rig.look((e.clientX - t.x) * 1.6, (e.clientY - t.y) * 1.6);
      else {
        this.rig.touchMove.set(clamp((e.clientX - t.sx) / 90, -1, 1), clamp(-(e.clientY - t.sy) / 90, -1, 1));
      }
      t.x = e.clientX;
      t.y = e.clientY;
    });
    const endTouch = (e: PointerEvent) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      touches.delete(e.pointerId);
      if (t.side === 'L') this.rig.touchMove.set(0, 0);
      if (Math.hypot(e.clientX - t.sx, e.clientY - t.sy) < 10 && performance.now() - t.t < 300) this.tapAt(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', endTouch);
    canvas.addEventListener('pointercancel', endTouch);

    // The corner buttons stay out of sight until the pointer goes looking for them.
    const corners = [$('menu-btn'), $('write-btn')];
    let cornerTimer = 0;
    const away = () => corners.forEach((b) => b.classList.add('away'));
    away();
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || document.pointerLockElement) return;
      if (e.clientY > innerHeight - 120 && (e.clientX < 140 || e.clientX > innerWidth - 140)) {
        corners.forEach((b) => b.classList.remove('away'));
        clearTimeout(cornerTimer);
        cornerTimer = window.setTimeout(away, 2500);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.audio?.suspend();
      else if (this.mode !== 'threshold' && this.mode !== 'departed') void this.audio?.resume();
    });
  }

  private tapAt(x: number, y: number) {
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    if (this.raycaster.intersectObject(this.chair.hit, false).length) {
      if (this.rig.distanceToChair() < 1.5) this.rig.setKneel(!this.rig.kneeling);
      else this.rig.attend(this.chair.group.position.clone().setY(0.35), 0.95);
      return;
    }
    const meshes = [...this.text.items.values()].filter((i) => i.vis > 0.4).map((i) => i.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (hit) {
      const it = [...this.text.items.values()].find((i) => i.mesh === hit.object);
      if (it) {
        const c = it.centre;
        if (it.placement.surface === 'ceiling') this.rig.faceToward(c);
        else this.rig.attend(c, it.placement.surface === 'floor' ? 0.8 : 1.25);
      }
    }
  }

  // ─────────────────────────────── UI ───────────────────────────────

  private showHint() {
    this.hintShown = true;
    const h = $('hint');
    h.textContent = this.touch
      ? 'drag left to walk · drag right to look'
      : 'Esc to pause';
    h.classList.add('on');
    setTimeout(() => h.classList.remove('on'), 5500);
  }

  private bindUI() {
    $('enter').addEventListener('click', () => void this.enter());
    $('menu-btn').addEventListener('click', () => (this.mode === 'settings' ? this.closeSettings() : this.openSettings()));
    $('write-btn').addEventListener('click', () => this.openContribute());
    $('resume').addEventListener('click', () => this.closeSettings());
    $('leave').addEventListener('click', () => this.depart());
    $('return').addEventListener('click', () => this.returnToRoom());
    $('forget').addEventListener('click', () => {
      this.text.removeContributions();
      this.director.forgetContributions();
      forgetVisits();
      this.visits = 0;
      const b = $<HTMLButtonElement>('forget');
      b.textContent = 'forgotten';
      b.disabled = true;
      setTimeout(() => {
        b.textContent = 'forget what I wrote, and that I was here';
        b.disabled = false;
      }, 3000);
    });

    const vol = $<HTMLInputElement>('opt-volume');
    vol.addEventListener('input', () => this.setPref('volume', Number(vol.value)));
    $<HTMLInputElement>('opt-mute').addEventListener('change', (e) => this.setPref('muted', (e.target as HTMLInputElement).checked));
    $<HTMLInputElement>('opt-captions').addEventListener('change', (e) => this.setPref('captions', (e.target as HTMLInputElement).checked));
    $<HTMLInputElement>('opt-speech').addEventListener('change', (e) => this.setPref('speech', (e.target as HTMLInputElement).checked));
    $<HTMLInputElement>('opt-motion').addEventListener('change', (e) => this.setPref('reducedMotion', (e.target as HTMLInputElement).checked));
    $<HTMLSelectElement>('opt-intensity').addEventListener('change', (e) => this.setPref('intensity', (e.target as HTMLSelectElement).value as Prefs['intensity']));
    $<HTMLSelectElement>('opt-quality').addEventListener('change', (e) => this.setPref('quality', (e.target as HTMLSelectElement).value as Prefs['quality']));

    const form = $<HTMLFormElement>('contribute-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submitContribution();
    });
    // Keep the room's keys from firing while typing.
    $('contribute-input').addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.closeContribute();
        e.preventDefault();
      }
      e.stopPropagation();
    });
    // Focus trap for the settings dialog.
    $('settings').addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...$('settings').querySelectorAll<HTMLElement>('button, input, select')].filter((x) => !x.hasAttribute('disabled'));
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    });
    this.syncSettingsUI();
  }

  private setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    this.prefs[k] = v;
    savePrefs(this.prefs);
    this.applyPrefs();
    this.syncSettingsUI();
  }

  private applyPrefs() {
    const p = this.prefs;
    if (this.audio) {
      this.audio.setVolume(p.volume);
      this.audio.setMuted(p.muted);
      this.audio.intensity = p.intensity === 'gentle' ? 0.5 : 1;
    }
    if (this.voices) this.voices.speechFallback = p.speech;
    this.captions.enabled = p.captions;
    if (this.rig) this.rig.reducedMotion = p.reducedMotion;
    document.documentElement.classList.toggle('reduce-motion', p.reducedMotion);
    if (p.muted || !p.speech) this.voices?.stopSpeech();
    if (this.post) {
      this.post.reducedMotion = p.reducedMotion;
      this.post.intensityScale = p.intensity === 'gentle' ? 0.4 : 1;
    }
    if (this.renderer && this.post) {
      this.onResize();
      const size = p.quality === 'low' ? 512 : p.quality === 'medium' ? 1024 : 2048;
      const sh = this.lighting.key.shadow;
      if (sh.mapSize.x !== size) {
        sh.mapSize.set(size, size);
        sh.map?.dispose();
        sh.map = null as unknown as THREE.WebGLRenderTarget;
      }
      this.post.setSamples(p.quality === 'high' ? 4 : p.quality === 'medium' ? 2 : 0);
    }
  }

  private syncSettingsUI() {
    const p = this.prefs;
    $<HTMLInputElement>('opt-volume').value = String(p.volume);
    $<HTMLInputElement>('opt-mute').checked = p.muted;
    $<HTMLInputElement>('opt-captions').checked = p.captions;
    $<HTMLInputElement>('opt-speech').checked = p.speech;
    $<HTMLInputElement>('opt-motion').checked = p.reducedMotion;
    $<HTMLSelectElement>('opt-intensity').value = p.intensity;
    $<HTMLSelectElement>('opt-quality').value = p.quality;
  }

  openSettings() {
    if (this.mode !== 'room') return;
    this.mode = 'settings';
    if (document.pointerLockElement) document.exitPointerLock();
    this.rig.keys.clear();
    this.rig.cancelAttend();
    $('settings').hidden = false;
    $('resume').focus();
    if (this.audio) this.audio.ramp(this.audio.pause.gain, 0.3, 0.8);
    this.voices?.stopSpeech();
  }

  closeSettings() {
    if (this.mode !== 'settings') return;
    this.mode = 'room';
    $('settings').hidden = true;
    this.renderer.domElement.focus();
    if (this.audio) this.audio.ramp(this.audio.pause.gain, 1, 1.5);
  }

  openContribute() {
    if (this.mode !== 'room') return;
    this.mode = 'contribute';
    if (document.pointerLockElement) document.exitPointerLock();
    this.rig.keys.clear();
    this.rig.cancelAttend();
    $('contribute').hidden = false;
    const inp = $<HTMLInputElement>('contribute-input');
    inp.value = '';
    setTimeout(() => inp.focus(), 30);
  }

  closeContribute() {
    if (this.mode !== 'contribute') return;
    this.mode = 'room';
    $('contribute').hidden = true;
    $<HTMLInputElement>('contribute-input').value = '';
    this.renderer.domElement.focus();
  }

  private async submitContribution() {
    const inp = $<HTMLInputElement>('contribute-input');
    const text = inp.value.replace(/\s+/g, ' ').trim().slice(0, 140);
    inp.value = '';
    this.closeContribute();
    if (!text) return;
    const it = await this.interpreter.interpret(text);
    this.director.contribute(text, it);
  }

  // ─────────────────────────────── leaving ───────────────────────────────

  depart() {
    if (this.mode !== 'settings' && this.mode !== 'room') return;
    $('settings').hidden = true;
    this.mode = 'departed';
    const line = this.director.departureLine();
    this.director.depart();
    this.post.depart = 1;
    this.voices?.stopSpeech();
    if (this.audio) this.audio.silence(0.97, 9999);
    this.captions.clear();
    $('menu-btn').hidden = true;
    $('write-btn').hidden = true;
    const dep = $('departure');
    clearTimeout(this.departTimer);
    this.departTimer = window.setTimeout(() => {
      dep.hidden = false;
      requestAnimationFrame(() => dep.classList.add('on'));
      $('departure-line').textContent = line;
      setTimeout(() => $('departure-line').classList.add('on'), 1500);
      setTimeout(() => {
        $('return').hidden = false;
        $('return').focus();
        void this.audio?.suspend();
      }, 6000);
    }, this.prefs.reducedMotion ? 1500 : 4000);
  }

  returnToRoom() {
    if (this.mode !== 'departed') return;
    void this.audio?.resume();
    this.audio?.silence(0, 0.1);
    this.mode = 'room';
    this.director.returnAfterDeparture();
    // Back in from the dark, slowly: the overlay fades while the room lightens beneath it.
    this.post.depart = 0;
    this.rig.pos.set(0.15, 0, 2.55);
    this.rig.yaw = 0.06;
    this.rig.pitch = -0.06;
    this.rig.setKneel(false);
    this.rig.cancelAttend();
    const dep = $('departure');
    dep.classList.remove('on');
    $('departure-line').classList.remove('on');
    $('return').hidden = true;
    const hide = () => {
      if (!dep.classList.contains('on')) dep.hidden = true;
    };
    dep.addEventListener('transitionend', hide, { once: true });
    setTimeout(hide, 3600);
    $('menu-btn').hidden = false;
    $('write-btn').hidden = false;
    this.renderer.domElement.focus();
  }

  /**
   * QA/inspection hook (not exposed in the UI): advance the room's time by `seconds`
   * with the visitor held where they are, applying every cue as if lived through.
   */
  advance(seconds: number, step = 0.1) {
    const cam = this.rig.camera;
    for (let t = 0; t < seconds; t += step) {
      const input = {
        x: this.rig.pos.x - this.chair.group.position.x,
        z: this.rig.pos.z - this.chair.group.position.z,
        yaw: this.rig.yaw,
        pitch: this.rig.pitch,
        gazePhraseId: this.text.phraseOf(this.text.attention(cam)),
        gazeChair: false,
        nearSurface: this.room.nearWall(this.rig.pos.x, this.rig.pos.z),
        kneeling: this.rig.kneeling,
      };
      this.time += step;
      for (const c of this.director.tick(step, input, this.room.facing(this.rig.yaw))) this.apply(c.cue);
      this.text.update(step, this.time, cam, this.director.env, this.text.attention(cam), this.director.visitor.gazeFor);
    }
    this.enteredAt = Math.min(this.enteredAt, this.time - 30);
  }

  private updateDebug() {
    this.lastDebug = this.time;
    const s = this.director.snapshot();
    const peak = this.audio ? this.audio.peakDb().toFixed(1) : 'off';
    this.debugEl.textContent =
      `fps ${this.fps.toFixed(0)}  peak ${peak} dBFS  scale ${this.room.scale.toFixed(3)}  phrases ${PHRASES.length}  assets ${this.voices?.assetCount ?? 0}\n` +
      `phase ${s.phase}  gaze ${this.gazeId ?? '-'}${this.gazeChair ? ' [chair]' : ''}\n` +
      `visitor ${JSON.stringify(s.visitor)}\nfield ${JSON.stringify(s.field)}\nmotifs ${JSON.stringify(s.memory.strength)} formed ${s.memory.formed.join(',')}\n` +
      `env ${JSON.stringify(Object.fromEntries(Object.entries(this.director.env).map(([k, v]) => [k, +v.toFixed(2)])))}\n` +
      `situations ${JSON.stringify(s.situations)}\n` +
      `met again ${s.encounters.join(' ')}\n` +
      `pending\n  ${s.pending.join('\n  ')}\nrecent\n  ${s.recent.join('\n  ')}`;
  }
}
