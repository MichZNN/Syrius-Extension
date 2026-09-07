import React, { useState, useEffect, useRef } from 'react';

const CustomDropdown = React.forwardRef(({
  name,
  className,
  options = [],
  onChange,
  onBlur,
  value,
  label,
  placeholder,
  displayKey = false,
}, ref) => {
  const [isOpened, setIsOpened] = useState(false);
  const selectRef = useRef(ref);
  const [selectedIndex, setSelectedIndex] = useState();

  const clickControl = () => {
    setIsOpened(!isOpened);
  }

  const clickOption = (i, value) => {
    setSelectedIndex(i);
    onChange(i, value);
    setIsOpened(!isOpened);
  }

  useEffect(() => {
    const index = options.findIndex((currentValue) => currentValue === value);
    setSelectedIndex(index >= 0 ? index : undefined);
    setIsOpened(false);
  }, [options, value]);

  return (
      <div className={`Dropdown-root ${isOpened?'is-open':''}`}>
        <div className='dropdown-label'>
            {label || ""}
        </div>
        <div className={`${className} w-100 Dropdown-control`} tabIndex="0"
          role="listbox" aria-expanded={isOpened} onClick={clickControl}
          onBlur={onBlur} ref={selectRef}>
            <span>
              {(displayKey ? displayKey.split('.').reduce((p,c)=>(p && p[c]) || "", options[selectedIndex])
                  :options[selectedIndex])
              || placeholder}
              </span>
            <span className='Dropdown-arrow'></span>
        </div>

        <div className='mt-0 Dropdown-menu'>
          {options.map(function(currentValue, i){
            if(options.length === 1 || currentValue !== value){
              return <div className='Dropdown-option' key={i} role="option"
                aria-selected={i === selectedIndex}
                onClick={() => clickOption(i, currentValue)}>{
                displayKey ? displayKey.split('.').reduce((p,c)=>(p && p[c]) || "", currentValue)
                :currentValue
              }</div>;
            }

            return null;
          })}
        </div>
    </div>
  );
});

export default CustomDropdown;
