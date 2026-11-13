import * as THREE from 'three';
import { ROOM } from '../core/room';
import { hashString } from '../core/rng';
import { sleep } from '../core/time';
import { wallClock } from '../world/WallText';
import type { Cue, VoicePosition } from '../state/cues';
import type { Surface } from '../content/types';
import type { VoicePlacement, Played } from '../audio/Voices';
import VOICE_TIMINGS from '../content/voice-timings.json';
import { FRAGMENT_IDS } from '../content/ids';
import { gentle, gentleDim } from './presentation';
import type { AppContext, Peers } from './context';

/**
 * What the Director asks of the room: each cue (`apply`), as the walls, the light, the sound and
 * the chair carry it out, and the places those cues name.
 */
export class Cues {
  constructor(
    private readonly ctx: AppContext,
    private readonly peers: Peers,
  ) {}

  apply(cue: Cue) {
    switch (cue.type) {
      case 'reveal':
        this.ctx.text.reveal(cue.phraseId, cue.seconds * (this.ctx.prefs.reducedMotion ? 0.7 : 1));
        break;
      case 'hide':
        this.ctx.text.hide(cue.phraseId, cue.seconds);
        break;
      case 'redraw':
        this.ctx.text.redraw(cue.key ?? cue.phraseId);
        break;
      case 'write': {
        const c = this.ctx.chair.group.position;
        const near = cue.nearPoint && cue.surface === 'floor'
          ? { u: c.x + cue.nearPoint.x + ROOM.halfW, v: c.z + cue.nearPoint.z + ROOM.halfD }
          : cue.surface && !cue.beside ? this.viewPointOn(cue.surface, cue.purpose === 'recall') : undefined;
        const size = this.ctx.touch && cue.size === 'xs' && cue.purpose === 'recall' ? 's' : cue.size;
        // A memory's line by the drawing it opens from; looking at the drawing is reading it too.
        if (cue.under && cue.source) this.ctx.text.drawingMeans(cue.under, cue.source);
        const ok = this.ctx.text.write({ key: cue.key, text: cue.text, hand: cue.hand, size, beside: cue.beside, surface: cue.surface, near, by: cue.under, purpose: cue.purpose, ttl: cue.ttl, now: this.ctx.time, source: cue.source, start: !cue.found });
        if (ok && cue.found) this.ctx.text.appear(cue.key, 5);
        if (ok && cue.strike) this.ctx.text.strike(cue.strike, this.ctx.time, cue.ttl);
        if (!ok) this.ctx.director.writeFailed(cue.key);
        break;
      }
      case 'link':
        this.ctx.text.link(cue.a, cue.b, cue.ttl, this.ctx.time);
        break;
      case 'voice':
        void this.playVoice(cue);
        break;
      case 'music':
        if (this.ctx.music && this.ctx.audio) {
          if (cue.melody?.length) this.ctx.music.playMelody(cue.melody, cue.stopAt);
          else this.ctx.music.play(cue.mood, cue.notes, cue.truncate);
        }
        break;
      case 'sound':
        if (this.ctx.voices && this.ctx.audio) void this.ctx.voices.sound(cue.kind, this.place(cue.position), cue.gain);
        break;
      case 'stopVoice':
        this.ctx.voices?.stop(cue.tag, cue.fade);
        break;
      case 'glow': {
        const c = this.ctx.chair.group.position;
        this.ctx.lighting.leaveResidue(c.x + cue.x, c.z + cue.z, cue.amount * gentle(this.ctx.prefs.intensity, 'light'), cue.seconds, this.ctx.time);
        break;
      }
      case 'chairTurn': {
        const c = this.ctx.chair.group.position;
        this.ctx.chair.turnToward(c.x + cue.x, c.z + cue.z, cue.amount);
        break;
      }
      case 'erode':
        this.ctx.text.erode(cue.key, cue.keep, this.ctx.time);
        break;
      case 'vignette': {
        void this.peers.vignettes.playVignette(cue.id, cue.variant, false, cue.phraseId).then((ok) => {
          if (!ok) this.ctx.director.memoryFailed(cue.id);
        });
        break;
      }
      case 'memory-scene': {
        void this.peers.living.playMemory(cue.id, cue.phraseId, cue.variant, cue.voices).then((ok) => {
          if (!ok) this.ctx.director.memoryFailed(cue.id);
        });
        break;
      }
      case 'memory': {
        const a = this.ctx.text.anchorOf(cue.phraseId, this.ctx.gazeId ?? this.ctx.lastTappedKey);
        if (!a) break;
        this.ctx.memoryLight.reducedMotion = this.ctx.prefs.reducedMotion;
        this.ctx.memoryLight.strength = gentle(this.ctx.prefs.intensity, 'light');
        // The room hushes first; 0.8 s later the light arrives; the present comes back only after it has gone.
        const lead = 0.8, total = cue.attack + cue.hold + cue.release;
        this.ctx.memoryLight.start(a.group, a.x, a.y, a.w, a.h, a.minX, a.maxX, a.maxY, cue, this.ctx.time, lead);
        this.ctx.memoryKey = a.key;
        this.ctx.audio?.silence(0.55, lead + total, 1.4, 2.5);
        // And the room's own light gives way a little: the memory is brighter than the present.
        this.ctx.lighting.dimToChair(0.93, lead + total, this.ctx.time);
        break;
      }
      case 'draw':
        if (!this.ctx.text.draw(cue.id)) this.ctx.director.drawFailed(cue.id);
        break;
      case 'air': {
        // Between the chair and the visitor, nearer the chair, facing where they stand.
        const c = this.ctx.chair.group.position;
        const p = this.ctx.rig.camera.getWorldPosition(new THREE.Vector3());
        const dir = new THREE.Vector3(p.x - c.x, 0, p.z - c.z);
        if (dir.lengthSq() < 1e-4) break;
        dir.normalize();
        // To the visitor's left, so the chair stands at the end of the line rather than under its middle.
        const at = new THREE.Vector3(c.x + dir.x * cue.toward - dir.z * cue.aside, cue.height, c.z + dir.z * cue.toward + dir.x * cue.aside);
        this.ctx.text.writeInAir({ key: `air:${cue.phraseId}`, phraseId: cue.phraseId, at, face: p, light: this.ctx.lighting.key.position, now: this.ctx.time });
        break;
      }
      case 'silence':
        // A silence dimmed for its whole length (at the chair): its sound starts back a few seconds
        // before its light does (heard, then seen).
        if (cue.dim !== undefined && cue.dimSeconds === cue.seconds) this.ctx.audio?.silence(cue.depth * gentle(this.ctx.prefs.intensity, 'sound'), Math.max(1, cue.seconds - 8), cue.fall ?? 1.4, cue.rise ?? 2.5);
        else this.ctx.audio?.silence(cue.depth * gentle(this.ctx.prefs.intensity, 'sound'), cue.seconds, cue.fall, cue.rise);
        if (cue.dim !== undefined) this.ctx.lighting.dimToChair(gentleDim(this.ctx.prefs.intensity, cue.dim), Math.min(cue.seconds, cue.dimSeconds ?? 11), this.ctx.time);
        break;
      case 'lift':
        // The room is heard coming back first; its light follows two seconds later.
        this.ctx.audio?.lift(cue.seconds);
        this.ctx.lighting.liftDim(this.ctx.time + 2, cue.seconds);
        break;
      case 'chairNudge':
        this.ctx.chair.nudge(cue.dx, cue.dz, cue.dyaw);
        break;
      case 'flash':
        this.ctx.lighting.triggerFlash(cue.kind, cue.amount * gentle(this.ctx.prefs.intensity, 'flash'), cue.seconds, this.ctx.time);
        break;
      case 'leave':
        // They stood at the door and the room let them go.
        this.peers.menus.depart('door');
        break;
      case 'flinch': {
        // Sound first (a 70 ms fall, held a moment, back soon), then the room's light pulls back
        // toward the chair a quarter-second later: in over 0.9 s, held 1 s, out over 5 s.
        const intensity = this.ctx.prefs.intensity;
        this.ctx.audio?.silence(0.62 * cue.amount * gentle(intensity, 'sound'), 1.2, 0.07, 1.5);
        // The second time the room stays as it is and the chair's own light goes: the hurt in the chair.
        const to = cue.chair ? 1 : 1 - 0.28 * cue.amount * gentle(intensity, 'flinchDim');
        this.ctx.lighting.dimToChair(to, 0.9 + 1 + 5, this.ctx.time, { delay: 0.25, fall: 0.9, rise: 5, glow: gentle(intensity, 'flinchGlow'), key: cue.chair ? 0.4 * gentle(intensity, 'light') : 0 });
        break;
      }
    }
  }

  /** The drawings on a wall (their rectangles in its group's metres). */
  drawingsOn(group: THREE.Object3D): { x: number; y: number; w: number; h: number }[] {
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (const it of this.ctx.text.items.values()) {
      if (it.purpose !== 'drawing' || it.vis < 0.2) continue;
      const a = this.ctx.text.anchorOfKey(it.key);
      if (a && a.group === group) out.push({ x: a.x, y: a.y, w: a.w, h: a.h });
    }
    return out;
  }

  /**
   * Where the view meets a surface. `level`: along the view's heading, not its pitch, and at a
   * height a line can be read at: a line offered for a memory to someone looking down at the
   * chair was written above the frame (interaction designer, 2026-11-06).
   */
  private viewPointOn(surface: Surface, level = false): { u: number; v: number } | undefined {
    const frame = this.ctx.room.frames[surface];
    const wall = surface !== 'floor' && surface !== 'ceiling';
    if (level && wall) {
      const cam = this.ctx.rig.camera;
      const dir = cam.getWorldDirection(new THREE.Vector3()).setY(0);
      if (dir.lengthSq() > 1e-6) {
        this.ctx.raycaster.set(new THREE.Vector3(cam.position.x, 1.35, cam.position.z), dir.normalize());
        const hit = this.ctx.raycaster.intersectObject(frame.mesh, false)[0];
        if (hit) {
          const local = frame.group.worldToLocal(hit.point.clone());
          return { u: local.x / this.ctx.room.scale + frame.size.w / 2, v: local.y + frame.size.h / 2 };
        }
      }
    }
    this.ctx.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.ctx.rig.camera);
    const hit = this.ctx.raycaster.intersectObject(frame.mesh, false)[0];
    if (!hit) return undefined;
    const local = frame.group.worldToLocal(hit.point.clone());
    const s = this.ctx.room.scale;
    if (surface === 'floor') return { u: local.x / s + frame.size.w / 2, v: frame.size.h / 2 - local.y / s };
    if (surface === 'ceiling') return { u: local.x / s + frame.size.w / 2, v: local.y / s + frame.size.h / 2 };
    return { u: local.x / s + frame.size.w / 2, v: local.y + frame.size.h / 2 };
  }

  place(p: VoicePosition): VoicePlacement {
    const c = this.ctx.chair.group.position;
    const cam = this.ctx.rig.camera.position;
    switch (p.kind) {
      case 'chair':
        return { from: [c.x, 0.45, c.z] };
      case 'behind': {
        const f = this.ctx.rig.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
        return { from: [cam.x - f.x * 1.1, cam.y, cam.z - f.z * 1.1] };
      }
      case 'nowhere':
        return { nowhere: true };
      case 'beyond': {
        const hw = this.ctx.room.halfW, hd = this.ctx.room.halfD;
        const r = (hashString(String(this.ctx.time)) % 100) / 100 - 0.5;
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
        const w = this.ctx.text.centreOf(p.phraseId);
        return w ? { from: [w.x, w.y, w.z] } : { from: [c.x, 0.5, c.z] };
      }
      case 'approach': {
        const sx = cam.x > 0 ? -1 : 1, sz = cam.z > 0 ? -1 : 1;
        return { from: [sx * this.ctx.room.halfW * 0.9, 1.5, sz * this.ctx.room.halfD * 0.9], to: [c.x, 0.6, c.z] };
      }
    }
  }

  async playVoice(cue: Extract<Cue, { type: 'voice' }>) {
    let dur = 3;
    if (cue.lead && this.ctx.audio) {
      // Falls fast enough to be felt before the first word (and never lifts a deeper silence).
      this.ctx.audio.silence(0.4 * gentle(this.ctx.prefs.intensity, 'sound'), cue.lead + 3.5, 0.4);
      await sleep(cue.lead * 1000);
      if (this.ctx.mode === 'departed') return;
    }
    let played: Played = { duration: 0 };
    if (this.ctx.voices && this.ctx.audio) {
      const assetKey = cue.assetId ?? (cue.phraseId ? `phrase:${cue.phraseId}` : undefined);
      played = await this.ctx.voices.playLine(cue.kind, cue.text, { ...this.place(cue.position), tag: cue.tag }, cue.gain, assetKey, {
        melody: cue.melody, synth: cue.synth, performances: cue.performances,
      });
      dur = played.duration;
    }
    // What is said can become writing: written where the line belongs as it is heard, or an
    // unfinished line finished as its missing words are spoken.
    if (cue.phraseId && cue.write) this.writeWithVoice(cue.phraseId, played);
    if (cue.phraseId && cue.finish) this.finishWithVoice(cue.phraseId, played);
    if (dur > 0) this.ctx.captions.show(cue.caption, dur, cue.text === null);
  }

  /** Write a piece of writing following the recording just played (or at the hand's own pace if there is none). */
  writeWithVoice(key: string, played: Played): number {
    const heard = this.heardAs(played);
    if (heard) return this.ctx.text.writeOn(key, { speech: heard.timing.chars, audioStart: heard.audioStart });
    return this.ctx.text.writeOn(key);
  }

  /** Finish an unfinished line: the hand goes on as the first missing word is heard. */
  finishWithVoice(id: string, played: Played) {
    const heard = this.heardAs(played);
    if (!heard) return this.ctx.text.finish(id, 0.6);
    const at = this.ctx.text.nextWordStart(id);
    const wordHeard = at !== null && heard.timing.chars[at] ? heard.audioStart + heard.timing.chars[at][0] : wallClock() + 0.6;
    this.ctx.text.finish(id, Math.max(0, wordHeard - wallClock()));
  }

  /**
   * When (wall clock) a recording just played is heard to begin, and its character timing, if it
   * has any (generated with the recording): what lets a hand write as the voice speaks.
   */
  private heardAs(played: Played): { timing: { chars: [number, number][] }; audioStart: number } | null {
    const timing = played.file ? (VOICE_TIMINGS as unknown as Record<string, { chars: [number, number][] }>)[played.file] : undefined;
    if (!timing || played.startAt === undefined || !this.ctx.audio) return null;
    const ctx = this.ctx.audio.ctx;
    const latency = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0;
    return { timing, audioStart: wallClock() + (played.startAt - ctx.currentTime) + latency };
  }

  /** A word written in the air was rubbed out by someone coming close: an eraser where it was, and a breath. */
  airGone(how: string, at: THREE.Vector3) {
    const { voices, audio, captions } = this.ctx;
    if (how !== 'approach' || !voices || !audio) return;
    const place = { from: [at.x, at.y, at.z] as [number, number, number] };
    void voices.sound('eraser', place, 0.35).then((dur) => {
      if (dur > 0 && !captions.speaking) captions.say('rubbedOut', '[rubbed out]', dur);
    });
    void sleep(200).then(() => this.ctx.voices?.playLine('breath', null, place, 0.12, FRAGMENT_IDS.breath));
  }
}
