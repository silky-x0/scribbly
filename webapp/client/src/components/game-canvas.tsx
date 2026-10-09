'use client';

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { AppSocket } from '@/lib/socket';
import { resolveColor } from '@/lib/palette';
import type {
  Point,
  ServerToClientEvents,
  Stroke,
  Tool,
} from '@/types/socket-events';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
const SEND_INTERVAL_MS = 30;

type DrawData = Parameters<ServerToClientEvents['draw_data']>[0];
type GameState = Parameters<ServerToClientEvents['game_state']>[0];

export interface DrawingTool {
  tool: Tool;
  color: string;
  size: number;
}

function applyStrokeStyle(
  ctx: CanvasRenderingContext2D,
  stroke: Pick<Stroke, 'tool' | 'color' | 'size'>,
): void {
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
  }
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  const [first, ...rest] = stroke.points;
  if (first === undefined) return;
  ctx.moveTo(first.x * CANVAS_WIDTH, first.y * CANVAS_HEIGHT);
  if (rest.length === 0) {
    ctx.lineTo(first.x * CANVAS_WIDTH + 0.5, first.y * CANVAS_HEIGHT + 0.5);
  }
  for (const p of rest) {
    ctx.lineTo(p.x * CANVAS_WIDTH, p.y * CANVAS_HEIGHT);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function paintSegment(
  ctx: CanvasRenderingContext2D,
  stroke: Pick<Stroke, 'tool' | 'color' | 'size'>,
  from: Point,
  to: Point,
): void {
  if (from.x === to.x && from.y === to.y) return;
  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(from.x * CANVAS_WIDTH, from.y * CANVAS_HEIGHT);
  ctx.lineTo(to.x * CANVAS_WIDTH, to.y * CANVAS_HEIGHT);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

export function GameCanvas({
  socket,
  drawing,
  tool,
}: {
  socket: AppSocket;
  drawing: boolean;
  tool: DrawingTool;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const remoteRef = useRef(new Map<string, { stroke: Stroke; last: Point }>());
  const localRef = useRef<{ active: boolean; stroke: Stroke | null }>({
    active: false,
    stroke: null,
  });
  const seqRef = useRef(0);
  const lastSentRef = useRef(0);
  const pendingRef = useRef<Point | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function ctxOf(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  useEffect(() => {
    const rebuild = (strokes: Stroke[]): void => {
      strokesRef.current = strokes;
      remoteRef.current.clear();
      const ctx = canvasRef.current?.getContext('2d') ?? null;
      if (ctx === null) return;
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      for (const s of strokes) paintStroke(ctx, s);
    };
    const onData = (d: DrawData) => {
      const ctx = ctxOf();
      if (d.phase === 'start') {
        const stroke: Stroke = {
          id: d.strokeId,
          color: d.color,
          size: d.size,
          tool: d.tool,
          points: [{ x: d.x, y: d.y }],
        };
        strokesRef.current.push(stroke);
        remoteRef.current.set(d.strokeId, {
          stroke,
          last: { x: d.x, y: d.y },
        });
        if (ctx !== null) paintStroke(ctx, stroke);
        return;
      }
      const entry = remoteRef.current.get(d.strokeId);
      if (entry === undefined) return;
      const point: Point = { x: d.x, y: d.y };
      entry.stroke.points.push(point);
      if (ctx !== null) paintSegment(ctx, entry.stroke, entry.last, point);
      entry.last = point;
      if (d.phase === 'end') remoteRef.current.delete(d.strokeId);
    };
    const onUndo = (p: { strokes: Stroke[] }) => rebuild(p.strokes);
    const onClear = () => rebuild([]);
    const onState = (p: GameState) => rebuild(p.strokes);
    socket.on('draw_data', onData);
    socket.on('draw_undo', onUndo);
    socket.on('canvas_clear', onClear);
    socket.on('game_state', onState);
    return () => {
      socket.off('draw_data', onData);
      socket.off('draw_undo', onUndo);
      socket.off('canvas_clear', onClear);
      socket.off('game_state', onState);
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [socket]);

  function pointFromEvent(e: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function flushPending(): void {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) return;
    socket.emit('draw_move', pending);
    lastSentRef.current = Date.now();
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!drawing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointFromEvent(e);
    const t = tool;
    const color = resolveColor(t.color);
    seqRef.current += 1;
    const stroke: Stroke = {
      id: `local-${seqRef.current}`,
      color,
      size: t.size,
      tool: t.tool,
      points: [p],
    };
    strokesRef.current.push(stroke);
    localRef.current = { active: true, stroke };
    const ctx = ctxOf();
    if (ctx !== null) paintStroke(ctx, stroke);
    socket.emit('draw_start', { x: p.x, y: p.y, color, size: t.size, tool: t.tool });
    lastSentRef.current = Date.now();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>): void {
    const local = localRef.current;
    if (!local.active || local.stroke === null) return;
    const p = pointFromEvent(e);
    const ctx = ctxOf();
    const pts = local.stroke.points;
    const prev = pts[pts.length - 1];
    if (prev !== undefined && ctx !== null) {
      paintSegment(ctx, local.stroke, prev, p);
    }
    pts.push(p);
    pendingRef.current = p;
    const now = Date.now();
    if (now - lastSentRef.current >= SEND_INTERVAL_MS) {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushPending();
    } else if (flushTimerRef.current === null) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushPending();
      }, SEND_INTERVAL_MS);
    }
  }

  function endStroke(): void {
    const local = localRef.current;
    if (!local.active) return;
    local.active = false;
    local.stroke = null;
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushPending();
    socket.emit('draw_end');
  }

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className="game-canvas"
      aria-label={
        drawing ? 'Drawing canvas — draw the word' : 'Drawing canvas — watch and guess'
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
    />
  );
}
