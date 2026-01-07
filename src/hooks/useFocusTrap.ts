import { type RefObject, useEffect } from "react";

/**
 * Trap keyboard focus inside the given container while active.
 *
 * When active, focuses the first focusable descendant (or the container if none exist), confines Tab and Shift+Tab navigation to elements inside the container, and reverts any temporary tabindex changes on cleanup.
 *
 * @param ref - React ref to the container element that should trap focus
 * @param isActive - Whether the focus trap is active
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, isActive: boolean): void {
  useEffect(() => {
    if (!isActive || !ref.current) return;

    // Track whether we add a tabindex to the container so we can revert on cleanup
    let addedTabIndex = false;

    // Helper to get focusable elements
    const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
      const focusableSelector = [
        "button",
        "[href]",
        "input",
        "select",
        "textarea",
        '[contenteditable="true"]',
        "audio[controls]",
        "video[controls]",
        '[tabindex]:not([tabindex="-1"])',
      ].join(", ");

      const nodeList = container.querySelectorAll(focusableSelector);

      return Array.from(nodeList).filter((el) => {
        const style = window.getComputedStyle(el as Element);
        const ariaHidden = el.getAttribute("aria-hidden") === "true";
        const tabIndex = (el as HTMLElement).tabIndex;

        // Type-safe checks for disabled and hidden properties
        const isDisabled =
          (el instanceof HTMLButtonElement ||
            el instanceof HTMLInputElement ||
            el instanceof HTMLSelectElement ||
            el instanceof HTMLTextAreaElement) &&
          el.disabled === true;

        // Check if element is inside a disabled fieldset (but not in its first legend)
        const isInDisabledFieldset = (element: Element): boolean => {
          let current: Element | null = element;
          while (current && current !== container) {
            if (current instanceof HTMLFieldSetElement && current.disabled) {
              // Elements inside the first <legend> of a disabled fieldset are NOT disabled
              const firstLegend = current.querySelector(":scope > legend");
              if (firstLegend && firstLegend.contains(element)) {
                return false;
              }
              return true;
            }
            current = current.parentElement;
          }
          return false;
        };

        const isHiddenAttr = el instanceof HTMLElement && el.hidden === true;

        return (
          !isDisabled &&
          !isInDisabledFieldset(el) &&
          !isHiddenAttr &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          ariaHidden !== true &&
          tabIndex !== -1
        );
      }) as HTMLElement[];
    };

    // Focus first focusable child or container
    const focusableElements = getFocusableElements(ref.current);
    if (focusableElements.length > 0) {
      // Focus first focusable child
      focusableElements[0]?.focus();
    } else {
      // No focusable children: make container focusable and focus it
      if (!ref.current.hasAttribute("tabindex")) {
        ref.current.setAttribute("tabindex", "-1");
        addedTabIndex = true;
      }
      ref.current.focus();
    }

    // Focus trap handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;

      const focusableElements = getFocusableElements(ref.current);

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey) {
        // Shift + Tab: wrap from first to last
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        // Tab: wrap from last to first
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Capture ref value for cleanup
    const element = ref.current;

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Revert tabindex only if we added it
      if (addedTabIndex && element) {
        element.removeAttribute("tabindex");
      }
    };
  }, [ref, isActive]);
}
