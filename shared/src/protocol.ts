import type { DepositKind, MapId } from './data/maps';
import type { EnemyTypeId } from './data/enemies';
import type { ResourceBag, ResourceId } from './data/resources';
import type { ShipClassId } from './data/ships';
import type { UpgradeLevels, UpgradeTrack } from './data/upgrades';

// ───────────────────────────── Client → Server ─────────────────────────────

export interface AuthMsg { t: 'auth'; token: string }
export interface InputMsg {
  t: 'input';
  seq: number;
  mx: number;
  my: number;
  aim: number;
  fire: boolean;
  mine: boolean;
}
export interface UpgradeMsg { t: 'upgrade'; track: UpgradeTrack }
export interface RespawnMsg { t: 'respawn' }
export interface PingMsg { t: 'ping'; ts: number }

export type ClientMsg = AuthMsg | InputMsg | UpgradeMsg | RespawnMsg | PingMsg;

// ───────────────────────────── Server → Client ─────────────────────────────

export interface Profile {
  name: string;
  level: number;
  xp: number;
  xpNext: number;
  credits: number;
  storage: ResourceBag;
  storageCap: number;
  cargo: ResourceBag;
  shipClass: ShipClassId;
  upgrades: UpgradeLevels;
  kills: number;
  deaths: number;
}

export interface SelfState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hull: number;
  shield: number;
  energy: number;
  dead: boolean;
  safe: boolean;
  docked: boolean;
  /** Id of the deposit currently being mined (0 = none). */
  mining: number;
}

export interface PlayerSnap {
  id: number;
  name: string;
  x: number;
  y: number;
  a: number;
  /** Hull / shield in percent (0..100). */
  h: number;
  s: number;
  cls: ShipClassId;
  lvl: number;
  mining: number;
  dead: boolean;
}

export interface EnemySnap {
  id: number;
  type: EnemyTypeId;
  x: number;
  y: number;
  a: number;
  h: number;
  s: number;
  /** True when the enemy is currently hostile towards someone. */
  hostile: boolean;
}

export interface LootSnap {
  id: number;
  x: number;
  y: number;
  res: ResourceId;
  amt: number;
}

export interface DepositSnap {
  id: number;
  res: ResourceId;
  kind: DepositKind;
  x: number;
  y: number;
  r: number;
  amt: number;
  max: number;
}

export type EntityKind = 'p' | 'e';

export type GameEvent =
  | { e: 'shot'; id: number; o: number; ot: EntityKind; x: number; y: number; vx: number; vy: number; ttl: number; w: string }
  | { e: 'hit'; id: number; tid: number; tt: EntityKind; x: number; y: number; dmg: number; crit: boolean; miss: boolean; sh: boolean }
  | { e: 'boom'; x: number; y: number; size: number }
  | { e: 'expire'; id: number };

export interface WelcomeMsg {
  t: 'welcome';
  id: number;
  map: MapId;
  profile: Profile;
  self: SelfState;
  st: number;
}

export interface SnapshotMsg {
  t: 'snap';
  tick: number;
  /** Server time (ms) when the snapshot was produced. */
  st: number;
  /** Last input sequence number processed for this player. */
  ack: number;
  self: SelfState;
  players: PlayerSnap[];
  enemies: EnemySnap[];
  loot: LootSnap[];
  /** Present only every DEPOSIT_SYNC_EVERY ticks. */
  deposits?: DepositSnap[];
  events: GameEvent[];
  online: number;
}

export type NotifyLevel = 'info' | 'success' | 'warn' | 'error' | 'loot' | 'level';

export interface ProfileMsg { t: 'profile'; profile: Profile }
export interface NotifyMsg { t: 'notify'; level: NotifyLevel; text: string }
export interface PongMsg { t: 'pong'; ts: number; st: number }
export interface KickedMsg { t: 'kicked'; reason: string }

export type ServerMsg = WelcomeMsg | SnapshotMsg | ProfileMsg | NotifyMsg | PongMsg | KickedMsg;

// ───────────────────────────── HTTP API ─────────────────────────────

export interface AuthRequest { username: string; password: string }
export interface AuthResponse { token: string; username: string }
export interface ApiError { error: string }
