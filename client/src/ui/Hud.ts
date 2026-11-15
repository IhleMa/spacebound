import {
  ENEMIES,
  RESOURCES,
  SHIP_CLASSES,
  UPGRADE_TRACKS,
  UPGRADE_TRACK_IDS,
  bagTotal,
  upgradeCost,
  type MapDef,
  type NotifyLevel,
  type Profile,
  type ResourceId,
  type SelfState,
  type ShipStats,
  type UpgradeTrack,
} from '@spacebound/shared';
import type { ClientWorld } from '../game/ClientWorld';
import type { TargetRef } from '../game/types';
import { fmt, h, setText, setWidth } from './dom';

export interface HudCallbacks {
  onUpgrade(track: UpgradeTrack): void;
  onRespawn(): void;
  onSelectTarget(t: TargetRef | null): void;
  onReconnect(): void;
  onLogout(): void;
}

export interface NearbyItem {
  ref: TargetRef;
  name: string;
  color: string;
  dist: number;
}

export interface HudFrame {
  self: SelfState;
  stats: ShipStats;
  target: TargetRef | null;
  nearby: NearbyItem[];
  ping: number | null;
  online: number;
  autoMine: boolean;
}

/** Resources shown in the resource bar during Phase 1. */
const BAR_RESOURCES: ResourceId[] = ['iron', 'copper', 'silicon'];

type PanelId = 'world' | 'ship' | 'help';

export class Hud {
  readonly root: HTMLElement;
  private profile: Profile | null = null;
  private lastFrame: HudFrame | null = null;
  private panel: PanelId = 'world';
  private shipPanelKey = '';

  // Top bar
  private levelBadge = h('div', { class: 'level-badge' }, '1');
  private xpText = h('span', {}, '0 / 100 XP');
  private xpFill = h('i');
  private resEls = new Map<ResourceId, { val: HTMLElement; cap: HTMLElement }>();
  private creditsEl = h('span', { class: 'res-val' }, '0');
  private pingEl = h('b', {}, '–');
  private onlineEl = h('span', {}, '');

  // Left panel
  private shipName = h('div', { class: 'ship-name' });
  private shipClass = h('div', { class: 'ship-class' });
  private bars: Record<'hull' | 'shield' | 'energy' | 'cargo', { fill: HTMLElement; val: HTMLElement; bar: HTMLElement }>;
  private cargoList = h('div', { class: 'cargo-list' });
  private miniStats = h('div', { class: 'mini-stats' });
  private targetCard = h('div', { class: 'target-card' });

  // Right panel
  private minimap = h('canvas', { class: 'minimap', width: 444, height: 444 });
  private nearbyList = h('ul', { class: 'nearby' });
  private logList = h('ul', { class: 'log' });

  private zoneEl = h('div', { class: 'zone panel' });
  private hintEl = h('div', { class: 'hint' });
  private toasts = h('div', { class: 'toasts' });
  private navButtons = new Map<PanelId, HTMLButtonElement>();
  private modalWrap = h('div', { class: 'modal-wrap hidden' });
  private deathOverlay: HTMLElement;
  private connOverlay: HTMLElement;
  private connText = h('p');

  constructor(parent: HTMLElement, private cb: HudCallbacks) {
    const bar = (cls: string, label: string) => {
      const fill = h('i');
      const val = h('span');
      const b = h('div', { class: `bar ${cls}` }, fill);
      const el = h('div', { class: 'stat-bar' }, h('div', { class: 'lbl' }, h('span', {}, label), val), b);
      return { el, fill, val, bar: b };
    };
    const hull = bar('hull', 'Hull');
    const shield = bar('shield', 'Shield');
    const energy = bar('energy', 'Energy');
    const cargo = bar('cargo', 'Cargo');
    this.bars = { hull, shield, energy, cargo };

    const resources = h('div', { class: 'resources' });
    for (const id of BAR_RESOURCES) {
      const def = RESOURCES[id];
      const val = h('span', { class: 'res-val' }, '0');
      const cap = h('span', { class: 'res-cap' }, '/ 0');
      this.resEls.set(id, { val, cap });
      resources.append(
        h('div', { class: 'res', title: `${def.name} – ${def.description} (station storage)` },
          h('div', { class: 'res-icon', style: `background:${def.color};color:${def.color}` }),
          h('div', {}, h('div', { class: 'res-name' }, def.name), h('div', {}, val, ' ', cap)),
        ),
      );
    }
    resources.append(
      h('div', { class: 'res credits', title: 'Credits – the trading currency' },
        h('div', { class: 'res-icon', style: 'background:#ffb340;color:#ffb340;border-radius:50%' }),
        h('div', {}, h('div', { class: 'res-name' }, 'Credits'), this.creditsEl),
      ),
    );

    const topbar = h('header', { class: 'topbar panel' },
      h('div', { class: 'logo' }, 'SPACEBOUND'),
      h('div', { class: 'level-box' }, this.levelBadge,
        h('div', { class: 'xp-wrap' }, h('div', { class: 'xp-label' }, h('span', {}, 'Level'), this.xpText), h('div', { class: 'bar xp' }, this.xpFill))),
      resources,
      h('div', { class: 'status' }, h('span', {}, 'Ping ', this.pingEl), this.onlineEl),
    );

    const left = h('aside', { class: 'left-panel panel' },
      h('div', { class: 'panel-title' }, 'Ship Status'),
      this.shipName, this.shipClass,
      hull.el, shield.el, energy.el, cargo.el, this.cargoList,
      this.miniStats,
      this.targetCard,
    );

    const right = h('aside', { class: 'right-panel panel' },
      h('div', {}, h('div', { class: 'panel-title' }, 'Sector Scan'), this.minimap),
      h('div', {}, h('div', { class: 'panel-title' }, 'Nearby'), this.nearbyList),
      h('div', {}, h('div', { class: 'panel-title' }, 'Event Log'), this.logList),
    );

    const nav = h('nav', { class: 'bottom-nav panel' });
    const navItem = (id: PanelId, label: string, key: string) => {
      const b = h('button', { class: 'nav-btn', onclick: () => this.openPanel(this.panel === id && id !== 'world' ? 'world' : id) }, label, h('kbd', {}, key));
      this.navButtons.set(id, b);
      nav.append(b);
    };
    navItem('world', 'World', 'Esc');
    navItem('ship', 'Ship', 'C');
    navItem('help', 'Controls', 'H');

    this.modalWrap.addEventListener('mousedown', (e) => {
      if (e.target === this.modalWrap) this.openPanel('world');
    });

    this.deathOverlay = h('div', { class: 'overlay hidden' },
      h('div', { class: 'overlay-card panel' },
        h('h1', {}, 'SHIP DESTROYED'),
        h('p', {}, 'Your ship will be rebuilt at Haven Outpost. Your storage, upgrades and progress are safe.'),
        h('button', { class: 'btn', onclick: () => this.cb.onRespawn() }, 'Respawn at Haven'),
      ),
    );
    this.connOverlay = h('div', { class: 'overlay neutral hidden' },
      h('div', { class: 'overlay-card panel' },
        h('h1', {}, 'SIGNAL LOST'),
        this.connText,
        h('div', { class: 'login-actions' },
          h('button', { class: 'btn', onclick: () => this.cb.onReconnect() }, 'Reconnect'),
          h('button', { class: 'btn secondary', onclick: () => this.cb.onLogout() }, 'Log out'),
        ),
      ),
    );

    this.root = h('div', { class: 'hud' }, topbar, left, right, this.zoneEl, this.hintEl, this.toasts, nav,
      this.modalWrap, this.deathOverlay, this.connOverlay);
    parent.append(this.root);
    this.openPanel('world');
  }

  destroy(): void {
    this.root.remove();
  }

  get activePanel(): PanelId {
    return this.panel;
  }

  openPanel(id: PanelId): void {
    this.panel = id;
    for (const [k, b] of this.navButtons) b.classList.toggle('active', k === id);
    this.modalWrap.replaceChildren();
    if (id === 'world') {
      this.modalWrap.classList.add('hidden');
      return;
    }
    this.modalWrap.classList.remove('hidden');
    this.modalWrap.append(id === 'ship' ? this.buildShipPanel() : this.buildHelpPanel());
  }

  setProfile(p: Profile): void {
    const levelChanged = this.profile && this.profile.level !== p.level;
    this.profile = p;
    setText(this.levelBadge, String(p.level));
    setText(this.xpText, `${fmt(p.xp)} / ${fmt(p.xpNext)} XP`);
    setWidth(this.xpFill, (p.xp / Math.max(1, p.xpNext)) * 100);
    for (const [id, els] of this.resEls) {
      setText(els.val, fmt(p.storage[id] ?? 0));
      setText(els.cap, `/ ${fmt(p.storageCap)}`);
    }
    setText(this.creditsEl, fmt(p.credits));
    const cls = SHIP_CLASSES[p.shipClass];
    setText(this.shipName, `${p.name}'s ${cls.name}`);
    setText(this.shipClass, `${cls.role} class`);
    const shipKey = JSON.stringify([p.credits, p.storage, p.upgrades, p.level, p.kills, p.deaths]);
    if (this.panel === 'ship' && (shipKey !== this.shipPanelKey || levelChanged)) this.openPanel('ship');
    this.shipPanelKey = shipKey;
  }

  setConnectionLost(text: string | null): void {
    if (text === null) this.connOverlay.classList.add('hidden');
    else {
      setText(this.connText, text);
      this.connOverlay.classList.remove('hidden');
    }
  }

  notify(level: NotifyLevel, text: string): void {
    const li = h('li', { class: level }, text);
    this.logList.prepend(li);
    while (this.logList.childElementCount > 60) this.logList.lastElementChild?.remove();
    if (level === 'loot' || level === 'info') return; // log only – avoid toast spam
    const t = h('div', { class: `toast ${level}` }, text);
    this.toasts.append(t);
    while (this.toasts.childElementCount > 4) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.remove(), 3100);
  }

  update(f: HudFrame, world: ClientWorld): void {
    this.lastFrame = f;
    const { self, stats } = f;
    const b = this.bars;
    setText(b.hull.val, `${Math.ceil(self.hull)} / ${Math.round(stats.maxHull)}`);
    setWidth(b.hull.fill, (self.hull / stats.maxHull) * 100);
    setText(b.shield.val, `${Math.ceil(self.shield)} / ${Math.round(stats.maxShield)}`);
    setWidth(b.shield.fill, (self.shield / stats.maxShield) * 100);
    setText(b.energy.val, `${Math.floor(self.energy)} / ${Math.round(stats.maxEnergy)}`);
    setWidth(b.energy.fill, (self.energy / stats.maxEnergy) * 100);

    const cargo = this.profile?.cargo ?? {};
    const used = bagTotal(cargo);
    setText(b.cargo.val, `${used} / ${stats.cargoCapacity}`);
    setWidth(b.cargo.fill, (used / stats.cargoCapacity) * 100);
    b.cargo.bar.classList.toggle('full', used >= stats.cargoCapacity);
    const cargoKey = JSON.stringify(cargo);
    if (this.cargoList.dataset.key !== cargoKey) {
      this.cargoList.dataset.key = cargoKey;
      const chips = Object.entries(cargo).filter(([, v]) => (v ?? 0) > 0)
        .map(([k, v]) => h('span', { class: 'chip', style: `border-left:3px solid ${RESOURCES[k as ResourceId].color}` }, `${v} ${RESOURCES[k as ResourceId].name}`));
      this.cargoList.replaceChildren(...(chips.length ? chips : [h('span', { class: 'empty' }, 'Cargo hold empty')]));
    }

    const statsKey = `${stats.speed}|${stats.weaponDamage}|${stats.armor}|${stats.miningEfficiency}|${f.autoMine}`;
    if (this.miniStats.dataset.key !== statsKey) {
      this.miniStats.dataset.key = statsKey;
      this.miniStats.replaceChildren(
        h('span', {}, 'Speed'), h('span', {}, `${Math.round(stats.speed)}`),
        h('span', {}, 'Damage'), h('span', {}, `${Math.round(stats.weaponDamage * 100)}%`),
        h('span', {}, 'Armor'), h('span', {}, `${Math.round(stats.armor)}`),
        h('span', {}, 'Mining'), h('span', {}, `${stats.miningEfficiency.toFixed(1)}/s`),
        h('span', {}, 'Auto-mine'), h('span', { style: `color:${f.autoMine ? 'var(--green)' : 'var(--text-dim)'}` }, f.autoMine ? 'ON' : 'OFF'),
      );
    }

    this.updateTarget(f.target, world);
    this.updateNearby(f.nearby, f.target);

    setText(this.pingEl, f.ping === null ? '–' : `${Math.round(f.ping)} ms`);
    setText(this.onlineEl, `${f.online} pilot${f.online === 1 ? '' : 's'} online`);

    const zone = self.docked ? ['docked', 'DOCKED · HAVEN OUTPOST'] : self.safe ? ['safe', 'SAFE ZONE'] : ['hostile', 'HOSTILE SPACE'];
    this.zoneEl.className = `zone panel ${zone[0]}`;
    setText(this.zoneEl, zone[1]);

    this.deathOverlay.classList.toggle('hidden', !self.dead);

    let hint = '';
    if (self.mining) hint = 'Mining… resources go to your cargo hold. Dock at Haven Outpost to store them.';
    else if (used >= stats.cargoCapacity) hint = 'Cargo full – fly back to Haven Outpost (green arrow) to unload.';
    else if (self.docked && this.profile && this.profile.level <= 2) hint = 'Fly out with <b>WASD</b>, aim with the <b>mouse</b>, hold <b>left click</b> to fire, hold <b>E</b> near asteroids to mine.';
    if (this.hintEl.dataset.key !== hint) {
      this.hintEl.dataset.key = hint;
      this.hintEl.innerHTML = hint;
    }
  }

  private updateTarget(target: TargetRef | null, world: ClientWorld): void {
    let html: (Node | string)[] = [];
    if (target?.kind === 'e') {
      const e = world.enemies.get(target.id);
      if (e) {
        const def = ENEMIES[e.snap.type];
        html = [
          h('div', { class: 'panel-title' }, 'Target'),
          h('div', { class: 'target-name hostile' }, `${def.elite ? '★ ' : ''}${def.name}`),
          h('div', { class: 'target-sub' }, `Level ${def.level} · ${def.aggressive ? 'Aggressive' : 'Passive'}${e.snap.hostile ? ' · ENGAGED' : ''}`),
          this.miniBar('shield', e.snap.s),
          this.miniBar('hull', e.snap.h),
          h('div', { class: 'target-sub', style: 'margin-top:6px' }, def.description),
        ];
      }
    } else if (target?.kind === 'p') {
      const p = world.players.get(target.id);
      if (p) {
        html = [
          h('div', { class: 'panel-title' }, 'Target'),
          h('div', { class: 'target-name friendly' }, p.snap.name),
          h('div', { class: 'target-sub' }, `Pilot · Level ${p.snap.lvl} · ${SHIP_CLASSES[p.snap.cls].name}`),
          this.miniBar('shield', p.snap.s),
          this.miniBar('hull', p.snap.h),
        ];
      }
    } else if (target?.kind === 'd') {
      const d = world.deposits.get(target.id);
      if (d) {
        const r = RESOURCES[d.res];
        html = [
          h('div', { class: 'panel-title' }, 'Target'),
          h('div', { class: 'target-name resource', style: `color:${r.color}` }, `${r.name} ${d.kind}`),
          h('div', { class: 'target-sub' }, `${d.amt} / ${d.max} units remaining`),
          this.miniBar('cargo', (d.amt / d.max) * 100),
          h('div', { class: 'target-sub', style: 'margin-top:6px' }, 'Fly close and hold E (or toggle auto-mine with F).'),
        ];
      }
    }
    const key = JSON.stringify(target) + html.map((n) => (n as HTMLElement).textContent).join('|');
    if (this.targetCard.dataset.key === key) return;
    this.targetCard.dataset.key = key;
    this.targetCard.replaceChildren(...html);
    this.targetCard.classList.toggle('hidden', html.length === 0);
  }

  private miniBar(cls: string, pct: number): HTMLElement {
    const i = h('i');
    setWidth(i, pct);
    return h('div', { class: `bar ${cls}`, style: 'height:6px;margin-top:4px' }, i);
  }

  private updateNearby(items: NearbyItem[], target: TargetRef | null): void {
    const key = items.map((i) => `${i.ref.kind}${i.ref.id}:${Math.round(i.dist / 10)}`).join(',') + JSON.stringify(target);
    if (this.nearbyList.dataset.key === key) return;
    this.nearbyList.dataset.key = key;
    if (items.length === 0) {
      this.nearbyList.replaceChildren(h('li', { class: 'empty' }, 'Nothing on scanners'));
      return;
    }
    this.nearbyList.replaceChildren(
      ...items.map((it) => {
        const sel = target && target.kind === it.ref.kind && target.id === it.ref.id;
        return h('li', { class: sel ? 'selected' : '', onclick: () => this.cb.onSelectTarget(it.ref) },
          h('span', { class: 'dot', style: `background:${it.color};color:${it.color}` }),
          h('span', { class: 'nm' }, it.name),
          h('span', { class: 'ds' }, `${Math.round(it.dist)}m`),
        );
      }),
    );
  }

  drawMinimap(map: MapDef, world: ClientWorld, me: { x: number; y: number; angle: number }, view: { halfW: number; halfH: number }): void {
    const c = this.minimap;
    const ctx = c.getContext('2d')!;
    const S = c.width;
    const scale = S / (map.halfSize * 2);
    const tx = (x: number) => (x + map.halfSize) * scale;
    const ty = (y: number) => (y + map.halfSize) * scale;
    ctx.clearRect(0, 0, S, S);

    ctx.strokeStyle = 'rgba(77,225,255,0.07)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo((S / 8) * i, 0);
      ctx.lineTo((S / 8) * i, S);
      ctx.moveTo(0, (S / 8) * i);
      ctx.lineTo(S, (S / 8) * i);
      ctx.stroke();
    }
    for (const z of map.zones) {
      ctx.strokeStyle = z.kind === 'safe' ? 'rgba(92,255,157,0.5)' : 'rgba(255,77,109,0.5)';
      ctx.fillStyle = z.kind === 'safe' ? 'rgba(92,255,157,0.07)' : 'rgba(255,77,109,0.07)';
      ctx.beginPath();
      ctx.arc(tx(z.x), ty(z.y), z.radius * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    for (const s of map.stations) {
      ctx.fillStyle = '#5cff9d';
      ctx.fillRect(tx(s.x) - 4, ty(s.y) - 4, 8, 8);
    }
    for (const d of world.deposits.values()) {
      ctx.fillStyle = RESOURCES[d.res].color;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(tx(d.x) - 1.5, ty(d.y) - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    for (const e of world.enemies.values()) {
      ctx.fillStyle = ENEMIES[e.snap.type].elite ? '#ff2e63' : e.snap.hostile ? '#ff4d6d' : '#ffb340';
      ctx.beginPath();
      ctx.arc(tx(e.x), ty(e.y), ENEMIES[e.snap.type].elite ? 4.5 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of world.players.values()) {
      ctx.fillStyle = '#a66bff';
      ctx.beginPath();
      ctx.arc(tx(p.x), ty(p.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // View rectangle
    ctx.strokeStyle = 'rgba(214,251,255,0.35)';
    ctx.strokeRect(tx(me.x - view.halfW), ty(me.y - view.halfH), view.halfW * 2 * scale, view.halfH * 2 * scale);
    // Me
    ctx.save();
    ctx.translate(tx(me.x), ty(me.y));
    ctx.rotate(me.angle);
    ctx.fillStyle = '#4de1ff';
    ctx.shadowColor = '#4de1ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ───────────────────────────── Panels ─────────────────────────────

  private buildShipPanel(): HTMLElement {
    const p = this.profile;
    const stats = this.lastFrame?.stats;
    const close = h('button', { class: 'close-btn', onclick: () => this.openPanel('world') }, 'CLOSE');
    if (!p || !stats) return h('div', { class: 'modal panel' }, 'Loading…');

    const fmtStat: [string, string][] = [
      ['Max hull', `${Math.round(stats.maxHull)}`],
      ['Max shield', `${Math.round(stats.maxShield)}`],
      ['Shield regen', `${stats.shieldRegen.toFixed(1)}/s`],
      ['Armor', `${Math.round(stats.armor)}`],
      ['Flight speed', `${Math.round(stats.speed)}`],
      ['Acceleration', `${Math.round(stats.acceleration)}`],
      ['Maneuverability', `${stats.maneuverability.toFixed(1)} rad/s`],
      ['Cargo capacity', `${stats.cargoCapacity}`],
      ['Weapon damage', `${Math.round(stats.weaponDamage * 100)}%`],
      ['Energy', `${Math.round(stats.maxEnergy)}`],
      ['Energy regen', `${stats.energyRegen.toFixed(1)}/s`],
      ['Critical chance', `${Math.round(stats.critChance * 100)}%`],
      ['Critical damage', `${Math.round(stats.critDamage * 100)}%`],
      ['Evasion', `${Math.round(stats.evasion * 100)}%`],
      ['Mining efficiency', `${stats.miningEfficiency.toFixed(1)}/s`],
      ['Collection range', `${Math.round(stats.collectionRange)}`],
    ];
    const statTable = h('div', { class: 'stat-table' }, ...fmtStat.flatMap(([k, v]) => [h('span', {}, k), h('span', {}, v)]));

    const cards = UPGRADE_TRACK_IDS.map((id) => {
      const def = UPGRADE_TRACKS[id];
      const lvl = p.upgrades[id] ?? 0;
      const cost = upgradeCost(id, lvl);
      const pips = h('div', { class: 'pips' }, ...Array.from({ length: def.maxLevel }, (_, i) => h('i', { class: i < lvl ? 'on' : '' })));
      const effects = Object.entries(def.perLevel).map(([k, v]) => `+${Math.round((v as number) * 100)}% ${labelFor(k)}`).join(' · ');
      let affordable = true;
      const costs = h('div', { class: 'costs' });
      if (cost) {
        const okC = p.credits >= cost.credits;
        affordable &&= okC;
        costs.append(h('span', { class: `cost ${okC ? 'ok' : 'no'}` }, `${fmt(cost.credits)} CR`));
        for (const [r, amt] of Object.entries(cost.resources)) {
          const have = p.storage[r as ResourceId] ?? 0;
          const ok = have >= (amt ?? 0);
          affordable &&= ok;
          costs.append(h('span', { class: `cost ${ok ? 'ok' : 'no'}`, title: `In storage: ${have}` }, `${fmt(amt ?? 0)} ${RESOURCES[r as ResourceId].name}`));
        }
      }
      return h('div', { class: 'upgrade' },
        h('h3', {}, def.name, h('small', {}, `LV ${lvl} / ${def.maxLevel}`)),
        pips,
        h('p', {}, def.description),
        h('div', { class: 'effects' }, `Per level: ${effects}`),
        cost ? costs : h('div', { class: 'effects' }, 'Maximum level reached'),
        h('button', { class: 'btn', disabled: !cost || !affordable, onclick: () => this.cb.onUpgrade(id) }, cost ? 'Upgrade' : 'Maxed'),
      );
    });

    return h('div', { class: 'modal panel' },
      h('div', { class: 'modal-head' }, h('h2', {}, 'SHIP · ' + SHIP_CLASSES[p.shipClass].name.toUpperCase()), close),
      h('div', { class: 'ship-layout' },
        h('div', {}, h('div', { class: 'panel-title' }, 'Attributes'), statTable,
          h('div', { class: 'note' }, `Kills: ${p.kills} · Deaths: ${p.deaths}`)),
        h('div', {}, h('div', { class: 'panel-title' }, 'Upgrades'), h('div', { class: 'upgrades' }, ...cards),
          h('div', { class: 'note' }, 'Upgrades are paid with credits and resources from your station storage. Dock at Haven Outpost to move your cargo into storage. Purchases are validated and saved by the server.')),
      ),
    );
  }

  private buildHelpPanel(): HTMLElement {
    const row = (k: string, d: string) => [h('kbd', {}, k), h('span', {}, d)];
    return h('div', { class: 'modal panel', style: 'width:min(560px,94vw)' },
      h('div', { class: 'modal-head' }, h('h2', {}, 'FLIGHT MANUAL'), h('button', { class: 'close-btn', onclick: () => this.openPanel('world') }, 'CLOSE')),
      h('div', { class: 'help-grid' },
        ...row('W A S D / Arrows', 'Fly'),
        ...row('Mouse', 'Aim'),
        ...row('Left click (hold)', 'Fire lasers at the cursor'),
        ...row('Space (hold)', 'Fire at the selected target (auto-aim)'),
        ...row('Right click', 'Select a target under the cursor'),
        ...row('Tab', 'Cycle through nearby enemies'),
        ...row('E (hold)', 'Mine the nearest deposit in range'),
        ...row('F', 'Toggle auto-mining'),
        ...row('C', 'Ship & upgrades'),
        ...row('H', 'This manual'),
        ...row('Esc', 'Close panels / clear target'),
      ),
      h('div', { class: 'note' },
        'Mine asteroids and crystals, destroy drones and pirates for credits and XP, then dock at Haven Outpost to move your cargo into storage. ',
        'Inside the green safe zone your hull repairs and enemies cannot follow. Pirates attack on sight; drones only defend themselves. ',
        'Watch out for the ★ Pirate Captain guarding the eastern hideout.'),
      h('div', { class: 'login-actions' }, h('button', { class: 'btn secondary', onclick: () => this.cb.onLogout() }, 'Log out')),
    );
  }
}

function labelFor(stat: string): string {
  const map: Record<string, string> = {
    maxHull: 'hull', armor: 'armor', speed: 'speed', acceleration: 'acceleration', maneuverability: 'maneuverability',
    maxShield: 'shield', shieldRegen: 'shield regen', cargoCapacity: 'cargo', collectionRange: 'range', miningEfficiency: 'mining',
  };
  return map[stat] ?? stat;
}
