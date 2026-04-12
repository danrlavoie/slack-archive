import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

export function useMessageAnchor(isLoading: boolean) {
  const { messageTs } = useParams();

  useEffect(() => {
    if (isLoading || !messageTs) return;

    // Small delay to ensure DOM has rendered after data load
    const timer = setTimeout(() => {
      const el = document.getElementById(messageTs);
      if (!el) return;

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('message-highlight');

      // Remove highlight after animation completes
      const cleanup = setTimeout(() => {
        el.classList.remove('message-highlight');
      }, 2000);

      return () => clearTimeout(cleanup);
    }, 100);

    return () => clearTimeout(timer);
  }, [isLoading, messageTs]);
}
