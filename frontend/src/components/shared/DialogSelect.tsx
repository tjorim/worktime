import ReactSelect, { type Props, type GroupBase } from "react-select";
import { cn } from "@/lib/utils";
import { useDialogMenuPortalTarget } from "@/hooks/useDialogMenuPortalTarget";

/** Render picker menus outside the dialog's scrolling body without leaving its modal scope. */
export function DialogSelect<Option, IsMulti extends boolean = false>(
  props: Props<Option, IsMulti, GroupBase<Option>>,
) {
  const menuPortalTarget = useDialogMenuPortalTarget();
  return (
    <ReactSelect
      {...props}
      menuPortalTarget={menuPortalTarget}
      menuPosition="fixed"
      menuPlacement="auto"
      // React-select emits an unlayered z-index; override it with our modal popover token.
      classNames={{
        ...props.classNames,
        menuPortal: () => "z-popover!",
        // Placement constrains the list height, so its wrapper must not add padding or borders.
        menu: (state) => cn(props.classNames?.menu?.(state), "border-0 p-0 ring-1 ring-border"),
      }}
    />
  );
}
