import React, { useEffect, useState, useRef, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zenon, Primitives } from 'znn-ts-sdk';
import TokenDropdown from '../../../components/token-dropdown/token-dropdown';
import TransactionItem from '../../../components/transaction-item/transaction-item';
import fallbackValues from '../../../services/utils/fallbackValues';
import { receiveAllBlocks } from '../../../services/utils/utils';
import { motion } from 'framer-motion';
import animationVariants from '../../../layouts/tabsLayout/animationVariants';
import { useSelector } from 'react-redux';
import { SilentSpinnerContext } from '../../../services/hooks/silent-spinner/silentSpinnerContext'
import { toast } from 'react-toastify';
import BalanceVisibilityToggle from '../../../components/balance-visibility-toggle/balance-visibility-toggle';
import { SAFE_OPERATION_ERROR } from '../../../services/security/safeErrors';
import { isWalletSessionActive } from '../../../services/security/session';
import walletVault from '../../../services/security/walletVault';
import { formatTokenAmount } from '../../../services/security/amounts';
import { embeddedContractName, contractDisplayName } from '../../../services/utils/contracts';
import { decodeCall, describeCall } from '../../../services/utils/contractCalls';

const Dashboard = () => {
  const availableTokens = Object.keys(fallbackValues.availableTokens);
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [tokenColor, setTokenColor] = useState("green");
  const [transactions, setTransactions] = useState([]);
  const [selectedToken, setSelectedToken] = useState(availableTokens[0]);
  const [walletInfo, setWalletInfo] = useState({
    balanceInfoMap: fallbackValues.availableTokens
  });
  const transactionsCount = useRef(0);
  const currentTransactionsPage = useRef(0);
  const myAddressObject = useRef(null);
  const [shouldLoadMore, setShouldLoadMore] = useState(true);
  const [noTransactionsLabel, setNoTransactionsLabel] = useState(false);
  const transactionsObserver = useRef({});
  const transactionsLoading = useRef(false);
  const zenon = Zenon.getSingleton();
  const pageSize = 200;
  const walletCredentials = useSelector(state => state.wallet);
  const connectionParameters = useSelector(state => state.connectionParameters);
  const balancesVisible = useSelector(state => state.balanceVisibility.balancesVisible);
  const { handleSilentSpinner } = useContext(SilentSpinnerContext);

  useEffect(() => {
  const loadMoreTransactionsTrigger = document.getElementById("loadMoreTransactionsTrigger");
    const fetchData = async() => {
      await getWalletInfo();
      if (loadMoreTransactionsTrigger) {
        transactionsObserver.current = (new IntersectionObserver(loadTransactions, {
        root: null,
        rootMargin: `0px 0px 0px 0px`,
        threshold: 1.0
        }));
        transactionsObserver.current.observe(loadMoreTransactionsTrigger);
      }

      const refreshTimer = window.setInterval(refreshNewestTransactions, 10000);
      return refreshTimer;
    }
    const refreshTimerPromise = fetchData();

    return ()=>{
      transactionsObserver.current?.disconnect?.();
      refreshTimerPromise.then((refreshTimer) => window.clearInterval(refreshTimer));
    }
  // Dashboard polling and its observer are owned by this page instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getWalletInfo = async ()=>{
    const showSilentSpinner = handleSilentSpinner(
      <>
        <div className='text-bold'>
          Receiving transactions ...
        </div>
      </>
    );
    showSilentSpinner(true);

    try{
      const decrypted = walletVault.getKeyStore();

      if(decrypted){
        const currentKeyPair = walletVault.getKeyPair(walletCredentials.selectedAddressIndex);
        const addr = (await currentKeyPair.getAddress()).toString();
        myAddressObject.current = Primitives.Address.parse(addr);
        setAddress(addr);

        const updateAccountInfo = async() => {
          const getAccountInfoByAddress = await zenon.ledger.getAccountInfoByAddress(myAddressObject.current);
          if(Object.keys(getAccountInfoByAddress.balanceInfoMap).length) {
            getAccountInfoByAddress.balanceInfoMap = {...walletInfo.balanceInfoMap, ...getAccountInfoByAddress.balanceInfoMap}
            setWalletInfo(getAccountInfoByAddress);
          }
        }
        await updateAccountInfo();

        if (await isWalletSessionActive()) {
          await receiveAllBlocks(zenon, currentKeyPair);
        }
        await updateAccountInfo();
      }
    }
    catch{
      // Keep network and node details out of user-facing logs and errors.
    }
    finally {
      showSilentSpinner(false);
    }
  }

  const loadTransactions = async() =>{
    if (transactionsLoading.current || !shouldLoadMore || !myAddressObject.current) {
      return;
    }

    transactionsLoading.current = true;
    try{
      const getBlocksByPage = await zenon.ledger.getBlocksByPage(
        myAddressObject.current,
        currentTransactionsPage.current,
        pageSize,
      );
      const blocks = getBlocksByPage?.list || [];
      if(blocks.length > 0){
        transactionsCount.current += blocks.length;
        const newTransactions = await Promise.all(blocks.map(async (transaction) => (
          transformTransactionItem(transaction.toJson())
        )));
        setTransactions((prevTransactions) => [...prevTransactions, ...newTransactions]);
        currentTransactionsPage.current += 1;
        setShouldLoadMore(blocks.length === pageSize);
      }
      else{
        setShouldLoadMore(false);
        if(transactionsCount.current === 0){
          setNoTransactionsLabel(true);
        }
      }
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
    } finally {
      transactionsLoading.current = false;
    }
  }

  const refreshNewestTransactions = async () => {
    if (!myAddressObject.current) {
      return;
    }

    try {
      const response = await zenon.ledger.getBlocksByPage(myAddressObject.current, 0, pageSize);
      const blocks = response?.list || [];
      if (!blocks.length) {
        return;
      }

      const freshTransactions = await Promise.all(blocks.map((block) => (
        transformTransactionItem(block.toJson())
      )));
      setTransactions((previousTransactions) => {
        const freshByHash = new Map(freshTransactions.map((item) => [item.hash, item]));
        const existingHashes = new Set(previousTransactions.map((item) => item.hash));
        const updated = previousTransactions.map((item) => freshByHash.get(item.hash) || item);
        const added = freshTransactions.filter((item) => !existingHashes.has(item.hash));
        return [...added, ...updated];
      });
    } catch {
      // A refresh is best-effort; keep the already loaded history intact.
    }
  }

  const transformTransactionItem = async (transactionItem) =>{
    const ownTransaction = transactionItem;
    const referencedTransaction = transactionItem.blockType === 3 || transactionItem.blockType === '3'
      ? await getReferencedTransaction(transactionItem)
      : null;
    const transaction = referencedTransaction || transactionItem;
    const transactionDescription = identifyTransaction(transaction);
    const tokenStandard = transaction.tokenStandard?.toString();
    const tokenDecimals = Number(transaction.token?.decimals
      ?? fallbackValues.availableTokens[tokenStandard]?.token.decimals
      ?? fallbackValues.decimals);
    const amount = formatTokenAmount(
      transaction.amount?.toString() || '0',
      tokenDecimals,
    ) || '0';
    const confirmationCount = Number(ownTransaction.confirmationDetail?.numConfirmations);
    const hasConfirmationDetail = Number.isFinite(confirmationCount);
    const transformedTransaction = {
      type: transactionDescription.type,
      label: transactionDescription.label,
      counterpartyName: transactionDescription.counterpartyName,
      amount,
      tokenSymbol: transaction.token?.symbol || fallbackValues.availableTokens[tokenStandard]?.token.symbol || "?",
      address: transactionDescription.type === 'received'
        ? transaction.address?.toString() || transaction.toAddress?.toString() || "?"
        : transaction.toAddress?.toString() || "?",
      hash: ownTransaction.hash?.toString() || transaction.hash?.toString() || "",
      chainId: Number(connectionParameters?.chainIdentifier),
      confirmations: hasConfirmationDetail ? Math.max(0, confirmationCount) : 0,
      isUnconfirmed: hasConfirmationDetail && confirmationCount <= 0,
    }

    if (transactionDescription.method && !transaction.token?.symbol) {
      transformedTransaction.tokenSymbol = null;
    }

    return transformedTransaction;
  }

  const identifyTransaction = (transactionItem) =>{
    const toAddress = transactionItem.toAddress?.toString();
    const ownAddress = myAddressObject.current?.toString?.();

    if (toAddress && toAddress === ownAddress) {
      const fromContract = embeddedContractName(transactionItem.address);
      return {
        type: 'received',
        label: 'Received',
        counterpartyName: fromContract ? contractDisplayName(fromContract) : null,
      };
    }

    const contract = embeddedContractName(toAddress);
    if (!contract) {
      return { type: 'sent', label: 'Sent', counterpartyName: null };
    }

    const method = decodeCall(contract, transactionItem.data);
    return {
      type: contract,
      label: describeCall(contract, method),
      counterpartyName: contractDisplayName(contract),
      method,
    };
  }

  const getReferencedTransaction = async (transactionItem)=>{
    try {
      return (await zenon.ledger.getBlockByHash(transactionItem.fromBlockHash)).toJson();
    } catch {
      return null;
    }
  }

  const goToSend = () => {
    navigate('send', {
      state: {
        currentSelectedToken: selectedToken,
      }
    });
  }

  const switchToken = () =>{
    setSelectedToken(availableTokens[(availableTokens.indexOf(selectedToken)+1)%(availableTokens.length)]);
    if(tokenColor === 'green'){
      setTokenColor('blue');
    }else{
      setTokenColor('green');
    }
  }

  const selectToken = (index, value) => {
    setSelectedToken(value.token.tokenStandard);
    if(value.token.symbol === 'ZNN'){
      setTokenColor('green');
    }else{
      setTokenColor('blue');
    }
  }

  const selectedTokenInfo = walletInfo.balanceInfoMap?.[selectedToken]
    || fallbackValues.availableTokens[selectedToken];
  const selectedTokenDecimals = Number(
    selectedTokenInfo?.token?.decimals ?? fallbackValues.decimals,
  );
  const selectedBalance = formatTokenAmount(
    selectedTokenInfo?.balance?.toString() || '0',
    selectedTokenDecimals,
  ) || '0';

  return (
    <motion.div
      className='black-bg transition-animated'
      initial={"pageTransitionInitial"}
      animate={"pageTransitionAnimate"}
      exit={"pageTransitionExit"}
      variants={animationVariants}>

      <div className='mt-2 ml-2 mr-2 d-flex justify-content-center'>
        <div className={`wallet-circle circle-${tokenColor}`}>
          <div className='wallet-balance-row'>
            <h2 className='mb-0 tooltip'>
              {balancesVisible ? (
                <>
                  {selectedBalance}
                  <span className='tooltip-text mt-2'>{selectedBalance}</span>
                </>
              ) : '***'}
            </h2>
            <BalanceVisibilityToggle />
          </div>
          <h4 className='mb-0 mt-1 text-gray'>{selectedTokenInfo?.token?.symbol || '?'}</h4>
          <h4 className='m-0 text-gray tooltip cursor-pointer' onClick={() => {try{navigator.clipboard.writeText(address); toast(`Address copied`, {
                position: "bottom-center",
                autoClose: 1000,
                hideProgressBar: true,
                closeOnClick: true,
                pauseOnHover: false,
                draggable: true,
                newestOnTop: true,
                type: 'success',
                theme: 'dark'
              })}catch{} }}>
            {address.slice(0, 3) + '...' + address.slice(-3)}
            <span className='tooltip-text'>{address}</span>
          </h4>
          <img alt="" onClick={()=>{switchToken()}} className='mt-1 p-2 button' src={require(`./../../../assets/switch-${tokenColor}.svg`)} width='16px'></img>
        </div>
      </div>

      <div className='mt-2 ml-2 mr-2 d-flex justify-content-center'>
        <TokenDropdown options={Object.keys(walletInfo.balanceInfoMap).map((value)=>{return walletInfo.balanceInfoMap[value]})} tokenSymbolPath={`token.symbol`} onChange={selectToken} value={selectedToken} placeholder="Select token" />
      </div>

      <div className='mt-2 ml-2 mr-2 d-flex'>
        <div onClick={goToSend} className='button secondary w-100 mr-2 d-flex justify-content-center'>
          Send
          <img alt="" className='ml-1' src={require('./../../../assets/send-right-green.svg')} width='20px'></img>
        </div>
        <Link to="receive" className='button secondary w-100 d-flex justify-content-center'>
          Receive
          <img alt="" className='ml-1' src={require('./../../../assets/send-left-green.svg')} width='20px'></img>
        </Link>
      </div>
      <div className='transactions mt-2 ml-2 mr-2'>
        {
          transactions.map((transaction, i) => {
            return <TransactionItem  key={"transaction-"+transaction.hash+"-"+i} type={transaction.type} label={transaction.label} counterpartyName={transaction.counterpartyName} amount={transaction.amount} tokenSymbol={transaction.tokenSymbol} address={transaction.address} hash={transaction.hash} chainId={transaction.chainId} isUnconfirmed={transaction.isUnconfirmed} confirmations={transaction.confirmations}></TransactionItem>
          })
        }
      </div>

      {(shouldLoadMore || noTransactionsLabel) &&
        <div className='mt-2 center-items'>
          <span className='text-gray ml-1'>{
            noTransactionsLabel?'No transactions':<span id="loadMoreTransactionsTrigger">Loading...</span>
          }</span>
        </div>
      }
  </motion.div>
  );
};

export default Dashboard
