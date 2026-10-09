export const GUESS_BASE_POINTS = 100;
export const GUESS_TIME_BONUS_MAX = 400;
export const DRAWER_POINTS_PER_GUESS = 50;
const ORDER_BONUS_START = 60;
const ORDER_BONUS_STEP = 20;

export function guesserPoints(
  timeLeft: number,
  drawTime: number,
  guessOrder: number,
): number {
  const timeBonus =
    drawTime > 0
      ? Math.round((GUESS_TIME_BONUS_MAX * Math.max(0, timeLeft)) / drawTime)
      : 0;
  const orderBonus = Math.max(
    0,
    ORDER_BONUS_START - ORDER_BONUS_STEP * Math.max(0, guessOrder - 1),
  );
  return GUESS_BASE_POINTS + timeBonus + orderBonus;
}
