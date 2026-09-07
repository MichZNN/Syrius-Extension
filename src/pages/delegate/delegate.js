import React, {useRef, useState, useEffect, useContext} from 'react';
import { Zenon, Primitives } from 'znn-ts-sdk';
import PillarItem from '../../components/pillar-item/pillar-item';
import { motion } from 'framer-motion';
import animationVariants from '../../layouts/tabsLayout/animationVariants';
import { useSelector } from 'react-redux';
import AlertModal from '../../components/modals/alert-modal';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import { toast } from 'react-toastify';
import fallbackValues from '../../services/utils/fallbackValues';
import { SAFE_OPERATION_ERROR } from '../../services/security/safeErrors';
import { isWalletSessionActive } from '../../services/security/session';
import { formatTokenAmount } from '../../services/security/amounts';
import walletVault from '../../services/security/walletVault';

const Delegate = () => {
  const [pillarItems, setPillarItems] = useState([]);
  const [delegatedPillar, setDelegatedPillar] = useState({name:"", weightWithDecimals: ""});
  const delegatedPillarName = useRef();
  const myAddressObject = useRef(null);
  const currentKeyPair = useRef({});
  const operationInProgress = useRef(false);
  const zenon = Zenon.getSingleton();
  const currentPillarsPage = useRef(0);
  const [shouldLoadMore, setShouldLoadMore] = useState(true);
  const pageSize = 5;
  const pillarListObserver = useRef({});
  const pillarItemsLoading = useRef(false);
  const [noPillarItemsLabel, setNoPillarItemsLabel] = useState(false);
  const walletCredentials = useSelector(state => state.wallet);
  const { handleModal } = useContext(ModalContext);

  const [uncollectedZnnReward, setUncollectedZnnReward] = useState('0');
  const [uncollectedQsrReward, setUncollectedQsrReward] = useState('0');

  useEffect(() => {
    const loadMorePillarsTrigger = document.getElementById("loadMorePillarsTrigger");
      const fetchData = async() => {
        await getWalletInfo();
        if (loadMorePillarsTrigger) {
          pillarListObserver.current = (new IntersectionObserver(loadPillars, {
          root: null,
          rootMargin: `0px 0px 0px 0px`,
          threshold: 1.0
          }));
          pillarListObserver.current.observe(loadMorePillarsTrigger);
        }
      }
      fetchData();

      return ()=>{
        pillarListObserver.current?.disconnect?.();
      }
  // Pillar data and its observer are initialized once per page instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const getWalletInfo = async ()=>{
    try{
      const decrypted = walletVault.getKeyStore();

      if(decrypted){
        currentKeyPair.current = walletVault.getKeyPair(walletCredentials.selectedAddressIndex);
        const addr = (await currentKeyPair.current.getAddress()).toString();
        myAddressObject.current = Primitives.Address.parse(addr);

        const getDelegatedPillar = await zenon.embedded.pillar.getDelegatedPillar(myAddressObject.current);
        if(getDelegatedPillar){
          setDelegatedPillar(getDelegatedPillar);
          delegatedPillarName.current = getDelegatedPillar.name
        }

        const getUncollectedReward = await zenon.embedded.pillar.getUncollectedReward(myAddressObject.current);
        setUncollectedZnnReward(formatTokenAmount(
          getUncollectedReward.znnAmount,
          fallbackValues.availableTokens['zts1znnxxxxxxxxxxxxx9z4ulx']?.token.decimals || fallbackValues.decimals,
        ) || '0');
        setUncollectedQsrReward(formatTokenAmount(
          getUncollectedReward.qsrAmount,
          fallbackValues.availableTokens['zts1qsrxxxxxxxxxxxxxmrhjll']?.token.decimals || fallbackValues.decimals,
        ) || '0');
      }
    }
    catch{
      return false;
    }
  }

  const transformPillarItem = (pillarItem) =>{
    return{
      name: pillarItem.name,
      giveDelegateRewardPercentage: pillarItem.giveDelegateRewardPercentage,
      giveMomentumRewardPercentage: pillarItem.giveMomentumRewardPercentage,
      weight: pillarItem.weight.toString(),
      producedMomentums: pillarItem.currentStats.producedMomentums,
      expectedMomentums: pillarItem.currentStats.expectedMomentums,
      producerAddress: pillarItem.producerAddress.toString(),
      // The current SDK response does not expose uptime, so do not display a fabricated value.
      uptime: null,
      isDelegatedPillar: pillarItem.name === delegatedPillarName.current
    }
  }

  const loadPillars = async() =>{
    if (pillarItemsLoading.current || !shouldLoadMore || !myAddressObject.current) {
      return;
    }

    pillarItemsLoading.current = true;
    try {
      const getAll = await zenon.embedded.pillar.getAll(currentPillarsPage.current, pageSize);
      if(getAll.list.length > 0){
        const newPillarItems = getAll.list.map((pillarItem)=>{
          return transformPillarItem(pillarItem);
        });
        setPillarItems((pillars) => [...pillars, ...newPillarItems]);

        currentPillarsPage.current = currentPillarsPage.current + 1;

        if(getAll.count > currentPillarsPage.current * pageSize){
          setShouldLoadMore(true);
        }else{
          setShouldLoadMore(false);
        }
      }
      else{
        setShouldLoadMore(false);
        if(pillarItems.length === 0){
          setNoPillarItemsLabel(true);
        }
      }
    } catch {
      setShouldLoadMore(false);
      if (pillarItems.length === 0) {
        setNoPillarItemsLabel(true);
      }
    } finally {
      pillarItemsLoading.current = false;
    }
  }

  const openDelegateModal = (pillarName) => {
    handleModal(<AlertModal
        type="confirm"
        title="Are you sure ?"
        onDismiss={()=>onDelegateDismiss()}
        onSuccess={()=>onDelegateSuccess(pillarName)}>
        <div>
          <div>Are you sure you want to delegate to</div>
          <div>
            <b>{pillarName}</b> ?
          </div>
        </div>
      </AlertModal>)
  }

  const onDelegateDismiss = ()=>{
  }

  const onDelegateSuccess = (pillarName)=>{
    delegatePillar(pillarName);
  }

  const delegatePillar = async (name) =>{
    if (operationInProgress.current) {
      return;
    }

    operationInProgress.current = true;
    try{
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      const delegate = zenon.embedded.pillar.delegate(name);
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      await zenon.send(delegate, currentKeyPair.current);

      toast(`Succesfully delegated`, {
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


  const openUndelegateModal = () => {
    handleModal(<AlertModal
        type="confirm"
        title="Are you sure ?"
        onDismiss={()=>onUndelegateDismiss()}
        onSuccess={()=>onUndelegateSuccess()}>
        <div>
          <div>Are you sure you want to undelegate ?</div>
        </div>
      </AlertModal>)
  }

  const onUndelegateDismiss = ()=>{
  }

  const onUndelegateSuccess = ()=>{
    undelegatePillar();
  }

  const undelegatePillar = async () =>{
    if (operationInProgress.current) {
      return;
    }

    operationInProgress.current = true;
    try{
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      const delegate = zenon.embedded.pillar.undelegate();
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      await zenon.send(delegate, currentKeyPair.current);
      toast(`Succesfully undelegated`, {
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

  const openCollectRewardModal = (uncollectedZnnReward, uncollectedQsrReward) => {
    handleModal(<AlertModal
        type="confirm"
        title="Are you sure ?"
        onDismiss={()=>onCollectRewardDismiss()}
        onSuccess={()=>onCollectRewardSuccess()}>
        <div>
          <div>Are you sure you want to collect ?</div>
          <div><b>{uncollectedZnnReward} ZNN </b>and</div>
          <div><b>{uncollectedQsrReward} QSR </b>?</div>
        </div>
      </AlertModal>)
  }

  const onCollectRewardDismiss = ()=>{
  }

  const onCollectRewardSuccess = ()=>{
    collectReward();
  }

  const collectReward = async () =>{
    if (operationInProgress.current) {
      return;
    }

    operationInProgress.current = true;
    try{
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      const collectReward = zenon.embedded.pillar.collectReward();
      if (!(await isWalletSessionActive())) {
        throw new Error(SAFE_OPERATION_ERROR);
      }

      await zenon.send(collectReward, currentKeyPair.current);
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

  return (
    <motion.div
      className='black-bg transition-animated'
      initial={"pageTransitionInitial"}
      animate={"pageTransitionAnimate"}
      exit={"pageTransitionExit"}
      variants={animationVariants}>

      <h1 className='mt-1'>Delegate</h1>

      <div className='ml-2 mr-2'>
        {
          delegatedPillar.name!=="" &&
          <>
            <div className='d-flex align-items-center justify-content-between w-100 text-left'>
              <div>
                <div><b className='text-gray'>Delegated:</b> {delegatedPillar?.name}</div>
                <div><b className='text-gray'>Weight:</b> {parseFloat(delegatedPillar?.weightWithDecimals).toFixed(0)}</div>
              </div>
              <div onClick={()=>openUndelegateModal()} className='thin-button secondary d-flex justify-content-center'>
                  Undelegate
              </div>
            </div>
            {
              (uncollectedQsrReward !== '0' || uncollectedZnnReward !== '0') &&
              <div className='mt-2 d-flex align-items-center justify-content-between w-100 text-left'>
                <div>
                  <div><b className='text-gray'>Rewarded ZNN:</b> {uncollectedZnnReward}</div>
                  <div><b className='text-gray'>Rewarded QSR:</b> {uncollectedQsrReward}</div>
                </div>
                <div onClick={()=>openCollectRewardModal(uncollectedZnnReward, uncollectedQsrReward)}
                  className={`thin-button primary d-flex justify-content-center ${(uncollectedQsrReward !== '0' || uncollectedZnnReward !== '0')?'':'disabled'}`}>
                    Collect
                </div>
              </div>
            }
          </>
        }

        <div className='transactions mt-2'>
          {
            pillarItems.map((pillar, i) => {
              return <PillarItem key={"pillar-"+i} delegatePillar={openDelegateModal} undelegatePillar={openUndelegateModal} isDelegatedPillar={pillar.isDelegatedPillar} name={pillar.name} giveDelegateRewardPercentage={pillar.giveDelegateRewardPercentage} giveMomentumRewardPercentage={pillar.giveMomentumRewardPercentage} weight={pillar.weight} producedMomentums={pillar.producedMomentums} expectedMomentums={pillar.expectedMomentums} producerAddress={pillar.producerAddress} uptime={pillar.uptime} ></PillarItem>
            })
          }
        </div>

        {(shouldLoadMore || noPillarItemsLabel) &&
          <div className='mt-2 center-items'>
            <span className='text-gray ml-1'>{
              noPillarItemsLabel?'No pillars':<span id="loadMorePillarsTrigger">Loading...</span>
            }</span>
          </div>
        }
      </div>

  </motion.div>
  );
};

export default Delegate;
