import React from 'react';

// The dots under an onboarding flow.
//
// It built `new Array(maxSteps)` and filled it by index, which rendered one dot
// fewer than there were steps, and iterated with `for (const step in steps)` —
// string keys compared against a number.
const ProgressSteps = ({ currentStep, totalSteps }) => (
  <div className="onboarding-progress-container">
    {Array.from({ length: totalSteps }, (unused, index) => (
      <div className={`current-progress ${index <= currentStep ? 'filled' : ''}`} key={index} />
    ))}
  </div>
);

export default ProgressSteps;
