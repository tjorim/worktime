// Owned styles for unstyled react-select; retain search, clear and multi-select behaviour.
export const selectClassNames = {
  control: ({ isFocused, isDisabled }: { isFocused: boolean; isDisabled: boolean }) =>
    `tw:flex tw:min-h-8 tw:w-full tw:flex-wrap tw:items-center tw:rounded-lg tw:border tw:bg-background tw:px-2.5 tw:py-1 tw:text-sm ${isFocused ? "tw:border-ring tw:ring-3 tw:ring-ring/50" : "tw:border-input"} ${isDisabled ? "tw:opacity-50" : ""}`,
  menu: () =>
    "tw:mt-1 tw:w-full tw:rounded-lg tw:border tw:border-border tw:bg-popover tw:p-1 tw:text-popover-foreground tw:shadow-md",
  option: ({ isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }) =>
    `tw:rounded-md tw:px-3 tw:py-2 tw:text-sm ${isSelected ? "tw:bg-primary tw:text-primary-foreground" : isFocused ? "tw:bg-muted" : ""}`,
  input: () => "tw:m-0 tw:p-0",
  placeholder: () => "tw:text-muted-foreground",
  singleValue: () => "tw:text-foreground",
  noOptionsMessage: () => "tw:px-3 tw:py-2 tw:text-sm tw:text-muted-foreground",
  multiValue: () =>
    "tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:bg-secondary tw:px-1.5 tw:text-sm tw:text-secondary-foreground",
  multiValueLabel: () => "",
  multiValueRemove: () => "tw:rounded-sm tw:px-1 tw:hover:bg-muted",
};
// Compatibility export until other product areas migrate their imports.
export const bootstrapSelectClassNames = selectClassNames;
