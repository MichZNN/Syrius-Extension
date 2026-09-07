import { toast } from 'react-toastify';
import { readableError } from './errors';

// Every toast in this wallet used to carry its own nine-line options object,
// and they had drifted: some closed after a second, some after five, some
// showed a progress bar, some paused on hover. Toasts are the wallet's only
// feedback channel for "it worked" and "it did not", so they are one thing now.

const base = {
  position: 'bottom-center',
  hideProgressBar: true,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: false,
  newestOnTop: true,
  theme: 'dark',
};

const notify = {
  success: (message, options = {}) =>
    toast(message, { ...base, type: 'success', autoClose: 2000, ...options }),

  // Failures stay up longer than confirmations: one is read on the way past,
  // the other has to be acted on.
  error: (error, options = {}) =>
    toast(readableError(error), { ...base, type: 'error', autoClose: 5000, ...options }),

  info: (message, options = {}) =>
    toast(message, { ...base, type: 'info', autoClose: 3000, ...options }),

  // Acknowledgement of something the user just did to the clipboard. Short, and
  // deliberately not stacking — copying an address twice should not queue two.
  copied: (what = 'Copied') =>
    toast(what, { ...base, type: 'success', autoClose: 1200, toastId: 'clipboard' }),
};

// Clipboard access can be refused, and every call site had its own try/catch
// that logged and then said nothing to the person who pressed the button.
const copyToClipboard = async (text, label = 'Copied') => {
  try {
    await navigator.clipboard.writeText(text);
    notify.copied(label);
    return true;
  } catch (err) {
    notify.error('Could not copy to the clipboard.');
    return false;
  }
};

export { notify, copyToClipboard };
export default notify;
