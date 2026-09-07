import React, { useEffect, useRef, useState } from 'react';

const TokenDropdown = React.forwardRef(({
  name,
  className,
  options = [],
  onChange,
  onBlur,
  value,
  placeholder,
  label,
  tokenStandardPath = false,
  tokenSymbolPath = false,
}, ref) => {
  const [isOpened, setIsOpened] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState();
  const selectRef = useRef(ref);

  const clickControl = () => {
    setIsOpened(!isOpened);
  }

  const clickOption = (i, value) => {
    onChange(i, value);
    setIsOpened(!isOpened);
    setSelectedIndex(i);
  }

  useEffect(()=>{
    const index = options.findIndex((currentValue) => (
      currentValue?.token?.tokenStandard?.toString() === value?.toString()
    ));
    setSelectedIndex(index >= 0 ? index : undefined);
    setIsOpened(false);
  }, [value, options]);

  return (
    <div className={`Dropdown-root ${isOpened?'is-open':''}`}>
        <div className='dropdown-label'>
            {label || ""}
        </div>
        <div className={`${className} w-100 Dropdown-control`} tabIndex="0"
          role="listbox" aria-expanded={isOpened} onClick={clickControl}
          onBlur={onBlur} ref={selectRef}>
            {
              (selectedIndex || selectedIndex === 0) && (
                    (tokenSymbolPath.split('.').reduce((p,c)=>(p && p[c]) || "", options[selectedIndex]))
                +" "+
                ((tokenStandardPath && (
                      ((tokenStandardPath.split('.').reduce((p,c)=>(p && p[c]) || "", options[selectedIndex]))+"").slice(0, 3)
                  + '...' +
                  ((tokenStandardPath.split('.').reduce((p,c)=>(p&&p[c])||"", options[selectedIndex]))+"").slice(-3)
                )) || "")
              )
            }
            {
              (!selectedIndex && selectedIndex !==0) && (
              placeholder)
            }
            <span className='Dropdown-arrow'></span>
        </div>

        <div className='mt-0 Dropdown-menu'>
          {options.map(function(currentValue, i){
            if(options.length === 1 || currentValue?.token?.tokenStandard?.toString() !== value?.toString()){
              return <div className='Dropdown-option d-flex' key={i} role="option"
                aria-selected={i === selectedIndex}
                onClick={() => clickOption(i, currentValue)}>
                {
                  (
                    (tokenSymbolPath.split('.').reduce((p,c)=>(p && p[c]) || "", currentValue))
                    +" "+
                    ((tokenStandardPath && (
                      ((tokenStandardPath.split('.').reduce((p,c)=>(p&&p[c])||"", currentValue))+"").slice(0, 3)
                      + '...' +
                      ((tokenStandardPath.split('.').reduce((p,c)=>(p&&p[c])||"", currentValue))+"").slice(-3)
                    )) || "")
                  )
                }
              </div>
            }

            return null;
          })}
        </div>
    </div>
  );
});

export default TokenDropdown;
