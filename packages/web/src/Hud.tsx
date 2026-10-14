import type { Action, MatchState, Outcome, Unit } from "@evt/engine";
import { TEAM_COLOR } from "./board/BoardView.ts";
import { resultText } from "./game/describe.ts";

interface HudProps {
  state: MatchState;
  localTeams: readonly number[];
  myTurn: boolean;
  selectedId: string | null;
  pending: Action | null;
  outcome: Outcome | null;
  log: readonly string[];
  onConfirm(): void;
  onCancel(): void;
  onEndTurn(): void;
  onRestart(): void;
}

const teamColor = (team: number) => TEAM_COLOR[team % TEAM_COLOR.length];

function HpBar({ unit }: { unit: Unit }) {
  return (
    <span className="hp">
      <span className="hp-fill" style={{ width: `${(unit.hp / unit.maxHp) * 100}%` }} />
    </span>
  );
}

export function Hud(props: HudProps) {
  const { state, localTeams, myTurn, outcome } = props;
  const byId = new Map(state.units.map((u) => [u.id, u]));
  const activeId = state.result ? undefined : state.queue[0];
  const chosen = props.selectedId ? byId.get(props.selectedId) : undefined;
  // A defeated unit is no longer shown; fall back to whoever is acting.
  const selected = chosen && chosen.hp > 0 ? chosen : activeId ? byId.get(activeId) : undefined;
  const activeUnit = activeId ? byId.get(activeId) : undefined;

  return (
    <>
      <section className="panel turn-order">
        <h2>
          Round {state.round}/{state.maxRounds}
        </h2>
        <ol>
          {state.queue.map((id) => {
            const u = byId.get(id);
            if (!u) return null;
            return (
              <li key={id} className={id === activeId ? "active" : ""}>
                <span className="chip" style={{ background: teamColor(u.team) }}>
                  {u.id}
                </span>
                <HpBar unit={u} />
                <span className="num">{u.hp}</span>
              </li>
            );
          })}
        </ol>
        <p className="hint">
          {state.result
            ? ""
            : myTurn
              ? "Your turn: click a blue tile to move, a red tile to attack. E ends the turn."
              : activeUnit && localTeams.includes(activeUnit.team)
                ? "…"
                : "Opponent's turn"}
        </p>
        <button type="button" disabled={!myTurn} onClick={props.onEndTurn}>
          End turn (E)
        </button>
      </section>

      {selected && (
        <section className="panel unit-card">
          <h2>
            <span className="chip" style={{ background: teamColor(selected.team) }}>
              {selected.id}
            </span>{" "}
            {localTeams.includes(selected.team) ? "Ally" : "Enemy"}
          </h2>
          <HpBar unit={selected} />
          <dl>
            <dt>HP</dt>
            <dd>
              {selected.hp}/{selected.maxHp}
            </dd>
            <dt>Attack</dt>
            <dd>{selected.attack}</dd>
            <dt>Range</dt>
            <dd>{selected.range}</dd>
            <dt>Move</dt>
            <dd>{selected.move}</dd>
            <dt>Jump</dt>
            <dd>{selected.jump}</dd>
            <dt>Initiative</dt>
            <dd>{selected.initiative}</dd>
          </dl>
        </section>
      )}

      {props.pending && outcome && (
        <section className="panel preview">
          <h2>Attack preview</h2>
          <ul>
            {outcome.hpChanges.map((c) => {
              const before = byId.get(c.unit)?.hp ?? 0;
              return (
                <li key={c.unit}>
                  {c.unit}: {before} → {before + c.delta} <strong>({c.delta})</strong>
                </li>
              );
            })}
            {outcome.deaths.map((id) => (
              <li key={`dies-${id}`}>{id} is defeated</li>
            ))}
          </ul>
          <div className="buttons">
            <button type="button" onClick={props.onConfirm}>
              Confirm
            </button>
            <button type="button" className="secondary" onClick={props.onCancel}>
              Cancel (Esc)
            </button>
          </div>
        </section>
      )}

      {props.log.length > 0 && (
        <section className="panel log">
          {props.log.slice(-8).map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the log is append-only
            <div key={props.log.length - 8 + i}>{line}</div>
          ))}
        </section>
      )}

      {state.result && (
        <div className="result">
          <div className="panel">
            <h1>{resultText(state, localTeams)}</h1>
            <button type="button" onClick={props.onRestart}>
              Play again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
