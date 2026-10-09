'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppSocket } from '@/lib/socket';
import {
  SYSTEM_SENDER_ID,
  type ServerToClientEvents,
} from '@/types/socket-events';

export interface ChatLine {
  id: number;
  kind: 'chat' | 'correct' | 'close' | 'system';
  playerName: string;
  text: string;
  mine: boolean;
}

type ChatMsg = Parameters<ServerToClientEvents['chat_message']>[0];
type GuessRes = Parameters<ServerToClientEvents['guess_result']>[0];
const MAX_LINES = 50;

export function ChatPanel({
  socket,
  myId,
  guessing,
}: {
  socket: AppSocket;
  myId: string;
  guessing: boolean;
}) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const idRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const push = useCallback((line: Omit<ChatLine, 'id'>) => {
    idRef.current += 1;
    const id = idRef.current;
    setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), { ...line, id }]);
  }, []);

  useEffect(() => {
    const onChat = (m: ChatMsg) => {
      if (m.playerId === SYSTEM_SENDER_ID) {
        push({ kind: 'system', playerName: '', text: m.text, mine: false });
      } else {
        push({
          kind: 'chat',
          playerName: m.playerName,
          text: m.text,
          mine: m.playerId === myId,
        });
      }
    };
    const onGuess = (g: GuessRes) => {
      if (g.correct) {
        push({
          kind: 'correct',
          playerName: g.playerName,
          text:
            g.playerId === myId
              ? `You guessed it! +${g.points ?? 0}`
              : `${g.playerName} guessed the word!${g.points === undefined ? '' : ` +${g.points}`}`,
          mine: g.playerId === myId,
        });
      } else {
        push({ kind: 'close', playerName: '', text: 'So close — one letter off!', mine: true });
      }
    };
    socket.on('chat_message', onChat);
    socket.on('guess_result', onGuess);
    return () => {
      socket.off('chat_message', onChat);
      socket.off('guess_result', onGuess);
    };
  }, [socket, myId, push]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [lines]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (text === '') return;
    setDraft('');
    socket.emit(guessing ? 'guess' : 'chat', { text });
  }

  return (
    <div className="chat-panel">
      <div className="chat-list" role="log" aria-label="Guesses and chat">
        {lines.length === 0 && (
          <p className="chat-empty">No messages yet — guess or say hi.</p>
        )}
        {lines.map((l) => (
          <p key={l.id} className={`chat-line chat-${l.kind}${l.mine ? ' chat-mine' : ''}`}>
            {l.kind === 'chat' && (
              <>
                <strong>{l.mine ? 'You' : l.playerName}</strong> {l.text}
              </>
            )}
            {l.kind !== 'chat' && l.text}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          className="text-field chat-input"
          placeholder={guessing ? 'Type your guess…' : 'Say something…'}
          aria-label={guessing ? 'Type your guess' : 'Chat message'}
          value={draft}
          maxLength={100}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button variant="tool" type="submit" aria-label="Send" title="Send">
          <Send size={16} />
        </Button>
      </form>
    </div>
  );
}
