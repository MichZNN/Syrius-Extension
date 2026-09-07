import React, { useEffect, useState, useContext } from 'react';
import { useForm } from 'react-hook-form';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Zenon, Constants } from 'znn-ts-sdk';
import ChangeNodeItem from '../../../components/change-node-item/change-node-item';
import { SpinnerContext } from '../../../services/hooks/spinner/spinnerContext';
import {
  storeChainIdentifier,
  storeNodeUrl,
} from '../../../services/redux/connectionParametersSlice';
import {
  DEFAULT_MAINNET_CHAIN_ID,
  NODE_CHAIN_ID_STORAGE_KEY,
  getNodeChainId,
  isValidNodeUrl,
  mergeNodeChainIds,
  mergeNodeUrls,
  resolveNodeUrl,
} from '../../../services/utils/networkDefaults';
import { SAFE_NODE_ERROR } from '../../../services/security/safeErrors';
import { readStoredArray, readStoredRecord } from '../../../services/utils/utils';

const InitialNodeSelection = () => {
  const [currentNode, setCurrentNode] = useState('');
  const [nodeToBeAdded, setNodeToBeAdded] = useState('');
  const [nodeChainIdToBeAdded, setNodeChainIdToBeAdded] = useState(
    String(DEFAULT_MAINNET_CHAIN_ID)
  );
  const { register, handleSubmit, formState: { errors }, setValue } = useForm();
  const zenon = Zenon.getSingleton();
  const { handleSpinner } = useContext(SpinnerContext);
  const connectionParameters = useSelector(state => state.connectionParameters);
  const dispatch = useDispatch();
  const [nodeItems, setNodeItems] = useState(() => (
    readStoredArray("nodeList").filter((node) => isValidNodeUrl(node))
  ));
  const [nodeChainIds, setNodeChainIds] = useState(
    () => readStoredRecord(NODE_CHAIN_ID_STORAGE_KEY)
  );
  const navigate = useNavigate();

  useEffect(() => {
    const currentNodeUrl = resolveNodeUrl(localStorage.getItem("currentNodeUrl") || connectionParameters.nodeUrl);
    localStorage.setItem("currentNodeUrl", currentNodeUrl);

    const updatedNodes = mergeNodeUrls(nodeItems, currentNodeUrl);
    const updatedNodeChainIds = mergeNodeChainIds(
      updatedNodes,
      currentNodeUrl,
      nodeChainIds
    );
    setNodeItems(updatedNodes);
    setNodeChainIds(updatedNodeChainIds);
    localStorage.setItem("nodeList", JSON.stringify(updatedNodes));
    localStorage.setItem(
      NODE_CHAIN_ID_STORAGE_KEY,
      JSON.stringify(updatedNodeChainIds)
    );
    setCurrentNode(currentNodeUrl);
  // Stored node metadata is migrated once during first-run setup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelectNode = async (node) => {
    const selectedChainId = getNodeChainId(node, nodeChainIds);
    const previousChainId = Number.isSafeInteger(
      Number(connectionParameters.chainIdentifier)
    )
      ? Number(connectionParameters.chainIdentifier)
      : DEFAULT_MAINNET_CHAIN_ID;
    const showSpinner = handleSpinner(
      <div>
        Connecting to {node}
        <div className='button secondary mt-2' onClick={() => showSpinner(false)}>Cancel</div>
      </div>
    );

    try {
      showSpinner(true);

      zenon.clearSocketConnection();
      Zenon.setChainIdentifier(selectedChainId);
      await zenon.initialize(node, false, 2500)
      setCurrentNode(node);
      localStorage.setItem("currentNodeUrl", node);
      localStorage.setItem(Constants.DEFAULT_CHAINID_PATH, String(selectedChainId));
      dispatch(storeNodeUrl(node));
      dispatch(storeChainIdentifier(selectedChainId));

      toast("Updated node url", {
        position: "top-center",
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
      // Restore the previously active node after the new connection fails.
      try {
        Zenon.setChainIdentifier(previousChainId);
        await zenon.initialize(connectionParameters.nodeUrl, false, 2500);
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

  const addNodeItem = (node, chainId) => {
    const normalizedNode = typeof node === 'string' ? node.trim() : '';
    const normalizedChainId = Number(chainId);
    if (!isValidNodeUrl(normalizedNode)
      || !Number.isSafeInteger(normalizedChainId)
      || normalizedChainId < 0
      || isInNodeList(nodeItems, normalizedNode)) {
      return;
    }

    const updatedNodes = [...nodeItems, normalizedNode];
    const updatedNodeChainIds = {
      ...nodeChainIds,
      [normalizedNode]: normalizedChainId,
    };

    setNodeItems(updatedNodes);
    setNodeChainIds(updatedNodeChainIds);
    setNodeToBeAdded("");
    setNodeChainIdToBeAdded(String(DEFAULT_MAINNET_CHAIN_ID));
    setValue(
      "nodeChainIdToBeAddedField",
      String(DEFAULT_MAINNET_CHAIN_ID),
      { shouldValidate: false }
    );

    localStorage.setItem("nodeList", JSON.stringify(updatedNodes));
    localStorage.setItem(
      NODE_CHAIN_ID_STORAGE_KEY,
      JSON.stringify(updatedNodeChainIds)
    );
  }

  const saveNode = () => {
    navigate("/password");
  }


  const removeNodeItem = (node) => {
    const updatedNodes = nodeItems.filter((item) => item !== node);
    const updatedNodeChainIds = { ...nodeChainIds };
    delete updatedNodeChainIds[node];

    setNodeItems(updatedNodes);
    setNodeChainIds(updatedNodeChainIds);
    localStorage.setItem("nodeList", JSON.stringify(updatedNodes));
    localStorage.setItem(
      NODE_CHAIN_ID_STORAGE_KEY,
      JSON.stringify(updatedNodeChainIds)
    );
  }

  const isInNodeList = (nodeList, node) => {
    return nodeList.some((nodeInList) => node === nodeInList)
  }

  const validateAddNode = (input) => {
    const normalizedNode = typeof input === 'string' ? input.trim() : '';
    if (isValidNodeUrl(normalizedNode)) {
      if (isInNodeList(nodeItems, normalizedNode)) {
        return "Node already in list"
      } else return true;
    } else return "Invalid address"
  }

  const validateAddChainId = (input) => {
    if (input === null || input === undefined || String(input).trim() === "") {
      return "Type a valid Chain ID";
    }

    const normalizedChainId = Number(input);
    if (!Number.isSafeInteger(normalizedChainId) || normalizedChainId < 0) {
      return "Invalid Chain ID";
    }

    return true;
  }

  return (
    <div className='black-bg mt-5 mb-5 pl-2 pr-2'>
      <h1 className='mt-1'>Select your node</h1>
      <h5 className='mt-1 text-gray'>This is the url of your trusted Zenon Node</h5>

      <div className='mt-2'>
        {
          nodeItems.map((item, index) => {
            return <ChangeNodeItem isSelected={currentNode === item} key={"change-node-item-" + index} onSelect={onSelectNode} onRemove={removeNodeItem} url={item} chainId={getNodeChainId(item, nodeChainIds)}></ChangeNodeItem>
          })
        }

        <form className='mt-2' id="addNodeForm" onSubmit={handleSubmit(() => addNodeItem(nodeToBeAdded, nodeChainIdToBeAdded))}>
          <div className='custom-control'>
            <div className={`w-100`}>
              <input name="nodeToBeAddedField" {...register("nodeToBeAddedField",
                {
                  required: true,
                  validate: (input) => validateAddNode(input)
                })}
                className={`w-100 custom-label pr-3 ${errors.nodeToBeAddedField ? 'custom-label-error' : ''}`}
                placeholder="Add a node (Ex. wss://node.example:35998)"
                value={nodeToBeAdded}
                onChange={(e) => { setNodeToBeAdded(e.target.value); setValue('nodeToBeAddedField', e.target.value, { shouldValidate: true }) }}
                type='text'></input>

            </div>

            <div className={`input-error ${errors.nodeToBeAddedField ? '' : 'invisible'}`}>
              {errors.nodeToBeAddedField?.message || 'Type an url'}
            </div>
          </div>
          <div className='custom-control mt-2'>
            <div className='w-100'>
              <label className='text-gray text-sm d-block mb-1' htmlFor="nodeChainIdToBeAddedField">
                Chain ID (default: 1 = mainnet)
              </label>
              <input id="nodeChainIdToBeAddedField" name="nodeChainIdToBeAddedField" {...register("nodeChainIdToBeAddedField", {
                required: true,
                validate: (input) => validateAddChainId(input)
              })}
                className={`w-100 custom-label pr-3 ${errors.nodeChainIdToBeAddedField ? 'custom-label-error' : ''}`}
                placeholder="Chain ID (mainnet: 1, testnet: 3)"
                value={nodeChainIdToBeAdded}
                onChange={(e) => { setNodeChainIdToBeAdded(e.target.value); setValue('nodeChainIdToBeAddedField', e.target.value, { shouldValidate: true }) }}
                type='number' min='0' step='1' inputMode='numeric'></input>
            </div>

            <div className={`input-error ${errors.nodeChainIdToBeAddedField ? '' : 'invisible'}`}>
              {errors.nodeChainIdToBeAddedField?.message || 'Type a valid Chain ID'}
            </div>
          </div>
        </form>

        <div className='mt-2 d-flex'>
          <input className='button secondary w-100 d-flex justify-content-center text-white'
            value={"Add node"} type="submit" form="addNodeForm" name="submitButton"></input>
        </div>

        <div className='button primary mt-2 stick-bottom-1em' onClick={saveNode}>Save</div>

      </div>
    </div>
  );
};

export default InitialNodeSelection;
