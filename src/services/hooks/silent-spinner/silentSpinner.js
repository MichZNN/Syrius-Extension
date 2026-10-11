import React, { useContext } from 'react';
import ReactDOM from 'react-dom';
import { SilentSpinnerContext } from './silentSpinnerContext';
import Icon from '../../../components/icon/icon';

// Portalled into the header, so background work reads as the wallet being busy
// rather than as a dialog demanding attention.
const SilentSpinner = () => {
  const { silentSpinner, silentSpinnerContent } = useContext(SilentSpinnerContext);
  const root = document.querySelector('#pow-spinner-root');

  if (!silentSpinner || !root) {
    return null;
  }

  return ReactDOM.createPortal(
    <div className="pow-spinner-container" title={silentSpinnerContent}>
      <Icon name="loader" size={16} className="pow-spinner" />
    </div>,
    root
  );
};

export default SilentSpinner;
