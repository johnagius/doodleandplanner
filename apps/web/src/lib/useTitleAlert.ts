import { useEffect } from 'react';

/**
 * Reflect a pending-items count in the document title (e.g. "(2) Doodle &
 * Planner"), so a backgrounded tab shows when it's your move or a message
 * arrived. Restores the base title on unmount or when the count hits zero.
 */
export function useTitleAlert(count: number, baseTitle = 'Doodle & Planner'): void {
  useEffect(() => {
    document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
    return () => {
      document.title = baseTitle;
    };
  }, [count, baseTitle]);
}
