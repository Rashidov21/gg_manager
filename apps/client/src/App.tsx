import React from 'react';
import { KioskSessionProvider } from './context/KioskSessionContext';
import { useClientWindowLabel } from './lib/windowLabel';
import { LoginWindow } from './windows/LoginWindow';
import { OverlayWindow } from './windows/OverlayWindow';

export const App: React.FC = () => {
  const label = useClientWindowLabel();

  if (label === 'overlay') {
    return (
      <KioskSessionProvider>
        <OverlayWindow />
      </KioskSessionProvider>
    );
  }

  return <LoginWindow />;
};
