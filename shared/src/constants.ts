/** Authoritative simulation rate of the server (ticks per second). */
export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
export const TICK_MS = 1000 / TICK_RATE;

/** Radius around a player inside which entities are replicated to that player. */
export const VIEW_RADIUS = 1500;

/** Deposits change slowly, so they are replicated less often (every N ticks). */
export const DEPOSIT_SYNC_EVERY = 10;

/** Delay used by the client when interpolating remote entities (ms). */
export const INTERPOLATION_DELAY_MS = 110;

/** Seconds without taking damage before shields start regenerating. */
export const SHIELD_REGEN_DELAY = 3;

/** Hull repair rate inside a safe zone (fraction of max hull per second). */
export const SAFE_ZONE_REPAIR_RATE = 0.08;

/** Base storage capacity per resource. Raised by future storage upgrades / technologies. */
export const BASE_STORAGE_CAPACITY = 5000;

/** Seconds a dropped loot container stays in the world. */
export const LOOT_LIFETIME = 60;
/** Seconds during which only the owner (top damage dealer) may collect a loot container. */
export const LOOT_OWNER_LOCK = 12;

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export const PASSWORD_MIN = 6;

/** Input queue protection: the server processes exactly one input per tick. */
export const MAX_INPUT_QUEUE = 6;
