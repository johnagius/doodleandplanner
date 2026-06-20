/**
 * Which match the Cinema is showing. A tiny dedicated store so any card or the
 * fixtures list can point the Cinema tab at a match without prop-drilling.
 * `seq` bumps on every request so the page can jump to the Cinema tab even when
 * the same match is re-selected.
 */
import { create } from 'zustand';

interface MatchRoomStore {
  openId: string | null;
  seq: number;
  open: (matchId: string) => void;
  close: () => void;
}

export const useMatchRoom = create<MatchRoomStore>((set) => ({
  openId: null,
  seq: 0,
  open: (matchId) => set((s) => ({ openId: matchId, seq: s.seq + 1 })),
  close: () => set({ openId: null }),
}));
