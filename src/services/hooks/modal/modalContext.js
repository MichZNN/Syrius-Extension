import React from 'react';
import useModal from './useModal';
import Modal from './modal';

const ModalContext = React.createContext();

const ModalProvider = ({ children }) => {
  const value = useModal();

  return (
    <ModalContext.Provider value={value}>
      <Modal />
      {children}
    </ModalContext.Provider>
  );
};

export { ModalContext, ModalProvider };
