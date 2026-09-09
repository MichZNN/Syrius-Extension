import React, { useEffect, useState } from 'react';
import { useController } from "react-hook-form";
import TokenDropdown from '../token-dropdown/token-dropdown';
import CustomDropdown from './custom-dropdown';

const ControlledDropdown = React.forwardRef((props, ref) => {
  const { field } = useController(props);
  const [value, setValue] = useState(field.value);

  // React Hook Form expects blur callbacks to receive an event. The dropdown
  // closes from a document-level pointer event, so preserve that event instead
  // of forwarding an undefined argument into its registered handler.
  const handleChange = (...args) => {
    props.onChange?.(...args);
    field.onChange(...args);
  };
  const handleBlur = (...args) => {
    props.onBlur?.(...args);
    field.onBlur(...args);
  };

  useEffect(() => {
    setValue(props.value);
  }, [props.value]);

  switch(props.dropdownComponent || 'CustomDropdown'){
    default:
    case ('CustomDropdown'): {
      return (
        <CustomDropdown 
          name={props.name}
          className={props.className}
          options={props.options} 
          onChange={handleChange}
          onBlur={handleBlur}
          value={value} 
          placeholder={props.placeholder || ""}
          label={props.label || ""}
          displayKey={props.displayKey || false} 
          ref={ref} 
        />
      );    
    }
    case ('TokenDropdown'): {
      return (
        <TokenDropdown 
          name={props.name}
          className={props.className}
          options={props.options} 
          onChange={handleChange}
          onBlur={handleBlur}
          value={value} 
          placeholder={props.placeholder || ""}
          label={props.label || ""}
          tokenSymbolPath={props.tokenSymbolPath || false} 
          tokenStandardPath={props.tokenStandardPath || false} 
          ref={ref} 
        />
      );    
    }
  }

});

export default ControlledDropdown;
