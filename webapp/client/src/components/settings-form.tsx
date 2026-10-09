'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { RoomSettings } from '@/types/socket-events';

export interface RoomForm {
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  wordCount: number;
  hints: number;
  wordMode: RoomSettings['wordMode'];
}

const LIMITS: Record<keyof Omit<RoomForm, 'wordMode'>, [number, number]> = {
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
};

function clampField(
  name: keyof Omit<RoomForm, 'wordMode'>,
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
  onSubmit: (form: RoomForm) => void;
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
  const [error, setError] = useState('');

  function set(name: string, value: string) {
    setDraft((d) => ({ ...d, [name]: value }));
    setError('');
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Partial<RoomForm> = { wordMode };
    for (const name of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
      const clamped = clampField(name, draft[name] ?? '');
      if (clamped === null) {
        const [min, max] = LIMITS[name];
        setError(`"${name}" needs a number between ${min} and ${max}.`);
        return;
      }
      (next as Record<string, number>)[name] = clamped;
    }
    onSubmit(next as RoomForm);
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
