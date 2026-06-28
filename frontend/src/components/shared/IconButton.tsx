import { forwardRef, type ComponentPropsWithoutRef } from "react";
import Button from "react-bootstrap/Button";

type BootstrapButtonProps = ComponentPropsWithoutRef<typeof Button>;

interface IconButtonProps extends Omit<BootstrapButtonProps, "aria-label" | "children"> {
  icon: string;
  label: string;
  iconClassName?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, iconClassName, title, ...buttonProps },
  ref,
) {
  const iconClasses = iconClassName ? `bi ${icon} ${iconClassName}` : `bi ${icon}`;

  return (
    <Button ref={ref} aria-label={label} title={title ?? label} {...buttonProps}>
      <i className={iconClasses} aria-hidden="true"></i>
    </Button>
  );
});
