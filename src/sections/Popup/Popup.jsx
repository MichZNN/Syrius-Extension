import React from 'react';
import { HashRouter as Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import './Popup.scss';
import MainLayout from '../../layouts/mainLayout/mainLayout';
import { store } from '../../services/redux/store';
import { ModalProvider } from '../../services/hooks/modal/modalContext';
import { SpinnerProvider } from '../../services/hooks/spinner/spinnerContext';
import { SilentSpinnerProvider } from '../../services/hooks/silent-spinner/silentSpinnerContext';

// A hash router, not a browser router.
//
// The service worker opens this page for a dApp approval, and the only way it
// can say which screen to open is the URL. Under `BrowserRouter` that is
// impossible inside an extension — every path is a 404 against the packaged
// popup.html — so the previous build handed the flow over through storage, read
// it once, and hoped the popup and the worker agreed about whose turn it was.
// `popup.html#/site-integration` needs none of that, and it is also what lets
// the dev harness open a screen directly.
const Popup = () => (
  <Provider store={store}>
    <Router>
      <ModalProvider>
        <SpinnerProvider>
          <SilentSpinnerProvider>
            <div className="popup">
              <MainLayout />
            </div>
          </SilentSpinnerProvider>
        </SpinnerProvider>
      </ModalProvider>
      <ToastContainer limit={3} />
      <div id="modal-root" />
      <div id="spinner-root" />
    </Router>
  </Provider>
);

export default Popup;
