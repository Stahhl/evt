import {
  ABILITIES,
  type AbilityId,
  type Action,
  type MatchState,
  type Outcome,
  type Pos,
  type SurfaceKind,
  tileAt,
  type Unit,
} from "@evt/engine";
import { TEAM_COLOR } from "./board/BoardView.ts";
import { ARCHETYPE_NAME, archetypeOf } from "./game/archetype.ts";
import { resultText } from "./game/describe.ts";

interface HudProps {
  state: MatchState;
  localTeams: readonly number[];
  myTurn: boolean;
  selectedId: string | null;
  hover: Pos | null;
  /** Abilities of the active unit that can be used now. */
  readyAbilities: readonly AbilityId[];
  mode: AbilityId | null;
  pending: Action | null;
  outcome: Outcome | null;
  log: readonly string[];
  onMode(ability: AbilityId | null): void;
  onConfirm(): void;
  onCancel(): void;
  onEndTurn(): void;
  onRestart(): void;
  onDownloadReplay(): void;
}

const teamColor = (team: number) => TEAM_COLOR[team % TEAM_COLOR.length];

const SURFACE_NAME: Record<SurfaceKind, string> = {
  puddle: "Puddle",
  steam: "Steam (50% dodge)",
  ice: "Ice",
  electrified: "Electrified",
  iceWall: "Ice wall",
};

function HpBar({ unit }: { unit: Unit }) {
  return (
    <span className="hp">
      <span className="hp-fill" style={{ width: `${(unit.hp / unit.maxHp) * 100}%` }} />
    </span>
  );
}

function OutcomeView({ state, outcome }: { state: MatchState; outcome: Outcome }) {
  const byId = new Map(state.units.map((u) => [u.id, u]));
  return (
    <>
      {outcome.branches.map((branch, i) => {
        const surfaces = new Map<string, number>();
        for (const e of branch.events) {
          if (e.type === "surfaceChanged" && e.to) {
            surfaces.set(e.to, (surfaces.get(e.to) ?? 0) + 1);
          }
        }
        const frozen = branch.events.flatMap((e) => (e.type === "frozen" ? [e.unit] : []));
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: branches have a fixed order
          <div key={i} className="branch">
            {outcome.branches.length > 1 && (
              <div className="chance">{Math.round(branch.chance * 100)}% chance</div>
            )}
            <ul>
              {branch.hpChanges.length === 0 && <li>No damage</li>}
              {branch.hpChanges.map((c) => {
                const before = byId.get(c.unit)?.hp ?? 0;
                return (
                  <li key={c.unit}>
                    {c.unit}: {before} → {before + c.delta} <strong>({c.delta})</strong>
                  </li>
                );
              })}
              {branch.deaths.map((id) => (
                <li key={`dies-${id}`}>{id} is defeated</li>
              ))}
              {frozen.map((id) => (
                <li key={`frozen-${id}`}>{id} is frozen</li>
              ))}
              {[...surfaces].map(([kind, n]) => (
                <li key={`surface-${kind}`}>
                  {n} × {SURFACE_NAME[kind as SurfaceKind]}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

export function Hud(props: HudProps) {
  const { state, localTeams, myTurn, outcome } = props;
  const byId = new Map(state.units.map((u) => [u.id, u]));
  const activeId = state.result ? undefined : state.queue[0];
  const activeUnit = activeId ? byId.get(activeId) : undefined;
  const chosen = props.selectedId ? byId.get(props.selectedId) : undefined;
  // A defeated unit is no longer shown; fall back to whoever is acting.
  const selected = chosen && chosen.hp > 0 ? chosen : activeUnit;
  const hoverTile = props.hover ? tileAt(state.map, props.hover) : undefined;

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
            const frozen = u.statuses.some((s) => s.kind === "frozen");
            return (
              <li key={id} className={id === activeId ? "active" : ""}>
                <span className="chip" style={{ background: teamColor(u.team) }}>
                  {u.id}
                </span>
                <HpBar unit={u} />
                <span className="num">{u.hp}</span>
                {frozen && <span title="Frozen">❄</span>}
              </li>
            );
          })}
        </ol>
        <p className="hint">
          {state.result
            ? ""
            : myTurn
              ? props.mode
                ? `${ABILITIES[props.mode].name}: pick a highlighted tile. Esc cancels.`
                : "Blue tiles: move. Red: attack. Or pick an ability. E ends the turn, ←/→ rotate."
              : activeUnit && localTeams.includes(activeUnit.team)
                ? "…"
                : "Opponent's turn"}
        </p>
        {myTurn && activeUnit && activeUnit.abilities.length > 0 && (
          <div className="abilities">
            {activeUnit.abilities.map((a, i) => {
              const def = ABILITIES[a];
              const cooldown = activeUnit.cooldowns[a] ?? 0;
              const ready = props.readyAbilities.includes(a);
              return (
                <button
                  type="button"
                  key={a}
                  className={`ability ${def.element} ${props.mode === a ? "selected" : ""}`}
                  disabled={!ready}
                  title={`${def.name}: range ${def.range}, cooldown ${def.cooldown}`}
                  onClick={() => props.onMode(props.mode === a ? null : a)}
                >
                  {i + 1}. {def.name}
                  {cooldown > 0 && <span className="cooldown"> ({cooldown})</span>}
                </button>
              );
            })}
          </div>
        )}
        <button type="button" className="end-turn" disabled={!myTurn} onClick={props.onEndTurn}>
          End turn (E)
        </button>
        {props.hover && hoverTile && (
          <p className="tile-info">
            ({props.hover.x}, {props.hover.y}) · {hoverTile.terrain} · height {hoverTile.height}
            {hoverTile.surface && ` · ${SURFACE_NAME[hoverTile.surface.kind]}`}
            {hoverTile.surface?.rounds != null && ` (${hoverTile.surface.rounds})`}
          </p>
        )}
      </section>

      {selected && (
        <section className="panel unit-card">
          <h2>
            <span className="chip" style={{ background: teamColor(selected.team) }}>
              {selected.id}
            </span>{" "}
            {ARCHETYPE_NAME[archetypeOf(selected)]} ·{" "}
            {localTeams.includes(selected.team) ? "ally" : "enemy"}
            {selected.statuses.some((s) => s.kind === "frozen") && " · frozen"}
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
            {selected.abilities.map((a) => (
              <div key={a} className="row">
                <dt>{ABILITIES[a].name}</dt>
                <dd>{selected.cooldowns[a] ? `in ${selected.cooldowns[a]}` : "ready"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {props.pending && outcome && (
        <section className="panel preview">
          <h2>
            {props.pending.type === "ability" ? ABILITIES[props.pending.ability].name : "Attack"}{" "}
            preview
          </h2>
          <OutcomeView state={state} outcome={outcome} />
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
            <p className="summary">Round {state.round}</p>
            <div className="buttons">
              <button type="button" onClick={props.onRestart}>
                Play again
              </button>
              <button type="button" className="secondary" onClick={props.onDownloadReplay}>
                Download replay
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
