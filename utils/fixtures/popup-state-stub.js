'use strict';
// Popup state (src/services/utils/popupState.js), taken out of the way for
// fixtures that render a screen for something else. The real one keeps fields
// in chrome.storage.session under the unlocked wallet's lease; here a field is
// the screen's own useState, so a fixture's state indices are unchanged.
const popupStateStub = (react) => {
  const usePopupState = (key, initial) => react.useState(initial);
  return {
    __esModule: true,
    default: usePopupState,
    usePopupState,
    load: async () => null,
    clear: () => {},
    savedRoute: () => null,
    saveRoute: () => {},
    readField: () => undefined,
    writeField: () => {},
    flush: () => {},
  };
};
module.exports = { popupStateStub };
