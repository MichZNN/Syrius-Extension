import React, { useState } from 'react';
import NavBack from '../../components/nav-back/nav-back';
import ProgressSteps from '../../components/progress-steps/progress-steps';
import {
  KeyStore,
  KeyStoreManager,
} from 'znn-ts-sdk';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import fallbackValues from '../../services/utils/fallbackValues';
import { toast } from 'react-toastify';
import {
  isSafeWalletName,
  loadStorageWalletNames,
} from '../../services/utils/utils';
import { SAFE_OPERATION_ERROR } from '../../services/security/safeErrors';

const Recovery = () => {
  const [mnemonic, setMnemonic] = useState("");
  const [walletName, setWalletName] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [currentFlowStep, setCurrentFlowStep] = useState(0);
  const passwordValidationInfo = fallbackValues.passwordValidationInfo;
  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm();

  const navigate = useNavigate();

  const validateCredentials = async (mnemonic, walletName, password, repeatPassword) => {
    if(walletName && password && password === repeatPassword){
      try{
        const isValidName = validateWalletName(walletName);

        if(isValidName!==true){
          return new Error(isValidName);
        }

        const isValidKeystore = await createKeystoreFromMnemonic(mnemonic, password, walletName);
        if(isValidKeystore!==true){
          return new Error(isValidKeystore);
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

  const saveNewKeyStore = async (mnemonic, pass, name) => {
    const _keyManager = new KeyStoreManager();
    const _keyStore = new KeyStore();
    const newStore = _keyStore.fromMnemonic(mnemonic);
    await _keyManager.saveKeyStore(newStore, pass, name);
  }

  const createKeystoreFromMnemonic = async (mnemonic) => {
    const _keyStore = new KeyStore();
    const newStore = _keyStore.fromMnemonic(normaliseMnemonic(mnemonic));
    return Boolean(newStore);
  }

  const onFormSubmit = () => {
    nextStep();
  };

  const validatePasswords = (repeatedPassword) =>{
    if(repeatedPassword === password){
      return true
    }else{
      return "Passwords don't match"
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

  const isCorrectMnemonic = (inputMnemonic) =>{
    const cleanedMnemonic = normaliseMnemonic(inputMnemonic);
    const wordCount = cleanedMnemonic ? cleanedMnemonic.split(' ').length : 0;

    if (wordCount !== 24 && wordCount !== 12) {
      return false;
    }

    try {
      new KeyStore().fromMnemonic(cleanedMnemonic);
      return true;
    } catch {
      return false;
    }
  }

  const normaliseMnemonic = (inputMnemonic) => (
    typeof inputMnemonic === 'string'
      ? inputMnemonic.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
      : ''
  );

  const nextStep = async () => {
    let isValidated = false;

    switch(currentFlowStep){
      default:
      case 0:{
        if(isCorrectMnemonic(mnemonic)){
          isValidated = true;
        }

        break;
      }
      case 1:{
        try{
          const isValid = await validateCredentials(mnemonic, walletName, password, repeatPassword);
          if(isValid!==true) {
            throw new Error(isValid);
          }
          isValidated = true;
          await saveNewKeyStore(mnemonic, password, walletName);
          setMnemonic("");
          setPassword("");
          setRepeatPassword("");
          reset();
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
      case 2:{
        navigate("/password");
        break;
      }

    }

    if(isValidated) {
      setCurrentFlowStep(currentFlowStep+1);
    }

  };

  return (
    <div className='black-bg onboarding-layout'>
      <div className='header'>
        <div className='back-button-container'>
          <NavBack/>
        </div>
      <h1 className='mt-0'>Import seed</h1>
      </div>
      {currentFlowStep === 0 &&
        <div className=''>
          <div className='mt-4 secret-phrase-container'>
            <textarea autoComplete='off' placeholder='Type your 12 or 24 words seed / recovery phrase' rows='4' className='secret-phrase-text' value={mnemonic} onChange={(e) => setMnemonic(e.target.value)}></textarea>
          </div>

          <div className={`mt-2 input-error ${!isCorrectMnemonic(mnemonic)?'':'invisible'}`}>
            { 'Invalid mnemonic'}
          </div>

          <div className='mt-2 buttons-container'>
            <div className={`button primary ${!isCorrectMnemonic(mnemonic)?'disabled':''}`} onClick={nextStep}>Import</div>
          </div>

        </div>
      }

      {currentFlowStep === 1 &&
        <div className=''>
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
                { errors.walletNameField?.message || 'Wallet name is required'}
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

      {currentFlowStep === 2 &&
        <div className=''>
          <p>Open the extension and sign in</p>
          <div className='mt-4 button primary' onClick={nextStep}>Done</div>
        </div>
      }

      <ProgressSteps currentStep={currentFlowStep} maxSteps={3}/>
    </div>
  );
};

export default Recovery;
