import React, { useEffect, useState, useRef } from 'react';
import MenuHeader from '../../menu/menu-header/menu-header';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import {
  Zenon,
  Constants
} from 'znn-ts-sdk';
import { useDispatch, useSelector } from 'react-redux';
import { loadAddressInfoForWalletFromStorage, resetWalletState, storeWalletName } from '../../../services/redux/walletSlice';
import { useForm } from "react-hook-form";
import ControlledDropdown from '../../../components/custom-dropdown/controlled-dropdown';
import { toast } from 'react-toastify';
import { storeNodeUrl } from '../../../services/redux/connectionParametersSlice';
import { loadStorageWalletNames, readStoredRecord } from '../../../services/utils/utils';
import { storeChainIdentifier } from '../../../services/redux/connectionParametersSlice';
import { loadStorageAddressInfo } from './../../../services/utils/utils';
import {
  DEFAULT_MAINNET_CHAIN_ID,
  NODE_CHAIN_ID_STORAGE_KEY,
  getNodeChainId,
  resolveNodeUrl,
} from '../../../services/utils/networkDefaults';
import { SAFE_UNLOCK_ERROR } from '../../../services/security/safeErrors';
import walletVault from '../../../services/security/walletVault';
import { sendRuntimeMessage } from '../../../services/security/runtimeMessage';

const DashboardPassword = () => {
  const [walletPassword, setWalletPassword] = useState("");
  const navigate = useNavigate();

  const [walletNames, setWalletNames] = useState([]);
  const [unlockStatusLabel, setUnlockStatusLabel] = useState("Unlock");
  const [selectedWallet, setSelectedWallet] = useState(walletNames[0] || "");
  const connectionParameters = useSelector(state => state.connectionParameters);
  const final3Dobject = useRef({});
  const integrationFlowState = useSelector(state => state.integrationFlow);
  const dispatch = useDispatch();
  const { register, control, handleSubmit, formState: { errors }, reset, setValue } = useForm();

  const onFormSubmit = (data) => {
    unlockWallet(walletPassword, selectedWallet);
  };

useEffect(() => {
  dispatch(resetWalletState());
  walletVault.clear();

  if(!localStorage.getItem("currentNodeUrl")){
    navigate("/initial-node-selection");
    return;
  }

  const fetchData = async() => {
    const loadedWallets = loadStorageWalletNames();
    if(loadedWallets){
      setWalletNames(loadedWallets);

      try{
        const credentials = await getCredentialsFromBackgroundScript();
        setSelectedWallet(credentials.name);
        unlockWallet(null, credentials.name, credentials.entropy)
      }
      catch{
        if(loadedWallets.length === 1){
          setSelectedWallet(loadedWallets[0] || "");
        }
      }
    }
  }
  fetchData();

  setTimeout(() => {
    if(document.getElementById('moving-scene')){
      renderMovingBall()
    }
  }, 10);
// The unlock page initializes its restore flow once per popup instance.
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

const getCredentialsFromBackgroundScript = () => {
  return sendRuntimeMessage({
    message: "internal.getCredentialsFromBackgroundScript",
  }, { fallback: null }).then((credentials) => {
    if (credentials
      && typeof credentials.name === 'string'
      && credentials.entropy) {
      return credentials;
    }

    throw new Error(SAFE_UNLOCK_ERROR);
  });

}

const storeCredentialsToBackgroundScript = (entropy, name) => (
  sendRuntimeMessage({
      message: "internal.storeCredentialsToBackgroundScript",
      data: {
        name: name,
        entropy,
      }
    }, { fallback: null })
);

const onSelectWallet = (index, value) => {
  setSelectedWallet(value);
}

const getAddressFromDecrypted = async(decrypted, addressIndex) => {
  const currentKeyPair = decrypted.getKeyPair(addressIndex);
  const addr = (await currentKeyPair.getAddress()).toString();
  return addr;
}

const sendChangeAddressEvent = (newAddress) => {
  sendRuntimeMessage({
    message: "znn.addressChanged",
    data: {newAddress: newAddress}
  }, { fallback: null });
}

const unlockWallet = async (pass, name, entropy = null)=>{
  setUnlockStatusLabel("Unlocking in progress ...");

  try{
    const decrypted = entropy
      ? walletVault.unlockWithEntropy(name, entropy)
      : await walletVault.unlockWithPassword(name, pass);

    if(decrypted){

      const zenon = Zenon.getSingleton();

      const currentNodeUrl = resolveNodeUrl(localStorage.getItem("currentNodeUrl") || connectionParameters.nodeUrl);
      localStorage.setItem("currentNodeUrl", currentNodeUrl);

      const storedNodeChainIds = readStoredRecord(NODE_CHAIN_ID_STORAGE_KEY);
      const storedChainId = localStorage.getItem(Constants.DEFAULT_CHAINID_PATH);
      const parsedChainId = storedChainId === null ? NaN : Number(storedChainId);
      const chainIdentifier = Number.isSafeInteger(parsedChainId) && parsedChainId >= 0
        ? parsedChainId
        : getNodeChainId(currentNodeUrl, storedNodeChainIds) ?? DEFAULT_MAINNET_CHAIN_ID;
      Zenon.setChainIdentifier(chainIdentifier);
      localStorage.setItem(Constants.DEFAULT_CHAINID_PATH, String(chainIdentifier));

      try {
        await zenon.initialize(currentNodeUrl, false, 8000);
      } catch {
        // A node outage must not destroy a valid local unlock. The user can
        // open node settings and choose another endpoint while still unlocked.
        zenon.clearSocketConnection();
      }
      dispatch(storeNodeUrl(currentNodeUrl));
      dispatch(storeChainIdentifier(Zenon.getChainIdentifier()));
      dispatch(loadAddressInfoForWalletFromStorage(name));
      const addressInfo = loadStorageAddressInfo(name);
      walletVault.setSelectedAddressIndex(addressInfo.selectedAddressIndex);

      const storedCredentials = await storeCredentialsToBackgroundScript(
        walletVault.getEntropy(),
        name,
      );
      if (storedCredentials?.ok !== true) {
        throw new Error(SAFE_UNLOCK_ERROR);
      }

      dispatch(storeWalletName(name));
      setWalletPassword("");
      reset();
      setUnlockStatusLabel("Unlocked !");

      const address = await getAddressFromDecrypted(decrypted, addressInfo.selectedAddressIndex);
      await sendRuntimeMessage({
        message: 'internal.publishWalletState',
        data: {
          address,
          chainId: chainIdentifier,
          nodeUrl: currentNodeUrl,
        },
      }, { fallback: null });

      if(integrationFlowState.currentIntegrationFlow !== ""){
        navigate("/site-integration");
      }
      else{
        sendChangeAddressEvent(address);

        navigate("/tabs");
      }

    }
    else{
      setWalletPassword("");
      reset();
      setUnlockStatusLabel("Wrong password");
      setTimeout(()=>{
        setUnlockStatusLabel("Unlock");
      },2500);

    }
  }
  catch{
    Zenon.getSingleton().clearSocketConnection();
    walletVault.clear();
    dispatch(resetWalletState());
    setWalletPassword("");
    reset();
    toast(SAFE_UNLOCK_ERROR,{
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

    setUnlockStatusLabel("Error unlocking");

    setTimeout(()=>{
      setUnlockStatusLabel("Unlock");
    },2500);
  }
}

const renderMovingBall = function(){
  const camera = new THREE.PerspectiveCamera( 70, window.innerWidth / 100, 0.1, 2000 );
  camera.position.z = 1;
  const scene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(0.45, 32, 16);
  const lgt = new THREE.PointLight()
  lgt.position.set(0, 0, 0);
  lgt.intensity = 0.8;
  scene.add(lgt)

  const color = 0xFFFFFF;
  const intensity = 0.4;
  const light = new THREE.DirectionalLight(color, intensity);
  light.castShadow = true;
  light.position.set(0, 1.5, 0);
  light.target.position.set(-4, 0, -4);
  scene.add(light);
  scene.add(light.target);

  let textureLoader = new THREE.TextureLoader();
  const map = textureLoader.load(require('./../../../assets/cyber-eye-equirectangular.png'));
  const mat = new THREE.MeshToonMaterial({map: map});
  geometry.rotateY(4.71);
  const mesh = new THREE.Mesh(geometry, mat);

  final3Dobject.current = mesh;
  scene.add( mesh );

  const renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
  renderer.setSize( window.innerWidth, '100' );
  renderer.setAnimationLoop( animation );

  document.getElementById('moving-scene').appendChild( renderer.domElement );

  function animation( time ) {
    renderer.render( scene, camera );
  }

  window.addEventListener('mousemove', function(e){
    const mouse3D = new THREE.Vector3(
        ( e.clientX / window.innerWidth ) * 1.5 - 0.75, // subtract for looking more to left
        - ( e.clientY / window.innerHeight ) * 1.5 + 0.33, // subtract for looking more down
        1.2 );

      final3Dobject.current.lookAt(mouse3D);
  })
}

  return (
    <div className='black-bg'>
      <MenuHeader changeNodeButton={true} />
        <div className="d-flex w-100 justify-content-center">
          <div className="mt-2" id="moving-scene" style={{height: '100px'}}>
          </div>
        </div>
        <div className='ml-2 mr-2'>
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <h2 className='mt-2'>Enter your password</h2>
            <div className='mt-5'>
              <div className='custom-control'>
                <ControlledDropdown dropdownComponent = 'CustomDropdown'
                  {...register("selectedWalletField", { required: true })} control={control}
                  name="selectedWalletField"
                  options={walletNames}
                  onChange={onSelectWallet}
                  value={selectedWallet}
                  placeholder="Select wallet"
                  className={`${errors.selectedWalletField?'custom-label-error':''}`} />

                <div className={`input-error ${errors.selectedWalletField?.type === 'required'?'':'invisible'}`}>
                  Wallet is required
                </div>
              </div>

              <div className='custom-control'>
                <input name="passwordField" {...register("passwordField", { required: true })}
                  className={`w-100 custom-label ${errors.passwordField?'custom-label-error':''}`}
                  placeholder="Type your password" autoComplete="off" value={walletPassword} onChange={(e) => {setWalletPassword(e.target.value); setValue('passwordField', e.target.value, {shouldValidate: true})}} type='password'></input>

                <div className={`input-error ${errors.passwordField?.type === 'required'?'':'invisible'}`}>
                  Password is required
                </div>
              </div>
            </div>


            <input value={unlockStatusLabel} type="submit" name="submitButton" className='button primary w-100 text-white'></input>
          </form>
          {
            <div className='mt-5 mb-5 text-center text-gray'>
              <b>Or <span onClick={()=>navigate('/auth')} className="text-primary cursor-pointer">create new wallet</span></b>
            </div>
          }
        </div>
    </div>
  );
};

export default DashboardPassword;
