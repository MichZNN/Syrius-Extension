import React, { useState, useEffect } from 'react';
import NavBack from '../../components/nav-back/nav-back';
import ProgressSteps from '../../components/progress-steps/progress-steps';
import {
  KeyStoreManager,
} from 'znn-ts-sdk';

import { useNavigate } from 'react-router-dom';
import {
  arrayShuffle,
  isSafeWalletName,
  loadStorageWalletNames,
} from '../../services/utils/utils';
import OrderWords from '../../components/order-words/order-words';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import fallbackValues from '../../services/utils/fallbackValues';
import { SAFE_OPERATION_ERROR } from '../../services/security/safeErrors';

const GetStarted = () => {
  const [mnemonic, setMnemonic] = useState("");
  const [newlyCreatedStore, setNewlyCreatedStore] = useState();
  const [walletName, setWalletName] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [currentFlowStep, setCurrentFlowStep] = useState(0);
  const [shuffledMnemonic, setShuffledMnemonic] = useState([]);
  const [orderedMnemonic, setOrderedMnemonic] = useState([]);
  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm();
  const navigate = useNavigate();
  const [savedMnemonicCheckbox, setSavedMnemonicCheckbox] = useState(false);
  const passwordValidationInfo = fallbackValues.passwordValidationInfo;

  useEffect(() => {
    setShuffledMnemonic(shuffledMnemonic);
  }, [shuffledMnemonic]);

  const validateCredentials = async (walletName, password, repeatPassword) => {
    if(walletName && password && password === repeatPassword){
      try{
        const isValidName = validateWalletName(walletName);

        if(isValidName!==true){
          return new Error(isValidName);
        }

        return true
      }
      catch{
        throw new Error(SAFE_OPERATION_ERROR);
      }
    }
    else{
      throw new Error("Invalid wallet name or password");
    }
  }

  const validateWalletName = (walletName) =>{
    if(isSafeWalletName(walletName)){
      const loadedWallets = loadStorageWalletNames();

      if((loadedWallets.length > 0) && (loadedWallets.filter((existingWallet)=>existingWallet===walletName).length > 0)){
        return 'Wallet name already used'
      }
      return true
    }else{
      return "Invalid wallet name"
    }
  }

  const saveKeyStore = async (store, pass, name) => {
    const _keyManager = new KeyStoreManager();
    return await _keyManager.saveKeyStore(store, pass, name);
  }

  const getNewStore = async () => {
    const _keyManager = new KeyStoreManager();
    return await _keyManager.getNewKeystore();
  };

  const nextStep = async () => {
      let isValidated = false;

      switch(currentFlowStep){
        default:
        case 0:{
          try{
            const isValid = await validateCredentials(walletName, password, repeatPassword);
            if(isValid!==true) {
              throw new Error(isValid);
            }
            const newStore = await getNewStore()
            setNewlyCreatedStore(newStore);
            const generatedMnemonic = newStore['mnemonic'];
            setMnemonic(generatedMnemonic);
            setShuffledMnemonic(arrayShuffle(generatedMnemonic.split(" ")));
            isValidated = true;
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
          break;
        }
        case 1:{
          isValidated = savedMnemonicCheckbox;
          break;
        }
        case 2:{
          try{
            if(isCorrectMnemonic(orderedMnemonic)){
              await saveKeyStore(newlyCreatedStore, password, walletName);
              setMnemonic("");
              setNewlyCreatedStore(undefined);
              setShuffledMnemonic([]);
              setOrderedMnemonic([]);
              setPassword("");
              setRepeatPassword("");
              reset();
              isValidated = true;
            }
            else{
              throw(Error("Invalid mnemonic"));
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
          }
        break;
      }

      case 3:{
        navigate("/password");
        break;
      }

    }

    if(isValidated) {
      setCurrentFlowStep(currentFlowStep+1);
    }
  };

  const onFormSubmit = (walletName, password, repeatPassword) => {
    nextStep();
  };

  const validatePasswords = (repeatedPassword) =>{
    if(repeatedPassword === password){
      return true
    }else{
      return "Passwords don't match"
    }
  }

  const isCorrectMnemonic = (orderedMnemonic) =>{
    const originalMnemonic = mnemonic.split(" ");

    return orderedMnemonic.length === originalMnemonic.length && orderedMnemonic.every((value, index) => value === originalMnemonic[index])
  }

  return (
    <div className='black-bg onboarding-layout'>
      <div className='header'>
        <div className='back-button-container'>
          <NavBack/>
        </div>
        <h1 className='mt-0'>Backup phrase</h1>
      </div>
      {currentFlowStep === 0 &&
        <div className=''>
          <p>Let's set up a new passcode </p>
          <form onSubmit={handleSubmit(()=>onFormSubmit(walletName, password, repeatPassword))}>
            <div className='custom-control'>
              <input name="walletNameField" {...register("walletNameField", { required: true,
                    minLength: {
                      value: 2,
                      message: 'Minimum of 2 characters'
                    },
                    maxLength: {
                      value: 512,
                      message: 'Maximum of 512 characters'
                    }
                  })}
                className={`w-100 custom-label ${errors.walletNameField?'custom-label-error':''}`}
                placeholder="Wallet name" value={walletName} onChange={(e) => {setWalletName(e.target.value); setValue('walletNameField', e.target.value, {shouldValidate: true})}} type='text'></input>

              <div className={`input-error ${errors.walletNameField?'':'invisible'}`}>
                { errors.walletNameField?.message || 'Wallet name is required' }
              </div>
            </div>

            <div className='custom-control'>
              <input name="passwordField" {...register("passwordField", { required: true,
                    minLength: {
                      value: 8,
                      message: 'Minimum of 8 characters'
                    },
                    maxLength: {
                      value: 512,
                      message: 'Maximum of 512 characters'
                    },
                    validate: (value)=>RegExp(passwordValidationInfo.strongRegex).test(value) || passwordValidationInfo.passwordCriteria
                  })}
                className={`w-100 custom-label ${errors.passwordField?'custom-label-error':''}`}
                placeholder="New password" autoComplete="new-password" value={password} onChange={(e) => {setPassword(e.target.value); setValue('passwordField', e.target.value, {shouldValidate: true})}} type='password'></input>

              <div className={`input-error long-error-message ${errors.passwordField?'':'invisible'}`}>
                { errors.passwordField?.message || 'New password is required'}
              </div>
            </div>

            <div className='custom-control'>
              <input name="repeatPasswordField" {...register("repeatPasswordField", { required: true,
                    minLength: {
                      value: 8,
                      message: 'Minimum of 8 characters'
                    },
                    maxLength: {
                      value: 512,
                      message: 'Maximum of 512 characters'
                    },
                    validate: (value)=>validatePasswords(value)
                  })}
                className={`w-100 custom-label ${errors.repeatPasswordField?'custom-label-error':''}`}
                placeholder="Confirm password" autoComplete="new-password" value={repeatPassword} onChange={(e) => {setRepeatPassword(e.target.value); setValue('repeatPasswordField', e.target.value, {shouldValidate: true})}} type='password'></input>

              <div className={`input-error ${errors.repeatPasswordField?'':'invisible'}`}>
                { errors.repeatPasswordField?.message || 'Please confirm password'}
              </div>
            </div>

            <input className={`button primary w-100 text-white`}
              value='Next' type="submit" name="submitButton"></input>
          </form>
        </div>
      }

      {currentFlowStep === 1 &&
        <div className=''>
          <p>Your secret 12-word recovery phrase is the only way to recover your funds if you lose access to your wallet</p>
          <div className='mt-4 secret-phrase-container'>
          <div className='secret-phrase-text'>{mnemonic}</div>
          </div>
          <p className='text-warning text-xs mt-2'>Write this phrase down and keep it offline. It is deliberately not copied to the clipboard.</p>

          <div className='mt-4 text-left custom-checkbox-container'>
            <label className='pt-3 pb-3 custom-checkbox' htmlFor='agree_phrase'>
              <input className='mr-3 custom-checkbox' id="agree_phrase" type='checkbox'
                value={savedMnemonicCheckbox} onChange={(e) => {setSavedMnemonicCheckbox(!savedMnemonicCheckbox)}}></input>
                <span className='custom-checkmark'></span>
                I saved my backup phrase
              </label>
          </div>

          <div className='mt-4 buttons-container'>
            <div className={`button primary ${!savedMnemonicCheckbox?'disabled':''}`} onClick={nextStep}>Next</div>
          </div>
        </div>
      }

      {currentFlowStep === 2 &&
          <div className=''>
          <p>Put the words in order </p>

          <OrderWords ordered={orderedMnemonic} setOrder={setOrderedMnemonic} shuffled={shuffledMnemonic}></OrderWords>

          <div className={`input-error ${!isCorrectMnemonic(orderedMnemonic)?'':'invisible'}`}>
            { 'Words are not in the correct order'}
          </div>

          <div className='mt-2 buttons-container'>
            <div className={`button primary ${!isCorrectMnemonic(orderedMnemonic)?'disabled':''}`} onClick={nextStep}>Next</div>
          </div>
        </div>
      }

      {currentFlowStep === 3 &&
        <div className=''>
          <p>Open the extension and sign in</p>
          <div className='mt-4 button primary' onClick={nextStep}>Done</div>
        </div>
      }

      <ProgressSteps currentStep={currentFlowStep} maxSteps={3}/>
    </div>
  );
};

export default GetStarted;
