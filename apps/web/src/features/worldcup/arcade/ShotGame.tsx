import type { WcArcadeGame } from '@dap/shared';
import { useEffect, useRef, useState } from 'react';
import { useWorldCupStore } from '../../../state/worldCupStore.js';

/**
 * A self-contained arcade shooter on a 2D canvas. One skill mechanic across all
 * three games: a marker sweeps the target and a single Shoot action (button,
 * canvas tap or spacebar) stops it — land in the green sweet-zone to score. The
 * zone shrinks as you step back (basketball / free kicks) or stays put
 * (penalties). Three misses in a row ends the run and records your best.
 *
 * Everything dynamic is drawn on the canvas; React only owns the HUD + buttons.
 */

export interface ShotConfig {
  key: WcArcadeGame;
  theme: 'basket' | 'football';
  /** Sweet-zone half-width as a fraction of the bar (bigger = easier). */
  baseZone: number;
  /** Floor for the half-width once it has shrunk. */
  minZone: number;
  /** How much the half-width shrinks per shot taken (0 = never, for penalties). */
  shrink: number;
  /** Marker sweep speed in full cycles per second. */
  speed: number;
  /** Flavour distance label for the HUD, given how many shots have been taken. */
  distanceLabel: (shotsTaken: number) => string;
}

export const ARCADE_CONFIGS: Record<WcArcadeGame, ShotConfig> = {
  basketball: {
    key: 'basketball',
    theme: 'basket',
    baseZone: 0.17,
    minZone: 0.055,
    shrink: 0.012,
    speed: 0.82,
    distanceLabel: (n) => `${15 + n * 3} ft`,
  },
  freekick: {
    key: 'freekick',
    theme: 'football',
    baseZone: 0.16,
    minZone: 0.05,
    shrink: 0.011,
    speed: 0.9,
    distanceLabel: (n) => `${18 + n * 3} m`,
  },
  penalty: {
    key: 'penalty',
    theme: 'football',
    baseZone: 0.13,
    minZone: 0.13,
    shrink: 0,
    speed: 1.05,
    distanceLabel: () => `12 m`,
  },
};

const W = 640;
const H = 400;
const GROUND = 320;
const BAR_Y = 360;
const BAR_X0 = 60;
const BAR_X1 = 580;

type Phase = 'ready' | 'swing' | 'flight' | 'result';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface GameState {
  phase: Phase;
  shots: number;
  marker: number;
  dir: number;
  zoneCenter: number;
  zoneHalf: number;
  stopAt: number;
  made: boolean;
  flightT: number;
  keeper: number;
  keeperDir: number;
  resultHold: number;
  shake: number;
  particles: Particle[];
}

function freshZone(cfg: ShotConfig, shots: number): { center: number; half: number } {
  const half = Math.max(cfg.minZone, cfg.baseZone - cfg.shrink * shots);
  const center = 0.26 + Math.random() * 0.48; // random each shot: reaction, not rote
  return { center, half };
}

export function ShotGame({ config, onExit }: { config: ShotConfig; onExit: () => void }) {
  const submit = useWorldCupStore((s) => s.submitArcadeScore);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    phase: 'ready',
    shots: 0,
    marker: 0,
    dir: 1,
    zoneCenter: 0.5,
    zoneHalf: config.baseZone,
    stopAt: 0,
    made: false,
    flightT: 0,
    keeper: 0.5,
    keeperDir: 1,
    resultHold: 0,
    shake: 0,
    particles: [],
  });
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState<Phase>('ready');
  const [shotsTaken, setShotsTaken] = useState(0);
  const [lastShot, setLastShot] = useState<'make' | 'miss' | null>(null);
  const scoreRef = useRef(0);
  const missesRef = useRef(0);
  const overRef = useRef(false);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  function beginAim() {
    const st = stateRef.current;
    const z = freshZone(cfgRef.current, st.shots);
    st.zoneCenter = z.center;
    st.zoneHalf = z.half;
    st.marker = 0;
    st.dir = 1;
    st.phase = 'swing';
    setPhase('swing');
  }

  function resolveShot() {
    const st = stateRef.current;
    st.stopAt = st.marker;
    st.made = Math.abs(st.marker - st.zoneCenter) <= st.zoneHalf;
    st.keeper = st.marker;
    st.phase = 'flight';
    st.flightT = 0;
    setPhase('flight');
    if (st.made) {
      st.shake = 8;
      spawnBurst(st, cfgRef.current.theme);
    }
  }

  function finishShot() {
    const st = stateRef.current;
    const made = st.made;
    st.shots += 1;
    st.phase = 'ready';
    setPhase('ready');
    setShotsTaken(st.shots);
    setLastShot(made ? 'make' : 'miss');
    if (made) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      missesRef.current = 0;
      setMisses(0);
    } else {
      missesRef.current += 1;
      setMisses(missesRef.current);
      if (missesRef.current >= 3) {
        overRef.current = true;
        setOver(true);
        void submit(cfgRef.current.key, scoreRef.current);
      }
    }
  }

  /** The single Shoot action — button, canvas tap and spacebar all call this. */
  function shoot() {
    if (overRef.current) return;
    const st = stateRef.current;
    if (st.phase === 'ready') beginAim();
    else if (st.phase === 'swing') resolveShot();
  }

  function restart() {
    scoreRef.current = 0;
    missesRef.current = 0;
    overRef.current = false;
    setScore(0);
    setMisses(0);
    setOver(false);
    setLastShot(null);
    setPhase('ready');
    setShotsTaken(0);
    const st = stateRef.current;
    st.shots = 0;
    st.phase = 'ready';
    st.particles = [];
    st.flightT = 0;
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      e.preventDefault();
      if (overRef.current) restart();
      else shoot();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let prev = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(50, now - prev) / 1000;
      prev = now;
      update(stateRef.current, cfgRef.current, dt, finishShot);
      draw(ctx, stateRef.current, cfgRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cfg = config;
  const lives = [0, 1, 2].map((i) => i < 3 - misses);

  return (
    <div className="wc-arcade-game stack">
      <div className="row spread" style={{ alignItems: 'center' }}>
        <button className="btn btn-sm btn-ghost" onClick={onExit}>
          ← Arcade
        </button>
        <span className="wc-arcade-hud">
          <strong>{score}</strong> scored ·{' '}
          <span className="wc-arcade-lives" aria-label={`${3 - misses} lives left`}>
            {lives.map((alive, i) => (
              <span key={i} className={alive ? 'on' : 'off'}>
                {alive ? '●' : '○'}
              </span>
            ))}
          </span>
        </span>
      </div>

      <div className="wc-arcade-stage">
        <canvas
          ref={canvasRef}
          className="wc-arcade-canvas"
          role="img"
          aria-label={`${cfg.key} mini-game`}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!over) shoot();
          }}
        />
        {over && (
          <div className="wc-arcade-over">
            <div className="wc-arcade-over-card stack">
              <h3 style={{ margin: 0 }}>Game over</h3>
              <p className="muted" style={{ margin: 0 }}>
                You scored <strong>{score}</strong>.
              </p>
              <div className="row" style={{ justifyContent: 'center', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={restart}>
                  Play again
                </button>
                <button className="btn btn-ghost" onClick={onExit}>
                  Back
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!over && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary wc-arcade-shoot" onClick={shoot}>
            {phase === 'ready' ? '▶ Aim' : phase === 'swing' ? '🎯 Shoot!' : '…'}
          </button>
        </div>
      )}
      <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>
        Tap <strong>Aim</strong>, then <strong>Shoot</strong> when the marker hits the green —
        spacebar works too. Distance: {cfg.distanceLabel(shotsTaken)}
        {lastShot ? ` · last: ${lastShot === 'make' ? 'scored! 🔥' : 'missed 😬'}` : ''}
      </p>
    </div>
  );
}

// --- update + draw (operate on the mutable state ref) ------------------------

function targetPoint(st: GameState): { x: number; y: number } {
  const depth = Math.min(1, st.shots * 0.05);
  return { x: 430 + depth * 90, y: 150 - depth * 18 };
}

function spawnBurst(st: GameState, theme: ShotConfig['theme']) {
  const colors =
    theme === 'basket' ? ['#ff8c42', '#ffd166', '#ffffff'] : ['#22c55e', '#ffffff', '#86efac'];
  const tp = targetPoint(st);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 200;
    st.particles.push({
      x: tp.x,
      y: tp.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 60,
      life: 0.8 + Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)]!,
    });
  }
}

function update(st: GameState, cfg: ShotConfig, dt: number, onFinish: () => void) {
  for (const p of st.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 520 * dt;
    p.life -= dt;
  }
  st.particles = st.particles.filter((p) => p.life > 0);
  if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 30);

  if (st.phase === 'swing') {
    st.marker += st.dir * cfg.speed * dt;
    if (st.marker >= 1) {
      st.marker = 1;
      st.dir = -1;
    } else if (st.marker <= 0) {
      st.marker = 0;
      st.dir = 1;
    }
    st.keeper += st.keeperDir * cfg.speed * 0.6 * dt;
    if (st.keeper >= 0.85) st.keeperDir = -1;
    else if (st.keeper <= 0.15) st.keeperDir = 1;
  } else if (st.phase === 'flight') {
    st.flightT += dt / 0.7;
    if (st.flightT >= 1) {
      st.flightT = 1;
      st.phase = 'result';
      st.resultHold = 650;
    }
  } else if (st.phase === 'result') {
    st.resultHold -= dt * 1000;
    if (st.resultHold <= 0) onFinish();
  }
}

function draw(ctx: CanvasRenderingContext2D, st: GameState, cfg: ShotConfig) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (st.shake > 0) {
    ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake);
  }
  if (cfg.theme === 'basket') drawBasketScene(ctx, st);
  else drawFootballScene(ctx, st);
  drawBallAndShot(ctx, st, cfg);
  for (const p of st.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  drawGauge(ctx, st, cfg);
  drawResultText(ctx, st);
}

function drawBasketScene(ctx: CanvasRenderingContext2D, st: GameState) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#3b2f6b');
  sky.addColorStop(1, '#6d4baa');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = ['#ffd166', '#ef476f', '#06d6a0', '#ffffff'][i % 4]!;
    ctx.beginPath();
    ctx.arc(((i * 53) % W) + 8, 24 + ((i * 17) % 70), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const floor = ctx.createLinearGradient(0, GROUND, 0, H);
  floor.addColorStop(0, '#b5651d');
  floor.addColorStop(1, '#8a4b16');
  ctx.fillStyle = floor;
  ctx.fillRect(0, GROUND, W, H - GROUND);
  const t = targetPoint(st);
  ctx.fillStyle = '#e8e8ee';
  ctx.fillRect(t.x + 34, t.y - 44, 8, 96);
  ctx.strokeStyle = '#e8e8ee';
  ctx.lineWidth = 4;
  ctx.strokeRect(t.x + 18, t.y - 40, 26, 40);
  ctx.strokeStyle = '#ff7a18';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(t.x, t.y, 26, 8, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(t.x + i * 7, t.y);
    ctx.lineTo(t.x + i * 4, t.y + 30);
    ctx.stroke();
  }
}

function drawFootballScene(ctx: CanvasRenderingContext2D, st: GameState) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#2a6cf0');
  sky.addColorStop(1, '#8fd3ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND);
  const pitch = ctx.createLinearGradient(0, GROUND - 40, 0, H);
  pitch.addColorStop(0, '#2faa3f');
  pitch.addColorStop(1, '#1d7a2c');
  ctx.fillStyle = pitch;
  ctx.fillRect(0, GROUND - 40, W, H - GROUND + 40);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < W; i += 80) ctx.fillRect(i, GROUND - 40, 40, H - GROUND + 40);
  const t = targetPoint(st);
  const gw = 150;
  const gh = 90;
  const gx = t.x - gw / 2;
  const gy = t.y - 10;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gw; i += 12) {
    ctx.beginPath();
    ctx.moveTo(gx + i, gy);
    ctx.lineTo(gx + i, gy + gh);
    ctx.stroke();
  }
  for (let j = 0; j <= gh; j += 12) {
    ctx.beginPath();
    ctx.moveTo(gx, gy + j);
    ctx.lineTo(gx + gw, gy + j);
    ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(gx, gy, gw, gh);
  const kx = gx + 12 + st.keeper * (gw - 40);
  const lunge = st.phase === 'flight' ? Math.sin(st.flightT * Math.PI) * 10 : 0;
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(kx, gy + gh - 46 - lunge, 22, 46);
  ctx.beginPath();
  ctx.arc(kx + 11, gy + gh - 52 - lunge, 9, 0, Math.PI * 2);
  ctx.fill();
}

function drawBallAndShot(ctx: CanvasRenderingContext2D, st: GameState, cfg: ShotConfig) {
  const start = { x: 90, y: GROUND - 16 };
  const tgt = targetPoint(st);
  let x = start.x;
  let y = start.y;
  if (st.phase === 'flight' || st.phase === 'result') {
    const tt = st.flightT;
    const endX = st.made ? tgt.x : tgt.x + (st.stopAt - st.zoneCenter) * 220;
    const endY = st.made ? tgt.y + 26 : tgt.y - 10;
    const peak = 150;
    x = start.x + (endX - start.x) * tt;
    y = start.y + (endY - start.y) * tt - peak * 4 * tt * (1 - tt);
  }
  const r = 12;
  ctx.fillStyle = cfg.theme === 'basket' ? '#ff8c2b' : '#fafafa';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = cfg.theme === 'basket' ? '#7a3d00' : '#222222';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (cfg.theme === 'basket') {
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#222222';
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGauge(ctx: CanvasRenderingContext2D, st: GameState, cfg: ShotConfig) {
  const width = BAR_X1 - BAR_X0;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, BAR_X0 - 6, BAR_Y - 14, width + 12, 28, 8);
  ctx.fill();
  const zc = BAR_X0 + st.zoneCenter * width;
  const zw = st.zoneHalf * width;
  const grad = ctx.createLinearGradient(zc - zw, 0, zc + zw, 0);
  grad.addColorStop(0, '#16a34a');
  grad.addColorStop(0.5, '#4ade80');
  grad.addColorStop(1, '#16a34a');
  ctx.fillStyle = grad;
  roundRect(ctx, zc - zw, BAR_Y - 10, zw * 2, 20, 6);
  ctx.fill();
  if (cfg.theme === 'football' && st.phase === 'swing') {
    ctx.fillStyle = 'rgba(255,212,0,0.5)';
    const kx = BAR_X0 + st.keeper * width;
    roundRect(ctx, kx - 14, BAR_Y - 10, 28, 20, 6);
    ctx.fill();
  }
  if (st.phase === 'swing' || st.phase === 'ready') {
    const mx = BAR_X0 + st.marker * width;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, mx - 3, BAR_Y - 16, 6, 32, 3);
    ctx.fill();
  }
}

function drawResultText(ctx: CanvasRenderingContext2D, st: GameState) {
  if (st.phase !== 'result') return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, st.resultHold / 300);
  ctx.font = '800 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = st.made ? '#fde047' : '#fca5a5';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  const txt = st.made ? 'SCORE!' : 'MISS';
  ctx.strokeText(txt, W / 2, 110);
  ctx.fillText(txt, W / 2, 110);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
