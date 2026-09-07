import React, { useEffect, useState, useContext } from 'react';
import { useForm } from 'react-hook-form';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { Zenon, Constants } from 'znn-ts-sdk';
import ChangeChainIdItem from '../../../components/change-chainId-item/change-chainId-item';
import { SpinnerContext } from '../../../services/hooks/spinner/spinnerContext';
import { SAFE_NODE_ERROR } from '../../../services/security/safeErrors';
import { readStoredArray } from '../../../services/utils/utils';
import { storeChainIdentifier } from '../../../services/redux/connectionParametersSlice';
import {
  DEFAULT_CHAIN_IDS,
  DEFAULT_MAINNET_CHAIN_ID,
} from '../../../services/utils/networkDefaults';
import { sendRuntimeMessage } from '../../../services/security/runtimeMessage';

const ChangeChainId = () => {
  const [currentChainId, setCurrentChainId] = useState('');
  const [chainIdToBeAdded, setChainIdToBeAdded] = useState('');
  const { register, handleSubmit, formState: { errors }, setValue } = useForm();
  const { handleSpinner } = useContext(SpinnerContext);
  const connectionParameters = useSelector(state => state.connectionParameters);
  const dispatch = useDispatch();
  const [chainIdItems, setChainIdItems] = useState(() => (
    readStoredArray("chainIdList")
      .map((chainId) => Number(chainId))
      .filter((chainId) => Number.isSafeInteger(chainId) && chainId >= 0)
  ));

  useEffect(() => {
    const storedChainId = localStorage.getItem(Constants.DEFAULT_CHAINID_PATH);
    const parsedStoredChainId = storedChainId === null ? NaN : Number(storedChainId);
    const connectedChainId = Number.isSafeInteger(parsedStoredChainId) && parsedStoredChainId >= 0
      ? parsedStoredChainId
      : DEFAULT_MAINNET_CHAIN_ID;

    if (Zenon.getChainIdentifier() !== connectedChainId) {
      Zenon.setChainIdentifier(connectedChainId);
    }

    dispatch(storeChainIdentifier(connectedChainId));

    localStorage.setItem(Constants.DEFAULT_CHAINID_PATH, String(connectedChainId));

    const storedChainIds = readStoredArray("chainIdList");
    const normalizedChainIds = storedChainIds
      .map((chainId) => Number(chainId))
      .filter((chainId) => Number.isSafeInteger(chainId) && chainId >= 0);
    const updatedChainIds = [...new Set([
      ...normalizedChainIds,
      ...DEFAULT_CHAIN_IDS,
      connectedChainId,
    ].filter((chainId) => Number.isSafeInteger(chainId) && chainId >= 0))];

    setChainIdItems(updatedChainIds);
    localStorage.setItem("chainIdList", JSON.stringify(updatedChainIds));

    setCurrentChainId(connectedChainId);
  // Stored Chain IDs are normalized once when this settings page opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendChangeChainIdEvent = (newChainId) => {
    sendRuntimeMessage({
      message: "znn.chainIdChanged",
      data: {newChainId: newChainId}
    }, { fallback: null });
  }

  const onSelectChainId = async (chainId) => {
    const showSpinner = handleSpinner(
      <div>
        Connecting to {chainId}
        <div className='button secondary mt-2' onClick={() => showSpinner(false)}>Cancel</div>
      </div>
    );

    try {
      showSpinner(true);

      const selectedChainId = Number(chainId);
      Zenon.setChainIdentifier(selectedChainId);
      localStorage.setItem(Constants.DEFAULT_CHAINID_PATH, String(selectedChainId));
      setCurrentChainId(selectedChainId);
      dispatch(storeChainIdentifier(selectedChainId));
      sendChangeChainIdEvent(selectedChainId);
      await sendRuntimeMessage({
        message: 'internal.publishWalletState',
        data: { chainId: selectedChainId },
      }, { fallback: null });

      toast("Updated chainId", {
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
    }
    catch {
      // Restore the previously active chain ID after the selection fails.
      try {
        Zenon.setChainIdentifier(connectionParameters.chainIdentifier);
        setCurrentChainId(connectionParameters.chainIdentifier);

        toast(SAFE_NODE_ERROR, {
          position: "top-center",
          autoClose: 2500,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          newestOnTop: true,
          type: 'error',
          theme: 'dark'
        });
        showSpinner(false);
      }
      catch {
        showSpinner(false);
        toast(SAFE_NODE_ERROR, {
          position: "top-center",
          autoClose: 2500,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          newestOnTop: true,
          type: 'error',
          theme: 'dark'
        });
        showSpinner(false);
      }
    }
  }

  const addChainIdItem = (chainId) => {
    const normalizedChainId = Number(chainId);
    if (!Number.isSafeInteger(normalizedChainId)
      || normalizedChainId < 0
      || isInChainIdList(chainIdItems, normalizedChainId)) {
      return;
    }

    let updatedChainIds = [];
    setChainIdItems(prevChainIds => {
      updatedChainIds = [...prevChainIds, normalizedChainId];
      return updatedChainIds;
    })
    setChainIdToBeAdded("");

    localStorage.setItem("chainIdList", JSON.stringify(updatedChainIds));
  }

  const removeChainIdItem = (chainId) => {
    let updatedChainIds = [];
    setChainIdItems(prevChainIds => {
      updatedChainIds = prevChainIds.filter((v) => v !== chainId)
      return updatedChainIds;
    })

    localStorage.setItem("chainIdList", JSON.stringify(updatedChainIds));
  }

  const isInChainIdList = (chainIdList, chainId) => {
    return chainIdList.some(chainIdInList => Number(chainIdInList) === Number(chainId))
  }

  const validateAddChainId = (input) => {
    const normalizedChainId = Number(input);
    if (!Number.isSafeInteger(normalizedChainId) || normalizedChainId < 0) {
      return "Invalid chainId";
    }
    if (isInChainIdList(chainIdItems, normalizedChainId)) {
      return "ChainId already in list"
    }

    return true;
  }

  return (
    <div className='black-bg'>
      <h1 className='mt-1'>Change chainId</h1>

      <div className='mt-2 ml-2 mr-2'>
        {
          chainIdItems.map((item, index) => {
            return <ChangeChainIdItem isSelected={currentChainId === item} key={"change-chainId-item-" + index} onSelect={onSelectChainId} onRemove={removeChainIdItem} chainId={item}></ChangeChainIdItem>
          })
        }

        <form className='mt-2' id="addChainIdForm" onSubmit={handleSubmit(() => addChainIdItem(chainIdToBeAdded))}>
          <div className='custom-control'>
            <div className={`w-100`}>
              <input name="chainIdToBeAddedField" {...register("chainIdToBeAddedField",
                {
                  required: true,
                  validate: (input) => validateAddChainId(input)
                })}
                className={`w-100 custom-label pr-3 ${errors.chainIdToBeAddedField ? 'custom-label-error' : ''}`}
                placeholder="Add a chainId (Ex. 3)"
                value={chainIdToBeAdded}
                onChange={(e) => { setChainIdToBeAdded(e.target.value); setValue('chainIdToBeAddedField', e.target.value, { shouldValidate: true }) }}
                type='text'></input>

            </div>

            <div className={`input-error ${errors.chainIdToBeAddedField ? '' : 'invisible'}`}>
              {errors.chainIdToBeAddedField?.message || 'Type a chainId'}
            </div>
          </div>
        </form>

        <div className='mt-2 d-flex'>
          <input className='button primary w-100 d-flex justify-content-center text-white'
            value={"Add chainId"} type="submit" form="addChainIdForm" name="submitButton"></input>
        </div>

      </div>
    </div>
  );
};

export default ChangeChainId;
