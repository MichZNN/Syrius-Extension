import React from "react";

/**
 * Manage the modal spinner used while a wallet operation is in progress.
 *
 * Calling handleSpinner with content updates the message and returns a setter
 * that can explicitly show or hide the spinner:
 *
 * @example
 * const showSpinner = handleSpinner(<div>Loading wallet data...</div>);
 * showSpinner(false);
 */
const useSpinner = () => {
  const [spinner, setSpinner] = React.useState(false);
  const [spinnerContent, setSpinnerContent] = React.useState("Loading ...");

  const handleSpinner = (content = false) => {
    setSpinner(!spinner);
    if (content) {
      setSpinnerContent(content);
    }

    return setSpinner;
  };

  return { spinner, handleSpinner, spinnerContent };
};

export default useSpinner;
