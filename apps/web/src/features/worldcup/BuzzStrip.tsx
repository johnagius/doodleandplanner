import type { WcNewsArticle } from '@dap/shared';
import { useWorldCupNews } from './news.js';

/** Compact relative age like "3h" / "2d" / "just now". */
function ago(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

function BuzzCard({ article }: { article: WcNewsArticle }) {
  return (
    <a className="wc-buzz-card" href={article.url} target="_blank" rel="noopener noreferrer">
      {article.image && (
        <span
          className="wc-buzz-img"
          style={{ backgroundImage: `url(${article.image})` }}
          aria-hidden
        />
      )}
      <span className="wc-buzz-body">
        <span className="wc-buzz-headline">{article.headline}</span>
        {article.published && (
          <span className="wc-buzz-time muted small">{ago(article.published)}</span>
        )}
      </span>
    </a>
  );
}

/** "Buzz" strip: a horizontally-scrollable row of World Cup headlines from
 * ESPN's news feed. Renders nothing until/unless there are articles. */
export function BuzzStrip() {
  const { articles } = useWorldCupNews();
  if (articles.length === 0) return null;
  return (
    <section className="wc-buzz" aria-label="World Cup news">
      <div className="wc-buzz-head">📰 Buzz</div>
      <div className="wc-buzz-row">
        {articles.slice(0, 12).map((a) => (
          <BuzzCard key={a.url} article={a} />
        ))}
      </div>
    </section>
  );
}
