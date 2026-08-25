import type { ChangeEvent } from "react";

type Option = { value: string; label: string };

type MockReactSelectProps = {
  options?: Option[];
  value?: Option[] | Option | null;
  onChange?: (value: Option[] | Option | null) => void;
  inputId?: string;
  isMulti?: boolean;
  isDisabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
};

export default function MockReactSelect({
  options = [],
  value = null,
  onChange = () => {},
  inputId,
  isMulti = false,
  isDisabled = false,
  placeholder,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: MockReactSelectProps) {
  const selectedValues = Array.isArray(value)
    ? value.map((item) => item.value)
    : value
      ? [value.value]
      : [];

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (isMulti) {
      onChange(
        Array.from(event.target.selectedOptions).map((option) => ({
          value: option.value,
          label: option.text,
        })),
      );
      return;
    }

    const selected = event.target.value
      ? {
          value: event.target.value,
          label: event.target.options[event.target.selectedIndex]?.text ?? "",
        }
      : null;
    onChange(selected);
  };

  return (
    <select
      multiple={isMulti}
      id={inputId}
      aria-label={ariaLabel ?? placeholder}
      aria-describedby={ariaDescribedBy}
      disabled={isDisabled}
      value={isMulti ? selectedValues : (selectedValues[0] ?? "")}
      onChange={handleChange}
    >
      {options.map((option, index) => (
        <option key={`${option.value ?? option.label ?? "option"}-${index}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
