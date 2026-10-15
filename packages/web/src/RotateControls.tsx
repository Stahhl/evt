import { TEAM_COLOR } from "./board/BoardView.ts";

interface RotateControlsProps {
  /** Quarter turns from the start view; may be negative or above 3. */
  turns: number;
  /** The team the player controls; its corner is drawn at the bottom of the start view. */
  team: number;
  onRotate(direction: 1 | -1): void;
}

/**
 * Turns the view a quarter turn at a time. The compass between the buttons is
 * the board seen from the camera, with a dot in each side's starting corner.
 */
export function RotateControls({ turns, team, onRotate }: RotateControlsProps) {
  const own = TEAM_COLOR[team % TEAM_COLOR.length];
  const enemy = TEAM_COLOR[(team + 1) % TEAM_COLOR.length];
  return (
    <div className="panel rotate-controls">
      <button
        type="button"
        className="rotate"
        title="Rotate left (←)"
        aria-label="Rotate left"
        onClick={() => onRotate(-1)}
      >
        ⟲
      </button>
      <div className="compass" title="Your side is the dot in your team's colour">
        <div className="compass-board" style={{ transform: `rotate(${-90 * turns}deg)` }}>
          <span className="compass-dot own" style={{ background: own }} />
          <span className="compass-dot enemy" style={{ background: enemy }} />
        </div>
      </div>
      <button
        type="button"
        className="rotate"
        title="Rotate right (→)"
        aria-label="Rotate right"
        onClick={() => onRotate(1)}
      >
        ⟳
      </button>
    </div>
  );
}
