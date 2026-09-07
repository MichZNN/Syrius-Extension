import React, { useContext, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ModalContext } from './modalContext';

const Modal = () => {
  const { modal, modalContent, closeModal } = useContext(ModalContext);
  const root = document.querySelector('#modal-root');

  // A confirmation people cannot dismiss with Escape feels stuck.
  useEffect(() => {
    if (!modal) {
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal, closeModal]);

  if (!modal || !root) {
    return null;
  }

  return ReactDOM.createPortal(
    <>
      <div className="modal-backdrop" onClick={closeModal} />
      <div className="modal-container text-white" role="dialog" aria-modal="true">
        {modalContent}
      </div>
    </>,
    root
  );
};

export default Modal;
