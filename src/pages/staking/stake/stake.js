import React, { useEffect, useState, useRef, useContext } from 'react';
import { Zenon, Primitives } from 'znn-ts-sdk';
import fallbackValues from '../../../services/utils/fallbackValues';
import StakeItem from '../../../components/stake-item/stake-item';
import { motion } from 'framer-motion';
import animationVariants from '../../../layouts/tabsLayout/animationVariants';
import { useSelector } from 'react-redux';
import { ModalContext } from '../../../services/hooks/modal/modalContext';
import AlertModal from '../../../components/modals/alert-modal'
import { useForm } from 'react-hook-form';
import ControlledDropdown from '../../../components/custom-dropdown/controlled-dropdown';
import { toast } from 'react-toastify';
import { SAFE_OPERATION_ERROR } from '../../../services/security/safeErrors';
import {
  formatTokenAmount,
  isSufficientRawTokenBalance,
  parseTokenAmount,
} from '../../../services/security/amounts';
import { isWalletSessionActive } from '../../../services/security/session';
import walletVault from '../../../services/security/walletVault';

const Stake = () => {
  const [znnAmount, setZnnAmount] = useState('0');
  const [znnBalance, setZnnBalance] = useState("0");
  const [stakeDuration, setStakeDuration] = useState("");
  const [stakedZnnAmount, setStakedZnnAmount] = useState('0');
  const [uncollectedZnnReward, setUncollectedZnnReward] = useState('0');
  const [uncollectedQsrReward, setUncollectedQsrReward] = useState('0');
  const [toStakeAmount, setToStakeAmount] = useState("");
  const [noStakeItemsLabel, setNoStakeItemsLabel] = useState(false);
  const [shouldLoadMore, setShouldLoadMore] = useState(true);
  const [stakeLabel, setStakeLabel] = useState("Stake ZNN");
  const [stakedItems, setStakedItems] = useState([]);
  const myAddressObject = useRef(null);
  const stakeListObserver = useRef({});
  const stakeItemsLoading = useRef(false);
  const currentKeyPair = useRef({});
  const operationInProgress = useRef(false);
  const zenon = Zenon.getSingleton();
  const currentStakePage = useRef(0);
  const availableStakeDurations = fallbackValues.stakingDurations;
  const pageSize = 5;
  const walletCredentials = useSelector(state => state.wallet);
  const { handleModal } = useContext(ModalContext);
  const { register, handleSubmit, control, formState: { errors }, reset, setValue } = useForm();

  useEffect(() => {
    const loadMoreStakeItemsTrigger = document.getElementById("loadMoreStakeItemsTrigger");
      const fetchData = async() => {
        await getWalletInfo();
        if (loadMoreStakeItemsTrigger) {
          stakeListObserver.current = (new IntersectionObserver(loadStakeItems, {
          root: null,
          rootMargin: `0px 0px 0px 0px`,
          threshold: 1.0
          }));
          stakeListObserver.current.observe(loadMoreStakeItemsTrigger);
        }
      }
      fetchData();

      return ()=>{
        stakeListObserver.current?.disconnect?.();
      }
    // Staking data and its observer are initialized once per page instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


  const getWalletInfo = async ()=>{
    try{
      const decrypted = walletVault.getKeyStore();

      if(decrypted){
        currentKeyPair.current = walletVault.getKeyPair(walletCredentials.selectedAddressIndex);
        const addr = (await currentKeyPair.current.getAddress()).toString();
        myAddressObject.current = Primitives.Address.parse(addr);

        const getUncollectedReward = await zenon.embedded.stake.getUncollectedReward(myAddressObject.current);
        const znnDecimals = fallbackValues.availableTokens["zts1znnxxxxxxxxxxxxx9z4ulx"]?.token.decimals || fallbackValues.decimals;
        const qsrDecimals = fallbackValues.availableTokens["zts1qsrxxxxxxxxxxxxxmrhjll"]?.token.decimals || fallbackValues.decimals;
        setUncollectedZnnReward(formatTokenAmount(getUncollectedReward.znnAmount, znnDecimals) || '0');
        setUncollectedQsrReward(formatTokenAmount(getUncollectedReward.qsrAmount, qsrDecimals) || '0');

        const getAccountInfoByAddress = await zenon.ledger.getAccountInfoByAddress(myAddressObject.current);
        if(Object.keys(getAccountInfoByAddress.balanceInfoMap).length) {
          if(getAccountInfoByAddress.balanceInfoMap['zts1znnxxxxxxxxxxxxx9z4ulx']){
            const znnTokenInfo = getAccountInfoByAddress.balanceInfoMap['zts1znnxxxxxxxxxxxxx9z4ulx'];
            setZnnBalance(znnTokenInfo.balance);
            setZnnAmount(formatTokenAmount(
              znnTokenInfo.balance,
              fallbackValues.availableTokens["zts1znnxxxxxxxxxxxxx9z4ulx"]?.token.decimals || fallbackValues.decimals,
            ) || '0');
          }
        }
      }
    }
    catch{
      return false;
    }
  }

  const transformStakeItem = (stakeItem) =>{
    return{
      amount: formatTokenAmount(
        stakeItem.amount,
        fallbackValues.availableTokens["zts1znnxxxxxxxxxxxxx9z4ulx"]?.token.decimals || fallbackValues.decimals,
      ) || '0',
      address: stakeItem.address.toString(),
      expiration: (stakeItem.expirationTimestamp - Date.now()/1000)/3600,
      period: (stakeItem.expirationTimestamp - stakeItem.startTimestamp)/3600/24/30,
      id: stakeItem.id
    }
  }

  const onFormSubmit = (stakeDuration, toStakeAmount) => {
    openStakeModal(stakeDuration, toStakeAmount);
  };

  const openStakeModal = (stakeDuration, toStakeAmount) => {
    handleModal(<AlertModal
        type="confirm"
        title="Are you sure ?"
        onDismiss={()=>onStakeDismiss()}
        onSuccess={()=>onStakeSuccess(stakeDuration, toStakeAmount)}>
        <div>
          <div>Are you sure you want to stake</div>
          <div>
            <b>{toStakeAmount} ZNN</b>
            {" for "}
          </div>
          <b>{parseFloat(parseFloat(stakeDuration)/3600/24/30).toFixed(0)} month{parseFloat(parseFloat(stakeDuration)/3600/24/30).toFixed(0)>1?'s':''} ?</b>
        </div>
      </AlertModal>)
  }

  const onStakeDismiss = ()=>{
  }

  const onStakeSuccess = (stakeDuration, toStakeAmount)=>{
    stakeZnn(stakeDuration, toStakeAmount);
  }

  const stakeZnn = async (stakeDuration, toStakeAmount) => {
    if (operationInProgress.current) {
      return;
    }

    operationInProgress.current = true;
    try{
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      const decimals = fallbackValues.availableTokens["zts1znnxxxxxxxxxxxxx9z4ulx"]?.token.decimals || fallbackValues.decimals;
      const amountWithDecimals = parseTokenAmount(toStakeAmount, decimals);
      if (amountWithDecimals === null
        || !isSufficientRawTokenBalance(znnBalance, amountWithDecimals)) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      setStakeLabel("Staking...");
      const stake = zenon.embedded.stake.stake(stakeDuration, amountWithDecimals);
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      await zenon.send(stake, currentKeyPair.current);

      setToStakeAmount("");
      setStakeDuration("");
      setStakeLabel("Staked !");
      reset();

      toast(`Successfully staked ${toStakeAmount} ZNN`, {
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
        setStakeLabel("Stake ZNN");
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
      setStakeLabel("Error staking");

      setTimeout(()=>{
        setStakeLabel("Stake ZNN");
      }, 2500);

    } finally {
      operationInProgress.current = false;
    }
  }

  const openCollectRewardModal = () => {
    handleModal(<AlertModal
        type="confirm"
        title="Are you sure ?"
        onDismiss={()=>onCollectRewardDismiss()}
        onSuccess={()=>onCollectRewardSuccess()}>
        <div>
          <div>Are you sure you want to collect</div>
          <div>
            <b>{uncollectedZnnReward} ZNN and {uncollectedQsrReward} QSR</b> ?
          </div>
        </div>
      </AlertModal>)
  }

  const onCollectRewardDismiss = ()=>{
  }

  const onCollectRewardSuccess = ()=>{
    collectStakeReward();
  }

  const collectStakeReward = async () => {
    if (operationInProgress.current) {
      return;
    }

    operationInProgress.current = true;
    try{
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      const stake = zenon.embedded.stake.collectReward();
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      await zenon.send(stake, currentKeyPair.current);

      setToStakeAmount("");
      setStakeLabel("Staked !");

      setTimeout(()=>{
        setStakeLabel("Stake ZNN");
      }, 2500);

      toast(`Succesfully collected`, {
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

  // The SDK provides cancellation; verify this flow against testnet before using it with real funds.
  const cancelStake = async (fuseId) => {
    if (operationInProgress.current) {
      return;
    }

    operationInProgress.current = true;
    try{
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      setStakeLabel("Canceling...");
      const cancelStake = zenon.embedded.stake.cancel(fuseId);
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      await zenon.send(cancelStake, currentKeyPair.current);

      setToStakeAmount("");
      setStakeLabel("Canceled !");

      setTimeout(()=>{
        setStakeLabel("Stake");
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

  const handleSetDuration = (i, value)=>{
    setStakeDuration(value.value);
  }


  const loadStakeItems = async() =>{
    if (stakeItemsLoading.current || !shouldLoadMore || !myAddressObject.current) {
      return;
    }

    stakeItemsLoading.current = true;
    try {
      const getEntriesByAddress = await zenon.embedded.stake.getEntriesByAddress(myAddressObject.current, currentStakePage.current, pageSize);
      const znnDecimals = fallbackValues.availableTokens["zts1znnxxxxxxxxxxxxx9z4ulx"]?.token.decimals || fallbackValues.decimals;
      setStakedZnnAmount(formatTokenAmount(getEntriesByAddress.totalAmount, znnDecimals) || '0');

      if(getEntriesByAddress.list.length > 0){
        const newStakeItem = getEntriesByAddress.list.map((fuseItem)=>{
          return transformStakeItem(fuseItem);
        });
        setStakedItems((stakes) => [...stakes, ...newStakeItem]);
        currentStakePage.current += 1;
        setShouldLoadMore(getEntriesByAddress.list.length === pageSize);
      }
      else{
        setShouldLoadMore(false);
        if(stakedItems.length === 0){
          setNoStakeItemsLabel(true);
        }
      }
    } catch {
      setShouldLoadMore(false);
      if (stakedItems.length === 0) {
        setNoStakeItemsLabel(true);
      }
    } finally {
      stakeItemsLoading.current = false;
    }
  }

  return (
    <motion.div
      className='black-bg transition-animated'
      initial={"pageTransitionInitial"}
      animate={"pageTransitionAnimate"}
      exit={"pageTransitionExit"}
      variants={animationVariants}>

      <h1 className='mt-1'>Staking</h1>
      <div className='mt-2 ml-2 mr-2'>
        <form id="stakeForm" onSubmit={handleSubmit(()=>onFormSubmit(stakeDuration, toStakeAmount))}>
          <div className='custom-control'>
            <div className={`input-with-button w-100`}>
              <input name="stakeAmountField" {...register("stakeAmountField",
                { required: true,
                  validate: (input) => {
                    const decimals = fallbackValues.availableTokens["zts1znnxxxxxxxxxxxxx9z4ulx"]?.token.decimals || fallbackValues.decimals;
                    const rawAmount = parseTokenAmount(input, decimals);
                    if (rawAmount === null) {
                      return 'Enter a valid amount with supported precision';
                    }
                    return isSufficientRawTokenBalance(znnBalance, rawAmount)
                      || 'Insufficient balance';
                  }
                })}
                control={control}
                className={`w-100 custom-label pr-3 ${errors.stakeAmountField?'custom-label-error':''}`}
                placeholder='Stake ZNN'
                value={toStakeAmount} onChange={(e) => {setToStakeAmount(e.target.value); setValue('stakeAmountField', e.target.value, {shouldValidate: true})}} type='text' inputMode='decimal'></input>
              <div className='primary input-chip-button'
                onClick={()=>{setToStakeAmount(znnAmount); setValue('stakeAmountField', znnAmount, { shouldValidate: true })}}>
                <span>{"MAX: " + znnAmount}</span>
              </div>
            </div>

            <div className={`input-error ${errors.stakeAmountField?'':'invisible'}`}>
              { errors.stakeAmountField?.message || 'Amount is required'}
            </div>
          </div>

          <div className='custom-control'>
            <ControlledDropdown dropdownComponent = 'CustomDropdown'
              {...register("stakeDurationField", { required: true })} control={control}
              name="stakeDurationField"
              options={availableStakeDurations}
              onChange={handleSetDuration}
              value={stakeDuration}
              placeholder={"Staking duration"}
              displayKey={"label"}
              className={`${errors.stakeDurationField?'custom-label-error':''}`} />

            <div className={`input-error ${errors.stakeDurationField?'':'invisible'}`}>
              {errors.stakeDurationField?.message || 'Staking period is required'}
            </div>
          </div>
        </form>

        <input className='button primary w-100 d-flex justify-content-center text-white'
              value={stakeLabel} type="submit" form="stakeForm" name="submitButton"></input>

        <div className="d-flex justify-content-between align-items-center mt-3">
          <div className="text-left">Staked {stakedZnnAmount} ZNN</div>
          <div onClick={()=>{openCollectRewardModal()}}
            className={`thin-button blue d-flex justify-content-center tooltip ${(uncollectedZnnReward !== '0' || uncollectedQsrReward !== '0')?'':'disabled'}`}>
            Collect rewards
            <span className='tooltip-text'>{uncollectedZnnReward} ZNN / {uncollectedQsrReward} QSR</span>
          </div>
        </div>

        <div className='transactions mt-3'>
          {
            stakedItems.map((transaction, i) => {
              return <StakeItem key={"stake-item-" + transaction.id.toString() + "-" + i} cancelStake={cancelStake} period={transaction.period} id={transaction.id} amount={transaction.amount} expiration={transaction.expiration}></StakeItem>
            })
          }
        </div>

        {(shouldLoadMore || noStakeItemsLabel) &&
          <div className='mt-2 center-items'>
            <span className='text-gray ml-1'>{
              noStakeItemsLabel?'No staking history':<span id="loadMoreStakeItemsTrigger">Loading...</span>
            }</span>
          </div>
        }

      </div>
    </motion.div>
  );
};

export default Stake;
