import { revokeWindow } from './rules';

// The steps between pressing Revoke and a Revoke block.
//
// Revoking ends a pillar: it stops producing, its delegators earn nothing from
// it, and the QSR burned to register it is gone. So the button on the Pillar
// tab does not send anything. It asks for the wallet password again, and when
// the vault accepts it, asks once more:
//
//   idle      the Revoke button
//   password  the wallet password, checked again
//   confirm   the last question
//
// and only `confirm` + "confirmed" builds the block. It is a table rather than
// state scattered through a component so the order can be checked without
// rendering (utils/pillar-mode-test.js): no event skips a step.

const steps = { idle: 'idle', password: 'password', confirm: 'confirm', send: 'send' };

// Why this address cannot revoke now, or null. The contract refuses each of
// these; saying so here costs no plasma.
const blocker = ({ pillar }) => {
  if (!pillar) return 'This address owns no pillar.';
  if (!revokeWindow(pillar).revocable) return 'The revoke window is closed.';
  return null;
};

const transitions = {
  idle: {
    // Only a pillar that can be revoked gets as far as the password.
    press: (context) => (blocker(context) ? steps.idle : steps.password),
  },
  password: {
    cancel: () => steps.idle,
    // `verified` is the vault's answer, not the fact that something was typed.
    password: (context) => {
      if (blocker(context)) return steps.idle;
      return context.verified === true ? steps.confirm : steps.password;
    },
  },
  confirm: {
    cancel: () => steps.idle,
    confirmed: (context) => (blocker(context) ? steps.idle : steps.send),
  },
  // A block went out; the next press starts from the beginning.
  send: {},
};

// The step after `event`. An event a step does not know leaves it where it is.
const advance = (step, event, context = {}) => {
  const handler = transitions[step]?.[event];
  return handler ? handler(context) : step;
};

export { steps, blocker, advance };
