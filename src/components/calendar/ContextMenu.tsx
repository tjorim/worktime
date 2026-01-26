import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  variant?: "danger";
}

interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  onClose: () => void;
  items: ContextMenuItem[];
}

export function ContextMenu({ isOpen, x, y, onClose, items }: ContextMenuProps) {
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
            const next = (currentIndex + 1) % items.length;
            menuItems[next]?.focus();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          {
            const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
            const next = (currentIndex - 1 + items.length) % items.length;
            menuItems[next]?.focus();
          }
          break;
        case "Home":
          e.preventDefault();
          menuItems[0]?.focus();
          break;
        case "End":
          e.preventDefault();
          menuItems[items.length - 1]?.focus();
          break;
        case "Tab":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, items.length]);

  const handleItemClick = (item: ContextMenuItem) => {
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
      {items.map((item, index) => (
        <button
          key={`${menuId}-item-${index}`}
          type="button"
          role="menuitem"
          className={classNames("context-menu-item", item.variant === "danger" && "danger")}
          onClick={() => handleItemClick(item)}
          aria-label={item.label}
        >
          {item.icon && <i className={classNames("bi", item.icon)} aria-hidden="true"></i>}
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
