/** Deterministic, friendly member colours for avatars and the doodle board. */

export const MEMBER_PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // amber
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
  '#84cc16', // lime
] as const;

/** Pick a stable colour for a member given how many already exist. */
export function colorForIndex(index: number): string {
  return MEMBER_PALETTE[index % MEMBER_PALETTE.length]!;
}

/** Hash a string to a palette colour (used for deterministic identity colours). */
export function colorForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return MEMBER_PALETTE[Math.abs(hash) % MEMBER_PALETTE.length]!;
}

/** Two uppercase initials for an avatar bubble. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
