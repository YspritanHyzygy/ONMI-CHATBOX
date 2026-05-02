import { useCallback, useEffect, useState } from 'react';

function isNarrowViewport(breakpoint: number) {
  return typeof window !== 'undefined' && window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches;
}

export function useResponsiveSidebar(breakpoint = 900) {
  const [showSidebar, setShowSidebar] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= breakpoint;
  });

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handleChange = (event: MediaQueryListEvent) => {
      setShowSidebar(!event.matches);
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [breakpoint]);

  const closeSidebarOnNarrow = useCallback(() => {
    if (isNarrowViewport(breakpoint)) setShowSidebar(false);
  }, [breakpoint]);

  return {
    showSidebar,
    setShowSidebar,
    closeSidebarOnNarrow,
  };
}
