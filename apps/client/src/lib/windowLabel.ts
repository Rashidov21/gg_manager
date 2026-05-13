import { useEffect, useState } from 'react';

export type ClientWindowLabel = 'login' | 'overlay';

export function useClientWindowLabel(): ClientWindowLabel {
  const [label, setLabel] = useState<ClientWindowLabel>('login');

  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    if (!isTauri) {
      const q = new URLSearchParams(window.location.search).get('window');
      setLabel(q === 'overlay' ? 'overlay' : 'login');
      return;
    }

    void import('@tauri-apps/api/window').then(({ getCurrent }) => {
      const l = getCurrent().label;
      setLabel(l === 'overlay' ? 'overlay' : 'login');
    });
  }, []);

  return label;
}
