import { useCallback, useState } from 'react';

// `handleModal(content)` toggled a boolean and doubled as both open and close,
// so a component that opened a modal from inside another one closed the first.
const useModal = () => {
  const [modalContent, setModalContent] = useState(null);

  const openModal = useCallback((content) => setModalContent(content), []);
  const closeModal = useCallback(() => setModalContent(null), []);

  return { modal: modalContent !== null, modalContent, openModal, closeModal };
};

export default useModal;
