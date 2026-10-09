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
): string[] {
  const pool = allWords(categories);
  if (pool.length === 0) return [];
  const fresh = pool.filter((w) => !used.has(w));
  const candidates = fresh.length >= count ? fresh : pool;
  return shuffled(candidates).slice(0, Math.max(1, count));
}

export function listCategories(): string[] {
  return Object.keys(CATEGORIES);
}
