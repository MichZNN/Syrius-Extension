import React, { useEffect, useState, useContext, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ChangeAddressItem from '../../../components/change-address-item/change-address-item';
import { SpinnerContext } from '../../../services/hooks/spinner/spinnerContext';
import { storeMaxAddressIndex, storeSelectedAddressIndex } from '../../../services/redux/walletSlice';
import { toast } from 'react-toastify';
import {
  MAX_ADDRESS_INDEX,
  readStoredRecord,
} from '../../../services/utils/utils';
import walletVault from '../../../services/security/walletVault';
import { sendRuntimeMessage } from '../../../services/security/runtimeMessage';

const ChangeAddress = () => {
  const [currentAddress, setCurrentAddress] = useState();
  const { handleSpinner } = useContext(SpinnerContext);
  const walletCredentials = useSelector(state => state.wallet);
  const dispatch = useDispatch();
  const [addresses, setAddresses] = useState([]);
  const addressInfo = useRef({});

  useEffect(() => {
     const fetchAddresses = async() => {
      await getAddresses(walletCredentials.maxAddressIndex);

      addressInfo.current = readStoredRecord("addressInfo");
      addressInfo.current[walletCredentials.walletName] = {
        selectedAddressIndex: walletCredentials.selectedAddressIndex,
        maxAddressIndex: walletCredentials.maxAddressIndex
      }
      localStorage.setItem("addressInfo", JSON.stringify(addressInfo.current));

      setCurrentAddress(walletCredentials.selectedAddressIndex);
    }
    fetchAddresses();
  // Address metadata is loaded once for this settings page instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAddresses = async (maxIndex)=>{
    const showSpinner = handleSpinner(
      <>
        <div className='text-bold'>
          Loading addresses ...
        </div>
      </>
    );

    try{
      if (!Number.isSafeInteger(maxIndex)
        || maxIndex <= 0
        || maxIndex > MAX_ADDRESS_INDEX) {
        showSpinner(false);
        return;
      }

      showSpinner(true);
      setAddresses([]);
      setAddresses(await walletVault.getAddresses(maxIndex));
      showSpinner(false);
    }
    catch{
      showSpinner(false);
    }
  }

  const sendChangeAddressEvent = (newAddress) => {
    sendRuntimeMessage({
      message: "znn.addressChanged",
      data: {newAddress: newAddress}
    }, { fallback: null });
  }

  const onSelectAddress = async (address) => {
    setCurrentAddress(address);
    walletVault.setSelectedAddressIndex(address);
    dispatch(storeSelectedAddressIndex(address));

    addressInfo.current[walletCredentials.walletName] = {
      selectedAddressIndex: address,
      maxAddressIndex: walletCredentials.maxAddressIndex
    }
    localStorage.setItem("addressInfo", JSON.stringify(addressInfo.current));

    sendChangeAddressEvent(addresses[address]);
    await sendRuntimeMessage({
      message: 'internal.publishWalletState',
      data: { address: addresses[address] },
    }, { fallback: null });

    toast(`Successfully changed address`, {
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
  }

  const addAddress = () => {
    if (!Number.isSafeInteger(walletCredentials.maxAddressIndex)
      || walletCredentials.maxAddressIndex >= MAX_ADDRESS_INDEX) {
      return;
    }

    addressInfo.current[walletCredentials.walletName] = {
      selectedAddressIndex: walletCredentials.selectedAddressIndex,
      maxAddressIndex: walletCredentials.maxAddressIndex+1
    }
    localStorage.setItem("addressInfo", JSON.stringify(addressInfo.current));

    dispatch(storeMaxAddressIndex(walletCredentials.maxAddressIndex+1));

    getAddresses(walletCredentials.maxAddressIndex + 1);
  }


  return (
    <div className='black-bg'>
      <h1 className='mt-1'>Change address</h1>

      <div className='mt-2 ml-2 mr-2'>
        {
          addresses.map((item, index) => {
            return <ChangeAddressItem isSelected={currentAddress === index} key={"change-address-item-" + index} index={index} onSelect={onSelectAddress} address={item}></ChangeAddressItem>
          })
        }

        <div className='mt-2 stick-bottom d-flex'>
          <div className='button primary w-100 d-flex justify-content-center text-white'
            onClick={addAddress} name="submitButton">Add address</div>
        </div>

      </div>
    </div>
  );
};

export default ChangeAddress;
