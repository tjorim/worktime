// Owned styles for unstyled react-select; retain search, clear and multi-select behaviour.
export const selectClassNames = {
  control: ({ isFocused, isDisabled }: { isFocused: boolean; isDisabled: boolean }) =>
    `flex min-h-8 w-full flex-wrap items-center rounded-lg border bg-background px-2.5 py-1 text-sm ${isFocused ? "border-ring ring-3 ring-ring/50" : "border-input"} ${isDisabled ? "opacity-50" : ""}`,
  menu: () =>
    "mt-1 w-full rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
  option: ({ isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }) =>
    `rounded-md px-3 py-2 text-sm ${isSelected ? "bg-primary text-primary-foreground" : isFocused ? "bg-muted" : ""}`,
  input: () => "m-0 p-0",
  placeholder: () => "text-muted-foreground",
  singleValue: () => "text-foreground",
  noOptionsMessage: () => "px-3 py-2 text-sm text-muted-foreground",
  multiValue: () =>
    "flex items-center gap-1 rounded-md bg-secondary px-1.5 text-sm text-secondary-foreground",
  multiValueLabel: () => "",
  multiValueRemove: () => "rounded-sm px-1 hover:bg-muted",
};
