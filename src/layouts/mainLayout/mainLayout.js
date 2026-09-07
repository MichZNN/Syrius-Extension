/**
 * Route the popup between onboarding, wallet unlock, dashboard and bridge
 * approval screens, while monitoring the temporary wallet session.
 */
import React, { useState, useEffect, useRef } from 'react';
import DashboardPassword from '../../pages/dashboard/dashboard-password/dashboard-password';
import { Route, Routes } from 'react-router-dom';
import {
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  Zenon,
} from 'znn-ts-sdk';
import TabsLayout from '../tabsLayout/tabsLayout';
import AuthLayout from '../authLayout/authLayout';
import { useDispatch, useSelector } from 'react-redux';
import { resetIntegrationFlow, setCurrentIntegrationFlow, setIntegrationSiteOrigin, setIntegrationRequestId, storeAccountBlockData, storeTransactionData } from '../../services/redux/integrationSlice';
import { resetWalletState } from '../../services/redux/walletSlice';
import SiteIntegrationLayout from '../siteIntegrationLayout/siteIntegrationLayout';
import Lottie from 'react-lottie-player';
import * as splashAnimation from './../../assets/lottie/intro-mobile.json'
import { ModalProvider } from '../../services/hooks/modal/modalContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { SpinnerProvider } from '../../services/hooks/spinner/spinnerContext';
import { SilentSpinnerProvider } from '../../services/hooks/silent-spinner/silentSpinnerContext';
import InitialNodeSelection from '../../pages/settings/change-node/initial-node-selection';
import { loadStorageWalletNames } from '../../services/utils/utils';
import walletVault from '../../services/security/walletVault';
import { sendRuntimeMessage } from '../../services/security/runtimeMessage';

const getIntegrationRequest = () => sendRuntimeMessage({
    message: 'internal.getIntegrationRequest',
  }, { fallback: null }).then((request) => request || null);

const SESSION_ACTIVITY_THROTTLE_MS = 5 * 1000;
const SESSION_CHECK_INTERVAL_MS = 30 * 1000;

const sendSessionMessage = (message, onResponse) => {
  sendRuntimeMessage({ message }, { fallback: null }).then(onResponse);
};

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const initialPathname = useRef(location.pathname);
  const hasUnlockedWallet = useSelector((state) => Boolean(state.wallet.walletName));
  const isWalletSessionOpen = hasUnlockedWallet
    && (location.pathname.startsWith('/tabs') || location.pathname === '/site-integration');
  const [animationSettings] = useState({
    loop: false,
    autoPlay: true,
    animationData: splashAnimation,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid slice'
    }
  });
  const [isAnimationStopped, setIsAnimationStopped] = useState(false);

  useEffect(() => {
    if (isAnimationStopped) {
      const walletNames = loadStorageWalletNames();

      let isCancelled = false;

      const initializeLayout = async () => {
        const integrationRequest = await getIntegrationRequest();

        if (isCancelled) {
          return;
        }

        dispatch(resetIntegrationFlow());
        if (integrationRequest?.currentIntegrationFlow) {
          dispatch(setCurrentIntegrationFlow(integrationRequest.currentIntegrationFlow));
          dispatch(setIntegrationSiteOrigin(integrationRequest.siteOrigin || ''));
          dispatch(setIntegrationRequestId(integrationRequest.requestId || ''));
          if (integrationRequest.currentIntegrationFlow === 'transactionSigning') {
            dispatch(storeTransactionData(integrationRequest.transactionData));
          }
          if (integrationRequest.currentIntegrationFlow === 'accountBlockSending') {
            dispatch(storeAccountBlockData(integrationRequest.accountBlockData));
          }
        }

        if (walletNames.length > 0) {
          if (initialPathname.current !== '/tabs') {
            navigate('/password');
          }
        } else if (initialPathname.current !== '/auth') {
          navigate('/auth');
        }

      };

      initializeLayout();

      return () => {
        isCancelled = true;
      };
    }
    return undefined;
  }, [dispatch, isAnimationStopped, navigate]);

  useEffect(() => {
    if (!isWalletSessionOpen) {
      return undefined;
    }

    let isCancelled = false;
    let lastActivityMessageAt = 0;

    const lockWallet = () => {
      if (isCancelled) {
        return;
      }

      isCancelled = true;
      Zenon.getSingleton().clearSocketConnection();
      walletVault.clear();
      dispatch(resetWalletState());
      dispatch(resetIntegrationFlow());
      navigate('/password');
    };

    const handleSessionResponse = (response) => {
      if (!isCancelled && response?.active !== true) {
        lockWallet();
      }
    };

    const refreshActivity = () => {
      const now = Date.now();

      if (now - lastActivityMessageAt < SESSION_ACTIVITY_THROTTLE_MS) {
        return;
      }

      lastActivityMessageAt = now;
      sendSessionMessage('internal.touchCredentials', handleSessionResponse);
    };

    const checkSession = () => {
      sendSessionMessage('internal.checkCredentials', handleSessionResponse);
    };

    ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
      window.addEventListener(eventName, refreshActivity);
    });
    refreshActivity();
    const checkInterval = window.setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);

    return () => {
      isCancelled = true;
      ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
        window.removeEventListener(eventName, refreshActivity);
      });
      window.clearInterval(checkInterval);
    };
  }, [dispatch, isWalletSessionOpen, navigate]);


  return (
    <div className="main-layout">
      { !isAnimationStopped &&
        <Lottie
          {...animationSettings}
          play={!isAnimationStopped}
          onComplete={() => setIsAnimationStopped(true)}
        />
    }
      {
        isAnimationStopped &&
        <>
          <ModalProvider>
            <SpinnerProvider>
              <SilentSpinnerProvider>
                <Routes>
                  <Route path="auth/*" element={<AuthLayout/>} />
                  <Route path="password" element={<DashboardPassword/>}/>
                  <Route path="initial-node-selection" element={<InitialNodeSelection/>}/>
                  <Route path="tabs/*" element={<TabsLayout/>}/>
                  <Route path="site-integration" element={<SiteIntegrationLayout/>}/>
                </Routes>
              </SilentSpinnerProvider>
            </SpinnerProvider>
          </ModalProvider>
          <ToastContainer />
          <div id="modal-root"></div>
          <div id="spinner-root"></div>
        </>
      }

    </div>
  );
};

export default MainLayout;
