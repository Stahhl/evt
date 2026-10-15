import { greedyBot } from "@evt/bots";
import {
  ABILITIES,
  type AbilityId,
  type Action,
  activeUnit,
  area,
  MAPS,
  type MatchState,
  type Pos,
  parseScenario,
  preview,
  readyAbilities,
  threatenedTiles,
} from "@evt/engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { BoardView, type Highlight, type MouseButton } from "./board/BoardView.ts";
import { type Aim, aimAction, canAim, defaultAim, firstTarget } from "./game/aim.ts";
import { describeEvent } from "./game/describe.ts";
import { NO_OPTIONS, posKey, turnOptions } from "./game/options.ts";
import { Hud } from "./Hud.tsx";
import type { HostUpdate } from "./host/GameHost.ts";
import { LocalHost } from "./host/LocalHost.ts";

/** How far the board zooms in while aiming on a touch screen. */
const AIM_ZOOM = 1.8;

/** Whether the main pointer is a finger rather than a mouse. */
function useCoarsePointer(): boolean {
  const query = "(pointer: coarse)";
  const [coarse, setCoarse] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const onChange = () => setCoarse(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return coarse;
}

interface GameProps {
  seed: number;
  map: string;
  onNewGame: (map: string) => void;
}

export function Game({ seed, map, onNewGame }: GameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<LocalHost | null>(null);
  const [board, setBoard] = useState<BoardView | null>(null);
  /** The state the board currently shows; lags behind the host while animating. */
  const [view, setView] = useState<MatchState | null>(null);
  const [animating, setAnimating] = useState(false);
  const [hover, setHover] = useState<Pos | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  /** The ability the player is aiming, if any. */
  const [mode, setMode] = useState<AbilityId | null>(null);
  /** Touch screens aim by dragging the board under a crosshair instead of tapping tiles. */
  const touch = useCoarsePointer();
  /** On touch screens: what the player is about to do, and the tile under the crosshair. */
  const [aim, setAim] = useState<Aim | null>(null);
  const [aimTile, setAimTile] = useState<Pos | null>(null);
  const [showThreat, setShowThreat] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const clickRef = useRef<(pos: Pos, button: MouseButton) => void>(() => {});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const h = new LocalHost({
      setup: { ...parseScenario(MAPS[map] as string), seed },
      bots: { 1: greedyBot(seed + 1) },
    });
    const b = new BoardView(container, h.state, {
      onHover: setHover,
      onClick: (pos, button) => clickRef.current(pos, button),
      onAim: setAimTile,
    });
    setHost(h);
    setBoard(b);
    // Lets browser tests click tiles and read the state. Not in production builds.
    if (import.meta.env.DEV) {
      const options = () => turnOptions(h.state, h.localTeams);
      Object.assign(window, { evt: { host: h, board: b, options } });
    }
    setView(h.state);

    // Updates are animated strictly in order, even if the bot answers quickly.
    const queue: HostUpdate[] = [];
    let running = false;
    let alive = true;
    const pump = async () => {
      if (running) return;
      running = true;
      setAnimating(true);
      for (let update = queue.shift(); update && alive; update = queue.shift()) {
        const lines = update.events.map(describeEvent).filter((l): l is string => l !== null);
        setLog((old) => [...old, ...lines].slice(-100));
        await b.play(update.events, update.state);
        if (alive) setView(update.state);
      }
      running = false;
      if (alive) setAnimating(false);
    };
    const unsubscribe = h.subscribe((update) => {
      queue.push(update);
      void pump();
    });
    return () => {
      alive = false;
      unsubscribe();
      h.dispose();
      b.dispose();
    };
  }, [seed, map]);

  const active = view ? activeUnit(view) : undefined;
  const myTurn =
    !!host &&
    !!view &&
    !animating &&
    view === host.state &&
    active !== undefined &&
    host.localTeams.includes(active.team);

  const options = useMemo(
    () => (myTurn && view && host ? turnOptions(view, host.localTeams) : NO_OPTIONS),
    [myTurn, view, host],
  );

  const ready = myTurn && view && active ? readyAbilities(view, active) : [];
  const localActive = !!host && !!active && host.localTeams.includes(active.team);

  // Touch: keep aiming at something the active unit can still do. The aim
  // survives the unit's own animations so the view doesn't jump out and back.
  useEffect(() => {
    if (!touch || !localActive) return setAim(null);
    if (!myTurn) return;
    setAim((old) => (old && canAim(options, old) ? old : defaultAim(options)));
  }, [touch, localActive, myTurn, options]);

  // Touch: zoom in on the first target when aiming starts, out when it stops.
  useEffect(() => {
    if (!board || !touch) return;
    if (aim && myTurn && active) {
      const target = firstTarget(options, aim, active);
      board.setPanMode(true);
      void board.focusOn(target, AIM_ZOOM);
      setAimTile(target);
    } else if (!aim) {
      board.setPanMode(false);
      void board.focusOn(null);
      setAimTile(null);
    }
  }, [board, touch, aim, myTurn, active, options]);

  /** Touch: the action the confirm button would submit. */
  const aimed = useMemo(
    () =>
      touch && myTurn && aim && aimTile && active
        ? aimAction(options, aim, active.id, aimTile)
        : null,
    [touch, myTurn, aim, aimTile, active, options],
  );
  /** The attack or ability whose outcome is previewed. */
  const shown = touch ? (aimed?.type === "move" ? null : aimed) : pending;
  const outcome = useMemo(
    () => (shown && view && myTurn ? preview(view, shown) : null),
    [shown, view, myTurn],
  );
  const cancel = () => {
    setPending(null);
    setMode(null);
  };

  const submit = (action: Action) => {
    setPending(null);
    setMode(null);
    try {
      host?.submit(action);
    } catch (e) {
      setLog((old) => [...old, `Not allowed: ${(e as Error).message}`]);
    }
  };

  // Mouse: left click moves (or aims an ability), right click attacks. On
  // touch screens a tap only selects; aiming is done by dragging the board.
  clickRef.current = (pos, button) => {
    const k = posKey(pos);
    const unit = view?.units.find((u) => u.hp > 0 && u.x === pos.x && u.y === pos.y);
    if (unit) setSelected(unit.id);
    if (!myTurn || touch) return;
    if (button === "secondary") {
      setMode(null);
      const attack = options.attacks.get(k);
      if (!attack) return setPending(null);
      // A second right click on the same target confirms.
      if (pending?.type === "attack" && posKey(pending.target) === k) return submit(attack);
      return setPending(attack);
    }
    if (mode) {
      const cast = options.abilities.get(mode)?.get(k);
      if (cast) return setPending(cast);
      return cancel();
    }
    if (options.moves.has(k) && active) return submit({ type: "move", unit: active.id, to: pos });
    setPending(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
      if (e.key === "Enter" && pending && myTurn) submit(pending);
      if (e.key === "ArrowLeft") board?.rotate(-1);
      if (e.key === "ArrowRight") board?.rotate(1);
      if (e.key === "t" || e.key === "T") setShowThreat((v) => !v);
      const index = Number(e.key) - 1;
      const ability = active?.abilities[index];
      if (myTurn && ability && ready.includes(ability)) {
        setPending(null);
        setMode(mode === ability ? null : ability);
      }
      if ((e.key === "e" || e.key === "E") && myTurn && active) {
        submit({ type: "endTurn", unit: active.id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!board || !view) return;
    const highlights = new Map<string, Highlight>();
    if (showThreat && host) {
      const team = host.localTeams[0] ?? 0;
      for (const index of threatenedTiles(view, team).keys()) {
        highlights.set(
          posKey({ x: index % view.map.cols, y: Math.floor(index / view.map.cols) }),
          "threat",
        );
      }
    }
    const cast = shown?.type === "ability" ? shown : null;
    const aiming =
      cast?.ability ?? (touch ? (aim !== "move" && aim !== "attack" ? aim : null) : mode);
    // The tile the player points at: under the crosshair, or under the mouse.
    const pointed = touch ? aimTile : hover;
    if (aiming) {
      // Show where the ability can go, and the area it would hit.
      for (const k of options.abilities.get(aiming)?.keys() ?? []) highlights.set(k, "ability");
      const center =
        cast?.target ??
        (pointed && options.abilities.get(aiming)?.has(posKey(pointed)) ? pointed : null);
      if (center) {
        for (const p of area(view.map, center, ABILITIES[aiming].radius)) {
          highlights.set(posKey(p), "target");
        }
      }
    } else {
      if (!touch || aim === "move") {
        for (const k of options.moves.keys()) highlights.set(k, "move");
        const path = pointed ? options.moves.get(posKey(pointed)) : undefined;
        for (const p of path ?? []) highlights.set(posKey(p), "path");
        if (touch && path) highlights.set(posKey(pointed as Pos), "target");
      }
      if (!touch || aim === "attack") {
        for (const k of options.attacks.keys()) highlights.set(k, "attack");
      }
      if (shown?.type === "attack") highlights.set(posKey(shown.target), "target");
    }
    if (active && myTurn) highlights.set(posKey(active), "active");
    board.setHighlights(highlights);
  }, [
    board,
    view,
    host,
    options,
    hover,
    shown,
    mode,
    active,
    myTurn,
    showThreat,
    touch,
    aim,
    aimTile,
  ]);

  const downloadReplay = () => {
    if (!host) return;
    const blob = new Blob([`${JSON.stringify(host.replay, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `evt-${map}-${seed}-${host.replay.actions.length}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="game">
      <nav className="panel toolbar">
        <label>
          Map{" "}
          <select value={map} onChange={(e) => onNewGame(e.target.value)}>
            {Object.keys(MAPS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary" onClick={() => onNewGame(map)}>
          New game
        </button>
        <button
          type="button"
          className="secondary"
          title="Rotate left (←)"
          onClick={() => board?.rotate(-1)}
        >
          ⟲
        </button>
        <button
          type="button"
          className="secondary"
          title="Rotate right (→)"
          onClick={() => board?.rotate(1)}
        >
          ⟳
        </button>
        <button
          type="button"
          className={`secondary ${showThreat ? "on" : ""}`}
          title="Tiles the enemy can hit next turn (T)"
          onClick={() => setShowThreat((v) => !v)}
        >
          Threat (T)
        </button>
        <button
          type="button"
          className="secondary"
          title="Save this match as a replay file"
          onClick={downloadReplay}
        >
          Replay ⤓
        </button>
      </nav>
      <div className="board" ref={containerRef} />
      {touch && aim && myTurn && <div className="reticle" />}
      {view && host && (
        <Hud
          state={view}
          localTeams={host.localTeams}
          myTurn={myTurn}
          selectedId={selected ?? active?.id ?? null}
          hover={hover}
          readyAbilities={ready}
          mode={mode}
          onMode={(a) => {
            setPending(null);
            setMode(a);
          }}
          pending={shown}
          outcome={outcome}
          log={log}
          touch={touch}
          aim={aim}
          aimed={aimed}
          onAim={setAim}
          onConfirm={() => {
            const action = touch ? aimed : pending;
            if (action) submit(action);
          }}
          onCancel={cancel}
          onEndTurn={() => active && submit({ type: "endTurn", unit: active.id })}
          onRestart={() => onNewGame(map)}
          onDownloadReplay={downloadReplay}
        />
      )}
    </div>
  );
}
