/**
 * Pushing what the visitor chose (preferences) and what the room is (its look) out to the parts
 * that draw and sound it: the lights, the room, the grade, the sound, the screen's size.
 */
import * as THREE from 'three';
import { lookFor, type PresetLookName } from '../world/Style';
import { samplesFor, shadowMapSize } from '../world/quality';
import { CLASS } from '../ui/dom';
import { gentle } from './presentation';
import type { AppContext } from './context';

/** Change the room's look (uniforms and light levels only: nothing compiles). */
export function setStyle(ctx: AppContext, name: PresetLookName): void {
  ctx.lookName = name;
  ctx.look = lookFor(name);
  applyLook(ctx);
}

/** Push the current look's values to the lights, the room, the grade and the chair. */
export function applyLook(ctx: AppContext): void {
  const l = ctx.look;
  ctx.lighting.look = l;
  ctx.room.setLook(l);
  ctx.post.grain = l.grain;
  ctx.post.vignette = l.vignette;
  ctx.post.vigLow = l.vigLow;
  ctx.chairContact = l.contact;
}

export function pixelRatio(ctx: AppContext): number {
  const dpr = devicePixelRatio || 1;
  const quality = ctx.prefs.quality;
  // Phones have small, dense screens: writing at ratio 1 is soft, so 'low' still renders at up to 1.5 there.
  return quality === 'low' ? Math.min(dpr, ctx.touch ? 1.5 : 1) : quality === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
}

export function resize(ctx: AppContext): void {
  const w = innerWidth, h = innerHeight;
  const pr = pixelRatio(ctx);
  ctx.renderer.setPixelRatio(pr);
  ctx.renderer.setSize(w, h);
  ctx.post.setSize(w, h, pr);
  ctx.rig.camera.aspect = w / h;
  ctx.rig.setAspect(w / h);
  ctx.rig.camera.updateProjectionMatrix();
}

export function applyPrefs(ctx: AppContext): void {
  const p = ctx.prefs;
  ctx.text.reducedMotion = p.reducedMotion;
  if (ctx.audio) {
    ctx.audio.setVolume(p.volume);
    ctx.audio.setMuted(p.muted);
    ctx.audio.intensity = gentle(p.intensity, 'audio');
  }
  if (ctx.voices) ctx.voices.speechFallback = p.speech;
  ctx.captions.enabled = p.captions;
  // Turned on to stop movement: no rise of the view to come either (the panel hides the cut).
  if (p.reducedMotion && !ctx.rig.reducedMotion) ctx.rig.stand();
  ctx.rig.reducedMotion = p.reducedMotion;
  document.documentElement.classList.toggle(CLASS.reduceMotion, p.reducedMotion);
  // (Changed while The Drive Home plays: its streetlights stop crossing, its light stays put.)
  ctx.street.reducedMotion = p.reducedMotion;
  ctx.street.strength = gentle(p.intensity, 'street');
  if (p.reducedMotion) ctx.lighting.cancelLean();
  if (p.muted || !p.speech) ctx.voices?.stopSpeech();
  ctx.post.reducedMotion = p.reducedMotion;
  ctx.post.intensityScale = gentle(p.intensity, 'post');
  resize(ctx);
  const size = shadowMapSize(p.quality);
  const sh = ctx.lighting.key.shadow;
  if (sh.mapSize.x !== size) {
    sh.mapSize.set(size, size);
    sh.map?.dispose();
    sh.map = null as unknown as THREE.WebGLRenderTarget;
    ctx.lighting.invalidateShadow();
  }
  ctx.post.setSamples(samplesFor(p.quality));
}
