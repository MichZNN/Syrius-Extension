import React from 'react';
import SettingsItem from '../../../components/settings-item/settings-item';

const Settings = () => {
  const settingsItems = [
    // Password changes require SDK support for re-encrypting the stored keystore.
    {
      icon: "view-mnemonic",
      title: "View backup phrase",
      description: "You can see your backup phrase (mnemonic) here",
      url: "export-mnemonic",
    },
    {
      icon: "change-network",
      title: "Node management",
      description: "You can change your current node and Chain ID here",
      url: "change-node",
    },
    {
      icon: "change-chainId",
      title: "ChainId management",
      description: "You can change your current chainId here",
      url: "change-chainId",
    },
    {
      icon: "lock",
      title: "Auto-lock",
      description: "Lock the active session after a period of inactivity",
      url: "auto-lock",
    },
    {
      icon: "settings",
      title: "Connected sites",
      description: "Review and revoke bridge website permissions",
      url: "connected-sites",
    },

  ]

  return (
    <div className='black-bg'>
      <h1 className='mt-1'>Settings</h1>

      <div className='mt-2 ml-2 mr-2'>
        {
          settingsItems.map((item, index)=>{
            return <SettingsItem key={"settings-item-"+index} icon={item.icon} title={item.title} description={item.description} url={item.url}></SettingsItem>
          })
        }

      </div>
  </div>
  );
};

export default Settings;
