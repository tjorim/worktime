import type { AriaAttributes } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import * as m from "@/paraglide/messages.js";

export type SelectOption = { value: string; label: string };
type PickerProps = Pick<AriaAttributes, "aria-label" | "aria-describedby"> & {
  options: SelectOption[];
  inputId?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};
type SearchSelectProps = PickerProps & {
  value: SelectOption | null;
  onChange: (value: SelectOption | null) => void;
};

/** Shared single-choice picker. Resolve objects by ID, including options recreated on render. */
export function SearchSelect({
  options,
  value,
  onChange,
  inputId,
  placeholder,
  disabled,
  className,
  ...aria
}: SearchSelectProps) {
  const anchor = useComboboxAnchor();
  return (
    <div ref={anchor} className={className}>
      <Combobox
        items={options}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        itemToStringLabel={(item) => item.label}
        isItemEqualToValue={(item, selected) => item.value === selected.value}
      >
        <ComboboxInput
          id={inputId}
          placeholder={placeholder ?? m.picker_placeholder()}
          disabled={disabled}
          showClear
          clearLabel={m.timeoff_clear_selection_aria()}
          triggerLabel={m.picker_open()}
          {...aria}
        />
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>{m.picker_empty()}</ComboboxEmpty>
          <ComboboxList>
            {(option: SelectOption) => (
              <ComboboxItem key={option.value} value={option}>
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

export function MultiSearchSelect({
  options,
  value,
  onChange,
  inputId,
  placeholder,
  disabled,
  className,
  ...aria
}: PickerProps & {
  value: SelectOption[];
  onChange: (value: SelectOption[]) => void;
}) {
  const anchor = useComboboxAnchor();
  return (
    <div className={className}>
      <Combobox
        multiple
        items={options}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        itemToStringLabel={(item) => item.label}
        isItemEqualToValue={(item, selected) => item.value === selected.value}
      >
        <ComboboxChips ref={anchor}>
          <ComboboxValue>
            {(selected: SelectOption[]) => (
              <>
                {selected.map((option) => (
                  <ComboboxChip key={option.value} removeLabel={`${m.remove()} ${option.label}`}>
                    {option.label}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput
                  id={inputId}
                  placeholder={selected.length ? undefined : placeholder}
                  disabled={disabled}
                  {...aria}
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>{m.picker_empty()}</ComboboxEmpty>
          <ComboboxList>
            {(option: SelectOption) => (
              <ComboboxItem key={option.value} value={option}>
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
