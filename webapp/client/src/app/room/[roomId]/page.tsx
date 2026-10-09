'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, Copy, LogOut, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GameView } from '@/components/game-view';
import { Toaster, type Toast } from '@/components/toaster';
import { useSocket } from '@/context/SocketContext';
import { ACK_TIMEOUT_MS } from '@/lib/socket';
import {
  loadIdentity,
  saveIdentity,
  saveLastRoom,
} from '@/lib/session';
import type {
  GamePhase,
  Player,
  RoomSettings,
  ServerToClientEvents,
} from '@/types/socket-events';
import type { GamePhaseView } from '@/components/game-view';

type RoundStartPayload = Parameters<ServerToClientEvents['round_start']>[0];
type RoundEndPayload = Parameters<ServerToClientEvents['round_end']>[0];
type GameOverPayload = Parameters<ServerToClientEvents['game_over']>[0];
type GameStatePayload = Parameters<ServerToClientEvents['game_state']>[0];

function friendlyJoinError(roomId: string, error: string): string {
  if (/not found/i.test(error)) {
    return `Room ${roomId} was not found. Check the code and try again.`;
  }
  return error;
}

// External-store reads, so SSR and hydration agree without setState in effects.
function getIdentitySnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return loadIdentity() === null;
}

function getIdentityServerSnapshot(): boolean {
  return false;
}

function subscribeIdentity(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

export default function RoomPage() {
  const params = useParams();
  const rawRoom = params.roomId;
  const roomId = Array.isArray(rawRoom) ? (rawRoom[0] ?? '') : (rawRoom ?? '');
  const router = useRouter();
  const { socket, connected } = useSocket();

  const [players, setPlayers] = useState<Player[] | null>(null);
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [phase, setPhase] = useState<GamePhase | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [wordOptions, setWordOptions] = useState<string[]>([]);
  const [pickedWord, setPickedWord] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundEnd, setRoundEnd] = useState<RoundEndPayload | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [joined, setJoined] = useState(false);
  const needsName = useSyncExternalStore(
    subscribeIdentity,
    getIdentitySnapshot,
    getIdentityServerSnapshot,
  );
  const [joinName, setJoinName] = useState('');
  const [busy, setBusy] = useState<'join' | 'start' | 'leave' | null>(null);
  const [joinError, setJoinError] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const joinedRef = useRef(false);

  const pushToast = useCallback((text: string, kind: Toast['kind']) => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current.slice(-2), { id, text, kind }]);
    // Errors persist until replaced — 4s is too short to process a failure.
    if (kind !== 'error') {
      setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== id));
      }, 4000);
    }
  }, []);

  const doJoin = useCallback(
    (name: string) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        setBusy(null);
        setJoinError(
          'Could not reach the game server. Check your connection and retry.',
        );
      }, ACK_TIMEOUT_MS);
      socket.emit('join_room', { roomId, name }, (res) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        setBusy(null);
        if (!res.ok) {
          setJoinError(friendlyJoinError(roomId, res.error));
          return;
        }
        joinedRef.current = true;
        setJoined(true);
        setMyId(res.player.id);
        setSettings(res.settings);
        setPlayers(res.players);
        saveLastRoom({ roomId, myId: res.player.id, settings: res.settings });
        setJoinError('');
      });
    },
    [socket, roomId],
  );

  // Join once per room; ack + broadcasts fill state (no seeding, so SSR/hydration agree).
  useEffect(() => {
    if (roomId === '') return;
    const identity = loadIdentity();
    if (identity === null) return;
    doJoin(identity.name);
    return () => {
      if (joinedRef.current) {
        joinedRef.current = false;
        socket.emit('leave_room', () => {});
      }
    };
  }, [roomId, socket, doJoin]);

  useEffect(() => {
    const onRoster = (payload: { players: Player[] }) => {
      setPlayers(payload.players);
    };
    socket.on('player_joined', onRoster);
    socket.on('player_left', onRoster);
    socket.on('lobby_update', onRoster);
    return () => {
      socket.off('player_joined', onRoster);
      socket.off('player_left', onRoster);
      socket.off('lobby_update', onRoster);
    };
  }, [socket]);

  useEffect(() => {
    const onRoundStart = (p: RoundStartPayload) => {
      setDrawerId(p.drawerId);
      setWordOptions(p.wordOptions ?? []);
      setPickedWord(null);
      setTimeLeft(p.drawTime);
      setRoundEnd(null);
      setGameOver(null);
      setPhase('WORD_SELECTION');
    };
    const onTick = (p: { timeLeft: number }) => setTimeLeft(p.timeLeft);
    const onState = (p: GameStatePayload) => {
      setPhase(p.phase);
      setTimeLeft(p.timeLeft);
    };
    const onRoundEnd = (p: RoundEndPayload) => {
      setPhase('ROUND_END');
      setRoundEnd(p);
      setPickedWord(null);
      setPlayers((prev) =>
        prev === null
          ? prev
          : prev.map((pl) => {
              const s = p.scores.find((x) => x.id === pl.id);
              return s === undefined ? pl : { ...pl, score: s.score };
            }),
      );
    };
    const onGameOver = (p: GameOverPayload) => {
      setPhase('GAME_OVER');
      setGameOver(p);
    };
    socket.on('round_start', onRoundStart);
    socket.on('timer_tick', onTick);
    socket.on('game_state', onState);
    socket.on('round_end', onRoundEnd);
    socket.on('game_over', onGameOver);
    return () => {
      socket.off('round_start', onRoundStart);
      socket.off('timer_tick', onTick);
      socket.off('game_state', onState);
      socket.off('round_end', onRoundEnd);
      socket.off('game_over', onGameOver);
    };
  }, [socket]);

  function submitName(event: React.FormEvent) {
    event.preventDefault();
    const name = joinName.trim();
    if (name === '') {
      setJoinError('Give yourself a nickname first.');
      return;
    }
    saveIdentity({ name, avatar: 0, language: 'English' });
    setBusy('join');
    doJoin(name);
  }

  function toggleReady() {
    const me = players?.find((p) => p.id === myId);
    socket.emit('toggle_ready', { isReady: !(me?.isReady ?? false) }, (res) => {
      if (!res.ok) pushToast(res.error, 'error');
    });
  }

  function startGame() {
    setBusy('start');
    socket.emit('start_game', (res) => {
      setBusy(null);
      if (!res.ok) {
        pushToast(res.error, 'error');
      }
    });
  }

  function pickWord(word: string) {
    socket.emit('word_chosen', { word });
    setPickedWord(word);
  }

  function leave() {
    setBusy('leave');
    const timer = setTimeout(() => router.push('/'), ACK_TIMEOUT_MS);
    socket.emit('leave_room', () => {
      clearTimeout(timer);
      joinedRef.current = false;
      router.push('/');
    });
  }

  async function copyInvite() {
    const url = `${window.location.origin}/room/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast('Invite link copied. Send it to your friends!', 'success');
    } catch {
      pushToast('Copy failed. The invite link is in your address bar.', 'error');
    }
  }

  const me = players?.find((p) => p.id === myId) ?? null;
  const canStart =
    me?.isHost === true && (players?.length ?? 0) >= 2 && busy === null;
  const gamePhase: GamePhaseView | 'GAME_OVER' | null =
    phase === 'WORD_SELECTION' ||
    phase === 'DRAWING' ||
    phase === 'ROUND_END' ||
    phase === 'GAME_OVER'
      ? phase
      : null;

  return (
    <div className="site">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Doodle Club home">
          doodle club<span className="text-primary">.</span>
        </Link>
        <span className="header-tag">{connected ? 'Online' : 'Offline…'}</span>
      </header>
      {gamePhase !== null && players !== null && drawerId !== null && myId !== null ? (
        <main>
          <GameView
            socket={socket}
            myId={myId}
            players={players}
            drawerId={drawerId}
            phase={gamePhase}
            wordOptions={wordOptions}
            pickedWord={pickedWord}
            timeLeft={timeLeft}
            roundEnd={roundEnd}
            endTitle={
              gameOver?.winner ? `${gameOver.winner.name} wins!` : 'Game over'
            }
            onPickWord={pickWord}
            onLeave={leave}
            leaving={busy === 'leave'}
          />
          {phase === 'GAME_OVER' && gameOver !== null && (
            <div className="dialog-backdrop">
              <section className="lobby-dialog" role="dialog" aria-label="Game over">
                <h2 className="card-title">
                  {gameOver.winner !== null ? `${gameOver.winner.name} wins!` : 'Game over'}
                </h2>
                <ul className="player-list">
                  {gameOver.leaderboard.map((p) => (
                    <li key={p.id} className="player-row">
                      <span className="player-avatar" aria-hidden="true">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="player-name">
                        {p.name}
                        {p.id === myId && ' (you)'}
                      </span>
                      <span className="player-score">{p.score}</span>
                    </li>
                  ))}
                </ul>
                <div className="entry-actions">
                  {me?.isHost === true && (
                    <Button type="button" variant="play" disabled={busy !== null} onClick={startGame}>
                      {busy === 'start' ? 'Starting…' : 'Play again'}
                    </Button>
                  )}
                  <Button type="button" variant="paper" disabled={busy === 'leave'} onClick={leave}>
                    <LogOut size={17} /> Leave
                  </Button>
                </div>
                {me?.isHost !== true && (
                  <p className="lobby-note">Waiting for the host to start again…</p>
                )}
              </section>
            </div>
          )}
        </main>
      ) : (
      <main className="lobby-wrap">
        {roomId === '' ? (
          <section className="lobby-card">
            <h2 className="card-title">That link looks broken.</h2>
            <p className="lobby-note">There is no room code in the address. Head home and create or join a room.</p>
            <div className="entry-actions">
              <Link href="/" className="game-button game-button-primary lobby-link-button">
                <ArrowLeft size={17} /> Back home
              </Link>
            </div>
          </section>
        ) : needsName && !joined && myId === null ? (
          <section className="lobby-card">
            <h2 className="card-title">Join room {roomId}</h2>
            <p className="lobby-note">You opened an invite link. Pick a nickname to hop in.</p>
            <form onSubmit={submitName}>
              <label className="field-label" htmlFor="join-nickname">WHAT SHOULD WE CALL YOU?</label>
              <input
                id="join-nickname"
                className="text-field"
                placeholder="Your nickname"
                value={joinName}
                maxLength={20}
                onChange={(e) => { setJoinName(e.target.value); setJoinError(''); }}
              />
              {joinError !== '' && <p role="alert" className="form-error">⚠ {joinError}</p>}
              <div className="entry-actions">
                <Button type="submit" variant="play" disabled={busy === 'join'}>
                  {busy === 'join' ? 'Joining…' : 'Join room'}
                </Button>
                <Link href="/" className="game-button game-button-paper lobby-link-button">
                  <ArrowLeft size={17} /> Back home
                </Link>
              </div>
            </form>
          </section>
        ) : (
          <section className="lobby-card" aria-busy={players === null}>
            <div className="lobby-top">
              <div>
                <h2 className="card-title">Room {roomId}</h2>
                <p className="lobby-note">
                  {settings?.isPrivate === true
                    ? 'Private room — invite link only.'
                    : 'Public room.'}
                </p>
              </div>
              <Button variant="tool" type="button" onClick={copyInvite} title="Copy invite link" aria-label="Copy invite link">
                <Copy size={17} />
              </Button>
            </div>

            {joinError !== '' && <p role="alert" className="form-error">⚠ {joinError}</p>}

            {settings !== null && (
              <dl className="settings-summary">
                <div><dt>Players</dt><dd>{players?.length ?? 1}/{settings.maxPlayers}</dd></div>
                <div><dt>Rounds</dt><dd>{settings.rounds}</dd></div>
                <div><dt>Draw time</dt><dd>{settings.drawTime}s</dd></div>
                <div><dt>Word choices</dt><dd>{settings.wordCount}</dd></div>
                <div><dt>Hints</dt><dd>{settings.hints}</dd></div>
                <div><dt>Word mode</dt><dd>{settings.wordMode}</dd></div>
              </dl>
            )}

            <h3 className="field-label">PLAYERS</h3>
            {players === null ? (
              <p className="lobby-note">Joining…</p>
            ) : (
              <ul className="player-list">
                {players.map((p) => (
                  <li key={p.id} className="player-row">
                    <span className="player-avatar" aria-hidden="true">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="player-name">
                      {p.name}
                      {p.id === myId && ' (you)'}
                    </span>
                    {p.isHost && <span className="host-badge">HOST</span>}
                    <span className={`ready-pill${p.isReady ? ' is-ready' : ''}`}>
                      {p.isReady ? <Check size={13} /> : null}
                      {p.isReady ? 'Ready' : 'Not ready'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="lobby-actions">
              <Button
                type="button"
                variant={me?.isReady === true ? 'paper' : 'play'}
                disabled={me === null}
                onClick={toggleReady}
              >
                {me?.isReady === true ? 'Not ready' : "I'm ready"}
              </Button>
              {me?.isHost === true && (
                <Button
                  type="button"
                  variant="play"
                  disabled={!canStart}
                  title={(players?.length ?? 0) < 2 ? 'Need at least 2 players to start' : 'Start the game'}
                  onClick={startGame}
                >
                  <Play size={17} /> {busy === 'start' ? 'Starting…' : 'Start game'}
                </Button>
              )}
              <Button type="button" variant="paper" disabled={busy === 'leave'} onClick={leave}>
                <LogOut size={17} /> {busy === 'leave' ? 'Leaving…' : 'Leave'}
              </Button>
            </div>
          </section>
        )}
      </main>
      )}
      <Toaster toasts={toasts} />
    </div>
  );
}
