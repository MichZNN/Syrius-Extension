import { useCallback, useState } from 'react';

// The blocking spinner.
//
// The old API was `handleSpinner(content)`, which *toggled* `spinner` on a
// stale closure over its own state and returned React's raw `setSpinner` so the
// caller could flip it back. Every call site therefore did
// `const show = handleSpinner(<div/>); show(true);` — turning it on twice — and
// an early return that forgot the second call left the wallet behind a spinner
// with no way out. Two overlapping operations fought over the same boolean.
//
// Show and hide, counted, so nested operations behave.
const useSpinner = () => {
  const [depth, setDepth] = useState(0);
  const [spinnerContent, setSpinnerContent] = useState('Loading…');

  const showSpinner = useCallback((content) => {
    if (content !== undefined) {
      setSpinnerContent(content);
    }
    setDepth((current) => current + 1);
  }, []);

  const hideSpinner = useCallback(() => {
    setDepth((current) => Math.max(0, current - 1));
  }, []);

  // For an operation that changes what it is doing partway through, without a
  // second show/hide pair. Sending no longer goes through here at all: proof of
  // work runs in the background and reports itself on the dashboard.
  const updateSpinner = useCallback((content) => setSpinnerContent(content), []);

  return {
    spinner: depth > 0,
    spinnerContent,
    showSpinner,
    hideSpinner,
    updateSpinner,
  };
};

export default useSpinner;
