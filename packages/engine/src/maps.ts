/**
 * Built-in maps in the scenario text format (see ascii.ts). Maps are data, so
 * they live here as text until there is a map format with its own files.
 */
export const MAPS: Readonly<Record<string, string>> = {
  /**
   * 10×10, 4 against 4, point-symmetric. Each side starts on a raised corner;
   * a 2×2 plateau holds the centre, the other two corners are high ground
   * worth taking, and water and pillars break up the approaches. Each side has
   * a fire knight, an ice archer, a lightning scout and a warden without
   * abilities who can take a beating.
   */
  highlands: `
    map:
    2s  2s  1g  1g  1g  1g  2s  3s  3s  3s
    2s  1g  1g  1g  0w  1g  1g  2s  3s  3s
    1g  1g  1gP 1g  0w  0w  1g  1g  2s  2s
    1g  1g  1g  2s  2s  1g  1g  1g  1g  1g
    0w  1g  1g  2s  3s  3s  2s  1g  1gP 1g
    1g  1gP 1g  2s  3s  3s  2s  1g  1g  0w
    1g  1g  1g  1g  1g  2s  2s  1g  1g  1g
    2s  2s  1g  1g  0w  0w  1g  1gP 1g  1g
    3s  3s  2s  1g  1g  0w  1g  1g  1g  2s
    3s  3s  3s  2s  1g  1g  1g  1g  2s  2s
    units:
    d   a   c   .   .   .   .   .   .   .
    b   .   .   .   .   .   .   .   .   .
    .   .   .   .   .   .   .   .   .   .
    .   .   .   .   .   .   .   .   .   .
    .   .   .   .   .   .   .   .   .   .
    .   .   .   .   .   .   .   .   .   .
    .   .   .   .   .   .   .   .   .   .
    .   .   .   .   .   .   .   .   .   .
    .   .   .   .   .   .   .   .   .   B
    .   .   .   .   .   .   .   C   A   D
    stats:
    a  maxHp=120 attack=35 abilities=fireball
    A  maxHp=120 attack=35 abilities=fireball
    b  maxHp=80 attack=20 range=4 initiative=12 abilities=iceWall,quickFreeze
    B  maxHp=80 attack=20 range=4 initiative=12 abilities=iceWall,quickFreeze
    c  move=5 jump=2 attack=25 initiative=14 abilities=chainLightning
    C  move=5 jump=2 attack=25 initiative=14 abilities=chainLightning
    d  maxHp=150 attack=30 move=3 initiative=8
    D  maxHp=150 attack=30 move=3 initiative=8
  `,
  /**
   * 8×8, 3 against 3, point-symmetric so neither side has better ground. A
   * plateau in the middle is reached by one ramp from each side; pillars and
   * water break up the lines of sight. Each side has a fire knight, an ice
   * archer and a lightning scout.
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
    a  maxHp=120 attack=35 abilities=fireball
    A  maxHp=120 attack=35 abilities=fireball
    b  maxHp=80 attack=20 range=4 initiative=12 abilities=iceWall,quickFreeze
    B  maxHp=80 attack=20 range=4 initiative=12 abilities=iceWall,quickFreeze
    c  move=5 jump=2 attack=25 initiative=14 abilities=chainLightning
    C  move=5 jump=2 attack=25 initiative=14 abilities=chainLightning
  `,
};
