import { randomBot } from "@evt/bots";
import {
  type Action,
  activeUnit,
  MAPS,
  type MatchState,
  type Pos,
  parseScenario,
  preview,
} from "@evt/engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { BoardView, type Highlight } from "./board/BoardView.ts";
import { describeEvent } from "./game/describe.ts";
import { NO_OPTIONS, posKey, turnOptions } from "./game/options.ts";
import { Hud } from "./Hud.tsx";
import type { HostUpdate } from "./host/GameHost.ts";
import { LocalHost } from "./host/LocalHost.ts";

export function Game({ seed, onRestart }: { seed: number; onRestart: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<LocalHost | null>(null);
  const [board, setBoard] = useState<BoardView | null>(null);
  /** The state the board currently shows; lags behind the host while animating. */
  const [view, setView] = useState<MatchState | null>(null);
  const [animating, setAnimating] = useState(false);
  const [hover, setHover] = useState<Pos | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const clickRef = useRef<(pos: Pos) => void>(() => {});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const h = new LocalHost({
      setup: { ...parseScenario(MAPS.skirmish as string), seed },
      bots: { 1: randomBot(seed + 1) },
    });
    const b = new BoardView(container, h.state, {
      onHover: setHover,
      onClick: (pos) => clickRef.current(pos),
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
  }, [seed]);

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
  const outcome = useMemo(
    () => (pending && view && myTurn ? preview(view, pending) : null),
    [pending, view, myTurn],
  );

  const submit = (action: Action) => {
    setPending(null);
    try {
      host?.submit(action);
    } catch (e) {
      setLog((old) => [...old, `Not allowed: ${(e as Error).message}`]);
    }
  };

  clickRef.current = (pos) => {
    const k = posKey(pos);
    const unit = view?.units.find((u) => u.hp > 0 && u.x === pos.x && u.y === pos.y);
    if (unit) setSelected(unit.id);
    if (!myTurn) return;
    const attack = options.attacks.get(k);
    if (attack) return setPending(attack);
    if (options.moves.has(k) && active) return submit({ type: "move", unit: active.id, to: pos });
    setPending(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPending(null);
      if ((e.key === "e" || e.key === "E") && myTurn && active) {
        submit({ type: "endTurn", unit: active.id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!board) return;
    const highlights = new Map<string, Highlight>();
    for (const k of options.moves.keys()) highlights.set(k, "move");
    const hoverPath = hover ? options.moves.get(posKey(hover)) : undefined;
    for (const p of hoverPath ?? []) highlights.set(posKey(p), "path");
    for (const k of options.attacks.keys()) highlights.set(k, "attack");
    if (pending?.type === "attack") highlights.set(posKey(pending.target), "target");
    if (active && myTurn) highlights.set(posKey(active), "active");
    board.setHighlights(highlights);
  }, [board, options, hover, pending, active, myTurn]);

  return (
    <div className="game">
      <div className="board" ref={containerRef} />
      {view && host && (
        <Hud
          state={view}
          localTeams={host.localTeams}
          myTurn={myTurn}
          selectedId={selected ?? active?.id ?? null}
          pending={pending}
          outcome={outcome}
          log={log}
          onConfirm={() => pending && submit(pending)}
          onCancel={() => setPending(null)}
          onEndTurn={() => active && submit({ type: "endTurn", unit: active.id })}
          onRestart={onRestart}
        />
      )}
    </div>
  );
}
