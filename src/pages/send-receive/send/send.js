import React, { useEffect, useState, useContext, useRef} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Zenon, Primitives, Enums } from 'znn-ts-sdk';
import fallbackValues from '../../../services/utils/fallbackValues';
import { useSelector } from 'react-redux';
import { ModalContext } from '../../../services/hooks/modal/modalContext';
import AlertModal from '../../../components/modals/alert-modal';
import { useForm } from "react-hook-form";
import { toast } from 'react-toastify';
import ControlledDropdown from '../../../components/custom-dropdown/controlled-dropdown';
import { SilentSpinnerContext } from '../../../services/hooks/silent-spinner/silentSpinnerContext';
import { SAFE_OPERATION_ERROR } from '../../../services/security/safeErrors';
import {
  formatTokenAmount,
  isSufficientRawTokenBalance,
  parseTokenAmount,
} from '../../../services/security/amounts';
import { isWalletSessionActive } from '../../../services/security/session';
import walletVault from '../../../services/security/walletVault';

const isValidRecipientAddress = (value) => {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    return false;
  }

  try {
    return Boolean(Primitives.Address.parse(value));
  } catch {
    return false;
  }
};

const Send = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const availableTokens = Object.keys(fallbackValues.availableTokens);
  const [recipientAddress , setRecipientAddress] = useState("");
  const [sendAmount , setSendAmount] = useState("");
  const [sendStatus , setSendStatus] = useState("");
  const [selectedToken, setSelectedToken] = useState(availableTokens[0]);
  const [walletInfo, setWalletInfo] = useState({
    balanceInfoMap: fallbackValues.availableTokens
  });
  const zenon = Zenon.getSingleton();
  const myAddressObject = useRef({});
  const walletCredentials = useSelector(state => state.wallet);
  const operationInProgress = useRef(false);
  const { handleModal } = useContext(ModalContext);
  const { register, control, handleSubmit, formState: { errors }, reset, setValue } = useForm({mode: "onChange"});
  const { handleSilentSpinner } = useContext(SilentSpinnerContext);

  useEffect(() => {
    getWalletInfo();
    if(location.state?.currentSelectedToken){
      setSelectedToken(location.state?.currentSelectedToken);
      setValue('selectedTokenField', location.state?.currentSelectedToken, {shouldValidate: true});
    }else{
      setSelectedToken(availableTokens[0]);
      setValue('selectedTokenField', availableTokens[0], {shouldValidate: true});
    }
  // Token and balance state are initialized once when the send page opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getWalletInfo = async ()=>{
    try{
      const decrypted = walletVault.getKeyStore();

      if(decrypted){
        const currentKeyPair = walletVault.getKeyPair(walletCredentials.selectedAddressIndex);
        const addr = (await currentKeyPair.getAddress()).toString();
        myAddressObject.current = Primitives.Address.parse(addr);

        const getAccountInfoByAddress = await zenon.ledger.getAccountInfoByAddress(myAddressObject.current);
        if(Object.keys(getAccountInfoByAddress.balanceInfoMap).length) {
          setWalletInfo(getAccountInfoByAddress);
        }
      }
    }
    catch{
      return false;
    }
  }

  const openConfirmModal = (recipientAddress, sendAmount) => {
    handleModal(<AlertModal
        type="confirm"
        title="Are you sure ?"
        onDismiss={()=>onModalDismiss()}
        onSuccess={()=>onModalSuccess(recipientAddress, sendAmount)}>
        <div>
          <div>Are you sure you want to send</div>
          <div>
            <b>{sendAmount} {walletInfo.balanceInfoMap[selectedToken]?.token?.symbol}</b>
            {" to"}
          </div>
          <div className='word-break-all'>{recipientAddress} ?</div>
        </div>
      </AlertModal>)
  }

  const onModalDismiss = ()=>{
  }

  const onModalSuccess = (recipientAddress, sendAmount)=>{
    onFormSubmit(recipientAddress, sendAmount);
  }

  const onFormSubmit = (recipientAddress, sendAmount) => {
    sendTransaction(recipientAddress, sendAmount);
  };

  const sendTransaction = async (address, amount)=>{
    if (operationInProgress.current) {
      return;
    }

    operationInProgress.current = true;
    let showSilentSpinner;
    let showPoWSpinner;
    try{
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      const tokenInfo = walletInfo.balanceInfoMap?.[selectedToken];
      const actualAmount = parseTokenAmount(amount, tokenInfo?.token?.decimals);
      if (actualAmount === null
        || !isSufficientRawTokenBalance(tokenInfo?.balance, actualAmount)) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      const currentKeyPair = await walletVault.getSigningKeyPair(
        walletCredentials.selectedAddressIndex,
      );
      showSilentSpinner = handleSilentSpinner(
        <>
          <div className='text-bold'>
            Sending ...
          </div>
        </>
      );
      showSilentSpinner(true);

      const zenon = Zenon.getSingleton();
      setSendStatus("Sending...");
      const AccountBlockTemplateSend = Primitives.AccountBlockTemplate.send(
        Primitives.Address.parse(address),
        Primitives.TokenStandard.parse(tokenInfo.token.tokenStandard),
        actualAmount,
      );

      showPoWSpinner = handleSilentSpinner(
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
          showSilentSpinner(false);
          showPoWSpinner(true);
        }
        if(powStatus === Enums.PowStatus.done){
          showPoWSpinner(false);
          showSilentSpinner(true);
          toast(`Finished generating plasma`, {
            position: "bottom-center",
            autoClose: 2500,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            newestOnTop: true,
            type: 'success',
            theme: 'dark'
          });
        }
      }

      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      await zenon.send(AccountBlockTemplateSend, currentKeyPair, generatingPowCallback);
      setSendAmount(0);
      setRecipientAddress("");
      setSendStatus("Sent !");
      reset();
      showSilentSpinner(false);

      toast(`Successfully sent ${amount} ${walletInfo.balanceInfoMap[selectedToken]?.token?.symbol}`, {
        position: "bottom-center",
        autoClose: 2500,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        newestOnTop: true,
        type: 'success',
        theme: 'dark'
      });

      setTimeout(()=>{
        setSendStatus("");
      }, 2500);
    }
    catch{
      showSilentSpinner?.(false);
      showPoWSpinner?.(false);
      toast(SAFE_OPERATION_ERROR,{
        position: "bottom-center",
        autoClose: 2500,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        newestOnTop: true,
        type: 'error',
        theme: 'dark'
      });

      setSendStatus("Error");
      setTimeout(()=>{
        setSendStatus("");
      }, 2500);
    } finally {
      operationInProgress.current = false;
    }
  }

  const onSelectToken = (index, value) => {
    setSelectedToken(value.token.tokenStandard);
    setValue('selectedTokenField', value.token.tokenStandard, {shouldValidate: true});
  }

  const selectedTokenInfo = walletInfo.balanceInfoMap?.[selectedToken];
  const maxAmount = formatTokenAmount(
    selectedTokenInfo?.balance?.toString() || '0',
    selectedTokenInfo?.token?.decimals ?? fallbackValues.decimals,
  ) || '0';

  return (
    <div className='black-bg'>
      <h1 className='mt-1'>Send</h1>
      <div className='mt-2 ml-2 mr-2'>
        <form onSubmit={handleSubmit(()=>openConfirmModal(recipientAddress, sendAmount))}>
          <div className='custom-control'>
            <ControlledDropdown dropdownComponent = 'TokenDropdown'
              {...register("selectedTokenField", { required: true })} control={control}
              name="selectedTokenField"
              options={Object.keys(walletInfo.balanceInfoMap).map((value)=>{return walletInfo.balanceInfoMap[value]})}
              onChange={onSelectToken}
              value={selectedToken}
              placeholder="Select token"
              tokenSymbolPath={`token.symbol`}
              tokenStandardPath={`token.tokenStandard`}
              className={`${errors.selectedTokenField?'custom-label-error':''}`} />

            <div className={`input-error ${errors.selectedTokenField?'':'invisible'}`}>
              {errors.selectedTokenField?.message || 'Token is required'}
            </div>
          </div>

          <div className='custom-control'>
            <div className={`input-with-button w-100`}>
              <input name="sendAmountField" {...register("sendAmountField",
                { required: true,
                  validate: (input) => {
                    const tokenInfo = walletInfo.balanceInfoMap?.[selectedToken];
                    const rawAmount = parseTokenAmount(input, tokenInfo?.token?.decimals);
                    if (rawAmount === null) {
                      return 'Enter a valid amount with supported precision';
                    }
                    return isSufficientRawTokenBalance(tokenInfo?.balance, rawAmount)
                      || 'Insufficient balance';
                  }
                })}
                control={control}
                className={`w-100 custom-label pr-3 ${errors.sendAmountField?'custom-label-error':''}`}
                placeholder={walletInfo.balanceInfoMap[selectedToken]?.token?.symbol + " amount"}
                value={sendAmount} onChange={(e) => {setSendAmount(e.target.value); setValue('sendAmountField', e.target.value, {shouldValidate: true})}} type='text' inputMode='decimal'></input>
              <div className={(walletInfo.balanceInfoMap[selectedToken]?.token?.symbol==='ZNN'?'primary':'blue') + " input-chip-button"}
                onClick={()=>{setSendAmount(maxAmount); setValue('sendAmountField', maxAmount, { shouldValidate: true })}}>
                <span>{"MAX: " + maxAmount}</span>
              </div>
            </div>

            <div className={`input-error ${errors.sendAmountField?'':'invisible'}`}>
              { errors.sendAmountField?.message || 'Amount is required'}
            </div>
          </div>

          <div className='custom-control'>
            <input name="recipientAddressField" {...register("recipientAddressField", {
              required: true,
              validate: (input) => isValidRecipientAddress(input) || 'Enter a valid Zenon address',
            })}
              className={`w-100 custom-label ${errors.recipientAddressField?'custom-label-error':''}`}
              placeholder="Recipient address" value={recipientAddress} onChange={(e) => {setRecipientAddress(e.target.value); setValue('recipientAddressField', e.target.value, {shouldValidate: true})}} type='text'></input>

            <div className={`input-error ${errors.recipientAddressField?'':'invisible'}`}>
              { errors.recipientAddressField?.message || 'Address is required'}
            </div>
          </div>

          <div className='d-flex'>
            <div onClick={() => navigate(-1)} className='button secondary w-100 mr-2 d-flex justify-content-center'>
              Back
            </div>
            <input className={(walletInfo.balanceInfoMap[selectedToken]?.token?.symbol==='ZNN'?'primary':'blue') + " button w-100 d-flex justify-content-center text-white"}
              value={sendStatus || "Send"} type="submit" name="submitButton"></input>
          </div>
        </form>
      </div>
  </div>
  );
};

export default Send;
