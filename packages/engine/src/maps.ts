/**
 * Built-in maps in the scenario text format (see ascii.ts). Maps are data, so
 * they live here as text until there is a map format with its own files.
 */
export const MAPS: Readonly<Record<string, string>> = {
  /**
   * 8×8, 3 against 3, point-symmetric so neither side has better ground. A
   * plateau in the middle is reached by one ramp from each side; pillars and
   * water break up the lines of sight.
   */
  skirmish: `
    map:
    2s 2s 1g 1g 1g  1g 1g 1g
    2s 1g 1g 1g 2sP 1g 1g 1g
    1g 1g 0w 0w 1g  1g 2s 1g
    1g 1g 0w 3s 3s  2s 1g 1g
    1g 1g 2s 3s 3s  0w 1g 1g
    1g 2s 1g 1g 0w  0w 1g 1g
    1g 1g 1g 2sP 1g 1g 1g 2s
    1g 1g 1g 1g 1g  1g 2s 2s
    units:
    .  a  c  .  .  .  .  .
    b  .  .  .  .  .  .  .
    .  .  .  .  .  .  .  .
    .  .  .  .  .  .  .  .
    .  .  .  .  .  .  .  .
    .  .  .  .  .  .  .  .
    .  .  .  .  .  .  .  B
    .  .  .  .  .  C  A  .
    stats:
    a  maxHp=120 attack=35
    A  maxHp=120 attack=35
    b  maxHp=80 attack=20 range=4 initiative=12
    B  maxHp=80 attack=20 range=4 initiative=12
    c  move=5 jump=2 attack=25 initiative=14
    C  move=5 jump=2 attack=25 initiative=14
  `,
};
