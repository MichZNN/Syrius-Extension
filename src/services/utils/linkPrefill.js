import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

// The arguments a syrius:// link opened this screen with (platform/linkRoutes.js
// names them), read once when the screen mounts. They only fill the form in.
const useLinkPrefill = () => {
  const { search } = useLocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Object.fromEntries(new URLSearchParams(search)), []);
};

export default useLinkPrefill;
