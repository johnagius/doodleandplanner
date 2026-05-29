import { useCallback } from 'react';
import { useToast } from '../components/Toast.js';

/** Copy text to the clipboard with a fallback and a toast confirmation. */
export function useClipboard() {
  const { show } = useToast();
  return useCallback(
    async (text: string, message = 'Copied to clipboard') => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const el = document.createElement('textarea');
          el.value = text;
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
        }
        show(message);
      } catch {
        show('Copy failed — select and copy manually');
      }
    },
    [show],
  );
}
