import React from "react";

/**
 * Manage the non-blocking spinner used for background wallet operations.
 *
 * Calling handleSilentSpinner with content updates the message and returns a
 * setter that can explicitly show or hide the spinner.
 *
 * @example
 * const showSilentSpinner = handleSilentSpinner(<div>Loading...</div>);
 * showSilentSpinner(false);
 */
const useSilentSpinner = () => {
  const [silentSpinner, setSilentSpinner] = React.useState(false);
  const [silentSpinnerContent, setSpinnerPowContent] = React.useState("Loading ...");

  const handleSilentSpinner = (content = false) => {
    setSilentSpinner(!silentSpinner);
    if (content) {
      setSpinnerPowContent(content);
    }

    return setSilentSpinner;
  };

  return { silentSpinner, handleSilentSpinner, silentSpinnerContent };
};

export default useSilentSpinner;
