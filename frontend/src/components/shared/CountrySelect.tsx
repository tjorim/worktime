import ReactSelect from "react-select";
import { type CountryCode, isValidCountryCode, SUPPORTED_COUNTRIES } from "../../types/countries";
import { bootstrapSelectClassNames } from "../../utils/reactSelectStyles";

type CountryOption = { value: string; label: string };

const COUNTRY_OPTIONS: CountryOption[] = SUPPORTED_COUNTRIES.map((c) => ({
  value: c.code,
  label: c.name,
}));

interface CountrySelectProps {
  value: CountryCode | null;
  onChange: (v: CountryCode | null) => void;
  ariaLabel: string;
  inputId?: string;
}

export function CountrySelect({ value, onChange, ariaLabel, inputId }: CountrySelectProps) {
  const selected = value ? (COUNTRY_OPTIONS.find((o) => o.value === value) ?? null) : null;

  return (
    <ReactSelect<CountryOption>
      unstyled
      isClearable
      isSearchable
      inputId={inputId}
      aria-label={ariaLabel}
      options={COUNTRY_OPTIONS}
      value={selected}
      onChange={(s) => {
        const code = s?.value ?? null;
        onChange(isValidCountryCode(code) ? code : null);
      }}
      classNames={bootstrapSelectClassNames}
    />
  );
}
