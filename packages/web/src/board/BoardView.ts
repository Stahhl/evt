/**
 * The 3D board. It knows nothing about the rules: it draws a state, plays
 * events as animations and reports which tile the pointer is on.
 */
import type { GameEvent, MatchState, Pos, Tile } from "@evt/engine";
import * as THREE from "three";

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

export type Highlight = "move" | "path" | "attack" | "target" | "active";
const HIGHLIGHT_COLOR: Record<Highlight, number> = {
  move: 0x7fd7ff,
  path: 0xffffff,
  attack: 0xff6a4d,
  target: 0xffd23f,
  active: 0xffe680,
};

export interface BoardCallbacks {
  onHover(pos: Pos | null): void;
  onClick(pos: Pos): void;
}

interface UnitView {
  readonly group: THREE.Group;
  readonly body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
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
  readonly #resize: ResizeObserver;
  #tweens: Tween[] = [];
  #state: MatchState;
  #hovered: string | null = null;
  #pointerDown: { x: number; y: number } | null = null;

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
    for (const u of state.units) this.#buildUnit(u.id, u.team);
    this.sync(state);

    const canvas = this.#renderer.domElement;
    canvas.addEventListener("pointermove", this.#onPointerMove);
    canvas.addEventListener("pointerdown", this.#onPointerDown);
    canvas.addEventListener("pointerup", this.#onPointerUp);
    canvas.addEventListener("pointerleave", this.#onPointerLeave);
    this.#resize = new ResizeObserver(() => this.#fit());
    this.#resize.observe(container);
    this.#fit();
    this.#renderer.setAnimationLoop((now) => {
      this.#tweens = this.#tweens.filter((t) => t(now));
      this.#renderer.render(this.#scene, this.#camera);
    });
  }

  /** Places every unit where the state says, without animation. */
  sync(state: MatchState): void {
    this.#state = state;
    for (const u of state.units) {
      const view = this.#units.get(u.id);
      if (!view) continue;
      view.group.visible = u.hp > 0;
      view.group.scale.setScalar(1);
      view.group.position.copy(this.#unitPosition(u));
      view.body.userData.pos = { x: u.x, y: u.y };
      view.body.material.emissive.setHex(0);
    }
  }

  setHighlights(highlights: ReadonlyMap<string, Highlight>): void {
    for (const [k, overlay] of this.#overlays) {
      const h = highlights.get(k);
      overlay.visible = h !== undefined;
      if (h) {
        overlay.material.color.setHex(HIGHLIGHT_COLOR[h]);
        overlay.material.opacity = h === "move" ? 0.35 : 0.6;
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
        overlay.position.copy(this.#world(pos, top + 0.01));
        overlay.visible = false;
        this.#scene.add(overlay);
        this.#overlays.set(key(pos), overlay);
      }
    }
  }

  #buildUnit(id: string, team: number): void {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, UNIT_HEIGHT, 0.56),
      new THREE.MeshLambertMaterial({ color: TEAM_COLOR[team % TEAM_COLOR.length] ?? "#fff" }),
    );
    body.position.y = UNIT_HEIGHT / 2;
    group.add(body);
    group.add(this.#label(id));
    this.#scene.add(group);
    this.#pickables.push(body);
    this.#units.set(id, { group, body });
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
    // Isometric-style view from the corner behind team 0, which starts at the
    // low x/y corner of the maps. Rotation comes in step 7.
    const size = Math.max(cols, rows);
    const aspect = w / h;
    const half = size * 0.62;
    this.#camera.left = -half * Math.max(aspect, 1);
    this.#camera.right = half * Math.max(aspect, 1);
    this.#camera.top = half / Math.min(aspect, 1);
    this.#camera.bottom = -half / Math.min(aspect, 1);
    this.#camera.near = 0.1;
    this.#camera.far = 200;
    this.#camera.position.set(-size, size * 1.1, -size);
    this.#camera.lookAt(0, 0, 0);
    this.#camera.updateProjectionMatrix();
  }

  #pick(event: PointerEvent): Pos | null {
    const rect = this.#renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(ndc, this.#camera);
    for (const hit of this.#raycaster.intersectObjects(this.#pickables, false)) {
      if (!hit.object.visible || !hit.object.parent?.visible) continue;
      const pos = hit.object.userData.pos as Pos | undefined;
      if (pos) return pos;
    }
    return null;
  }

  #onPointerMove = (event: PointerEvent): void => {
    const pos = this.#pick(event);
    const k = pos ? key(pos) : null;
    if (k !== this.#hovered) {
      this.#hovered = k;
      this.#callbacks.onHover(pos);
    }
  };

  #onPointerDown = (event: PointerEvent): void => {
    this.#pointerDown = { x: event.clientX, y: event.clientY };
  };

  #onPointerUp = (event: PointerEvent): void => {
    const down = this.#pointerDown;
    this.#pointerDown = null;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const pos = this.#pick(event);
    if (pos) this.#callbacks.onClick(pos);
  };

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
    await this.#tween(140, (t) => attacker.group.position.copy(home).addScaledVector(toward, t));
    await this.#tween(220, (t) => {
      attacker.group.position.copy(home).addScaledVector(toward, 1 - t);
      target.body.material.emissive.setRGB(0.9 * (1 - t), 0.1 * (1 - t), 0);
    });
  }

  async #animateDeath(id: string): Promise<void> {
    const view = this.#units.get(id);
    if (!view) return;
    await this.#tween(350, (t) => view.group.scale.setScalar(1 - t));
    view.group.visible = false;
  }
}
