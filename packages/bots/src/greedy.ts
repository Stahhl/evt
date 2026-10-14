/**
 * Greedy bot: looks one turn ahead. For every tile the active unit can end
 * up on (or staying put) it tries every useful action from there, scores the
 * resulting position and plays the best plan. Rolls are handled by taking
 * the expected score over preview's branches.
 *
 * It is stateless: each call re-plans from the current state and returns the
 * next step of the best plan, so a move is followed by the action it was
 * chosen for. Plans with exactly the best score are picked between with the
 * bot's seed, so two greedy bots do not replay the same match every time.
 */
import {
  ABILITIES,
  type Action,
  abilityTargets,
  activeUnit,
  area,
  attackTargets,
  distance,
  type MatchState,
  preview,
  reachableTiles,
  readyAbilities,
  rollBelow,
  seedRng,
  type Team,
  tileAt,
  type Unit,
} from "@evt/engine";
import type { Bot } from "./bot.ts";
import { stateSeed } from "./random.ts";

/** Score weights. Rough guesses until balance runs say otherwise. */
export const WEIGHTS = {
  /** Per hp point; own units count positive, enemies negative. */
  hp: 1,
  /** Extra value of a unit being alive, so finishing a unit off is worth more than its hp. */
  alive: 40,
  /** A frozen unit loses a turn. */
  frozen: 20,
  /** Per tile the active unit is further from the nearest enemy than its reach. */
  distance: 2,
  /** Standing on electrified ground hurts at the end of the turn. */
  electrified: 10,
  win: 100_000,
};

/** How good `state` is for `team`, from the point of view of `unitId` having acted. */
export function evaluate(state: MatchState, team: Team, unitId: string): number {
  if (state.result) {
    if (state.result.winner === team) return WEIGHTS.win;
    if (state.result.winner === null) return 0;
    return -WEIGHTS.win;
  }
  let score = 0;
  for (const u of state.units) {
    if (u.hp === 0) continue;
    const sign = u.team === team ? 1 : -1;
    score += sign * (u.hp * WEIGHTS.hp + WEIGHTS.alive);
    if (u.statuses.some((s) => s.kind === "frozen")) score -= sign * WEIGHTS.frozen;
  }
  const me = state.units.find((u) => u.id === unitId);
  if (me && me.hp > 0) {
    const enemies = state.units.filter((u) => u.hp > 0 && u.team !== team);
    const nearest = Math.min(...enemies.map((e) => distance(me, e)));
    const reach = Math.max(me.range, ...me.abilities.map((a) => ABILITIES[a].range));
    score -= WEIGHTS.distance * Math.max(0, nearest - reach);
    if (tileAt(state.map, me)?.surface?.kind === "electrified") score -= WEIGHTS.electrified;
  }
  return score;
}

function expected(state: MatchState, action: Action, team: Team, unitId: string) {
  const { branches } = preview(state, action);
  let score = 0;
  for (const b of branches) score += b.chance * evaluate(b.state, team, unitId);
  // Expected values are only compared, never stored, so floats are fine here.
  const next = branches[0]?.state ?? state;
  return { score, next };
}

/**
 * Attacks and abilities worth considering from where the unit stands. Area
 * abilities are only aimed where they hit an enemy, and ice walls are left
 * out: their value only shows later than a one-turn look-ahead can see.
 */
function actOptions(state: MatchState, unit: Unit): Action[] {
  if (state.turn.acted) return [];
  const actions: Action[] = attackTargets(state, unit).map((t) => ({
    type: "attack",
    unit: unit.id,
    target: { x: t.x, y: t.y },
  }));
  const enemies = state.units.filter((u) => u.hp > 0 && u.team !== unit.team);
  for (const ability of readyAbilities(state, unit)) {
    const def = ABILITIES[ability];
    if (ability === "iceWall") continue;
    for (const target of abilityTargets(state, unit, ability)) {
      const hits = area(state.map, target, def.radius);
      if (enemies.some((e) => hits.some((p) => p.x === e.x && p.y === e.y))) {
        actions.push({ type: "ability", unit: unit.id, ability, target });
      }
    }
  }
  return actions;
}

/** The best action from this state (or null to act no more), and its score. */
function bestAct(
  state: MatchState,
  unit: Unit,
  team: Team,
): { action: Action | null; score: number } {
  let best: { action: Action | null; score: number } = {
    action: null,
    score: evaluate(state, team, unit.id),
  };
  for (const action of actOptions(state, unit)) {
    const { score } = expected(state, action, team, unit.id);
    if (score > best.score) best = { action, score };
  }
  return best;
}

/** Scores closer than this count as equal. Expected values are floats. */
const TIE = 1e-9;

export function greedyBot(seed = 0): Bot {
  return {
    name: "greedy",
    chooseAction(state, team) {
      const unit = activeUnit(state);
      if (!unit || unit.team !== team) throw new Error(`team ${team} has no legal actions`);

      // Each plan is its first step and the score of the whole turn.
      const plans: { first: Action | null; score: number }[] = [];
      const stay = bestAct(state, unit, team);
      plans.push({ first: stay.action, score: stay.score });
      if (!state.turn.moved) {
        for (const { to } of reachableTiles(state, unit)) {
          const move: Action = { type: "move", unit: unit.id, to };
          const { score: moveScore, next } = expected(state, move, team, unit.id);
          const moved = next.units.find((u) => u.id === unit.id) as Unit;
          // A move ends the turn if the unit had already acted.
          const after =
            next.queue[0] === unit.id
              ? bestAct(next, moved, team)
              : { action: null, score: moveScore };
          plans.push({ first: move, score: after.score });
        }
      }

      const top = Math.max(...plans.map((p) => p.score));
      const best = plans.filter((p) => p.score >= top - TIE);
      const [index] = rollBelow(seedRng(stateSeed(seed, state)), best.length);
      return best[index]?.first ?? { type: "endTurn", unit: unit.id };
    },
  };
}
