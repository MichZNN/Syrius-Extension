import React from 'react';
import { toast } from 'react-toastify';
import ExternalLinkIcon from '../../animated-icons/external-link/external-link';
import { getExplorerTransactionUrl } from '../../services/utils/explorer';

const icons = {
  receive: require('./../../assets/send-left-green.svg'),
  receiveToken: require('./../../assets/send-left-blue.svg'),
  send: require('./../../assets/send-right-green.svg'),
  sendToken: require('./../../assets/send-right-blue.svg'),
  stake: require('./../../assets/blocks.svg'),
  pillar: require('./../../assets/pillar.svg'),
  plasma: require('./../../assets/lightning.svg'),
  contract: require('./../../assets/blocks.svg'),
};

const TransactionItem = ({type, label, counterpartyName, amount, tokenSymbol, address, hash, chainId, isUnconfirmed=false, confirmations=0, displayFullAddress=false}) => {
  const compactAmount = amount;
  const explorerUrl = getExplorerTransactionUrl(chainId, hash);
  const hasAmount = amount !== null
    && amount !== undefined
    && amount !== ''
    && String(amount) !== '0';
  const icon = type === 'received'
    ? (tokenSymbol === 'ZNN' ? icons.receive : icons.receiveToken)
    : type === 'sent'
      ? (tokenSymbol === 'ZNN' ? icons.send : icons.sendToken)
      : icons[type] || icons.contract;
  const transactionLabel = label || `${type?.charAt(0)?.toUpperCase() || ''}${type?.slice(1) || 'Transaction'}`;

  return (
    <div className='transaction mt-2'>
      <div className="transaction-icon mr-2">
        <img alt="" src={icon} width='20px'></img>

      </div>
      <div className='transaction-data'>
        <div className='d-flex justify-content-between mr-2 transaction-data text-left'>
          <div className='d-flex' style={{gap: '0.3rem'}}>
            <span className=''>
              {
                transactionLabel+" "
              }
            </span>
            {hasAmount && <span className='tooltip'>
              {compactAmount}
              <span className="tooltip-text text-xs mt-5">{amount}</span>
            </span>}
            {hasAmount && tokenSymbol && <span>
              {tokenSymbol}
            </span>}
            {isUnconfirmed && <span className='text-gray text-xs' role='status'>Pending</span>}
            {confirmations > 0 && <span className='text-gray text-xs'>{confirmations} confirmations</span>}
          </div>
          <div className='text-gray text-left text-xs tooltip cursor-pointer' onClick={() => {try{navigator.clipboard.writeText(address); toast(`Address copied`, {
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
            {
              type==="received" ?
                <>
                  {"From "}
                </>
              :
              <>
                {"To "}
              </>
            }
            {
              displayFullAddress?
              <div className='text-xs'>{address}</div>:
              <>
                {(address || '').slice(0, 3) + '...' + (address || '').slice(-3)}
                <span className="tooltip-text text-md ml-5 mt-5">{address}</span>
              </>
            }
            <img alt="" className='ml-1' src={require('./../../assets/copy-icon.png')} width='8px'></img>
          </div>
        </div>

      </div>
        {explorerUrl && <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
          <div className='tooltip'>
            <div className='squared-button animate-on-hover'>
              <ExternalLinkIcon></ExternalLinkIcon>
              <span className='tooltip-text transaction-explorer-button-tooltip'>Open transaction in explorer</span>
            </div>
          </div>
        </a>}
    </div>
  );
};

export default TransactionItem;
