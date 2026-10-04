import type { LucideIcon } from "lucide-react";
import type { RefObject } from "react";
import { useMemo } from "react";
import { Menu } from "@base-ui/react/menu";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils";

export type ContextMenuItem =
  | {
      separator?: false;
      label: string;
      icon?: LucideIcon;
      onClick: () => void;
      variant?: "danger";
      disabled?: boolean;
    }
  | { separator: true };
interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  onClose: () => void;
  items: ContextMenuItem[];
  triggerRef?: RefObject<HTMLElement | null>;
}

export function ContextMenu({ isOpen, x, y, onClose, items, triggerRef }: ContextMenuProps) {
  // The pointer is a virtual anchor; Base UI owns collision detection and focus.
  const anchor = useMemo(() => ({ getBoundingClientRect: () => new DOMRect(x, y, 0, 0) }), [x, y]);
  return (
    <Menu.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Menu.Portal>
        <Menu.Positioner
          anchor={anchor}
          side="bottom"
          align="start"
          className="z-popover"
          collisionPadding={8}
        >
          <Menu.Popup
            finalFocus={triggerRef}
            className="min-w-40 rounded-lg border border-wt-context-menu-border bg-wt-context-menu-bg p-1 text-wt-context-menu-item-text shadow-lg outline-none"
          >
            {items.map((item, index) =>
              item.separator ? (
                <Menu.Separator key={index} className="my-1 border-t border-border" />
              ) : (
                <Menu.Item
                  key={`${index}-${item.label}`}
                  disabled={item.disabled}
                  closeOnClick={false}
                  onClick={() => {
                    onClose();
                    item.onClick();
                  }}
                  className={cn(
                    "flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-wt-context-menu-item-hover data-disabled:opacity-50",
                    item.variant === "danger" && "text-danger-text",
                  )}
                >
                  {item.icon && <Icon icon={item.icon} />}
                  {item.label}
                </Menu.Item>
              ),
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
