import type { Action, MatchState, Team } from "@evt/engine";

export interface Bot {
  readonly name: string;
  chooseAction(state: MatchState, team: Team): Action;
}
