/**
 * The 3D board. It knows nothing about the rules: it draws a state, plays
 * events as animations and reports which tile the pointer is on.
 */
import {
  ABILITIES,
  type Element,
  type GameEvent,
  type MatchState,
  type Pos,
  type SurfaceKind,
  type Tile,
  type Unit,
} from "@evt/engine";
import * as THREE from "three";
import { type Archetype, archetypeOf } from "../game/archetype.ts";

/** World units per height level. Tiles are 1×1. */
const BLOCK = 0.5;
const BASE = 0.25;
const PILLAR_BLOCKS = 2;
const UNIT_HEIGHT = 0.8;

const TERRAIN_COLOR: Record<Tile["terrain"], number> = {
  grass: 0x6b9b4b,
  stone: 0x8d8984,
  water: 0x3b79b9,
};
export const TEAM_COLOR = ["#3f7fe0", "#e0503f"] as const;

export type Highlight = "threat" | "move" | "path" | "attack" | "ability" | "target" | "active";
const HIGHLIGHT_COLOR: Record<Highlight, number> = {
  move: 0x7fd7ff,
  path: 0xffffff,
  attack: 0xff6a4d,
  ability: 0xc792ff,
  target: 0xffd23f,
  threat: 0xff3030,
  active: 0xffe680,
};

const ELEMENT_COLOR: Record<Element, number> = {
  fire: 0xff7a3d,
  ice: 0x8fdcff,
  lightning: 0xffe34d,
};

const FROZEN_COLOR = new THREE.Color(0xbfefff);
const HEAD_COLOR = 0xf0d0b0;
const STEEL_COLOR = 0x9aa3ad;

export type MouseButton = "primary" | "secondary";

export interface BoardCallbacks {
  onHover(pos: Pos | null): void;
  onClick(pos: Pos, button: MouseButton): void;
  /** In pan mode: the tile under the centre of the screen changed. */
  onAim?(pos: Pos | null): void;
}

interface UnitView {
  readonly group: THREE.Group;
  /** Team-coloured; frozen tint and hit flashes are drawn on it. */
  readonly body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  /** Every mesh of the figure, for picking. */
  readonly parts: readonly THREE.Mesh[];
}

type Tween = (now: number) => boolean;

const key = (p: Pos) => `${p.x},${p.y}`;

export class BoardView {
  readonly #container: HTMLElement;
  readonly #callbacks: BoardCallbacks;
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.OrthographicCamera();
  readonly #raycaster = new THREE.Raycaster();
  readonly #pickables: THREE.Object3D[] = [];
  readonly #overlays = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
  readonly #units = new Map<string, UnitView>();
  readonly #surfaces = new Map<string, { kind: SurfaceKind; mesh: THREE.Mesh }>();
  readonly #resize: ResizeObserver;
  #tweens: Tween[] = [];
  #state: MatchState;
  #hovered: string | null = null;
  /** Camera angle around the board; a quarter turn per rotation step. */
  #angle = 0;
  #targetAngle = 0;
  #rotations = 0;
  #pointerDown: { x: number; y: number; button: number } | null = null;
  /** Where the pointer was at the last pan step, while dragging in pan mode. */
  #panFrom: { x: number; y: number } | null = null;
  #dragged = false;
  #panMode = false;
  /** The point the camera looks at, and how far it is zoomed in. */
  readonly #focus = new THREE.Vector3();
  #zoom = 1;
  #focusMoves = 0;

  constructor(container: HTMLElement, state: MatchState, callbacks: BoardCallbacks) {
    this.#container = container;
    this.#callbacks = callbacks;
    this.#state = state;

    this.#renderer = new THREE.WebGLRenderer({ antialias: true });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.setClearColor(0x1b1f2a);
    container.appendChild(this.#renderer.domElement);

    this.#scene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a3030, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-4, 10, 6);
    this.#scene.add(sun);

    this.#buildTerrain(state);
    for (const u of state.units) this.#buildUnit(u);
    this.sync(state);

    const canvas = this.#renderer.domElement;
    canvas.addEventListener("pointermove", this.#onPointerMove);
    canvas.addEventListener("pointerdown", this.#onPointerDown);
    canvas.addEventListener("pointerup", this.#onPointerUp);
    canvas.addEventListener("pointerleave", this.#onPointerLeave);
    canvas.addEventListener("contextmenu", this.#onContextMenu);
    this.#resize = new ResizeObserver(() => this.#fit());
    this.#resize.observe(container);
    this.#fit();
    this.#renderer.setAnimationLoop((now) => {
      this.#tweens = this.#tweens.filter((t) => t(now));
      this.#renderer.render(this.#scene, this.#camera);
    });
  }

  /** Shows the state as it is, without animation. */
  sync(state: MatchState): void {
    this.#state = state;
    for (const [i, tile] of state.map.tiles.entries()) {
      this.#setSurface(
        { x: i % state.map.cols, y: Math.floor(i / state.map.cols) },
        tile.surface?.kind ?? null,
      );
    }
    for (const u of state.units) {
      const view = this.#units.get(u.id);
      if (!view) continue;
      view.group.visible = u.hp > 0;
      view.group.scale.setScalar(1);
      view.group.position.copy(this.#unitPosition(u));
      for (const part of view.parts) part.userData.pos = { x: u.x, y: u.y };
      view.body.material.emissive.setHex(0);
      const color = new THREE.Color(TEAM_COLOR[u.team % TEAM_COLOR.length] ?? "#fff");
      if (u.statuses.some((st) => st.kind === "frozen")) color.lerp(FROZEN_COLOR, 0.65);
      view.body.material.color.copy(color);
    }
  }

  setHighlights(highlights: ReadonlyMap<string, Highlight>): void {
    for (const [k, overlay] of this.#overlays) {
      const h = highlights.get(k);
      overlay.visible = h !== undefined;
      if (h) {
        overlay.material.color.setHex(HIGHLIGHT_COLOR[h]);
        overlay.material.opacity = h === "move" ? 0.35 : h === "threat" ? 0.28 : 0.6;
      }
    }
  }

  /** Animates the events one after another, then shows `state`. */
  async play(events: readonly GameEvent[], state: MatchState): Promise<void> {
    for (const e of events) {
      switch (e.type) {
        case "moved":
          await this.#animateMove(e.unit, e.path);
          break;
        case "attacked":
          await this.#animateAttack(e.unit, e.target);
          break;
        case "died":
          await this.#animateDeath(e.unit);
          break;
        case "abilityUsed":
          await this.#animateCast(e.unit, e.target, ABILITIES[e.ability].element);
          break;
        case "damaged":
          await this.#animateHit(e.unit);
          break;
        case "surfaceChanged":
          this.#setSurface(e.pos, e.to);
          break;
        case "frozen": {
          const view = this.#units.get(e.unit);
          if (view) view.body.material.color.lerp(FROZEN_COLOR, 0.65);
          break;
        }
      }
    }
    this.sync(state);
  }

  /** Where the top of a tile is on screen, in CSS pixels relative to the canvas. */
  screenPosition(pos: Pos): { x: number; y: number } {
    const v = this.#world(pos, this.#top(pos)).project(this.#camera);
    const { clientWidth: w, clientHeight: h } = this.#renderer.domElement;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }

  /**
   * Pan mode is for aiming on touch screens: dragging moves the board under a
   * fixed crosshair in the middle of the screen, and the tile under it is the
   * target. Tapping a tile moves it under the crosshair.
   */
  setPanMode(on: boolean): void {
    this.#panMode = on;
    this.#panFrom = null;
  }

  /** Centres the view on a tile and zooms in, or with null shows the whole board. */
  focusOn(pos: Pos | null, zoom = 1): Promise<void> {
    const fromFocus = this.#focus.clone();
    const toFocus = pos ? this.#world(pos, this.#top(pos)) : new THREE.Vector3();
    const fromZoom = this.#zoom;
    const move = ++this.#focusMoves;
    return this.#tween(220, (t) => {
      if (move !== this.#focusMoves) return; // a newer move or a drag took over
      const eased = t * t * (3 - 2 * t);
      this.#focus.lerpVectors(fromFocus, toFocus, eased);
      this.#zoom = fromZoom + (zoom - fromZoom) * eased;
      this.#placeCamera();
    });
  }

  /** The tile in the middle of the screen, if any. */
  centerTile(): Pos | null {
    return this.#pickAt(new THREE.Vector2(0, 0));
  }

  dispose(): void {
    this.#renderer.setAnimationLoop(null);
    this.#resize.disconnect();
    this.#renderer.domElement.remove();
    this.#scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials) {
          (m as THREE.Material & { map?: THREE.Texture | null }).map?.dispose();
          m.dispose();
        }
      }
    });
    this.#renderer.dispose();
  }

  #top(pos: Pos): number {
    const tile = this.#state.map.tiles[pos.y * this.#state.map.cols + pos.x];
    return (tile?.height ?? 0) * BLOCK;
  }

  #world(pos: Pos, y: number): THREE.Vector3 {
    const { cols, rows } = this.#state.map;
    return new THREE.Vector3(pos.x - cols / 2 + 0.5, y, pos.y - rows / 2 + 0.5);
  }

  #unitPosition(pos: Pos): THREE.Vector3 {
    return this.#world(pos, this.#top(pos));
  }

  #buildTerrain(state: MatchState): void {
    const { map } = state;
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const tile = map.tiles[y * map.cols + x] as Tile;
        const pos = { x, y };
        const top = tile.height * BLOCK;
        const material = new THREE.MeshLambertMaterial({ color: TERRAIN_COLOR[tile.terrain] });
        // Checkerboard shading makes individual tiles readable.
        if ((x + y) % 2) material.color.multiplyScalar(0.92);
        const column = new THREE.Mesh(new THREE.BoxGeometry(1, top + BASE, 1), material);
        column.position.copy(this.#world(pos, (top - BASE) / 2));
        column.userData.pos = pos;
        this.#scene.add(column);
        this.#pickables.push(column);

        if (tile.object === "pillar") {
          const h = PILLAR_BLOCKS * BLOCK;
          const pillar = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, h, 0.6),
            new THREE.MeshLambertMaterial({ color: 0xb8b0a0 }),
          );
          pillar.position.copy(this.#world(pos, top + h / 2));
          pillar.userData.pos = pos;
          this.#scene.add(pillar);
          this.#pickables.push(pillar);
        }

        const overlay = new THREE.Mesh(
          new THREE.PlaneGeometry(0.94, 0.94),
          new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
        );
        overlay.rotation.x = -Math.PI / 2;
        overlay.position.copy(this.#world(pos, top + 0.04));
        overlay.visible = false;
        this.#scene.add(overlay);
        this.#overlays.set(key(pos), overlay);
      }
    }
  }

  #setSurface(pos: Pos, kind: SurfaceKind | null): void {
    const k = key(pos);
    const old = this.#surfaces.get(k);
    if (old?.kind === kind) return;
    if (old) {
      this.#scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      (old.mesh.material as THREE.Material).dispose();
      const i = this.#pickables.indexOf(old.mesh);
      if (i >= 0) this.#pickables.splice(i, 1);
      this.#surfaces.delete(k);
    }
    if (!kind) return;
    const top = this.#top(pos);
    let mesh: THREE.Mesh;
    if (kind === "iceWall" || kind === "steam") {
      const wall = kind === "iceWall";
      const h = wall ? 2 * BLOCK : 0.6;
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(wall ? 0.8 : 0.92, h, wall ? 0.8 : 0.92),
        new THREE.MeshLambertMaterial({
          color: wall ? 0xbfe9ff : 0xffffff,
          transparent: true,
          opacity: wall ? 0.85 : 0.35,
          depthWrite: wall,
        }),
      );
      mesh.position.copy(this.#world(pos, top + h / 2));
      if (wall) {
        mesh.userData.pos = pos;
        this.#pickables.push(mesh);
      }
    } else {
      const color = { puddle: 0x3f8fe8, ice: 0xdaf4ff, electrified: 0xffe34d }[kind];
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(this.#world(pos, top + 0.02));
    }
    this.#scene.add(mesh);
    this.#surfaces.set(k, { kind, mesh });
  }

  /**
   * A figure in the team colour whose shape and accent colour tell which kind
   * of character it is. Its front is local +z.
   */
  #buildUnit(unit: Unit): void {
    const group = new THREE.Group();
    const kind = archetypeOf(unit);
    const { body, parts } = figure(kind, TEAM_COLOR[unit.team % TEAM_COLOR.length] ?? "#fff");
    for (const part of parts) group.add(part);
    group.add(this.#label(unit.id));
    // Face the other side of the board: team 0 starts at the low x/y corner.
    group.rotation.y = unit.team === 0 ? Math.PI / 4 : (-3 * Math.PI) / 4;
    this.#scene.add(group);
    this.#pickables.push(...parts);
    this.#units.set(unit.id, { group, body, parts });
  }

  #label(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 38px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 32, 34);
    }
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }),
    );
    sprite.scale.setScalar(0.42);
    sprite.position.y = UNIT_HEIGHT + 0.35;
    sprite.renderOrder = 1;
    return sprite;
  }

  #fit(): void {
    const { clientWidth: w, clientHeight: h } = this.#container;
    if (w === 0 || h === 0) return;
    this.#renderer.setSize(w, h);
    const { cols, rows } = this.#state.map;
    const size = Math.max(cols, rows);
    // Fit the board seen from a corner: it is about √2·size wide and a bit
    // less tall. Whichever side is the tighter fit decides the zoom.
    const aspect = w / h;
    const halfWidth = size * 0.75;
    const halfHeight = size * 0.7;
    const top = aspect >= halfWidth / halfHeight ? halfHeight : halfWidth / aspect;
    this.#camera.left = -top * aspect;
    this.#camera.right = top * aspect;
    this.#camera.top = top;
    this.#camera.bottom = -top;
    this.#camera.near = 0.1;
    this.#camera.far = 200;
    this.#camera.updateProjectionMatrix();
    this.#placeCamera();
  }

  /**
   * Isometric-style view from a corner. Angle 0 looks from behind team 0,
   * which starts at the low x/y corner of the maps.
   */
  #placeCamera(): void {
    const size = Math.max(this.#state.map.cols, this.#state.map.rows);
    const a = this.#angle;
    const x = -Math.cos(a) + Math.sin(a);
    const z = -Math.sin(a) - Math.cos(a);
    this.#camera.position.set(x * size, size * 1.1, z * size).add(this.#focus);
    this.#camera.lookAt(this.#focus);
    if (this.#camera.zoom !== this.#zoom) {
      this.#camera.zoom = this.#zoom;
      this.#camera.updateProjectionMatrix();
    }
  }

  /** Turns the view a quarter turn: 1 clockwise, -1 counter-clockwise. */
  rotate(direction: 1 | -1): void {
    const from = this.#angle;
    this.#targetAngle += (direction * Math.PI) / 2;
    const to = this.#targetAngle;
    const turn = ++this.#rotations;
    void this.#tween(300, (t) => {
      if (turn !== this.#rotations) return; // a newer rotation took over
      const eased = t * t * (3 - 2 * t);
      this.#angle = from + (to - from) * eased;
      this.#placeCamera();
    });
  }

  #ndc(event: { clientX: number; clientY: number }): THREE.Vector2 {
    const rect = this.#renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  #pick(event: PointerEvent): Pos | null {
    return this.#pickAt(this.#ndc(event));
  }

  #pickAt(ndc: THREE.Vector2): Pos | null {
    this.#raycaster.setFromCamera(ndc, this.#camera);
    for (const hit of this.#raycaster.intersectObjects(this.#pickables, false)) {
      if (!hit.object.visible || !hit.object.parent?.visible) continue;
      const pos = hit.object.userData.pos as Pos | undefined;
      if (pos) return pos;
    }
    return null;
  }

  /** Where a screen point lands on the flat plane through the focus point. */
  #ground(point: { clientX: number; clientY: number }): THREE.Vector3 | null {
    this.#raycaster.setFromCamera(this.#ndc(point), this.#camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.#focus.y);
    return this.#raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  #pan(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const a = this.#ground({ clientX: from.x, clientY: from.y });
    const b = this.#ground({ clientX: to.x, clientY: to.y });
    if (!a || !b) return;
    const { cols, rows } = this.#state.map;
    this.#focus.add(a.sub(b));
    this.#focus.x = THREE.MathUtils.clamp(this.#focus.x, -cols / 2, cols / 2);
    this.#focus.z = THREE.MathUtils.clamp(this.#focus.z, -rows / 2, rows / 2);
    this.#placeCamera();
  }

  #onPointerMove = (event: PointerEvent): void => {
    const down = this.#pointerDown;
    if (this.#panMode && down && this.#panFrom) {
      if (!this.#dragged && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) {
        this.#dragged = true;
        this.#focusMoves++; // stop any running focus move
      }
      if (this.#dragged) {
        const to = { x: event.clientX, y: event.clientY };
        this.#pan(this.#panFrom, to);
        this.#panFrom = to;
        this.#callbacks.onAim?.(this.centerTile());
        return;
      }
    }
    const pos = this.#pick(event);
    const k = pos ? key(pos) : null;
    if (k !== this.#hovered) {
      this.#hovered = k;
      this.#callbacks.onHover(pos);
    }
  };

  #onPointerDown = (event: PointerEvent): void => {
    this.#pointerDown = { x: event.clientX, y: event.clientY, button: event.button };
    this.#dragged = false;
    if (this.#panMode && event.button === 0) {
      this.#panFrom = { x: event.clientX, y: event.clientY };
      this.#renderer.domElement.setPointerCapture?.(event.pointerId);
    }
  };

  #onPointerUp = (event: PointerEvent): void => {
    const down = this.#pointerDown;
    this.#pointerDown = null;
    this.#panFrom = null;
    if (!down) return;
    if (this.#panMode && this.#dragged) {
      // Settle on the tile under the crosshair.
      const pos = this.centerTile();
      if (pos) void this.focusOn(pos, this.#zoom);
      this.#callbacks.onAim?.(pos);
      return;
    }
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const pos = this.#pick(event);
    if (!pos) return;
    if (this.#panMode && down.button === 0) {
      void this.focusOn(pos, this.#zoom);
      this.#callbacks.onAim?.(pos);
    }
    this.#callbacks.onClick(pos, down.button === 2 ? "secondary" : "primary");
  };

  #onContextMenu = (event: Event): void => event.preventDefault();

  #onPointerLeave = (): void => {
    if (this.#hovered !== null) {
      this.#hovered = null;
      this.#callbacks.onHover(null);
    }
  };

  #tween(durationMs: number, step: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let start: number | undefined;
      this.#tweens.push((now) => {
        start ??= now;
        const t = Math.min(1, (now - start) / durationMs);
        step(t);
        if (t >= 1) resolve();
        return t < 1;
      });
    });
  }

  async #animateMove(id: string, path: readonly Pos[]): Promise<void> {
    const view = this.#units.get(id);
    if (!view) return;
    for (const pos of path) {
      const from = view.group.position.clone();
      const to = this.#unitPosition(pos);
      if (to.x !== from.x || to.z !== from.z) {
        view.group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      }
      await this.#tween(130, (t) => {
        view.group.position.lerpVectors(from, to, t);
        view.group.position.y += Math.sin(t * Math.PI) * 0.18;
      });
    }
  }

  async #animateAttack(attackerId: string, targetId: string): Promise<void> {
    const attacker = this.#units.get(attackerId);
    const target = this.#units.get(targetId);
    if (!attacker || !target) return;
    const home = attacker.group.position.clone();
    const toward = target.group.position.clone().sub(home).setY(0).normalize().multiplyScalar(0.3);
    attacker.group.rotation.y = Math.atan2(toward.x, toward.z);
    await this.#tween(140, (t) => attacker.group.position.copy(home).addScaledVector(toward, t));
    await this.#tween(220, (t) => {
      attacker.group.position.copy(home).addScaledVector(toward, 1 - t);
      target.body.material.emissive.setRGB(0.9 * (1 - t), 0.1 * (1 - t), 0);
    });
  }

  /** A ball of the element's colour flies from the caster to the target tile. */
  async #animateCast(casterId: string, target: Pos, element: Element): Promise<void> {
    const caster = this.#units.get(casterId);
    if (!caster) return;
    const aim = this.#world(target, 0).sub(caster.group.position);
    if (aim.x || aim.z) caster.group.rotation.y = Math.atan2(aim.x, aim.z);
    const from = caster.group.position.clone().setY(caster.group.position.y + UNIT_HEIGHT);
    const to = this.#world(target, this.#top(target) + 0.4);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 12),
      new THREE.MeshBasicMaterial({ color: ELEMENT_COLOR[element] }),
    );
    this.#scene.add(ball);
    await this.#tween(260, (t) => {
      ball.position.lerpVectors(from, to, t);
      ball.position.y += Math.sin(t * Math.PI) * 0.8;
    });
    this.#scene.remove(ball);
    ball.geometry.dispose();
    ball.material.dispose();
  }

  async #animateHit(id: string): Promise<void> {
    const view = this.#units.get(id);
    if (!view) return;
    await this.#tween(200, (t) =>
      view.body.material.emissive.setRGB(0.9 * (1 - t), 0.1 * (1 - t), 0),
    );
  }

  async #animateDeath(id: string): Promise<void> {
    const view = this.#units.get(id);
    if (!view) return;
    await this.#tween(350, (t) => view.group.scale.setScalar(1 - t));
    view.group.visible = false;
  }
}

const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });

function mesh(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  x: number,
  y: number,
  z: number,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> {
  const m = new THREE.Mesh(geometry, lambert(color));
  m.position.set(x, y, z);
  return m;
}

/**
 * Low-poly figures, all about UNIT_HEIGHT tall: a body in the team colour, a
 * head, and an accent in the element colour (steel for the warden).
 */
function figure(
  kind: Archetype,
  teamColor: THREE.ColorRepresentation,
): { body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>; parts: THREE.Mesh[] } {
  switch (kind) {
    case "knight": {
      // Stocky, with a crested helmet and a blade at the side.
      const body = mesh(new THREE.BoxGeometry(0.52, 0.52, 0.4), teamColor, 0, 0.26, 0);
      const head = mesh(new THREE.SphereGeometry(0.14, 14, 10), HEAD_COLOR, 0, 0.64, 0);
      const crest = mesh(new THREE.ConeGeometry(0.09, 0.22, 8), ELEMENT_COLOR.fire, 0, 0.86, 0);
      const blade = mesh(
        new THREE.BoxGeometry(0.06, 0.56, 0.1),
        ELEMENT_COLOR.fire,
        0.33,
        0.4,
        0.08,
      );
      return { body, parts: [body, head, crest, blade] };
    }
    case "archer": {
      // Slim and tall, with a bow at the side.
      const body = mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.6, 12), teamColor, 0, 0.3, 0);
      const head = mesh(new THREE.SphereGeometry(0.13, 14, 10), HEAD_COLOR, 0, 0.72, 0);
      const bow = mesh(
        new THREE.TorusGeometry(0.28, 0.04, 6, 16, Math.PI),
        ELEMENT_COLOR.ice,
        0.22,
        0.42,
        0,
      );
      // The half ring bulges outward, flat to the front and back.
      bow.rotation.z = -Math.PI / 2;
      const string = mesh(new THREE.BoxGeometry(0.015, 0.56, 0.015), 0xffffff, 0.22, 0.42, 0);
      return { body, parts: [body, head, bow, string] };
    }
    case "scout": {
      // Small and light, a spark floating over the head.
      const body = mesh(new THREE.CylinderGeometry(0.1, 0.24, 0.44, 10), teamColor, 0, 0.22, 0);
      const head = mesh(new THREE.SphereGeometry(0.12, 14, 10), HEAD_COLOR, 0, 0.54, 0);
      const spark = mesh(new THREE.OctahedronGeometry(0.12), ELEMENT_COLOR.lightning, 0, 0.8, 0);
      spark.scale.y = 1.5;
      return { body, parts: [body, head, spark] };
    }
    case "warden": {
      // Broad and heavy, a steel helmet and a big shield in front.
      const body = mesh(new THREE.BoxGeometry(0.62, 0.6, 0.46), teamColor, 0, 0.3, 0);
      const head = mesh(new THREE.SphereGeometry(0.15, 14, 10), HEAD_COLOR, 0, 0.74, 0);
      const helmet = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 12), STEEL_COLOR, 0, 0.8, 0);
      const shield = mesh(new THREE.BoxGeometry(0.56, 0.6, 0.06), STEEL_COLOR, 0, 0.34, 0.28);
      const boss = mesh(new THREE.SphereGeometry(0.08, 10, 8), teamColor, 0, 0.36, 0.32);
      return { body, parts: [body, head, helmet, shield, boss] };
    }
  }
}
