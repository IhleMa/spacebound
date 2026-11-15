import type { MapDef, SelfState } from '@spacebound/shared';
import type { Camera } from '../render/Camera';
import type { Effects } from '../render/effects';
import type { ClientWorld } from './ClientWorld';

export type TargetKind = 'e' | 'p' | 'd' | 'l';

export interface TargetRef {
  kind: TargetKind;
  id: number;
}

export interface ClientProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  color: string;
  /** Locally predicted projectile (own shot) – removed on visual collision. */
  local: boolean;
  hostileToMe: boolean;
}

export interface SceneView {
  map: MapDef;
  camera: Camera;
  world: ClientWorld;
  effects: Effects;
  projectiles: ClientProjectile[];
  myId: number;
  myName: string;
  myLevel: number;
  me: { x: number; y: number; angle: number; thrusting: boolean };
  self: SelfState;
  target: TargetRef | null;
  hover: TargetRef | null;
  time: number;
}
