'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Cat, Check, Copy, Ghost, Heart, MonitorSmartphone, Moon, Pencil, Rabbit, Shuffle, Smile, Sun, Trophy, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DrawingDemo } from '@/components/drawing-demo';

const avatars = [<Smile key="smile" size={34}/>,<Cat key="cat" size={34}/>,<Ghost key="ghost" size={34}/>,<Rabbit key="rabbit" size={34}/>];
type Theme = 'system' | 'light' | 'dark';
const THEME_ORDER: Theme[] = ['system', 'light', 'dark'];
const THEME_KEY = 'doodle-theme';
function getThemeSnapshot(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* private mode: fall back to system */ }
  return 'system';
}
function getThemeServerSnapshot(): Theme {
  return 'system';
}
function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}
function applyTheme(next: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', next === 'dark');
  root.classList.toggle('light', next === 'light');
  try {
    if (next === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, next);
  } catch { /* private mode: keep it in memory only */ }
}
export function LandingPage() {
  const [avatar, setAvatar] = useState(0);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('English');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'public'|'private'|null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');
  const [, setThemeTick] = useState(0);
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  function cycleTheme() {
    const current = getThemeSnapshot();
    const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length] ?? 'system';
    applyTheme(next);
    setThemeTick((t) => t + 1);
    setNotice(`Appearance: ${next}.`);
  }
  function enter(next: 'public'|'private') { if (!name.trim()) { setError('Give your doodler a name first.'); return; } setError(''); setCode(Math.random().toString(36).slice(2,8).toUpperCase()); setMode(next); }
  useEffect(() => {
    if (!mode) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key==='Escape') { setMode(null); return; }
      if (event.key!=='Tab' || !dialogRef.current) return;
      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute('disabled'));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown',key);
    return () => {
      document.removeEventListener('keydown',key);
      openerRef.current?.focus();
    };
  },[mode]);
  async function copy() { try { await navigator.clipboard.writeText(code); setCopied(true); setNotice('Room code copied to clipboard.'); } catch { setCopied(false); setNotice('Copy failed. Note the code down manually.'); } }
  return <div className="site">
    <header className="site-header"><Link href="/" className="brand" aria-label="Doodle Club home"><span className="brand-mark"><Pencil size={22}/></span>doodle club<span className="text-primary">.</span></Link><nav className="header-links"><a href="#how-it-works">How to play <ArrowRight size={13}/></a><Button variant="tool" type="button" onClick={cycleTheme} title={`Appearance: ${theme} (click to change)`} aria-label={`Appearance: ${theme}. Activate to change.`}>{theme === 'dark' ? <Moon size={17}/> : theme === 'light' ? <Sun size={17}/> : <MonitorSmartphone size={17}/>}</Button><span className="header-tag">A little messy. A lot of fun.</span></nav></header>
    <main>
      <section className="landing">
        <div className="hero-content">
          <Image src="/pencil-sticker.png" alt="Happy pink pencil with colorful doodle stickers" width={1024} height={1024} className="pencil-sticker" priority/>
          <div className="art-badge"><Smile size={28}/><span>Bad art.<br/>Good times.</span></div>
          <span className="scribble-note">your art teacher isn&apos;t invited ↗</span>
          <div className="hero-copy"><h1>Doodle Club<span>Draw. Guess. Giggle.</span></h1><p className="hero-description">A blank canvas. A bunch of friends. Absolutely no talent required.<br/>Your next “one more round” starts here.</p></div>
          <div className="entry-layout">
            <form className="entry-card" onSubmit={event => { event.preventDefault(); enter('public'); }}><span className="tape" aria-hidden="true"/><h2 className="card-title">Hey, future doodler!</h2><div className="avatar-row"><div className="avatar-main">{avatars[avatar]}</div><div className="avatar-meta"><strong>Your alter ego</strong>Looking good, little weirdo.</div><Button variant="tool" className="ml-auto" aria-label="Change avatar" title="Change avatar" onClick={() => { setAvatar((avatar+1)%avatars.length); setNotice('Avatar changed.'); }} type="button"><Shuffle size={17}/></Button></div><label className="field-label" htmlFor="nickname">WHAT SHOULD WE CALL YOU?</label><input id="nickname" className="text-field" placeholder="Your nickname" value={name} maxLength={24} onChange={event => { setName(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'name-error' : undefined}/>{error ? <p id="name-error" role="alert" className="form-error">⚠ {error}</p> : <p className="field-hint">Up to 24 characters. Be nice.</p>}<label className="field-label" htmlFor="language">PICK YOUR LANGUAGE</label><select id="language" className="language-field" value={language} onChange={event => setLanguage(event.target.value)}><option>English</option><option>Hindi</option><option>Español</option><option>Français</option></select><div className="entry-actions"><Button type="submit" variant="play">Let&apos;s play <ArrowRight/></Button><Button type="button" variant="paper" onClick={() => enter('private')}><Users/> Create a private room</Button></div><p className="entry-note">No sign-up. No downloads. Just doodles.</p></form>
            <DrawingDemo/>
          </div>
          <div className="social-proof"><div className="avatar-stack"><span><Cat size={17}/></span><span><Ghost size={17}/></span><span><Smile size={17}/></span></div><span>Better with friends. Even better with bad drawings.</span><Heart size={13} className="text-primary"/></div>
        </div>
      </section>
      <section className="steps-section" id="how-it-works"><div className="section-heading"><h2>Small doodles. Big laughs.</h2><span>THREE STEPS TO A VERY GOOD TIME</span></div><div className="steps"><article className="step"><span className="step-icon"><Pencil size={23}/></span><div><h3>01. Make your masterpiece</h3><p>Get a secret word. Draw it your way.<br/>Stick figures are very welcome.</p></div></article><article className="step"><span className="step-icon"><Smile size={23}/></span><div><h3>02. Guess the unexpected</h3><p>Is it a cat? A toaster? Your uncle?<br/>Type your guess before time runs out.</p></div></article><article className="step"><span className="step-icon"><Trophy size={23}/></span><div><h3>03. Collect the bragging rights</h3><p>Quick guesses. More points.<br/>Endless “how was that a banana?!”</p></div></article></div></section>
    </main>
    <footer className="site-footer"><span className="footer-love">Made for the joy of making a mess. <Heart size={11}/></span><span>© {new Date().getFullYear()} Doodle Club · Stay a little silly.</span></footer>
    <p className="sr-only" role="status">{notice}</p>
    {mode && <div className="dialog-backdrop" onClick={() => setMode(null)}><section ref={dialogRef} className="lobby-dialog" role="dialog" aria-modal="true" aria-labelledby="lobby-title" onClick={event => event.stopPropagation()}><Button ref={closeRef} variant="tool" className="close-dialog" aria-label="Close lobby" onClick={() => { setMode(null); setCopied(false); }}><X/></Button><div className="lobby-avatar">{avatars[avatar]}</div><h2 id="lobby-title">You&apos;re in, {name.trim()}!</h2><p>{mode==='private' ? 'Your private room preview' : 'Your game lobby preview'} · {language}</p>{mode==='private' && <div className="room-code"><strong>{code}</strong><Button variant="tool" aria-label="Copy room code" title="Copy room code" onClick={copy}>{copied ? <Check/> : <Copy/>}</Button></div>}<p>This is a local preview. Online rooms and multiplayer aren&apos;t connected yet. Your doodling warm-up is ready on the page!</p><Button variant="play" className="w-full mt-4" onClick={() => setMode(null)}>Back to doodling <Pencil/></Button></section></div>}
  </div>;
}
