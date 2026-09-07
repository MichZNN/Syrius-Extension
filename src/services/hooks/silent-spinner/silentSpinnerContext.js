import React from 'react';
import useSilentSpinner from './useSilentSpinner';
import SilentSpinner from './silentSpinner';

const SilentSpinnerContext = React.createContext();

const SilentSpinnerProvider = ({ children }) => {
  const value = useSilentSpinner();

  return (
    <SilentSpinnerContext.Provider value={value}>
      <SilentSpinner />
      {children}
    </SilentSpinnerContext.Provider>
  );
};

export { SilentSpinnerContext, SilentSpinnerProvider };
