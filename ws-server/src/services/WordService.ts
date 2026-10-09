import wordsData from '../data/words.json';

const CATEGORIES: Record<string, string[]> = wordsData;

function allWords(categories?: string[]): string[] {
  if (categories !== undefined && categories.length > 0) {
    const picked = categories.flatMap((c) => CATEGORIES[c] ?? []);
    if (picked.length > 0) return picked;
  }
  return Object.values(CATEGORIES).flat();
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

export function drawWordOptions(
  count: number,
  used: ReadonlySet<string>,
  categories?: string[],
  combineWords = false,
): string[] {
  const pool = allWords(categories);
  if (pool.length === 0) return [];
  const fresh = pool.filter((w) => !used.has(w));
  const candidates = fresh.length >= count ? fresh : pool;
  const shuffledPool = shuffled(candidates);
  if (!combineWords) return shuffledPool.slice(0, Math.max(1, count));
  const out: string[] = [];
  for (let i = 0; i + 1 < shuffledPool.length && out.length < count; i += 2) {
    const a = shuffledPool[i];
    const b = shuffledPool[i + 1];
    if (a !== undefined && b !== undefined) out.push(`${a} ${b}`);
  }
  return out.length > 0 ? out : shuffledPool.slice(0, 1);
}

export function listCategories(): string[] {
  return Object.keys(CATEGORIES);
}
