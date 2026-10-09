'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SERVER_URL } from '@/lib/server-url';
import type { RoomSettings } from '@/types/socket-events';

export interface RoomForm {
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  wordCount: number;
  hints: number;
  wordMode: RoomSettings['wordMode'];
  categories: string[];
  customWords: string;
  customOnly: boolean;
}

const LIMITS: Record<
  'maxPlayers' | 'rounds' | 'drawTime' | 'wordCount' | 'hints',
  [number, number]
> = {
  maxPlayers: [2, 20],
  rounds: [2, 10],
  drawTime: [15, 240],
  wordCount: [1, 5],
  hints: [0, 5],
};

export const DEFAULT_FORM: RoomForm = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 60,
  wordCount: 3,
  hints: 2,
  wordMode: 'Normal',
  categories: [],
  customWords: '',
  customOnly: false,
};

function clampField(
  name: keyof typeof LIMITS,
  raw: string,
): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const [min, max] = LIMITS[name];
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function SettingsForm({
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  initial: RoomForm;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (settings: RoomSettings) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({
    maxPlayers: String(initial.maxPlayers),
    rounds: String(initial.rounds),
    drawTime: String(initial.drawTime),
    wordCount: String(initial.wordCount),
    hints: String(initial.hints),
  });
  const [wordMode, setWordMode] = useState<RoomSettings['wordMode']>(
    initial.wordMode,
  );
  const [categories, setCategories] = useState<string[]>(initial.categories);
  const [allCategories, setAllCategories] = useState<string[] | null>(null);
  const [customRaw, setCustomRaw] = useState(initial.customWords);
  const [customOnly, setCustomOnly] = useState(initial.customOnly);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const res = await fetch(`${SERVER_URL}/api/words/categories`);
        const body: unknown = await res.json();
        if (!live || typeof body !== 'object' || body === null) return;
        const list = (body as Record<string, unknown>).categories;
        if (Array.isArray(list)) {
          setAllCategories(
            list.filter((c): c is string => typeof c === 'string'),
          );
        }
      } catch {
        // Unreachable server: creation fails later with its own error.
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, []);

  function set(name: string, value: string) {
    setDraft((d) => ({ ...d, [name]: value }));
    setError('');
  }

  function toggleCategory(category: string) {
    setCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
    setError('');
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const nums = {
      maxPlayers: initial.maxPlayers,
      rounds: initial.rounds,
      drawTime: initial.drawTime,
      wordCount: initial.wordCount,
      hints: initial.hints,
    };
    for (const name of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
      const clamped = clampField(name, draft[name] ?? '');
      if (clamped === null) {
        const [min, max] = LIMITS[name];
        setError(`"${name}" needs a number between ${min} and ${max}.`);
        return;
      }
      nums[name] = clamped;
    }
    const customWords: string[] = [];
    for (const part of customRaw.split(',')) {
      const word = part.trim().replace(/\s+/g, ' ');
      if (word.length === 0 || word.length > 30) continue;
      if (!customWords.includes(word)) customWords.push(word);
      if (customWords.length >= 50) break;
    }
    onSubmit({
      ...nums,
      wordMode,
      categories,
      customWords,
      customOnly,
      isPrivate: false,
    });
  }

  return (
    <form onSubmit={submit} className="settings-form">
      <div className="settings-grid">
        <div>
          <label className="field-label" htmlFor="set-players">PLAYERS (2–20)</label>
          <input id="set-players" className="text-field" type="number" min={2} max={20} value={draft.maxPlayers} disabled={busy} onChange={(e) => set('maxPlayers', e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="set-rounds">ROUNDS (2–10)</label>
          <input id="set-rounds" className="text-field" type="number" min={2} max={10} value={draft.rounds} disabled={busy} onChange={(e) => set('rounds', e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="set-drawtime">DRAW SECONDS (15–240)</label>
          <input id="set-drawtime" className="text-field" type="number" min={15} max={240} step={5} value={draft.drawTime} disabled={busy} onChange={(e) => set('drawTime', e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="set-words">WORD CHOICES (1–5)</label>
          <input id="set-words" className="text-field" type="number" min={1} max={5} value={draft.wordCount} disabled={busy} onChange={(e) => set('wordCount', e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="set-hints">HINTS (0–5)</label>
          <input id="set-hints" className="text-field" type="number" min={0} max={5} value={draft.hints} disabled={busy} onChange={(e) => set('hints', e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="set-mode">WORD MODE</label>
          <select id="set-mode" className="language-field" value={wordMode} disabled={busy} onChange={(e) => setWordMode(e.target.value as RoomSettings['wordMode'])}>
            <option>Normal</option>
            <option>Hidden</option>
            <option>Combination</option>
          </select>
        </div>
      </div>
      {allCategories !== null && allCategories.length > 0 && (
        <div>
          <span className="field-label" id="set-categories">WORD CATEGORIES (OPTIONAL — LEAVE EMPTY FOR ALL)</span>
          <div className="check-list" role="group" aria-labelledby="set-categories">
            {allCategories.map((c) => (
              <label key={c} className="check-row">
                <input
                  type="checkbox"
                  checked={categories.includes(c)}
                  disabled={busy}
                  onChange={() => toggleCategory(c)}
                />
                {c}
              </label>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="field-label" htmlFor="set-custom">CUSTOM WORDS (OPTIONAL, COMMA-SEPARATED)</label>
        <textarea
          id="set-custom"
          className="text-field text-area"
          rows={2}
          placeholder="dragon, left sock, …"
          value={customRaw}
          disabled={busy}
          onChange={(e) => {
            setCustomRaw(e.target.value);
            setError('');
          }}
        />
        <label className="check-row">
          <input
            type="checkbox"
            checked={customOnly}
            disabled={busy}
            onChange={(e) => setCustomOnly(e.target.checked)}
          />
          Ignore the built-in list
        </label>
      </div>
      {error !== '' && <p role="alert" className="form-error">⚠ {error}</p>}
      <div className="entry-actions">
        <Button type="submit" variant="play" disabled={busy}>
          {busy ? 'Creating…' : 'Create private room'}
        </Button>
        <Button type="button" variant="paper" disabled={busy} onClick={onCancel}>
          Back
        </Button>
      </div>
    </form>
  );
}
