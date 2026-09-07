import { useCallback, useState } from 'react';

// The unobtrusive one: background work that should be visible but must not take
// the screen away, such as receiving pending blocks. Same counted show/hide as
// the blocking spinner, for the same reason.
const useSilentSpinner = () => {
  const [depth, setDepth] = useState(0);
  const [silentSpinnerContent, setSilentSpinnerContent] = useState('');

  const showSilentSpinner = useCallback((content) => {
    if (content !== undefined) {
      setSilentSpinnerContent(content);
    }
    setDepth((current) => current + 1);
  }, []);

  const hideSilentSpinner = useCallback(() => {
    setDepth((current) => Math.max(0, current - 1));
  }, []);

  const updateSilentSpinner = useCallback((content) => setSilentSpinnerContent(content), []);

  return {
    silentSpinner: depth > 0,
    silentSpinnerContent,
    showSilentSpinner,
    hideSilentSpinner,
    updateSilentSpinner,
  };
};

export default useSilentSpinner;
