import { embeddedContractName } from './contracts';
import { contractDisplayName } from './contractCalls';

// Describing a block that has been built but not sent yet.
//
// The dashboard draws a row for every outgoing block while it is in flight, and
// that row has to be the same row the block gets once it is in the account's
// history — same glyph, same contract name, same colour. Reading both out of
// one place is what keeps a fuse from being a lightning bolt on the way out and
// a generic contract square once it lands.

// Which glyph a row gets. Deliberately coarser than the label: the label says
// exactly what happened, the icon only has to say what kind of thing it was.
const iconForContract = {
  plasma: 'plasma',
  pillar: 'delegate',
  stake: 'stake',
};

// The type, glyph and counterparty for an outgoing template, from the template
// itself — so a call site only has to supply what it alone knows, which is the
// wording and the amount.
const describeOutgoingTemplate = (template) => {
  const to = template?.toAddress?.toString() || '';
  const contract = embeddedContractName(to);

  if (!contract) {
    return { type: 'sent', icon: 'send', counterpartyName: null, address: to };
  }

  // Deliberately no method name. `decodeCall` reads the base64 string a block
  // carries once it has been through `toJson()`, and a template's `data` is
  // still a Buffer at this point — it would decode to null every time. The call
  // site supplies the wording anyway, since it is the only thing that knows the
  // amount and the pillar's name.
  return {
    type: contract,
    icon: iconForContract[contract] || 'contract',
    counterpartyName: contractDisplayName(contract),
    address: to,
  };
};

export { iconForContract, describeOutgoingTemplate };
