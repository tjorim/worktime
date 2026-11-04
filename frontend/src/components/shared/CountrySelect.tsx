import { SearchSelect } from "@/components/shared/SearchSelect";
import {
  type CountryCode,
  isValidCountryCode,
  SUPPORTED_COUNTRIES,
  getIsoCountries,
  isIsoCountryCode,
  type IsoAlpha2,
} from "@/types/countries";

type CountryOption = { value: string; label: string };

interface CountrySelectProps {
  worldwide?: false;
  required?: boolean;
  describedBy?: string;
  value: CountryCode | null;
  onChange: (v: CountryCode | null) => void;
  ariaLabel: string;
  inputId?: string;
}

type WorldwideCountrySelectProps = Omit<CountrySelectProps, "value" | "onChange" | "worldwide"> & {
  worldwide: true;
  value: string | null;
  onChange: (value: IsoAlpha2 | null) => void;
};

export function CountrySelect(props: CountrySelectProps | WorldwideCountrySelectProps) {
  const { value, ariaLabel, inputId } = props;
  const worldwide = "worldwide" in props && props.worldwide;
  const COUNTRY_OPTIONS: CountryOption[] = (
    worldwide ? getIsoCountries() : SUPPORTED_COUNTRIES
  ).map((c) => ({
    value: c.code,
    label: c.name,
  }));
  const selected = value ? (COUNTRY_OPTIONS.find((o) => o.value === value) ?? null) : null;

  return (
    <SearchSelect
      required={props.required}
      aria-describedby={props.describedBy}
      inputId={inputId}
      aria-label={ariaLabel}
      options={COUNTRY_OPTIONS}
      value={selected}
      onChange={(s) => {
        const code = s?.value ?? null;
        if (props.worldwide) {
          props.onChange(isIsoCountryCode(code) ? code : null);
        } else {
          props.onChange(isValidCountryCode(code) ? code : null);
        }
      }}
    />
  );
}
