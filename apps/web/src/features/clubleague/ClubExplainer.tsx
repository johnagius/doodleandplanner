import { CLUB_TROPHY_MEISTER, CLUB_TROPHY_SECOND, CLUB_TROPHY_TOP } from '@dap/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldIcon, TrophyIcon } from './TrophyIcons.js';

/** Pre-rendered narration in a natural voice, bundled as static audio so it
 * sounds the same (and never robotic) on every device. */
const VO = (id: string) => `${import.meta.env.BASE_URL}club-vo/${id}.mp3`;

interface Scene {
  id: string;
  /** Seconds this scene stays on screen (fallback when narration is off). */
  seconds: number;
  caption: string;
  Visual: () => JSX.Element;
}

/**
 * A short, auto-playing animated walkthrough of the whole game — three markets,
 * periods & divisions, promotion/relegation and the two trophies. Every scene has
 * synced on-screen captions, and optional narration using the device's best free
 * voice, so it reads professionally whether the sound is on or off.
 */
export function ClubExplainer({ autoNarrate = false }: { autoNarrate?: boolean }) {
  const scenes = SCENES;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [narrate, setNarrate] = useState(autoNarrate);
  // True when the browser blocked autoplaying the voice-over until a tap.
  const [soundBlocked, setSoundBlocked] = useState(false);
  // Bumped to force the current scene's narration to replay (from a tap gesture).
  const [nonce, setNonce] = useState(0);
  const timer = useRef<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const stopAudio = () => {
    if (audio.current) {
      audio.current.pause();
      audio.current = null;
    }
  };

  // Drive the timeline. With narration on, each scene plays its bundled voice-over
  // and advances when the audio ends; otherwise it holds for a fixed duration.
  useEffect(() => {
    if (!playing) return;
    const scene = scenes[idx]!;
    let cancelled = false;
    const advance = () => {
      if (cancelled) return;
      setIdx((i) => (i + 1) % scenes.length);
    };
    const holdMs = scene.seconds * 1000;
    if (narrate) {
      const el = new Audio(VO(scene.id));
      audio.current = el;
      el.onended = advance;
      // If the audio can't load, fall back to the timed hold so the tour still runs.
      el.onerror = () => {
        timer.current = window.setTimeout(advance, holdMs);
      };
      void el
        .play()
        .then(() => setSoundBlocked(false))
        .catch(() => {
          // Browsers block autoplay with sound until the user interacts — keep the
          // visuals rolling and surface a one-tap "turn sound on" prompt.
          setSoundBlocked(true);
          timer.current = window.setTimeout(advance, holdMs);
        });
    } else {
      timer.current = window.setTimeout(advance, holdMs);
    }
    return () => {
      cancelled = true;
      clear();
      stopAudio();
    };
  }, [idx, playing, narrate, scenes, nonce]);

  useEffect(() => () => stopAudio(), []);

  const go = useCallback(
    (next: number) => {
      clear();
      stopAudio();
      setIdx(((next % scenes.length) + scenes.length) % scenes.length);
    },
    [scenes.length],
  );

  const scene = scenes[idx]!;
  const Visual = scene.Visual;

  return (
    <div className="card stack club-explainer">
      <div className="row spread" style={{ alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🎬 The 60-second guide</h3>
        <div className="row" style={{ gap: '0.35rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${narrate ? 'btn-primary' : ''}`}
            aria-pressed={narrate}
            onClick={() => {
              if (narrate) stopAudio();
              setNarrate((n) => !n);
            }}
            title="Toggle narration"
          >
            {narrate ? '🔊 Narration on' : '🔈 Narrate'}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
        </div>
      </div>

      <div className="club-stage" key={idx}>
        <Visual />
        {narrate && soundBlocked && (
          <button
            type="button"
            className="club-stage-sound"
            onClick={() => {
              setNarrate(true);
              setSoundBlocked(false);
              setPlaying(true);
              setNonce((n) => n + 1); // replay this scene's voice from the tap gesture
            }}
          >
            🔊 Tap for sound
          </button>
        )}
      </div>

      <div className="club-stage-caption" aria-live="polite">
        {scene.caption}
      </div>

      <div className="club-scene-dots" role="tablist" aria-label="Scenes">
        {scenes.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === idx}
            aria-label={`Scene ${i + 1}`}
            className={`club-scene-dot ${i === idx ? 'active' : ''}`}
            onClick={() => go(i)}
          />
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'center', gap: '0.4rem' }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => go(idx - 1)}>
          ‹ Back
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => go(0)}>
          ↺ Restart
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => go(idx + 1)}>
          Next ›
        </button>
      </div>
    </div>
  );
}

// --- Scene visuals ---------------------------------------------------------

function Crest({ id, label }: { id: string; label: string }) {
  return (
    <div className="cx-crest">
      <img
        src={`https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`}
        alt=""
        width={44}
        height={44}
        loading="lazy"
      />
      <span>{label}</span>
    </div>
  );
}

function IntroVisual() {
  return (
    <div className="cx-intro">
      <div className="cx-ball" aria-hidden>
        ⚽
      </div>
      <div className="cx-title">Club Football</div>
      <div className="cx-sub">Every game our clubs play — league, cups &amp; Europe</div>
    </div>
  );
}

function MarketsVisual() {
  return (
    <div className="cx-fixture">
      <div className="cx-fixture-teams">
        <Crest id="360" label="Man Utd" />
        <span className="cx-v">v</span>
        <Crest id="359" label="Arsenal" />
      </div>
      <div className="cx-markets">
        <div className="cx-market cx-pop" style={{ animationDelay: '0.1s' }}>
          <span className="cx-mk-label">Result</span>
          <span className="cx-chip">1</span>
          <span className="cx-chip">X</span>
          <span className="cx-chip on">2</span>
          <span className="cx-pts">+3</span>
        </div>
        <div className="cx-market cx-pop" style={{ animationDelay: '0.9s' }}>
          <span className="cx-mk-label">Goals 2.5</span>
          <span className="cx-chip on">Over</span>
          <span className="cx-chip">Under</span>
          <span className="cx-pts">+2</span>
        </div>
        <div className="cx-market cx-pop" style={{ animationDelay: '1.7s' }}>
          <span className="cx-mk-label">Both score</span>
          <span className="cx-chip on">Yes</span>
          <span className="cx-chip">No</span>
          <span className="cx-pts">+2</span>
        </div>
      </div>
    </div>
  );
}

function ScoringVisual() {
  return (
    <div className="cx-scoring">
      <div className="cx-score">
        <Crest id="360" label="Man Utd" />
        <span className="cx-scoreline">1 – 3</span>
        <Crest id="359" label="Arsenal" />
      </div>
      <div className="cx-pills">
        <span className="cx-pill hit">2 ✓</span>
        <span className="cx-pill hit">Over 2.5 ✓</span>
        <span className="cx-pill hit">BTTS Yes ✓</span>
      </div>
      <div className="cx-total cx-pop" style={{ animationDelay: '1.2s' }}>
        +7 points
      </div>
    </div>
  );
}

function CombinatorVisual() {
  return (
    <div className="cx-scoring">
      <div className="cx-pills">
        <span className="cx-pill hit">Result ✓</span>
        <span className="cx-pill hit">Over/Under ✓</span>
        <span className="cx-pill hit">Both score ✓</span>
      </div>
      <div className="cx-total cx-pop" style={{ animationDelay: '0.5s', color: '#b388ff' }}>
        🎯 Combinator = +14
      </div>
      <div className="cx-sub cx-pop" style={{ animationDelay: '1s' }}>
        All three right → double · any wrong → 0 · max 2 per week
      </div>
    </div>
  );
}

function DivisionsVisual() {
  const l1 = ['John', 'Noel', 'Daniel', 'Saviour'];
  const l2 = ['Manuel', 'Kevin', 'Jonathan'];
  return (
    <div className="cx-divisions">
      <div className="cx-league cx-slide">
        <div className="cx-league-title">🥇 League 1</div>
        <div className="cx-players">
          {l1.map((n) => (
            <span key={n} className="cx-player">
              {n}
            </span>
          ))}
        </div>
      </div>
      <div className="cx-league cx-slide" style={{ animationDelay: '0.4s' }}>
        <div className="cx-league-title">League 2</div>
        <div className="cx-players">
          {l2.map((n) => (
            <span key={n} className="cx-player">
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PromoVisual() {
  return (
    <div className="cx-promo">
      <div className="cx-promo-col">
        <div className="cx-league-title">🥇 League 1</div>
        <span className="cx-player cx-demote">
          Saviour <span className="cx-arrow down">▼</span>
        </span>
      </div>
      <div className="cx-promo-mid">
        <span className="cx-date">at period end · 1 Nov</span>
        <span className="cx-swap" aria-hidden>
          ⇅
        </span>
      </div>
      <div className="cx-promo-col">
        <div className="cx-league-title">League 2</div>
        <span className="cx-player cx-promote">
          Manuel <span className="cx-arrow up">▲</span>
        </span>
      </div>
    </div>
  );
}

/** The finale beat: each division cuts its last-placed player, the rest reset to 0. */
function ResetVisual() {
  const survivors = ['John', 'Daniel', 'Noel'];
  return (
    <div className="cx-reset">
      <div className="cx-reset-cut cx-slide">
        <span className="cx-reset-cut-name">Saviour</span>
        <span className="cx-reset-cut-tag">✗ knocked out</span>
      </div>
      <div className="cx-reset-survivors">
        {survivors.map((n, i) => (
          <div
            key={n}
            className="cx-reset-row cx-slide"
            style={{ animationDelay: `${0.3 + i * 0.25}s` }}
          >
            <span className="cx-reset-name">{n}</span>
            <span className="cx-reset-old">28</span>
            <span className="cx-reset-arrow" aria-hidden>
              →
            </span>
            <span className="cx-reset-zero cx-pop" style={{ animationDelay: `${0.6 + i * 0.25}s` }}>
              0
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrophyVisual() {
  return (
    <div className="cx-trophies">
      <div className="cx-trophy cx-pop">
        <div className="cx-trophy-icon">
          <TrophyIcon size={58} />
        </div>
        <div className="cx-trophy-name">{CLUB_TROPHY_TOP.name}</div>
        <div className="cx-trophy-sub">League 1 survivors · from 0</div>
      </div>
      <div className="cx-trophy cx-pop" style={{ animationDelay: '0.5s' }}>
        <div className="cx-trophy-icon">
          <ShieldIcon size={58} />
        </div>
        <div className="cx-trophy-name">{CLUB_TROPHY_SECOND.name}</div>
        <div className="cx-trophy-sub">League 2 survivors · from 0</div>
      </div>
    </div>
  );
}

function MeisterVisual() {
  return (
    <div className="cx-meister">
      <div className="cx-meister-duel">
        <div className="cx-meister-side cx-slide">
          <TrophyIcon size={40} />
          <span className="cx-meister-tag">{CLUB_TROPHY_TOP.name}</span>
          <span className="cx-meister-who">winner</span>
        </div>
        <div className="cx-meister-mid cx-pop" style={{ animationDelay: '0.5s' }}>
          <span className="cx-meister-vs">VS</span>
          <span className="cx-meister-final">UCL final</span>
        </div>
        <div className="cx-meister-side cx-slide" style={{ animationDelay: '0.3s' }}>
          <ShieldIcon size={40} />
          <span className="cx-meister-tag">{CLUB_TROPHY_SECOND.name}</span>
          <span className="cx-meister-who">winner</span>
        </div>
      </div>
      <div className="cx-trophy-name cx-pop" style={{ animationDelay: '1.2s' }}>
        🥇 {CLUB_TROPHY_MEISTER.name}
      </div>
    </div>
  );
}

const SCENES: Scene[] = [
  {
    id: 'intro',
    seconds: 5,
    caption: 'Predict every game our clubs play — across the league, cups and Europe.',
    Visual: IntroVisual,
  },
  {
    id: 'markets',
    seconds: 9,
    caption: 'Three markets a game: Result (+3), Over/Under 2.5 (+2), Both teams to score (+2).',
    Visual: MarketsVisual,
  },
  {
    id: 'scoring',
    seconds: 7,
    caption: 'Each market scores on its own — nail all three and it’s a perfect +7.',
    Visual: ScoringVisual,
  },
  {
    id: 'combinator',
    seconds: 9,
    caption:
      'Feeling brave? A Combinator pays +14 if all three are right — but 0 if any is wrong. Two a week.',
    Visual: CombinatorVisual,
  },
  {
    id: 'divisions',
    seconds: 8,
    caption: 'The field splits into League 1 and League 2 — everyone still predicts every game.',
    Visual: DivisionsVisual,
  },
  {
    id: 'promo',
    seconds: 8,
    caption: 'Promotion & relegation happen only at period end, on set dates — never mid-game.',
    Visual: PromoVisual,
  },
  {
    id: 'reset',
    seconds: 9,
    caption:
      'At the finale each division cuts its last-placed player — the survivors reset to 0 and sprint the closing games.',
    Visual: ResetVisual,
  },
  {
    id: 'trophies',
    seconds: 9,
    caption:
      'The finale: points reset — the Master League Trophy for the leaders, the First Division Shield for League 2’s best.',
    Visual: TrophyVisual,
  },
  {
    id: 'meister',
    seconds: 9,
    caption:
      'The grand finale: the two trophy winners face off on the Champions League final — the sharper bet lifts the Meister Cup.',
    Visual: MeisterVisual,
  },
];
