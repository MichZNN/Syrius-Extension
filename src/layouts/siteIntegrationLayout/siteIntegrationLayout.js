/**
 * Display and approve a bridge request after the user has unlocked the wallet.
 */
/* global BigInt */

import React, {useState, useEffect, useRef, useContext} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { nextIntegrationStep } from '../../services/redux/integrationSlice';
import { Zenon, Primitives } from 'znn-ts-sdk';
import TransactionItem from '../../components/transaction-item/transaction-item';
import fallbackValues from '../../services/utils/fallbackValues';
import { toast } from 'react-toastify';
import { SpinnerContext } from '../../services/hooks/spinner/spinnerContext';
import { Enums, utils } from "znn-ts-sdk";
import { isAllowedBridgeUrl } from '../../services/security/bridgeOrigins';
import {
  isSafeBridgeAmount,
  isValidBridgeRequest,
} from '../../services/security/bridgeValidation';
import {
  formatTokenAmount,
  parseSafeRawTokenAmount,
} from '../../services/security/amounts';
import { SAFE_OPERATION_ERROR } from '../../services/security/safeErrors';
import {
  isIntegrationRequestActive,
  isWalletSessionActive,
} from '../../services/security/session';
import walletVault from '../../services/security/walletVault';
import { sendRuntimeMessage } from '../../services/security/runtimeMessage';

const isSafeTokenInfo = (tokenInfo, tokenStandard) => {
  const token = tokenInfo?.token;
  const decimals = Number(token?.decimals);
  const balance = typeof tokenInfo?.balance === 'number'
    ? Number.isSafeInteger(tokenInfo.balance) && tokenInfo.balance >= 0
      ? String(tokenInfo.balance)
      : null
    : tokenInfo?.balance;

  return Boolean(token)
    && token.tokenStandard?.toString() === tokenStandard
    && Number.isInteger(decimals)
    && decimals >= 0
    && decimals <= 18
    && typeof token.symbol === 'string'
    && token.symbol.length > 0
    && token.symbol.length <= 32
    && typeof balance === 'string'
    && /^\d+$/.test(balance)
    && balance.length <= 128;
};

const isSufficientBalance = (tokenInfo, tokenStandard, requestedAmount) => {
  if (!isSafeTokenInfo(tokenInfo, tokenStandard)
    || !isSafeBridgeAmount(requestedAmount)) {
    return false;
  }

  const balance = typeof tokenInfo.balance === 'number'
    ? String(tokenInfo.balance)
    : tokenInfo.balance;

  return typeof balance === 'string'
    && /^\d+$/.test(balance)
    && BigInt(balance) >= BigInt(String(requestedAmount));
};

const InsecureBridgeWarning = ({ visible }) => visible ? (
  <p className='text-warning text-xs mt-2' role='alert'>
    Warning: this bridge uses unencrypted HTTP. Continue only if you trust this network and website.
  </p>
) : null;

const sendIntegrationMessage = (message, requestId) => sendRuntimeMessage({
  ...message,
  requestId,
}, { fallback: null });

const rejectIntegrationRequest = async (message, error, requestId) => {
  await sendIntegrationMessage({
    message,
    error,
    data: {},
  }, requestId);
  window.close();
};

const SiteIntegrationLayout = ()=>{
  const [address, setAddress] = useState("");
  const [signedHash, setSignedHash] = useState({});
  const dispatch = useDispatch();
  const integrationState = useSelector(state => state.integrationFlow);
  const walletCredentials = useSelector(state => state.wallet);
  const myAddressObject = useRef({});
  const operationInProgress = useRef(false);
  const connectionParameters = useSelector(state => state.connectionParameters)
  const integrationRequestId = integrationState.requestId;
  const zenon = Zenon.getSingleton();
  const [walletInfo, setWalletInfo] = useState({
    balanceInfoMap: fallbackValues.availableTokens
  });
  const [isFormValid, setIsFormValid] = useState(false);
  const [displayedBlock, setDisplayedBlock] = useState({});
  const { handleSpinner } = useContext(SpinnerContext);
  const requestedTokenStandard = integrationState.transactionData?.tokenStandard;
  const requestedTokenInfo = walletInfo.balanceInfoMap?.[requestedTokenStandard];
  const requestedBalance = formatTokenAmount(
    requestedTokenInfo?.balance,
    requestedTokenInfo?.token?.decimals,
  );
  const requestedAmount = formatTokenAmount(
    integrationState.transactionData?.amount,
    requestedTokenInfo?.token?.decimals,
  );
  const hasTrustedSiteOrigin = isAllowedBridgeUrl(integrationState.siteOrigin);
  const usesInsecureBridgeTransport = integrationState.siteOrigin.startsWith('http://');
  const canApproveTransaction = isFormValid
    && hasTrustedSiteOrigin
    && isValidBridgeRequest('znn.sendTransactionToSigning', integrationState.transactionData)
    && isSafeTokenInfo(requestedTokenInfo, requestedTokenStandard);
  const canApproveAccountBlock = isFormValid
    && hasTrustedSiteOrigin
    && isValidBridgeRequest(
      'znn.sendAccountBlockToSend',
      integrationState.accountBlockData,
    );


  useEffect(()=>{
    async function fetchData() {
      try {
        if (!hasTrustedSiteOrigin) {
          setIsFormValid(false);
          return;
        }

        const walletLoaded = await getWalletInfo();
        if (!walletLoaded) {
          setIsFormValid(false);
          return;
        }

        if(integrationState.currentIntegrationFlow === 'accountBlockSending' ){
          const filledBlock = await setSendingBlockFields();
          setDisplayedBlock(filledBlock.toJson());
        }

        if(integrationState.currentIntegrationFlow === 'transactionSigning' ){
          const filledBlock = await setSigningBlockFields();
          setDisplayedBlock(filledBlock.toJson());
        }

        if(integrationState.currentIntegrationStep === "opening"){
          dispatch(nextIntegrationStep());
        }
        setIsFormValid(true);
      } catch {
        setIsFormValid(false);
        toast(SAFE_OPERATION_ERROR, {
          position: 'bottom-center',
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: false,
          draggable: true,
          newestOnTop: true,
          type: 'error',
          theme: 'dark',
        });
      }
    }
    fetchData();
    // The approval window consumes the request snapshot it was opened for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSendingBlockFields = async() => {
    if (!isValidBridgeRequest(
      'znn.sendAccountBlockToSend',
      integrationState.accountBlockData,
    )) {
      throw new Error(SAFE_OPERATION_ERROR);
    }

    const decrypted = walletVault.getKeyStore();
    if (!decrypted) {
      throw new Error(SAFE_OPERATION_ERROR);
    }
    const currentKeyPair = walletVault.getKeyPair(walletCredentials.selectedAddressIndex);
    const transaction = Primitives.AccountBlockTemplate.fromJson(integrationState.accountBlockData);

    return utils.BlockUtils._checkAndSetFields(zenon, transaction, currentKeyPair)
  }

  const setSigningBlockFields = async() => {
    if (!isValidBridgeRequest(
      'znn.sendTransactionToSigning',
      integrationState.transactionData,
    )) {
      throw new Error(SAFE_OPERATION_ERROR);
    }

    const decrypted = walletVault.getKeyStore();
    if (!decrypted) {
      throw new Error(SAFE_OPERATION_ERROR);
    }
    const currentKeyPair = walletVault.getKeyPair(walletCredentials.selectedAddressIndex);
    const rawAmount = parseSafeRawTokenAmount(integrationState.transactionData.amount);
    if (rawAmount === null) {
      throw new Error(SAFE_OPERATION_ERROR);
    }
    const transaction = Primitives.AccountBlockTemplate.send(
      Primitives.Address.parse(integrationState.transactionData.to),
      Primitives.TokenStandard.parse(integrationState.transactionData.tokenStandard),
      rawAmount);

    return utils.BlockUtils._checkAndSetFields(zenon, transaction, currentKeyPair)
  }


  const getAddress = async()=>{
    if (!hasTrustedSiteOrigin
      || !isFormValid
      || !(await isWalletSessionActive())
      || !(await isIntegrationRequestActive(integrationRequestId))) {
      setIsFormValid(false);
      return;
    }

    const walletLoaded = await getWalletInfo();
    if (!walletLoaded) {
      setIsFormValid(false);
      return;
    }

    const forwarded = await sendIntegrationMessage({
      message: "znn.grantedWalletRead",
      data: {
        address: myAddressObject.current.toString(),
        chainId: connectionParameters.chainIdentifier,
        nodeUrl: connectionParameters.nodeUrl
      }
    }, integrationRequestId);

    if (forwarded?.ok !== true) {
      setIsFormValid(false);
      return;
    }

    dispatch(nextIntegrationStep());
  }

  const denyWalletRead = async () => {
    await rejectIntegrationRequest(
      'znn.deniedWalletRead',
      'User denied wallet read',
      integrationRequestId,
    );
  }

  const signTransaction = async()=>{
    const requestedAmount = integrationState.transactionData?.amount;

    if (!(await isWalletSessionActive())) {
      setIsFormValid(false);
      toast(SAFE_OPERATION_ERROR, {
        position: 'bottom-center',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: false,
        draggable: true,
        newestOnTop: true,
        type: 'error',
        theme: 'dark',
      });
      return;
    }

    if (isFormValid
      && hasTrustedSiteOrigin
      && isValidBridgeRequest('znn.sendTransactionToSigning', integrationState.transactionData)
      && isSufficientBalance(requestedTokenInfo, requestedTokenStandard, requestedAmount)) {
        if (operationInProgress.current) {
          return;
        }

        operationInProgress.current = true;
        setIsFormValid(true);
        let showSpinner;
        let showPoWSpinner;
        try {
          showSpinner = handleSpinner(
          <>
      <div className='text-bold'>
              Sending ...
            </div>
          </>
          );
          showSpinner(true);

          const rawAmount = parseSafeRawTokenAmount(integrationState.transactionData.amount);
          if (rawAmount === null) {
            throw new Error(SAFE_OPERATION_ERROR);
          }

          const accountBlockTemplateSend = Primitives.AccountBlockTemplate.send(
            Primitives.Address.parse(integrationState.transactionData.to),
            Primitives.TokenStandard.parse(integrationState.transactionData.tokenStandard),
            rawAmount);

          const decrypted = walletVault.getKeyStore();
          if (!decrypted) {
            throw new Error(SAFE_OPERATION_ERROR);
          }
          if(decrypted){
            const currentKeyPair = walletVault.getKeyPair(walletCredentials.selectedAddressIndex);

            showPoWSpinner = handleSpinner(
              <>
                <div className='text-bold'>
                  Sending ...
                </div>
                <div className='text-bold'>
                  Generating Plasma ...
                </div>
              </>
            );
            const generatingPowCallback = (powStatus)=>{
              if(powStatus === Enums.PowStatus.generating){
                showSpinner(false);
                showPoWSpinner(true);
              }
              if(powStatus === Enums.PowStatus.done){
                showPoWSpinner(false);
                showSpinner(true);
              }
            }

            if (!(await isWalletSessionActive())) {
              throw new Error(SAFE_OPERATION_ERROR);
            }

            if (!(await isIntegrationRequestActive(integrationRequestId))) {
              throw new Error(SAFE_OPERATION_ERROR);
            }

            const signedTransaction = await zenon.send(accountBlockTemplateSend, currentKeyPair, generatingPowCallback);
            setSignedHash(signedTransaction.hash.toString());
            const forwarded = await sendIntegrationMessage({
              message: "znn.signedTransaction",
              data: {
                originalTransaction: integrationState.transactionData,
                accountBlock: accountBlockTemplateSend.toJson(),
                signedTransaction: signedTransaction.toJson()
              }
            }, integrationRequestId);

            if (forwarded?.ok !== true) {
              throw new Error(SAFE_OPERATION_ERROR);
            }

            dispatch(nextIntegrationStep());
            showSpinner(false);
          }
        }
        catch{
          showSpinner?.(false);
          showPoWSpinner?.(false);
          await rejectIntegrationRequest(
            'znn.deniedSignTransaction',
            'User denied transaction signing',
            integrationRequestId,
          );
          toast(SAFE_OPERATION_ERROR,{
            position: "bottom-center",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: false,
            draggable: true,
            newestOnTop: true,
            type: 'error',
            theme: 'dark'
          });
        } finally {
          operationInProgress.current = false;
        }
      }else{
        setIsFormValid(false);
        toast(SAFE_OPERATION_ERROR, {
          position: 'bottom-center',
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: false,
          draggable: true,
          newestOnTop: true,
          type: 'error',
          theme: 'dark',
        });
      }
  }

  const denySignTransaction = async () => {
    await rejectIntegrationRequest(
      'znn.deniedSignTransaction',
      'User denied transaction signing',
      integrationRequestId,
    );
  }

  const sendAccountBlock = async()=>{
      if (!isFormValid
        || !hasTrustedSiteOrigin
        || !isValidBridgeRequest(
          'znn.sendAccountBlockToSend',
          integrationState.accountBlockData,
        )) {
        setIsFormValid(false);
        return;
      }

      if (!(await isWalletSessionActive())) {
        setIsFormValid(false);
        return;
      }

      if (operationInProgress.current) {
        return;
      }

      operationInProgress.current = true;
      setIsFormValid(true);
      let showSpinner;
      let showPoWSpinner;

      try{
        showSpinner = handleSpinner(
          <>
            <div className='text-bold'>
              Sending ...
            </div>
          </>
        );
        showSpinner(true);

        const accountBlockTemplateSend = Primitives.AccountBlockTemplate.fromJson(integrationState.accountBlockData);
        const decrypted = walletVault.getKeyStore();
        if (!decrypted) {
          throw new Error(SAFE_OPERATION_ERROR);
        }

        if(decrypted){
          const currentKeyPair = walletVault.getKeyPair(walletCredentials.selectedAddressIndex);
          showPoWSpinner = handleSpinner(
            <>
              <div className='text-bold'>
                Sending ...
              </div>
              <div className='text-bold'>
                Generating Plasma ...
              </div>
            </>
          );
          const generatingPowCallback = (powStatus)=>{
            if(powStatus === Enums.PowStatus.generating){
              showSpinner(false);
              showPoWSpinner(true);
            }
            if(powStatus === Enums.PowStatus.done){
              showPoWSpinner(false);
              showSpinner(true);
            }
          }

          const completedBlock = await utils.BlockUtils._checkAndSetFields(zenon, accountBlockTemplateSend, currentKeyPair)

          if (!(await isWalletSessionActive())) {
            throw new Error(SAFE_OPERATION_ERROR);
          }

          if (!(await isIntegrationRequestActive(integrationRequestId))) {
            throw new Error(SAFE_OPERATION_ERROR);
          }

          const signedTransaction = await zenon.send(completedBlock, currentKeyPair, generatingPowCallback);
          setSignedHash(signedTransaction.hash.toString());

          const forwarded = await sendIntegrationMessage({
            message: "znn.accountBlockSent",
            data: {
              originalTransaction: integrationState.accountBlockData,
              accountBlock: completedBlock.toJson(),
              signedTransaction: signedTransaction.toJson()
            }
          }, integrationRequestId);

          if (forwarded?.ok !== true) {
            throw new Error(SAFE_OPERATION_ERROR);
          }

          dispatch(nextIntegrationStep());
          showSpinner(false);
        }
      }
      catch{
        showSpinner?.(false);
        showPoWSpinner?.(false);
        await rejectIntegrationRequest(
          'znn.deniedSendAccountBlock',
          'User denied sending account block',
          integrationRequestId,
        );
          toast(SAFE_OPERATION_ERROR,{
          position: "bottom-center",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: false,
          draggable: true,
          newestOnTop: true,
          type: 'error',
          theme: 'dark'
        });
      }
      finally {
        operationInProgress.current = false;
      }
  }

  const denySendAccountBlock = async () => {
    await rejectIntegrationRequest(
      'znn.deniedSendAccountBlock',
      'User denied sending account block',
      integrationRequestId,
    );
  }

  const getWalletInfo = async ()=>{
    try{
      const decrypted = walletVault.getKeyStore();

      if(decrypted){
        const currentKeyPair = walletVault.getKeyPair(walletCredentials.selectedAddressIndex);
        const addr = (await currentKeyPair.getAddress()).toString();
        myAddressObject.current = Primitives.Address.parse(addr);
        setAddress(addr);

        const getAccountInfoByAddress = await zenon.ledger.getAccountInfoByAddress(myAddressObject.current);

        if(Object.keys(getAccountInfoByAddress.balanceInfoMap || {}).length) {
          getAccountInfoByAddress.balanceInfoMap = {
            ...walletInfo.balanceInfoMap,
            ...getAccountInfoByAddress.balanceInfoMap,
          };
          setWalletInfo(getAccountInfoByAddress);
        }

        return true;
      }
      return false;
    }
    catch{
      toast(SAFE_OPERATION_ERROR,{
        position: "bottom-center",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: false,
        draggable: true,
        newestOnTop: true,
        type: 'error',
        theme: 'dark'
      });
      return false;
    }
  }

  return (
    <div className='text-white align-items-center d-flex h-100 justify-content-center' style={{height: '100vh'}}>
        { integrationState.currentIntegrationFlow === 'walletAccess' ?
            <div className="w-100">
              {
                integrationState.currentIntegrationStep === 'accepting' ?
                  <div className="mr-2 ml-2 max-w-100vw">
                    <div className='tooltip'>
                      <p className="text-xs mb-0">Current Address</p>
                      <span className="text-xs text-gray word-break-all" onClick={() => {try{navigator.clipboard.writeText(address); toast(`Copied to clipboard`, {
                                position: "bottom-center",
                                autoClose: 1000,
                                hideProgressBar: true,
                                closeOnClick: true,
                                pauseOnHover: false,
                                draggable: true,
                                newestOnTop: true,
                                type: 'success',
                                theme: 'dark'
                              })}catch{}
                            }}>{address}</span>
                        <span className='tooltip-text mt-4'>Click to copy. Go to settings to change address.</span>
                    </div>

                    <h3 className="mt-4">Do you grant this website permission to read your <b>Address</b>, <b>Chain Identifier</b> and <b>Node URL</b> ?</h3>
                    <InsecureBridgeWarning visible={usesInsecureBridgeTransport} />
                    <div className='d-flex w-100 justify-content-around mt-4'>
                      <div onClick={()=>{denyWalletRead()}} className='button secondary pl-5 pr-5'>No</div>
                      <div onClick={()=>{getAddress()}} className={`button primary pl-5 pr-5 ${isFormValid?'':'disabled'}`}>Yes</div>
                    </div>
                    <h5 className='text-gray mt-4 d-flex'>
                      <img alt="" className='mr-1' src={require(`./../../assets/info-icon.svg`)} width='18px'></img>
                      <span>You can change the current wallet and address from the Syrius Extension Settings</span>
                    </h5>
                  </div>
                :''
              }
            <div>
            </div>
              {
                integrationState.currentIntegrationStep === 'displayingInfo' ?
                  <div className="mr-2 ml-2 max-w-100vw">
                    <h3>Granted <b>read</b> access to</h3>
                    <p className="text-xs mb-0 mt-4">Website origin</p>
                    <span className="text-xs text-gray word-break-all">{integrationState.siteOrigin}</span>
                    <p className="text-xs mb-0 mt-5">Address</p>
                    <span className="text-xs text-gray word-break-all">{address}</span>

                    <p className="text-xs mb-0 mt-2">Chain identifier</p>
                    <span className="text-xs text-gray word-break-all">{connectionParameters.chainIdentifier}</span>

                    <p className="text-xs mb-0 mt-2">Current node</p>
                    <span className="text-xs text-gray word-break-all">{connectionParameters.nodeUrl}</span>

                    <div className='d-flex mt-5 w-100 justify-content-center'>
                        <div onClick={()=>{window.close()}} className='button primary pl-5 pr-5'>Done</div>
                      </div>
                  </div>

                :''
              }
            </div>
          :''
        }

        { integrationState.currentIntegrationFlow === 'transactionSigning' ?
            <div className="w-100">
              {
                integrationState.currentIntegrationStep === 'accepting' ?
                  <div>
                    <div className='ml-2 mr-2 d-flex justify-content-center max-w-100vw'>
                      <div className='wallet-circle circle-green'>
                        <h4 className='m-0 text-gray'>Available</h4>
                        {isSafeTokenInfo(requestedTokenInfo, requestedTokenStandard) ? (
                          <h2 className='mb-0 mt-1 tooltip'>
                            <span className='m-0 '>{requestedBalance}</span>
                            <span className='mb-0 text-gray'> {requestedTokenInfo.token.symbol}</span>
                            <span className='tooltip-text'>{requestedBalance}</span>
                          </h2>
                        ) : (
                          <p className='text-gray text-center'>Token information unavailable. Approval is blocked.</p>
                        )}

                        <h4 onClick={() => {try{navigator.clipboard.writeText(address); toast(`Copied to clipboard`, {
                              position: "bottom-center",
                              autoClose: 1000,
                              hideProgressBar: true,
                              closeOnClick: true,
                              pauseOnHover: false,
                              draggable: true,
                              newestOnTop: true,
                              type: 'success',
                              theme: 'dark'
                            })}catch{}
                          }} className='mb-0 mt-1 text-gray tooltip'>
                          {address.slice(0, 3) + '...' + address.slice(-3)}
                          <span className='tooltip-text'>{address}</span>
                        </h4>
                      </div>
                    </div>
                    <div className="mt-4 mr-2 ml-2">
                      <h3>Do you want to make this transaction ?</h3>
                      <InsecureBridgeWarning visible={usesInsecureBridgeTransport} />
                      <p className="text-xs text-gray word-break-all">Requested by {integrationState.siteOrigin}</p>
                      <p className="text-xs text-gray word-break-all">Chain ID {connectionParameters.chainIdentifier}</p>
                      <p className="text-xs text-gray word-break-all">Node {connectionParameters.nodeUrl}</p>
                      <p className="text-xs text-gray word-break-all">Token standard {requestedTokenStandard}</p>
                      {isSafeTokenInfo(requestedTokenInfo, requestedTokenStandard) && (
                        <TransactionItem displayFullAddress={false} type="send" amount={requestedAmount}
                        tokenSymbol={requestedTokenInfo.token.symbol} address={integrationState.transactionData.to}></TransactionItem>
                      )}

                      <div className='d-flex mt-4 w-100 justify-content-around'>
                        <div onClick={()=>{denySignTransaction()}} className='button secondary pl-5 pr-5'>No</div>
                        <div onClick={()=>{signTransaction()}} className={`button primary pl-5 pr-5 ${canApproveTransaction?'':'disabled'}`}>Yes</div>
                      </div>

                      <h5 className='text-gray mt-4 d-flex'>
                        <img alt="" className='mr-1' src={require(`./../../assets/info-icon.svg`)} width='18px'></img>
                        <span>You can change the current wallet and address from the Syrius Extension Settings</span>
                      </h5>

                    </div>
                  </div>
                :''
              }
              <div>
              </div>
              {
                integrationState.currentIntegrationStep === 'displayingInfo' ?
                <div className="mr-2 ml-2 max-w-100vw">
                  <h3>Transaction successfully executed !</h3>
                  <p className="text-xs mt-5">Transaction hash</p>
                  <span className="text-xs text-gray word-break-all">{signedHash}</span>

                  <div className='d-flex mt-4 w-100 justify-content-center'>
                      <div onClick={()=>{window.close()}} className='button primary pl-5 pr-5'>Done</div>
                    </div>
                </div>
                :''
              }
            </div>
          :''
        }

      { integrationState.currentIntegrationFlow === 'accountBlockSending' ?
            <div className="w-100">
              {
                integrationState.currentIntegrationStep === 'accepting' ?
                  <div>
                    <div className='tooltip'>
                      <p className="text-xs mb-0 mt-5">Current Address</p>
                      <span className="text-xs text-gray word-break-all" onClick={() => {try{navigator.clipboard.writeText(address); toast(`Copied to clipboard`, {
                                position: "bottom-center",
                                autoClose: 1000,
                                hideProgressBar: true,
                                closeOnClick: true,
                                pauseOnHover: false,
                                draggable: true,
                                newestOnTop: true,
                                type: 'success',
                                theme: 'dark'
                              })}catch{}
                            }}>{address}</span>
                        <span className='tooltip-text mt-4'>Click to copy. Go to settings to change address.</span>
                    </div>

                    <div className="mt-4 mr-2 ml-2 max-w-100vw">
                      <h3>Do you want to send this account block ?</h3>
                      <InsecureBridgeWarning visible={usesInsecureBridgeTransport} />
                      <p className="text-xs text-gray word-break-all">Requested by {integrationState.siteOrigin}</p>
                      <p className="text-xs text-gray word-break-all">Chain ID {connectionParameters.chainIdentifier}</p>
                      <p className="text-xs text-gray word-break-all">Node {connectionParameters.nodeUrl}</p>
                      <pre style={{maxHeight: '220px', overflow: 'scroll', textAlign: 'left'}}>
                        {JSON.stringify(displayedBlock, undefined, 2)}
                      </pre>

                      <div className='d-flex mt-4 w-100 justify-content-around max-w-100vw'>
                        <div onClick={()=>{denySendAccountBlock()}} className='button secondary pl-5 pr-5'>No</div>
                        <div onClick={()=>{sendAccountBlock()}} className={`button primary pl-5 pr-5 ${canApproveAccountBlock?'':'disabled'}`}>Yes</div>
                      </div>

                      <h5 className='text-gray mt-4 d-flex'>
                        <img alt="" className='mr-1' src={require(`./../../assets/info-icon.svg`)} width='18px'></img>
                        <span>You can change the current wallet and address from the Syrius Extension Settings</span>
                      </h5>

                    </div>
                  </div>
                :''
              }
              <div>
              </div>
              {
                integrationState.currentIntegrationStep === 'displayingInfo' ?
                <div className="mr-2 ml-2">
                  <h3>Account block sent !</h3>
                  <p className="text-xs mt-5">Transaction hash</p>
                  <span className="text-xs text-gray word-break-all">{signedHash}</span>

                  <div className='d-flex mt-4 w-100 justify-content-center'>
                      <div onClick={()=>{window.close()}} className='button primary pl-5 pr-5'>Done</div>
                    </div>
                </div>
                :''
              }
            </div>
          :''
        }
    </div>
  );
};

export default SiteIntegrationLayout;
