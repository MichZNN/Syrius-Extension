import React from 'react';
import useSpinner from './useSpinner';
import Spinner from './spinner';

const SpinnerContext = React.createContext();

const SpinnerProvider = ({ children }) => {
  const value = useSpinner();

  return (
    <SpinnerContext.Provider value={value}>
      <Spinner />
      {children}
    </SpinnerContext.Provider>
  );
};

export { SpinnerContext, SpinnerProvider };
