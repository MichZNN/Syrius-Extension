import React, { useEffect, useMemo, useRef, useState } from 'react';

// A select.
//
// Three things were wrong with the old one. It had an effect keyed on `value`
// that called `onChange` — a component telling its parent about a change the
// parent had just told it about, which re-entered react-hook-form's validation
// on every render pass. It used `options.filter` as a `forEach` and set state
// from inside the predicate. And it never closed on an outside click, so
// opening one and clicking elsewhere left it hanging over the screen.

const readPath = (path, object) =>
  path ? path.split('.').reduce((value, key) => (value === null || value === undefined ? '' : value[key]), object) : object;

const CustomDropdown = React.forwardRef(
  ({ name, className, options = [], onChange, onBlur, value, label, placeholder, displayKey = false }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef(null);

    // Derived, not stored: the selection follows `value` rather than being a
    // second copy of it that can drift.
    const selectedIndex = useMemo(
      () => options.findIndex((option) => option === value),
      [options, value]
    );

    useEffect(() => {
      if (!isOpen) {
        return undefined;
      }
      const onPointerDown = (event) => {
        if (!rootRef.current?.contains(event.target)) {
          setIsOpen(false);
          onBlur?.(event);
        }
      };
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', onPointerDown);
      document.addEventListener('keydown', onKeyDown);

      return () => {
        document.removeEventListener('mousedown', onPointerDown);
        document.removeEventListener('keydown', onKeyDown);
      };
    }, [isOpen, onBlur]);

    const selectOption = (index, option) => {
      setIsOpen(false);
      onChange?.(index, option);
    };

    const selectedLabel =
      selectedIndex >= 0 ? readPath(displayKey, options[selectedIndex]) : '';

    return (
      <div className={`Dropdown-root ${isOpen ? 'is-open' : ''}`} ref={rootRef}>
        {label && <div className="dropdown-label">{label}</div>}

        <div
          className={`${className || ''} w-100 Dropdown-control`}
          tabIndex="0"
          role="button"
          ref={ref}
          onClick={() => setIsOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setIsOpen((open) => !open);
            }
          }}
        >
          <span>{selectedLabel || placeholder}</span>
          <span className="Dropdown-arrow" />
        </div>

        {isOpen && (
          <div className="Dropdown-menu">
            {options.map((option, index) => (
              <div
                className={`Dropdown-option ${index === selectedIndex ? 'is-selected' : ''}`}
                key={`${name}-option-${index}`}
                onClick={() => selectOption(index, option)}
              >
                {readPath(displayKey, option)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

export default CustomDropdown;
