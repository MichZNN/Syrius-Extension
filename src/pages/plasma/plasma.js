/* global BigInt */

import React, { useEffect, useState, useRef, useContext } from 'react';
import { Zenon, Primitives } from 'znn-ts-sdk';
import fallbackValues from '../../services/utils/fallbackValues';
import FuseItem from '../../components/fuse-item/fuse-item';
import { motion } from 'framer-motion';
import animationVariants from '../../layouts/tabsLayout/animationVariants';
import { useSelector } from 'react-redux';
import AlertModal from '../../components/modals/alert-modal';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import { toast } from 'react-toastify';
import { useForm } from 'react-hook-form';
import { SpinnerContext } from '../../services/hooks/spinner/spinnerContext';
import { SAFE_OPERATION_ERROR } from '../../services/security/safeErrors';
import {
  formatTokenAmount,
  isSufficientRawTokenBalance,
  parseTokenAmount,
} from '../../services/security/amounts';
import { isWalletSessionActive } from '../../services/security/session';
import walletVault from '../../services/security/walletVault';

const Plasma = () => {
  const [qsrAmount, setQsrAmount] = useState('0');
  const [qsrBalance, setQsrBalance] = useState("0");
  const [fusedQsrAmount, setFusedQsrAmount] = useState("");
  const [toFuseAmount, setToFuseAmount] = useState("");
  const [noFusedTransactionsLabel, setNoFusedTransactionsLabel] = useState(false);
  const [fuseLabel, setFuseLabel] = useState("Fuse plasma");
  const [plasmaStatus, setPlasmaStatus] = useState("no-plasma");
  const [fuseItems, setFuseItems] = useState([]);
  const myAddressObject = useRef(null);
  const currentKeyPair = useRef({});
  const operationInProgress = useRef(false);
  const momentumHeight = useRef({});
  const zenon = Zenon.getSingleton();
  const [shouldLoadMore, setShouldLoadMore] = useState(true);
  const fuseItemsListObserver = useRef({});
  const fuseItemsLoading = useRef(false);
  const currentFuseItemsPage = useRef(0);
  const pageSize = 5;
  const walletCredentials = useSelector(state => state.wallet);
  const { handleModal } = useContext(ModalContext);
  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm();
  const { handleSpinner } = useContext(SpinnerContext);

  useEffect(() => {
    const loadMoreFuseItemsTrigger = document.getElementById("loadMoreFuseItemsTrigger");
      const fetchData = async() => {
        await getWalletInfo();
        if (loadMoreFuseItemsTrigger) {
          fuseItemsListObserver.current = (new IntersectionObserver(loadFuseItems, {
          root: null,
          rootMargin: `0px 0px 0px 0px`,
          threshold: 1.0
          }));
          fuseItemsListObserver.current.observe(loadMoreFuseItemsTrigger);
        }
      }
      fetchData();

      return ()=>{
        fuseItemsListObserver.current?.disconnect?.();
      }
  // Plasma data and its observer are initialized once per page instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getWalletInfo = async ()=>{
    try{
      const decrypted = walletVault.getKeyStore();

      if(decrypted){
        currentKeyPair.current = walletVault.getKeyPair(walletCredentials.selectedAddressIndex);
        const addr = (await currentKeyPair.current.getAddress()).toString();
        myAddressObject.current = Primitives.Address.parse(addr);

        const getAccountInfoByAddress = await zenon.ledger.getAccountInfoByAddress(myAddressObject.current);
        if(Object.keys(getAccountInfoByAddress.balanceInfoMap).length) {
          if(getAccountInfoByAddress.balanceInfoMap['zts1qsrxxxxxxxxxxxxxmrhjll']){
            const qsrTokenInfo = getAccountInfoByAddress.balanceInfoMap['zts1qsrxxxxxxxxxxxxxmrhjll'];
            setQsrBalance(qsrTokenInfo.balance);
            setQsrAmount(formatTokenAmount(
              qsrTokenInfo.balance,
              fallbackValues.availableTokens["zts1qsrxxxxxxxxxxxxxmrhjll"]?.token.decimals || fallbackValues.decimals,
            ) || '0');
          }
        }

        const getFrontierMomentum = await zenon.ledger.getFrontierMomentum();
        momentumHeight.current = getFrontierMomentum.height;
      }
    }
    catch{
      return false;
    }
  }

  const transformFuseItem = (fuseItem) =>{
    return{
      amount: formatTokenAmount(
        fuseItem.qsrAmount,
        fallbackValues.availableTokens["zts1qsrxxxxxxxxxxxxxmrhjll"]?.token.decimals || fallbackValues.decimals,
      ) || '0',
      beneficiary: fuseItem.beneficiary.toString(),
      expiration: (fuseItem.expirationHeight - momentumHeight.current)*10/3600,
      id: fuseItem.id
    }
  }

  const onFormSubmit = (toFuseAmount) => {
    openFuseModal(toFuseAmount);
  };

  const openFuseModal = (toFuseAmount) => {
    handleModal(<AlertModal
        type="confirm"
        title="Are you sure ?"
        onDismiss={()=>onFuseDismiss()}
        onSuccess={()=>onFuseSuccess(toFuseAmount)}>
        <div>
          <div>Are you sure you want to fuse</div>
          <div>
            <b>{toFuseAmount} QSR</b> ?
          </div>
        </div>
      </AlertModal>)
  }

  const onFuseDismiss = ()=>{
  }

  const onFuseSuccess = (toFuseAmount)=>{
    fusePlasma(toFuseAmount);
  }

  const fusePlasma = async (toFuseAmount) => {
    if (operationInProgress.current) {
      return;
    }

    operationInProgress.current = true;
    let showSpinner;
    try{
      showSpinner = handleSpinner(
        <div>
          Fusing {toFuseAmount} QSR
        </div>
      );
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      showSpinner(true);
      setFuseLabel("Fusing...");
      const decimals = fallbackValues.availableTokens["zts1qsrxxxxxxxxxxxxxmrhjll"]?.token.decimals || fallbackValues.decimals;
      const amountWithDecimals = parseTokenAmount(toFuseAmount, decimals);
      const minimumFuseAmount = parseTokenAmount('10', decimals);
      if (amountWithDecimals === null
        || amountWithDecimals < minimumFuseAmount
        || !isSufficientRawTokenBalance(qsrBalance, amountWithDecimals)) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      const fuse = await zenon.embedded.plasma.fuse(myAddressObject.current, amountWithDecimals);
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      await zenon.send(fuse, currentKeyPair.current);
      setToFuseAmount("");
      setFuseLabel("Fused !");
      reset();

      toast(`Successfully fused ${toFuseAmount} QSR`, {
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

      showSpinner(false);
      setTimeout(()=>{
        setFuseLabel("Fuse plasma");
      }, 2500);
    }
    catch{
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
      setFuseLabel("Error fusing");
      showSpinner?.(false);

      setTimeout(()=>{
        setFuseLabel("Fuse plasma");
      }, 2500);

    } finally {
      operationInProgress.current = false;
    }
  }

  const openCancelFuseModal = (fuseId) => {
    handleModal(<AlertModal
        type="warning"
        title="Are you sure ?"
        onDismiss={()=>onCancelFuseDismiss()}
        onSuccess={()=>onCancelFuseSuccess(fuseId)}>
        <div>
          <div>Are you sure you want to cancel fuse</div>
          <div>
            <b className='word-break-all text-sm text-gray'>{fuseId.toString()}</b> ?
          </div>
        </div>
      </AlertModal>)
  }

  const onCancelFuseDismiss = ()=>{
  }

  const onCancelFuseSuccess = (fuseId)=>{
    cancelFuse(fuseId);
  }

  const cancelFuse = async (fuseId) => {
    if (operationInProgress.current) {
      return;
    }

    operationInProgress.current = true;
    try{
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      setFuseLabel("Canceling...");
      const cancelFuse = await zenon.embedded.plasma.cancel(fuseId);
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      await zenon.send(cancelFuse, currentKeyPair.current);

      setToFuseAmount("");
      setFuseLabel("Fuse canceled !");

      setTimeout(()=>{
        setFuseLabel("Fuse plasma");
      }, 2500);

      toast(`Succesfully canceled`, {
        position: "bottom-center",
        autoClose: 1000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: false,
        draggable: true,
        newestOnTop: true,
        type: 'success',
        theme: 'dark'
      });
    }
    catch{
      toast(SAFE_OPERATION_ERROR,{
        position: "bottom-center",
        autoClose: 2500,
        hideProgressBar: true,
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

  const loadFuseItems = async() =>{
    if (fuseItemsLoading.current || !shouldLoadMore || !myAddressObject.current) {
      return;
    }

    fuseItemsLoading.current = true;
    try {
      const getEntriesByAddress = await zenon.embedded.plasma.getEntriesByAddress(myAddressObject.current, currentFuseItemsPage.current, pageSize);
      const qsrDecimals = fallbackValues.availableTokens["zts1qsrxxxxxxxxxxxxxmrhjll"]?.token.decimals || fallbackValues.decimals;
      const currentFusedQsrRaw = String(getEntriesByAddress.qsrAmount || '0');
      const currentFusedQsr = formatTokenAmount(currentFusedQsrRaw, qsrDecimals) || '0';
      const currentFusedQsrValue = BigInt(currentFusedQsrRaw);
      if(currentFusedQsrValue < BigInt(parseTokenAmount('10', qsrDecimals)))
        setPlasmaStatus("no-plasma");
      else if(currentFusedQsrValue < BigInt(parseTokenAmount('50', qsrDecimals)))
        setPlasmaStatus("low-plasma");
      else if(currentFusedQsrValue < BigInt(parseTokenAmount('120', qsrDecimals)))
        setPlasmaStatus("average-plasma");
      else
        setPlasmaStatus("high-plasma");

      setFusedQsrAmount(currentFusedQsr);

      if(getEntriesByAddress.list.length > 0){
        const newPillarItems = getEntriesByAddress.list.map((fuseItem)=>{
          return transformFuseItem(fuseItem);
        });
        setFuseItems((prevFuseItems) => [...prevFuseItems, ...newPillarItems]);

        currentFuseItemsPage.current = currentFuseItemsPage.current + 1;

        if(getEntriesByAddress.count > currentFuseItemsPage.current * pageSize){
          setShouldLoadMore(true);
        }else{
          setShouldLoadMore(false);
        }
      }
      else{
        setShouldLoadMore(false);
        if(fuseItems.length === 0){
          setNoFusedTransactionsLabel(true);
        }
      }
    } catch {
      setShouldLoadMore(false);
      if (fuseItems.length === 0) {
        setNoFusedTransactionsLabel(true);
      }
    } finally {
      fuseItemsLoading.current = false;
    }
  }


  return (
    <motion.div
      className='black-bg transition-animated'
      initial={"pageTransitionInitial"}
      animate={"pageTransitionAnimate"}
      exit={"pageTransitionExit"}
      variants={animationVariants}>

      <h1 className='mt-1'>Plasma</h1>
      <div className='mt-2 ml-2 mr-2'>
        <form id="fuseForm" onSubmit={handleSubmit(()=>onFormSubmit(toFuseAmount))}>
          <div className='custom-control'>
            <div className={`input-with-button w-100`}>
              <input name="toFuseQsrField" {...register("toFuseQsrField",
                { required: true,
                  min: {
                    value: 10,
                    message: 'Minimum of 10'
                  },
                  validate: (input) => {
                    const decimals = fallbackValues.availableTokens["zts1qsrxxxxxxxxxxxxxmrhjll"]?.token.decimals || fallbackValues.decimals;
                    const rawAmount = parseTokenAmount(input, decimals);
                    const minimumFuseAmount = parseTokenAmount('10', decimals);
                    if (rawAmount === null || rawAmount < minimumFuseAmount) {
                      return 'Enter at least 10 QSR with supported precision';
                    }
                    return isSufficientRawTokenBalance(qsrBalance, rawAmount)
                      || 'Insufficient balance';
                  }
                })}
                className={`w-100 custom-label pr-3 ${errors.toFuseQsrField?'custom-label-error':''}`}
                placeholder="Fuse QSR"
                value={toFuseAmount} onChange={(e) => {setToFuseAmount(e.target.value); setValue('toFuseQsrField', e.target.value, { shouldValidate: true })}} type='text' inputMode='decimal'></input>

                <div className='blue input-chip-button' onClick={()=>{setToFuseAmount(qsrAmount); setValue('toFuseQsrField', qsrAmount, { shouldValidate: true })}}>
                  <span>{"MAX: " + qsrAmount}</span>
                </div>
            </div>
            <div className={`input-error ${errors.toFuseQsrField?'':'invisible'}`}>
              { errors.toFuseQsrField?.message || 'Amount is required'}
            </div>
          </div>
        </form>

        <input className='button blue w-100 d-flex justify-content-center text-white'
              value={fuseLabel} type="submit" form="fuseForm" name="submitButton"></input>

        <div className="d-flex align-items-center tooltip mt-3">

          <div className="text-left">Fused {fusedQsrAmount} QSR</div>

          <img alt="" className='ml-2' src={require(`./../../assets/${plasmaStatus}.svg`)}></img>
          <span className='tooltip-text'>
            {plasmaStatus === 'no-plasma' && "No Plasma"}
            {plasmaStatus === 'low-plasma' && "Low Plasma"}
            {plasmaStatus === 'average-plasma' && "Average Plasma"}
            {plasmaStatus === 'high-plasma' && "High Plasma"}
          </span>
        </div>

        <div className='transactions mt-3'>
          {
            fuseItems.map((transaction, i) => {
              return <FuseItem key={transaction.id.toString()} cancelFuse={openCancelFuseModal} id={transaction.id} amount={transaction.amount} beneficiary={transaction.beneficiary} expiration={transaction.expiration}></FuseItem>
            })
          }
        </div>

        {(shouldLoadMore || noFusedTransactionsLabel) &&
          <div className='mt-2 center-items'>
            <span className='text-gray ml-1'>{
              noFusedTransactionsLabel?'No fusing history':<span id="loadMoreFuseItemsTrigger">Loading...</span>
            }</span>
          </div>
        }

      </div>

    </motion.div >
  );
};

export default Plasma;
