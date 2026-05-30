import { useCallback } from 'react';
import { useToast } from '../components/Toast.js';

export interface ShareData {
  title?: string;
  text?: string;
  url: string;
}

/** Is the native share sheet (Web Share API) available in this browser? */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Share via the OS share sheet when available (mobile, Safari, some Chrome),
 * falling back to copying the URL to the clipboard. Returns a function that
 * resolves to true when something happened (shared or copied), false if the
 * user dismissed the native sheet.
 */
export function useShare() {
  const { show } = useToast();
  return useCallback(
    async (data: ShareData): Promise<boolean> => {
      if (canNativeShare()) {
        try {
          await navigator.share(data);
          return true;
        } catch (err) {
          // The user dismissing the sheet throws AbortError — not an error.
          if (err instanceof DOMException && err.name === 'AbortError') return false;
          // Otherwise fall through to clipboard.
        }
      }
      try {
        await navigator.clipboard.writeText(data.url);
        show('Invite link copied');
        return true;
      } catch {
        show('Copy failed — select and copy manually');
        return false;
      }
    },
    [show],
  );
}
