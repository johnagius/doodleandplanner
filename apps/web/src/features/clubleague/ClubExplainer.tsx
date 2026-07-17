import { CLUB_TROPHY_SECOND, CLUB_TROPHY_TOP } from '@dap/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hasGoodVoice,
  primeVoices,
  speak,
  speechSupported,
  stopSpeaking,
} from './clubNarration.js';
import { ShieldIcon, TrophyIcon } from './TrophyIcons.js';

interface Scene {
  id: string;
  /** Seconds this scene stays on screen. */
  seconds: number;
  narration: string;
  caption: string;
  Visual: () => JSX.Element;
}

/**
 * A short, auto-playing animated walkthrough of the whole game — three markets,
 * periods & divisions, promotion/relegation and the two trophies. Every scene has
 * synced on-screen captions, and optional narration using the device's best free
 * voice, so it reads professionally whether the sound is on or off.
 */
export function ClubExplainer() {
  const scenes = SCENES;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [narrate, setNarrate] = useState(false);
  // Only offer narration when the device actually has a high-quality (neural)
  // voice — otherwise the built-in robotic voice sounds bad, so we simply don't
  // offer it and let the captions carry the words.
  const [goodVoice, setGoodVoice] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (speechSupported()) primeVoices(() => setGoodVoice(hasGoodVoice()));
  }, []);

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  // Drive the timeline. Each scene shows for its duration, or until narration
  // finishes (whichever is longer), then advances — looping at the end.
  useEffect(() => {
    if (!playing) return;
    const scene = scenes[idx]!;
    let cancelled = false;
    const advance = () => {
      if (cancelled) return;
      setIdx((i) => (i + 1) % scenes.length);
    };
    const holdMs = scene.seconds * 1000;
    if (narrate && speechSupported()) {
      const started = Date.now();
      void speak(scene.narration).then(() => {
        if (cancelled) return;
        const remaining = Math.max(600, holdMs - (Date.now() - started));
        timer.current = window.setTimeout(advance, remaining);
      });
    } else {
      timer.current = window.setTimeout(advance, holdMs);
    }
    return () => {
      cancelled = true;
      clear();
      stopSpeaking();
    };
  }, [idx, playing, narrate, scenes]);

  useEffect(() => () => stopSpeaking(), []);

  const go = useCallback(
    (next: number) => {
      clear();
      stopSpeaking();
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
          {goodVoice && (
            <button
              type="button"
              className={`btn btn-sm ${narrate ? 'btn-primary' : ''}`}
              aria-pressed={narrate}
              onClick={() => {
                setNarrate((n) => !n);
                if (narrate) stopSpeaking();
              }}
              title="Toggle narration"
            >
              {narrate ? '🔊 Narration on' : '🔈 Narrate'}
            </button>
          )}
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
      <div className="cx-title">Club Football Predictions</div>
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
        <span className="cx-player cx-demote">Saviour ▼</span>
      </div>
      <div className="cx-promo-mid">
        <span className="cx-date">at period end · 1 Nov</span>
        <span className="cx-swap" aria-hidden>
          ⇅
        </span>
      </div>
      <div className="cx-promo-col">
        <div className="cx-league-title">League 2</div>
        <span className="cx-player cx-promote">Manuel ▲</span>
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
        <div className="cx-trophy-sub">Top 3 overall · reset to 0</div>
      </div>
      <div className="cx-trophy cx-pop" style={{ animationDelay: '0.5s' }}>
        <div className="cx-trophy-icon">
          <ShieldIcon size={58} />
        </div>
        <div className="cx-trophy-name">{CLUB_TROPHY_SECOND.name}</div>
        <div className="cx-trophy-sub">Top of League 2 · reset to 0</div>
      </div>
    </div>
  );
}

const SCENES: Scene[] = [
  {
    id: 'intro',
    seconds: 5,
    narration:
      'Welcome to Club Football Predictions. Predict every game our ten clubs play, across the league, the cups and Europe.',
    caption: 'Predict every game our clubs play — across the league, cups and Europe.',
    Visual: IntroVisual,
  },
  {
    id: 'markets',
    seconds: 9,
    narration:
      'Each fixture is three quick bets. The result — one, X or two, worth three points. Over or under two and a half goals, worth two. And both teams to score, worth two. Fill in as many as you like.',
    caption: 'Three markets a game: Result (+3), Over/Under 2.5 (+2), Both teams to score (+2).',
    Visual: MarketsVisual,
  },
  {
    id: 'scoring',
    seconds: 7,
    narration:
      'When the game ends, every market you called right scores on its own. Nail all three and that is seven points.',
    caption: 'Each market scores on its own — nail all three and it’s a perfect +7.',
    Visual: ScoringVisual,
  },
  {
    id: 'divisions',
    seconds: 8,
    narration:
      'The season runs in periods, and the field splits into two divisions — League One for the leaders, and League Two for the chasing pack. Everyone still predicts every game.',
    caption: 'The field splits into League 1 and League 2 — everyone still predicts every game.',
    Visual: DivisionsVisual,
  },
  {
    id: 'promo',
    seconds: 8,
    narration:
      'Promotion and relegation happen only when a period ends, on set dates — never after a single game. Climb into the top four and you go up.',
    caption: 'Promotion & relegation happen only at period end, on set dates — never mid-game.',
    Visual: PromoVisual,
  },
  {
    id: 'trophies',
    seconds: 9,
    narration:
      'And the finale is a double decider. Points reset to level: the leaders fight for the Champions Crown, while the top of League Two battle for the Challengers Shield. Two trophies, all to play for.',
    caption:
      'The finale: points reset — the Crown for the leaders, the Shield for League 2’s best.',
    Visual: TrophyVisual,
  },
];
