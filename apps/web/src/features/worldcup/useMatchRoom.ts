/**
 * Which match (if any) is showing in the immersive Match Room overlay. A tiny
 * dedicated store so any card or the fixtures list can open the Room without
 * prop-drilling through WorldCupPage.
 */
import { create } from 'zustand';

interface MatchRoomStore {
  openId: string | null;
  open: (matchId: string) => void;
  close: () => void;
}

export const useMatchRoom = create<MatchRoomStore>((set) => ({
  openId: null,
  open: (matchId) => set({ openId: matchId }),
  close: () => set({ openId: null }),
}));
