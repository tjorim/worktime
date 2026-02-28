// Shared Bootstrap 5 classNames for react-select (unstyled mode).
// Each function returns class strings; unused parameters are omitted via less-args rule.
export const bootstrapSelectClassNames = {
  control: () => "form-control d-flex flex-wrap align-items-center h-auto",
  menu: () => "dropdown-menu show w-100 mt-1",
  option: ({ isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }) =>
    `dropdown-item${isSelected ? " active" : ""}${isFocused && !isSelected ? " bg-body-secondary" : ""}`,
  input: () => "p-0 m-0",
  placeholder: () => "text-muted",
  singleValue: () => "",
  noOptionsMessage: () => "dropdown-item disabled",
  // Multi-only (ignored for single-select):
  multiValue: () =>
    "badge bg-secondary-subtle text-secondary-emphasis d-flex align-items-center gap-1",
  multiValueLabel: () => "",
  multiValueRemove: () => "btn-close btn-close-sm ms-1",
};
