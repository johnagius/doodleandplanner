/**
 * Render a shareable "my standings" card to a PNG, drawn with the plain Canvas
 * API (no dependencies). Browser-only glue — used by the Leaderboard's share
 * button. Reflects the existing point totals; it changes no scoring.
 */

export interface WcShareCardData {
  /** Heading, e.g. "World Cup 2026 Predictions". */
  title: string;
  /** Whose card this is. */
  name: string;
  /** Medal or position chip, e.g. "🥇" or "#4". */
  medal: string;
  /** "2nd of 4". */
  rankLabel: string;
  points: number;
  exact: number;
  correctResults: number;
  scored: number;
  /** A motivating one-liner, e.g. "Top of the table 👑" or "6 off the lead". */
  subtitle?: string;
  /** Footer link. */
  url: string;
}

/** Pick the largest font size (≤ base) at which `text` fits within `maxWidth`. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  base: number,
  maxWidth: number,
  weight = 'bold',
): number {
  let size = base;
  while (size > 16) {
    ctx.font = `${weight} ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  return size;
}

/** Draw the card and resolve to a PNG blob. Rejects if canvas isn't available. */
export async function renderWcShareCard(d: WcShareCardData): Promise<Blob> {
  const W = 1080;
  const H = 1080;
  const cx = W / 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser');

  // Backdrop: deep blue → purple, with a soft top highlight.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#152a6e');
  bg.addColorStop(1, '#5b21b6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, 220, 40, cx, 220, 720);
  glow.addColorStop(0, 'rgba(255,255,255,0.16)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Rounded inner border for a framed look.
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  roundRect(ctx, 40, 40, W - 80, H - 80, 36);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Title.
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `600 ${fitFontSize(ctx, `⚽ ${d.title}`, 46, W - 200, '600')}px system-ui, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(`⚽ ${d.title}`, cx, 130);

  // Medal / position.
  ctx.font = '128px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(d.medal, cx, 300);

  // Name.
  ctx.fillStyle = '#ffffff';
  const nameSize = fitFontSize(ctx, d.name, 92, W - 200);
  ctx.font = `bold ${nameSize}px system-ui, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(d.name, cx, 430);

  // Big points number + label.
  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 220px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(String(d.points), cx, 630);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 52px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('POINTS', cx, 770);

  // Stat line.
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '500 44px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${d.exact} exact · ${d.correctResults} right · ${d.scored} picks`, cx, 850);

  // Rank label.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(d.rankLabel, cx, 920);

  // Subtitle (optional).
  if (d.subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `500 ${fitFontSize(ctx, d.subtitle, 40, W - 200, '500')}px system-ui, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(d.subtitle, cx, 978);
  }

  // Footer URL.
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '500 34px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(d.url, cx, 1028);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not render the card'))),
      'image/png',
    ),
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Share a rendered card via the OS share sheet (with the image file where
 * supported), else download it. Resolves to what happened: 'shared' via the
 * native sheet, 'downloaded' as the fallback, or 'cancelled' if the user
 * dismissed the sheet.
 */
export async function shareWcCard(
  blob: Blob,
  text: string,
  title: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], 'world-cup-card.png', { type: 'image/png' });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'world-cup-card.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
