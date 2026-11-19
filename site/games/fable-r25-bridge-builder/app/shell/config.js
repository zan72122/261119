// Shared constants for the shell. Units: metres, +Y up, hero root = world origin, forward = -Z.
// yaw = rotation about +Y (three.js rotation.y); 0 faces -Z, positive turns left (-X).

/** Rounds: the banks the machine connects, in order. Mirrors docs/HERO-SPEC.md §3. */
export const TARGETS = [
  { id: 'A', yaw: 0.80, distance: 6.5, height: 0.30, launchYaw: 0, color: 0xff7eb6, islandRadius: 2.4 },
  { id: 'B', yaw: -0.80, distance: 7.5, height: 0.45, launchYaw: 0, color: 0xffd23f, islandRadius: 2.6 },
  { id: 'C', yaw: 0.0, distance: 10.0, height: 0.15, launchYaw: 0, color: 0x6ec6ff, islandRadius: 3.2 },
];

/** Landing point of a target in world coordinates. */
export function landingPoint(t, out) {
  return out.set(-Math.sin(t.yaw) * t.distance, t.height, -Math.cos(t.yaw) * t.distance);
}

export const WORLD = {
  waterY: -3.0,
  valleyY: -2.6,
  heroClearRadius: 1.8,
};

/** Hard performance limits (docs/PLAN.md §3). The debug overlay turns red when exceeded. */
export const BUDGET = {
  trisTotal: 100000,
  trisHero: 50000,
  trisScene: 50000,
  gpuMiB: 128,
  heroTextures: 4,
  heroTexSize: 1024,
  sceneTexSize: 512,
  heroDrawCalls: 60,
  sceneDrawCalls: 40,
};

export const SOUND_NAMES = ['tick', 'ratchet', 'creak', 'clunk', 'lock', 'sparkle', 'pop', 'whoosh', 'hint'];
