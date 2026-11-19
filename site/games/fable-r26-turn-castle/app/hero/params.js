// All dimensions of the hero mechanism in one place (metres, seconds, radians).
// Every part in parts.js is generated from these numbers; the couplings in hero.js
// (gear ratios, cams, linkages) read the same numbers, so geometry and motion cannot drift apart.
// Angles: around +Y, measured from +Z (front, towards the camera) towards +X (screen right).

const DEG = Math.PI / 180;

export const PARAMS = {
  // ---- overall layout (docs/HERO-SPEC.md §1)
  FLOORS: 3,
  FLOOR_H: 1.5,            // floor-to-floor height
  FLOOR_Y0: 0.15,          // top of floor 0; floor i is at FLOOR_Y0 + i * FLOOR_H
  STEPS: 8,                // detent positions per turn (45° each)
  R_OUT: 2.6,              // ring outer radius
  R_CORE: 0.7,             // fixed centre column radius
  // hero.bounds = the real extent over all stages (turret roofs in x, back wall / ring rim in z, raised flag in y)
  BOUNDS: { X: 3.3, Z_BACK: -2.85, Z_FRONT: 2.85, TOP: 8.1 },

  // ---- P1 floor rings (turntables)
  RING: {
    R_IN: 1.72,            // inner radius: everything inside is the open stairwell
    T: 0.12,               // slab thickness
    SEG: 64,               // segments around (low tier: half)
    TILE: 1.7,             // metres per wood texture repeat
  },
  START_STEPS: [2, -3, -2], // initial offset of each ring from its connected position, in detent steps
  SPRING_W: 14,            // critically damped snap to the detent (rad/s)
  FLICK_GAIN: 0.1,         // seconds of drag velocity added when choosing the detent on release
  PROXY: { R: 2.9, H: 1.35 }, // invisible grab cylinder per floor (finger sized: 1.35 m ≈ 120 px tall)

  // ---- P4 spiral stairs: one flight per ring, standing in the stairwell, zig-zagging up the front
  STAIR: {
    N: 8,                  // risers per flight (rise = FLOOR_H / N)
    BETA: 90 * DEG,        // angle swept by one flight (N treads)
    R_IN: 0.78,            // tread inner radius (clears the column collars)
    R_OUT: 1.69,           // tread outer radius (clears the ring above, RING.R_IN)
    TREAD_T: 0.06,
    DIR: [1, -1, 1],       // chirality per ring: +1 climbs towards +angle, -1 towards -angle
    FOOT0: -67.5 * DEG,    // foot of flight 0 when connected; flight i+1 starts where flight i ends
    PLAT_W: 45 * DEG,      // landing at the top of each flight (cargo waits here)
    SLOT_NEAR: 0.30,       // waiting places on a landing, as a fraction of PLAT_W from the stair edge
    SLOT_FAR: 0.72,
    SLOT_DR: 0.2,          // the near place is this much inside the path radius, the far place outside (both stay visible)
    POST_R: 1.725, POST_W: 0.06, // posts that carry the flight, standing on the ring's inner edge
  },

  // ---- drawbridge: the lowest BRIDGE_N treads fold up so a turning flight clears cargo on the landing below
  BRIDGE: {
    N: 3,                  // folded treads (the hinge is at the nose of tread N+1)
    UP: 100 * DEG,         // folded-up angle about the hinge
    WIDTH: 0.72,
    SEC: 0.5,              // lowering time
  },

  // ---- P3 doors: a gate on tread BRIDGE.N+1 of every flight + the tower door
  GATE: {
    HALF_W: 0.31,          // half clear width (leaf width = HALF_W - 0.015)
    POST_H: 0.5,           // straight part of the leaf / post height
    OPEN: 100 * DEG,       // leaf swing: OPEN * smoothstep(t / SEC)
    SEC: 0.45,
  },

  // ---- P5 detent: wavy cam track on the ring, roller pawl on the right turret
  DETENT: {
    WAVES: 16,             // bumps per turn (2 per detent step)
    DEPTH: 0.05,           // cam lift: h = DEPTH * |sin(WAVES/2 * theta)|
    TRACK_R0: 2.42, TRACK_R1: 2.5,
    ANGLE: 52 * DEG,       // where the roller touches the track
    ARM: 0.34,             // pawl arm length
    ROLLER_R: 0.04,
    PIVOT_H: 0.14,         // pivot height above the floor
  },

  // ---- P6 gear train: spur teeth on the ring rim drive a pinion on the left turret
  GEAR: {
    Z_RING: 96,            // teeth on the ring rim (low tier: 48)
    Z_PINION: 12,          // pinion teeth (low tier: 6) -> theta_p = -(Z_RING / Z_PINION) * theta_ring = -8 theta
    TOOTH_H: 0.045,        // radial tooth height
    TOOTH_T: 0.09,         // tooth thickness (vertical)
    ANGLE: -53 * DEG,      // where the pinion meshes with the rim
  },

  // ---- P12 marks: rim trim + chasing lamps
  LAMPS: 16,
  LAMP_R: 2.56,
  TRIM_TUBE: 0.035,

  // ---- fixed shell (back wall with windows, turrets, roof deck)
  SHELL: {
    R_IN: 2.68, T: 0.16,
    CUT: 65 * DEG,         // the wall is left out for |angle| < CUT (cut-away front)
    WINDOWS: [110, 150, 210, 250], // window centres per floor (degrees)
    WIN_W: 0.5, WIN_SILL: 0.5, WIN_H: 0.38, WIN_ARCH: 0.25,
    TURRET_ANGLE: 70 * DEG, TURRET_RC: 2.9, TURRET_R: 0.4, TURRET_TOP: 4.35, TURRET_ROOF: 0.95, // lower than the roof deck: the tower stays the star
    PARAPET_H: 0.3, MERLONS: 19, MERLON_H: 0.22,
    TINT: [0xfff0d6, 0xffd9e6, 0xe6dcff], // inside wall colour per floor
  },

  // ---- P10 tower: onion dome made of 6 gores (petals) on a rack-and-pinion drive
  TOWER: {
    STEM_R: 0.74,          // stem radius above the roof (below the corbel)
    CUP_R: 1.12,           // calyx rim radius
    HINGE_R: 0.9,          // petal hinge radius
    HINGE_Y: 5.8,          // petal hinge height
    PETALS: 6,
    PETAL_H: 1.3,          // closed dome height above the hinge (gore arc length ≈ 1.83, widest radius 0.94)
    OPEN: 88 * DEG,        // opening angle (a bowl: the far petals show their inside, the cargo stays visible)
    SECTOR_R: 0.3,         // pitch radius of the sector gear on each petal hinge
    SECTOR_Z: 12,          // teeth of the full gear the sector is cut from (pitch = 2π·SECTOR_R / SECTOR_Z)
    PED_R: 0.56,           // pedestal (lift) body radius; rack ribs reach HINGE_R - SECTOR_R
    PED_LEN: 2.0,
    DOOR_HALF_W: 0.31,
    OPEN_SEC: 1.3,         // phi(t) = OPEN * easeOutBack(t / OPEN_SEC)
    LIFT_SEC: 0.9,         // hidden rise from the roof to the hinge height
    ENTER_SEC: 1.45,       // door opens, chest and teddy walk in (chest from 0.25 s, teddy from 0.6 s)
    LIFT_AT: 1.6,          // the lift starts (the door has closed)
    POLE_SEC: 0.8,         // flag pole extension time
    END_PAD: 0.5,          // from the fully open dome to `finished`
  },

  // ---- P11 flag
  FLAG: {
    POLE: 1.7, POLE_R: 0.025,
    W: 0.6, H: 0.4, SEG_W: 8, SEG_H: 4,
    WAVE: 0.11,            // z = WAVE * u * sin(6 t - 6.4 u), u = x / W (0 at the pole, 1 at the free edge)
    RISE_FROM: 0.6,        // pole starts rising when the dome is 60 % open
  },

  // ---- P7/P8 cargo: chest + teddy hop up the flight
  CARGO: {
    CHEST_SCALE: 1.25,     // chest 0.45 wide, 0.42 tall
    TEDDY_SCALE: 1.3,      // teddy 0.53 tall (must stay below the folded drawbridge: 0.69)
    HOP_SEC: 0.16,         // one tread
    HOP_H: 0.07,           // extra height of a hop
    ROLL_IN: 0.28, ROLL_OUT: 0.32,
    FOLLOW_DELAY: 0.4,     // the follower starts this much later (2.5 hops: its notes fall between the leader's)
    LID_OPEN: 70 * DEG,    // chest lid cam: 70° * max(0, sin(pi v))
  },

  // ---- timing of one connection chain (seconds from the lock)
  CHAIN: {
    BRIDGE_AT: 0.1,
    GATE_AT: 0.4,
    CLIMB_AT: 0.7,
    LID_SEC: 0.45,
  },
  RESET_SEC: 1.3,
  SPARKLES: 48,            // pool size (low tier: half)
};

export const DEGREE = DEG;
