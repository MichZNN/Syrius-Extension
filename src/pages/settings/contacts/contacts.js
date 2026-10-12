import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Primitives } from 'znn-ts-sdk';

import Icon from '../../../components/icon/icon';
import { notify } from '../../../services/utils/notify';
import { getContacts, removeContact, saveContact } from '../../../services/utils/storage';
import app from '../../../services/utils/app';

// The address book: names for addresses, offered on Send (the book button by
// the recipient field). Kept on this device only (services/utils/storage.js).

const validAddress = (input) => {
  try {
    Primitives.Address.parse((input || '').trim());
    return true;
  } catch (error) {
    return 'That is not a valid Zenon address';
  }
};

const Contacts = () => {
  const [contacts, setContacts] = useState(getContacts);
  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm({ mode: 'onSubmit' });

  const add = ({ name, address }) => {
    try {
      setContacts(saveContact(name, address.trim()));
      reset();
    } catch (error) {
      notify.error(error);
    }
  };

  const remove = (address) => {
    try {
      setContacts(removeContact(address));
    } catch (error) {
      notify.error(error);
    }
  };

  const scan = async () => {
    try {
      const found = ((await app().scan()) || '').match(/z1[0-9a-z]{38}/);
      if (found) setValue('address', found[0], { shouldValidate: true });
    } catch (error) {
      notify.error(error);
    }
  };

  return (
    <div className="page">
      <div className="settings-group contacts-list">
        {!contacts.length && <div className="text-gray text-xs contacts-empty">None yet</div>}
        {contacts.map((entry) => (
          <div className="contact-row" key={entry.address}>
            <div className="contact-text">
              <span className="recipient-name">{entry.name}</span>
              <span className="mono" title={entry.address}>{entry.address.slice(0, 10)}…{entry.address.slice(-6)}</span>
            </div>
            <button type="button" className="input-icon-button" aria-label={`Remove ${entry.name}`} onClick={() => remove(entry.address)}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(add)}>
        <div className="custom-control">
          <input
            {...register('name', { required: 'Give the contact a name', maxLength: { value: 32, message: 'At most 32 characters' } })}
            className={`w-100 custom-label ${errors.name ? 'custom-label-error' : ''}`}
            placeholder="Name"
            autoComplete="off"
          />
          <div className={`input-error ${errors.name ? '' : 'invisible'}`}>{errors.name?.message || ' '}</div>
        </div>
        <div className="custom-control">
          <div className="input-with-button w-100">
            <input
              {...register('address', { required: 'Enter an address', validate: validAddress })}
              className={`w-100 custom-label ${errors.address ? 'custom-label-error' : ''}`}
              placeholder="Address"
              spellCheck="false"
              autoComplete="off"
            />
            {app() && (
              <div className="input-icon-buttons">
                <button type="button" className="input-icon-button" aria-label="Scan QR code" onClick={scan}>
                  <Icon name="scan" size={18} />
                </button>
              </div>
            )}
          </div>
          <div className={`input-error ${errors.address ? '' : 'invisible'}`}>{errors.address?.message || ' '}</div>
        </div>
        <button type="submit" className="button primary w-100 text-white">Save contact</button>
      </form>
    </div>
  );
};

export default Contacts;
