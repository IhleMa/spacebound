import { describe, expect, it } from 'vitest';
import { ENEMIES, MAPS, TICK_DT, upgradeCost, type InputMsg } from '@spacebound/shared';
import { World } from '../src/game/World';
import { PlayerSession } from '../src/game/PlayerSession';
import { GameServer } from '../src/game/GameServer';
import { FakeConnection, createAccount, seeded, setupDb } from './helpers';

const map = MAPS.frontier!;

async function worldWithPlayer(name = 'tester') {
  const { repo, auth, db } = setupDb();
  const account = await createAccount(auth, name);
  const state = repo.loadOrCreate(account.id, account.username);
  const world = new World('test-1', map, seeded(7));
  const conn = new FakeConnection();
  const session = new PlayerSession(conn, state);
  const p = world.addPlayer(session);
  return { world, session, p, conn, repo, db, state };
}

function hold(p: { inputQueue: unknown[]; input: object }, input: Partial<InputMsg>) {
  Object.assign(p.input, { mx: 0, my: 0, aim: 0, fire: false, mine: false, ...input });
}

describe('auth', () => {
  it('registers, logs in and resolves tokens', async () => {
    const { auth } = setupDb();
    const reg = await auth.register('Pilot_1', 'hunter22');
    expect(auth.resolveToken(reg.token)?.username).toBe('Pilot_1');
    const login = await auth.login('pilot_1', 'hunter22');
    expect(login.account.id).toBe(reg.account.id);
    await expect(auth.login('Pilot_1', 'wrong-pass')).rejects.toThrow();
    await expect(auth.register('PILOT_1', 'whatever1')).rejects.toThrow(/taken/);
    await expect(auth.register('x', 'whatever1')).rejects.toThrow();
    expect(auth.resolveToken('not-a-real-token-at-all-123')).toBeNull();
  });
});

describe('economy state', () => {
  it('enforces cargo capacity and never goes negative', async () => {
    const { state } = await worldWithPlayer();
    const cap = state.stats.cargoCapacity;
    expect(state.addResource('cargo', 'iron', cap + 50, 'test')).toBe(cap);
    expect(state.addResource('cargo', 'copper', 10, 'test')).toBe(0);
    expect(state.removeResource('cargo', 'iron', cap + 999, 'test')).toBe(cap);
    expect(state.getResource('cargo', 'iron')).toBe(0);
    expect(state.trySpendCredits(1, 'test')).toBe(false);
  });

  it('persists state and ledger atomically and reloads it', async () => {
    const { state, repo, db } = await worldWithPlayer();
    state.addCredits(500, 'test');
    state.addResource('storage', 'iron', 120, 'test');
    state.addResource('cargo', 'silicon', 7, 'test');
    state.upgrades.engine = 2;
    repo.saveMany([state]);
    const reloaded = repo.loadOrCreate(state.accountId, state.name);
    expect(reloaded.credits).toBe(500);
    expect(reloaded.storage.iron).toBe(120);
    expect(reloaded.cargo.silicon).toBe(7);
    expect(reloaded.upgrades.engine).toBe(2);
    const ledger = db.prepare('SELECT asset, delta, balance_after FROM ledger WHERE account_id = ? ORDER BY id').all(state.accountId);
    expect(ledger).toContainEqual({ asset: 'credits', delta: 500, balance_after: 500 });
  });
});

describe('world simulation', () => {
  it('processes only one input per tick (no speed hacks via flooding)', async () => {
    const { world, p } = await worldWithPlayer();
    for (let i = 1; i <= 20; i++) p.inputQueue.push({ seq: i, mx: 1, my: 0, aim: 0, fire: false, mine: false });
    world.step(TICK_DT);
    expect(p.lastProcessedSeq).toBe(1);
    expect(p.inputQueue.length).toBe(19);
  });

  it('mines a deposit into the cargo hold when in range', async () => {
    const { world, p, state } = await worldWithPlayer();
    const dep = [...world.deposits.values()].find((d) => d.resource === 'iron')!;
    p.x = dep.x + dep.r + 20;
    p.y = dep.y;
    world.depositGrid.rebuild(world.deposits.values());
    hold(p, { mine: true });
    const before = dep.amount;
    for (let i = 0; i < 40; i++) world.step(TICK_DT); // 2 seconds
    expect(p.miningDepositId).toBe(dep.id);
    const mined = state.getResource('cargo', 'iron');
    expect(mined).toBeGreaterThanOrEqual(10);
    expect(dep.amount).toBe(before - mined);
  });

  it('does not mine when out of range', async () => {
    const { world, p, state } = await worldWithPlayer();
    p.x = 0;
    p.y = 0;
    hold(p, { mine: true });
    for (let i = 0; i < 20; i++) world.step(TICK_DT);
    expect(state.cargoUsed()).toBe(0);
  });

  it('unloads cargo into storage when docked', async () => {
    const { world, p, state } = await worldWithPlayer();
    state.addResource('cargo', 'copper', 40, 'test');
    p.x = 0;
    p.y = 0;
    world.step(TICK_DT);
    expect(state.getResource('cargo', 'copper')).toBe(0);
    expect(state.getResource('storage', 'copper')).toBe(40);
  });

  it('kills an enemy with weapons, granting xp, credits and loot', async () => {
    const { world, p, state } = await worldWithPlayer();
    const drone = [...world.enemies.values()].find((e) => e.def.id === 'scout_drone')!;
    // Freeze the drone in place and park the player next to it.
    drone.stats = { speed: 0, acceleration: 0, maneuverability: 0 };
    drone.def = { ...ENEMIES.scout_drone, weapon: 'drone_zapper' };
    p.x = drone.x - 200;
    p.y = drone.y;
    let ticks = 0;
    while (world.enemies.has(drone.id) && ticks < 600) {
      hold(p, { fire: true, aim: Math.atan2(drone.y - p.y, drone.x - p.x) });
      p.hull = 9999; // keep the test player alive
      world.step(TICK_DT);
      ticks++;
    }
    expect(world.enemies.has(drone.id)).toBe(false);
    expect(state.credits).toBeGreaterThanOrEqual(ENEMIES.scout_drone.credits[0]);
    expect(state.kills).toBe(1);
    expect(state.level * 1000 + state.xp).toBeGreaterThan(1000);
    expect(world.respawnQueue.some((r) => r.kind === 'enemy')).toBe(true);
  });

  it('server enforces weapon cooldown and energy', async () => {
    const { world, p } = await worldWithPlayer();
    p.x = 2000;
    p.y = 2000;
    hold(p, { fire: true });
    let shots = 0;
    for (let i = 0; i < 20 * 10; i++) {
      world.step(TICK_DT);
      shots += world.events.filter((e) => e.ev.e === 'shot' && (e.ev as { o: number }).o === p.id).length;
    }
    // 10s of fire: cooldown allows ~35 shots, energy (100 + 14/s regen, 5/shot) limits to ~48 → cooldown bound.
    expect(shots).toBeLessThanOrEqual(Math.ceil(10 / 0.28) + 1);
    expect(shots).toBeGreaterThan(10);
  });

  it('player death keeps progression and respawns at the station', async () => {
    const { world, p, state } = await worldWithPlayer();
    state.addResource('cargo', 'iron', 50, 'test');
    state.addResource('storage', 'iron', 300, 'test');
    p.x = 1500;
    p.y = 0;
    const { killPlayer, respawnPlayer } = await import('../src/game/systems/combat');
    killPlayer(world, p, 'test');
    expect(p.dead).toBe(true);
    expect(state.getResource('cargo', 'iron')).toBe(25);
    expect(state.getResource('storage', 'iron')).toBe(300);
    respawnPlayer(world, p);
    expect(p.dead).toBe(false);
    expect(Math.hypot(p.x, p.y)).toBeLessThan(200);
    expect(p.hull).toBe(state.stats.maxHull);
  });

  it('NPCs never enter the safe zone', async () => {
    const { world } = await worldWithPlayer();
    for (let i = 0; i < 20 * 30; i++) world.step(TICK_DT);
    for (const e of world.enemies.values()) expect(Math.hypot(e.x, e.y)).toBeGreaterThanOrEqual(699);
  });
});

describe('game server', () => {
  it('buys upgrades server-side and rejects unaffordable ones', async () => {
    const { repo, auth } = setupDb();
    const game = new GameServer(repo);
    const acc = await createAccount(auth, 'buyer');
    const conn = new FakeConnection();
    const s = game.join(conn, acc);

    game.handleMessage(s, { t: 'upgrade', track: 'hull' });
    expect(s.state.upgrades.hull).toBe(0);
    expect(conn.notifications().at(-1)).toMatch(/Not enough/);

    const cost = upgradeCost('hull', 0)!;
    s.state.addCredits(cost.credits, 'test');
    for (const [r, a] of Object.entries(cost.resources)) s.state.addResource('storage', r as 'iron', a!, 'test');
    game.handleMessage(s, { t: 'upgrade', track: 'hull' });
    expect(s.state.upgrades.hull).toBe(1);
    expect(s.state.credits).toBe(0);
    expect(repo.loadOrCreate(acc.id, 'buyer').upgrades.hull).toBe(1); // persisted immediately

    // Garbage input is ignored.
    game.handleMessage(s, { t: 'upgrade', track: 'warp-drive' as never });
    game.handleMessage(s, { t: 'input', seq: 1, mx: NaN, my: 0, aim: 0, fire: true, mine: false });
    expect(s.entity!.inputQueue.length).toBe(0);
    game.stop();
  });

  it('a second login kicks the first session and keeps state', async () => {
    const { repo, auth } = setupDb();
    const game = new GameServer(repo);
    const acc = await createAccount(auth, 'dupe');
    const c1 = new FakeConnection();
    const s1 = game.join(c1, acc);
    s1.state.addCredits(42, 'test');
    const c2 = new FakeConnection();
    const s2 = game.join(c2, acc);
    expect(c1.last('kicked')).toBeDefined();
    expect(c1.closed).not.toBeNull();
    expect(s2.state.credits).toBe(42);
    expect(game.sessions.size).toBe(1);
    game.stop();
  });

  it('replicates other players to each other (real multiplayer)', async () => {
    const { repo, auth } = setupDb();
    const game = new GameServer(repo);
    const a = await createAccount(auth, 'alpha');
    const b = await createAccount(auth, 'bravo');
    const ca = new FakeConnection();
    const cb = new FakeConnection();
    game.join(ca, a);
    game.join(cb, b);
    game.tick();
    const snap = ca.last('snap')!;
    expect(snap.players.map((p) => p.name)).toContain('bravo');
    expect(snap.online).toBe(2);
    game.stop();
  });
});
