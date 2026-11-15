import type {
  DepositKind,
  EnemyDef,
  EntityKind,
  ResourceId,
  ShipKinematics,
  ShipStats,
} from '@spacebound/shared';
import type { PlayerSession } from './PlayerSession';

export interface PlayerInput {
  seq: number;
  mx: number;
  my: number;
  aim: number;
  fire: boolean;
  mine: boolean;
}

export const NEUTRAL_INPUT: PlayerInput = { seq: 0, mx: 0, my: 0, aim: 0, fire: false, mine: false };

export interface PlayerEntity extends ShipKinematics {
  kind: 'p';
  id: number;
  session: PlayerSession;
  radius: number;
  hull: number;
  shield: number;
  energy: number;
  dead: boolean;
  safe: boolean;
  docked: boolean;
  lastDamageAt: number;
  nextFireAt: number;
  input: PlayerInput;
  inputQueue: PlayerInput[];
  lastProcessedSeq: number;
  miningDepositId: number;
  mineAccum: number;
  mineXpAccum: number;
  cargoFullNotifiedAt: number;
}

export interface EnemyEntity extends ShipKinematics {
  kind: 'e';
  id: number;
  def: EnemyDef;
  spawnIndex: number;
  homeX: number;
  homeY: number;
  radius: number;
  hull: number;
  shield: number;
  state: 'idle' | 'chase' | 'return';
  targetId: number;
  wanderX: number;
  wanderY: number;
  nextWanderAt: number;
  nextFireAt: number;
  lastDamageAt: number;
  strafeDir: number;
  nextStrafeSwitchAt: number;
  /** Damage dealt by each player id – used for reward distribution and threat. */
  threat: Map<number, number>;
  stats: Pick<ShipStats, 'speed' | 'acceleration' | 'maneuverability'>;
}

export interface Deposit {
  id: number;
  spawnIndex: number;
  resource: ResourceId;
  kind: DepositKind;
  x: number;
  y: number;
  r: number;
  amount: number;
  max: number;
  yieldFactor: number;
}

export interface Projectile {
  id: number;
  ownerId: number;
  ownerKind: EntityKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  damage: number;
  weaponDamage: number;
  critChance: number;
  critDamage: number;
}

export interface Loot {
  id: number;
  x: number;
  y: number;
  resource: ResourceId;
  amount: number;
  expiresAt: number;
  /** Player entity id that has exclusive pickup rights until `ownerUntil`. */
  ownerId: number;
  ownerUntil: number;
}

export type Combatant = PlayerEntity | EnemyEntity;
