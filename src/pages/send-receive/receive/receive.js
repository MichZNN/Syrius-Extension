import React, { useEffect, useState } from 'react';
import QRCode from "react-qr-code";
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import walletVault from '../../../services/security/walletVault';

const Receive = () => {
  const [address, setAddress] = useState("");
  const walletCredentials = useSelector(state => state.wallet);

  useEffect(() => {
    getWalletInfo();
    // The receive page only needs the selected address at mount time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getWalletInfo = async ()=>{
    try{
      const decrypted = walletVault.getKeyStore();

      if(decrypted){
        const currentKeyPair = walletVault.getKeyPair(walletCredentials.selectedAddressIndex);
        const address = (await currentKeyPair.getAddress()).toString();
        setAddress(address);
      }
    }
    catch{
      return false;
    }
  }

  return (
    <div className='black-bg'>

      <div className='ml-2 mr-2'>
        <div className="mt-3 mb-4" style={{position: "relative"}}>
          <h4 className='wrap-break-word'>{address}</h4>
          <div onClick={() => {try{navigator.clipboard.writeText(address); toast(`Copied to clipboard`, {
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
              }} className='copy-button' style={{position: "absolute", bottom: "-1.5em", right: 0}}>
            <img alt="" src={require('./../../../assets/copy-icon.png')} width='14px'></img>
          </div>
        </div>

        <div style={{ background: '#151515', padding: '1em' }}>
          <QRCode bgColor="#151515" fgColor="#00E721" value={address} level="M" />
        </div>

        <p className='mt-2'>This address can receive ZNN, QSR and other Zenon tokens.</p>
      </div>
  </div>
  );
};

export default Receive;
