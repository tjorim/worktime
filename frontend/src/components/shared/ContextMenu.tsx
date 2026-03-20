import { useEffect, useRef, useState, useId, type RefObject } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

export type ContextMenuItem =
  | {
      separator?: false;
      label: string;
      icon?: string;
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
  /** Element to return focus to when the menu closes */
  triggerRef?: RefObject<HTMLElement | null>;
}

export function ContextMenu({ isOpen, x, y, onClose, items, triggerRef }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const menuId = useId();

  // Calculate position with viewport edge detection
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x;
    let top = y;

    // Flip horizontally if too close to right edge
    if (x + menuRect.width > viewportWidth - 10) {
      left = x - menuRect.width;
    }

    // Flip vertically if too close to bottom edge
    if (y + menuRect.height > viewportHeight - 10) {
      top = y - menuRect.height;
    }

    // Ensure menu stays within viewport
    left = Math.max(5, Math.min(left, viewportWidth - menuRect.width - 5));
    top = Math.max(5, Math.min(top, viewportHeight - menuRect.height - 5));

    setPosition({ left, top });
  }, [isOpen, x, y]);

  // Focus first item when menu opens
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const firstItem = menuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]');
      firstItem?.focus();
    }
  }, [isOpen]);

  // Click-outside handler
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to avoid immediate close from triggering right-click
    const timeoutId = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("contextmenu", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("contextmenu", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Count only navigable (non-separator) items for the keyboard handler dependency
  const navigableCount = items.filter((item) => !item.separator).length;

  // Keyboard handlers
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cache menu items query for performance
      const menuItems = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || [],
      );

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowDown":
          e.preventDefault();
          {
            const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
            const next = (currentIndex + 1) % menuItems.length;
            menuItems[next]?.focus();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          {
            const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
            const next = (currentIndex - 1 + menuItems.length) % menuItems.length;
            menuItems[next]?.focus();
          }
          break;
        case "Home":
          e.preventDefault();
          menuItems[0]?.focus();
          break;
        case "End":
          e.preventDefault();
          menuItems[menuItems.length - 1]?.focus();
          break;
        case "Tab":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, navigableCount]);

  // Return focus to trigger element when menu closes
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (prevOpenRef.current && !isOpen) {
      triggerRef?.current?.focus();
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, triggerRef]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.separator) return;
    if (item.disabled) return;
    onClose();
    item.onClick();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label="Context menu"
      tabIndex={-1}
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
      }}
    >
      {items.map((item, index) => {
        const baseKey = item.separator
          ? "separator"
          : `item:${item.label}|${item.icon ?? ""}|${item.variant ?? ""}|${item.disabled ? "1" : "0"}`;
        const itemKey = `${menuId}-${index}-${baseKey}`;

        return item.separator ? (
          <hr key={itemKey} className="context-menu-separator" role="separator" />
        ) : (
          <button
            key={itemKey}
            type="button"
            role="menuitem"
            className={clsx("context-menu-item", item.variant === "danger" && "danger")}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
          >
            {item.icon && <i className={clsx("bi", item.icon)} aria-hidden="true"></i>}
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
