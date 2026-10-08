'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Clock3, Flower2, Pencil, RotateCcw, Smile, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const colors: [string, string, string][] = [ ['ink-dot', '--foreground', 'Ink'], ['pink-dot', '--primary', 'Cherry'], ['blue-dot', '--secondary', 'Sky'], ['yellow-dot', '--accent', 'Butter'], ['mint-dot', '--mint', 'Mint'] ];
export function DrawingDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const history = useRef<ImageData[]>([]);
  const [color, setColor] = useState('--foreground');
  function initialDrawing() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--foreground');
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(120,145); ctx.lineTo(123,78); ctx.lineTo(143,45); ctx.lineTo(170,71); ctx.quadraticCurveTo(202,56,230,71); ctx.lineTo(258,43); ctx.lineTo(273,80); ctx.lineTo(278,148); ctx.quadraticCurveTo(200,197,120,145); ctx.stroke();
    ctx.beginPath(); ctx.arc(163,104,4,0,Math.PI*2); ctx.moveTo(239,104); ctx.arc(235,104,4,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(192,121); ctx.lineTo(200,127); ctx.lineTo(208,121); ctx.moveTo(200,127); ctx.lineTo(200,138); ctx.quadraticCurveTo(189,149,183,138); ctx.moveTo(200,138); ctx.quadraticCurveTo(211,149,217,138); ctx.moveTo(148,124); ctx.lineTo(101,114); ctx.moveTo(147,137); ctx.lineTo(99,141); ctx.moveTo(253,124); ctx.lineTo(299,114); ctx.moveTo(253,137); ctx.lineTo(302,141); ctx.stroke();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary');
    ctx.beginPath(); ctx.moveTo(321,60); ctx.bezierCurveTo(304,44,289,67,320,85); ctx.bezierCurveTo(349,62,336,45,321,60); ctx.stroke();
    history.current = [];
  }
  useEffect(() => { initialDrawing(); }, []);
  function point(event: PointerEvent<HTMLCanvasElement>): [number, number] {
    const canvas = event.currentTarget; const rect = canvas.getBoundingClientRect();
    return [(event.clientX-rect.left)*canvas.width/rect.width,(event.clientY-rect.top)*canvas.height/rect.height];
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget; const ctx = canvas.getContext('2d'); if (!ctx) return;
    history.current.push(ctx.getImageData(0,0,canvas.width,canvas.height));
    canvas.setPointerCapture(event.pointerId); drawing.current = true;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue(color); ctx.lineWidth = 5;
    const [x,y] = point(event); ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+.1,y+.1); ctx.stroke();
  }
  function move(event: PointerEvent<HTMLCanvasElement>) { if (!drawing.current) return; const ctx = event.currentTarget.getContext('2d'); if (!ctx) return; const [x,y] = point(event); ctx.lineTo(x,y); ctx.stroke(); }
  function undo() { const ctx = canvasRef.current?.getContext('2d'); const previous = history.current.pop(); if (ctx && previous) ctx.putImageData(previous,0,0); }
  return <div className="demo-wrapper">
    <p className="demo-label">a little sneak peek ↴</p>
    <div className="drawing-paper">
      <div className="drawing-top"><span>GUESS THE DOODLE</span><strong>c _ t</strong><span className="timer"><Clock3 size={12}/> 42s</span></div>
      <canvas ref={canvasRef} width={400} height={205} className="draw-canvas" aria-label="Drawing preview — draw your own doodle" onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current=false; }} onPointerCancel={() => { drawing.current=false; }}/>
      <div className="drawing-toolbar"><Pencil size={15}/>{colors.map(([className,variable,label]) => <Button key={variable} variant="tool" className={`color-dot ${className}`} aria-label={label} title={label} aria-pressed={color===variable} onClick={() => setColor(variable)}/>)}<span className="tool-spacer"/><Button variant="tool" title="Undo drawing" aria-label="Undo drawing" onClick={undo}><Undo2/></Button><Button variant="tool" title="Reset drawing" aria-label="Reset drawing" onClick={initialDrawing}><RotateCcw/></Button></div>
    </div>
    <div className="guess-bubble"><Smile size={16}/><strong>little frog</strong><span>is that a potato?</span><span><Smile size={16}/></span></div>
    <span className="mini-sticker" aria-hidden="true"><Flower2 size={49}/></span>
  </div>;
}
