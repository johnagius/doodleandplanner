import {
  WC_STAGE_LABEL,
  findMatch,
  findTeam,
  winnerOf,
  type WcMatch,
  type WcSource,
  type WcStage,
  type WorldCupState,
} from '@dap/shared';

const ROUNDS: WcStage[] = ['r32', 'r16', 'qf', 'sf', 'final'];

/** A read-only knockout bracket that fills in as results are entered. */
export function BracketView({ wc }: { wc: WorldCupState }) {
  const hasKnockout = wc.matches.some((m) => m.stage !== 'group' && (m.homeId || m.awayId));
  const third = findMatch(wc, 'third-1');

  return (
    <div className="stack">
      {!hasKnockout && (
        <p className="muted small">
          The bracket fills in automatically once group results are entered — the group winners,
          runners-up and best third-placed teams drop into their slots.
        </p>
      )}
      <div className="wc-bracket-scroll">
        <div className="wc-bracket">
          {ROUNDS.map((stage) => {
            const matches = wc.matches
              .filter((m) => m.stage === stage)
              .sort((a, b) => a.order - b.order);
            return (
              <div key={stage} className="wc-bracket-col">
                <div className="wc-bracket-head">{WC_STAGE_LABEL[stage]}</div>
                {matches.map((m) => (
                  <BracketNode key={m.id} wc={wc} match={m} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {third && (
        <div className="wc-third-block">
          <div className="wc-bracket-head">{WC_STAGE_LABEL.third}</div>
          <div className="wc-bracket-col" style={{ maxWidth: 240 }}>
            <BracketNode wc={wc} match={third} />
          </div>
        </div>
      )}
    </div>
  );
}

function BracketNode({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const winner = winnerOf(match);
  return (
    <div className={`wc-bracket-node ${match.result ? 'played' : ''}`}>
      <Slot
        wc={wc}
        teamId={match.homeId}
        source={match.homeSource}
        score={match.result?.home}
        isWinner={!!winner && winner === match.homeId}
      />
      <Slot
        wc={wc}
        teamId={match.awayId}
        source={match.awaySource}
        score={match.result?.away}
        isWinner={!!winner && winner === match.awayId}
      />
    </div>
  );
}

function Slot({
  wc,
  teamId,
  source,
  score,
  isWinner,
}: {
  wc: WorldCupState;
  teamId: string | undefined;
  source: WcSource | undefined;
  score: number | undefined;
  isWinner: boolean;
}) {
  const team = findTeam(wc, teamId);
  return (
    <div className={`wc-bracket-slot ${isWinner ? 'is-winner' : ''} ${team ? '' : 'is-tbd'}`}>
      <span className="wc-bracket-flag" aria-hidden>
        {team ? team.flag : '•'}
      </span>
      <span className="wc-bracket-team" title={team?.name ?? shortSource(source)}>
        {team ? team.name : shortSource(source)}
      </span>
      <span className="wc-bracket-score">{score ?? ''}</span>
    </div>
  );
}

/** Compact placeholder for an unresolved slot, e.g. "1A", "2B", "3rd", "W QF1". */
function shortSource(source: WcSource | undefined): string {
  if (!source) return 'TBD';
  switch (source.kind) {
    case 'winner-group':
      return `1${source.group}`;
    case 'runner-group':
      return `2${source.group}`;
    case 'best-third':
      return `3rd #${source.thirdRank}`;
    case 'winner-match':
      return `W ${shortMatch(source.matchId)}`;
    case 'loser-match':
      return `L ${shortMatch(source.matchId)}`;
    default:
      return 'TBD';
  }
}

function shortMatch(matchId: string | undefined): string {
  if (!matchId) return '';
  const [stage, n] = matchId.split('-');
  const map: Record<string, string> = { r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF' };
  return `${map[stage ?? ''] ?? (stage ?? '').toUpperCase()}${n ? `-${n}` : ''}`;
}
