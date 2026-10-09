'use client';

import { useState } from 'react';
import { Check, Clock3, Eraser, LogOut, Pencil, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatPanel } from '@/components/chat-panel';
import { GameCanvas } from '@/components/game-canvas';
import {
  BRUSH_SIZES,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  PALETTE,
  swatchBackground,
} from '@/lib/palette';
import type { AppSocket } from '@/lib/socket';
import type {
  Player,
  ServerToClientEvents,
  Tool,
} from '@/types/socket-events';

export type GamePhaseView = 'WORD_SELECTION' | 'DRAWING' | 'ROUND_END' | 'GAME_OVER';
type RoundEnd = Parameters<ServerToClientEvents['round_end']>[0];

function drawerName(players: Player[], drawerId: string): string {
  return players.find((p) => p.id === drawerId)?.name ?? 'Someone';
}

export function GameView({
  socket,
  myId,
  players,
  drawerId,
  phase,
  wordOptions,
  pickedWord,
  timeLeft,
  roundEnd,
  endTitle,
  hints,
  guessing,
  prevScores,
  onPickWord,
  onLeave,
  leaving,
}: {
  socket: AppSocket;
  myId: string;
  players: Player[];
  drawerId: string;
  phase: GamePhaseView;
  wordOptions: string[];
  pickedWord: string | null;
  timeLeft: number;
  roundEnd: RoundEnd | null;
  endTitle: string;
  hints: string[] | null;
  guessing: boolean;
  prevScores: Record<string, number> | null;
  onPickWord: (word: string) => void;
  onLeave: () => void;
  leaving: boolean;
}) {
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [confirmClear, setConfirmClear] = useState(false);

  const isDrawer = myId === drawerId;
  const canDraw = isDrawer && phase === 'DRAWING';

  function selectColor(value: string) {
    setColor(value);
    setTool('brush');
  }

  function selectSize(next: number) {
    setSize(next);
    setTool('brush');
  }

  function requestClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setConfirmClear(false);
    socket.emit('clear_canvas');
  }

  const phaseLabel =
    phase === 'WORD_SELECTION'
      ? 'PICK A WORD'
      : phase === 'DRAWING'
        ? 'GUESS THE DOODLE'
        : phase === 'GAME_OVER'
          ? 'GAME OVER'
          : 'ROUND OVER';
  const centerText =
    phase === 'ROUND_END'
      ? (roundEnd?.word ?? '…')
      : phase === 'GAME_OVER'
        ? endTitle
        : isDrawer
          ? (pickedWord ?? '…')
          : `${drawerName(players, drawerId)} is drawing`;

  return (
    <div className="game-wrap">
      <div className="game-grid">
        <aside className="game-players" aria-label="Players">
          <h3 className="field-label">PLAYERS</h3>
          <ul className="player-list">
            {players.map((p) => (
              <li key={p.id} className="player-row">
                <span className="player-avatar" aria-hidden="true">
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <span className="player-name">
                  {p.name}
                  {p.id === myId && ' (you)'}
                  {p.id === drawerId && (
                    <Pencil size={13} aria-label="drawing now" />
                  )}
                </span>
                {p.isHost && <span className="host-badge">HOST</span>}
                {p.id !== drawerId && p.hasGuessed && (
                  <span className="ready-pill is-ready">
                    <Check size={13} /> Guessed
                  </span>
                )}
                <span className="player-score">{p.score}</span>
              </li>
            ))}
          </ul>
        </aside>
        <div className="game-center">
        <div className="drawing-paper">
          <div className="drawing-top">
            <span>{phaseLabel}</span>
            <strong>{centerText}</strong>
            <span className="top-group">
              {phase === 'DRAWING' && (
                <span className="timer">
                  <Clock3 size={12} /> {timeLeft}s
                </span>
              )}
              <Button
                variant="tool"
                type="button"
                title="Leave room"
                aria-label="Leave room"
                disabled={leaving}
                onClick={onLeave}
              >
                <LogOut size={15} />
              </Button>
            </span>
          </div>
          {!isDrawer && phase === 'DRAWING' && hints !== null && (
            <div className="hint-bar" aria-label="Word hint">
              {hints.join(' ')}
            </div>
          )}
          <GameCanvas socket={socket} drawing={canDraw} tool={{ tool, color, size }} />
          {canDraw && (
            <div className="drawing-toolbar">
              <Pencil size={15} aria-hidden="true" />
              {PALETTE.map((c) => (
                <Button
                  key={c.value}
                  variant="tool"
                  type="button"
                  className="color-dot"
                  style={{ background: swatchBackground(c.value) }}
                  aria-label={c.label}
                  title={c.label}
                  aria-pressed={tool === 'brush' && color === c.value}
                  onClick={() => selectColor(c.value)}
                />
              ))}
              {BRUSH_SIZES.map((b) => (
                <Button
                  key={b.size}
                  variant="tool"
                  type="button"
                  aria-label={`Brush size ${b.label}`}
                  title={`Brush size ${b.label}`}
                  aria-pressed={tool === 'brush' && size === b.size}
                  onClick={() => selectSize(b.size)}
                >
                  <span
                    className="size-dot"
                    style={{ width: b.size, height: b.size }}
                    aria-hidden="true"
                  />
                </Button>
              ))}
              <Button
                variant="tool"
                type="button"
                aria-label="Eraser"
                title="Eraser"
                aria-pressed={tool === 'eraser'}
                onClick={() => setTool(tool === 'eraser' ? 'brush' : 'eraser')}
              >
                <Eraser size={15} />
              </Button>
              <span className="tool-spacer" />
              <Button
                variant="tool"
                type="button"
                title="Undo last stroke"
                aria-label="Undo last stroke"
                onClick={() => socket.emit('undo_stroke')}
              >
                <Undo2 size={15} />
              </Button>
              <Button
                variant="tool"
                type="button"
                title={confirmClear ? 'Click again to confirm clear' : 'Clear canvas'}
                aria-label={confirmClear ? 'Confirm clear canvas' : 'Clear canvas'}
                className={confirmClear ? 'tool-armed' : undefined}
                onClick={requestClear}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          )}
        </div>
        </div>
        <aside className="game-chat" aria-label="Guesses and chat">
          <h3 className="field-label">GUESSES</h3>
          <ChatPanel socket={socket} myId={myId} guessing={guessing} />
        </aside>
      </div>

      {isDrawer && phase === 'WORD_SELECTION' && wordOptions.length > 0 && (
        <div className="word-options">
          <p className="lobby-note">Pick a word — you have 15 seconds.</p>
          {wordOptions.map((w) => (
            <Button key={w} type="button" variant="paper" onClick={() => onPickWord(w)}>
              {w}
            </Button>
          ))}
        </div>
      )}

      {phase === 'ROUND_END' && roundEnd !== null && (
        <div className="dialog-backdrop">
          <section className="lobby-dialog" role="dialog" aria-label="Round over">
            <h2 className="card-title">The word was “{roundEnd.word}”</h2>
            <ul className="player-list">
              {roundEnd.scores.map((s) => {
                const before = prevScores?.[s.id];
                const delta = before === undefined ? null : s.score - before;
                return (
                  <li key={s.id} className="player-row">
                    <span className="player-name">{s.name}</span>
                    <span className="player-score">
                      {s.score}
                      {delta !== null && delta > 0 && ` +${delta}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="lobby-note">Next turn starting…</p>
          </section>
        </div>
      )}
    </div>
  );
}
