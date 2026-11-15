import type * as THREE from 'three';

/** How a painted layer joins the wall (src/world/MemoryWindow.ts): pigment multiplies, light adds, sketch is the graphite, shade darkens. */
export type LayerKind = 'pigment' | 'light' | 'sketch' | 'shade';

/** A layer of a memory's painting, as the wall draws it. */
export interface WindowLayer {
  name: string;
  kind: LayerKind;
  texture: THREE.Texture;
}
