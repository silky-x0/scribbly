function isLetter(ch: string): boolean {
  return /[a-z0-9]/i.test(ch);
}

export function maskWord(word: string): string[] {
  return [...word].map((ch) => (isLetter(ch) ? '_' : ch));
}

export function revealRandomLetter(
  masked: readonly string[],
  word: string,
): string[] | null {
  const letters = [...word];
  const candidates: number[] = [];
  let hidden = 0;
  for (let i = 0; i < letters.length; i += 1) {
    const ch = letters[i];
    if (ch === undefined || !isLetter(ch)) continue;
    if (masked[i] === '_') {
      hidden += 1;
      candidates.push(i);
    }
  }
  if (hidden <= 1) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  if (pick === undefined) return null;
  const letter = letters[pick];
  if (letter === undefined) return null;
  return masked.map((m, i) => (i === pick ? letter : m));
}
