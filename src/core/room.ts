/** The room as built (metres). The chair stands at the origin. */
// 3.6 m high: a taller box than a house's room (the artist's reference is this proportion).
export const ROOM = { halfW: 3.2, halfD: 3.2, height: 3.6 };

/** The door: where its sounds and voices come from (the switch, a vignette's door). */
export const DOOR_AT = { x: 0.9, y: 1.25, z: ROOM.halfD - 0.1 } as const;
