import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Button from "react-bootstrap/Button";
import CloseButton from "react-bootstrap/CloseButton";
import Toast from "react-bootstrap/Toast";
import ToastContainer from "react-bootstrap/ToastContainer";
import * as m from "@/paraglide/messages.js";

/** Default autohide delay for info/success/warning toasts (ms). */
const DEFAULT_TOAST_DELAY = 4000;
/** Longer autohide delay for error toasts so failures aren't missed (ms). */
const ERROR_TOAST_DELAY = 10000;
/** Undo toasts stay a little longer so the action is reachable (ms). */
const UNDO_TOAST_DELAY = 7000;

/** Optional action button rendered inside a toast (e.g. "Undo"). */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: string;
  message: string;
  variant?: "success" | "danger" | "warning" | "info";
  icon?: string;
  delay?: number;
  autohide?: boolean;
  action?: ToastAction;
}

interface ToastContextType {
  /** Add a toast and return its generated id. */
  addToast: (message: Omit<ToastMessage, "id">) => string;
  removeToast: (id: string) => void;
  showSuccess: (message: string, icon?: string) => void;
  showError: (message: string, icon?: string) => void;
  showWarning: (message: string, icon?: string) => void;
  showInfo: (message: string, icon?: string) => void;
  /**
   * Show a toast with an "Undo" action for a recently performed destructive
   * action. Invoking undo runs `onUndo` and dismisses the toast.
   */
  showUndo: (message: string, onUndo: () => void, icon?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Hook to access toast notification context
 * Must be used within a ToastProvider
 *
 * @returns The ToastContextType with toast notification methods
 * @throws {Error} If used outside of a ToastProvider
 */
export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

interface ToastProviderProps {
  children: React.ReactNode;
}

interface ToastItemProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

/**
 * Renders a single toast and manages its autohide countdown.
 *
 * The timer is implemented manually (rather than relying on React Bootstrap's
 * built-in `autohide`) so it can pause while the toast is hovered or focused —
 * giving the user time to reach an action button such as "Undo".
 */
function ToastItem({ toast, onClose }: ToastItemProps) {
  const isError = toast.variant === "danger";
  const isLight = toast.variant === "warning";

  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.delay ?? DEFAULT_TOAST_DELAY);
  const startedAtRef = useRef<number | null>(null);
  // Keep the latest onClose without re-arming the timer when it changes.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (toast.autohide === false || paused || remainingRef.current <= 0) {
      return;
    }
    startedAtRef.current = Date.now();
    const timerId = window.setTimeout(() => {
      onCloseRef.current(toast.id);
    }, remainingRef.current);
    return () => {
      window.clearTimeout(timerId);
      // Subtract elapsed time so pausing resumes where it left off.
      if (startedAtRef.current != null) {
        remainingRef.current = Math.max(
          0,
          remainingRef.current - (Date.now() - startedAtRef.current),
        );
      }
    };
  }, [paused, toast.autohide, toast.id]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  return (
    <Toast
      onClose={() => onClose(toast.id)}
      show={true}
      // Autohide is handled manually above so it can pause on hover/focus.
      autohide={false}
      bg={toast.variant}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      // Errors interrupt (assertive); other toasts announce politely.
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <Toast.Body className="d-flex align-items-center">
        {toast.icon && <i className={`bi ${toast.icon} me-2`} aria-hidden="true"></i>}
        <span className={`${isLight ? "text-dark" : "text-white"} me-2`}>{toast.message}</span>
        {toast.action && (
          <Button
            size="sm"
            variant={isLight ? "outline-dark" : "outline-light"}
            className="ms-auto me-2 py-0 flex-shrink-0"
            onClick={toast.action.onClick}
          >
            {toast.action.label}
          </Button>
        )}
        <CloseButton
          className={toast.action ? "flex-shrink-0" : "ms-auto flex-shrink-0"}
          variant={isLight ? undefined : "white"}
          onClick={() => onClose(toast.id)}
          aria-label={m.toast_close_aria()}
        />
      </Toast.Body>
    </Toast>
  );
}

/**
 * Provides a toast notification context and renders a ToastContainer that displays active toasts.
 *
 * The provider supplies context methods to add and remove toasts and to show success, error,
 * warning and info messages with optional icons.
 *
 * @param children - React nodes to render inside the provider
 * @returns The provider element which renders its children and the toast container
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = crypto.randomUUID();
    const newToast: ToastMessage = {
      id,
      delay: DEFAULT_TOAST_DELAY,
      autohide: true,
      variant: "info",
      ...toast,
    };
    setToasts((prevToasts) => [...prevToasts, newToast]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const showSuccess = useCallback(
    (message: string, icon?: string) => {
      addToast({ message, variant: "success", icon: icon ?? "bi-check-circle-fill" });
    },
    [addToast],
  );

  const showError = useCallback(
    (message: string, icon?: string) => {
      addToast({
        message,
        variant: "danger",
        icon: icon ?? "bi-x-circle-fill",
        delay: ERROR_TOAST_DELAY,
      });
    },
    [addToast],
  );

  const showWarning = useCallback(
    (message: string, icon?: string) => {
      addToast({ message, variant: "warning", icon: icon ?? "bi-exclamation-triangle-fill" });
    },
    [addToast],
  );

  const showInfo = useCallback(
    (message: string, icon?: string) => {
      addToast({ message, variant: "info", icon: icon ?? "bi-info-circle-fill" });
    },
    [addToast],
  );

  const showUndo = useCallback(
    (message: string, onUndo: () => void, icon?: string) => {
      let clicked = false;
      const id = addToast({
        message,
        variant: "info",
        icon: icon ?? "bi-trash",
        delay: UNDO_TOAST_DELAY,
        action: {
          label: m.toast_undo(),
          onClick: () => {
            if (clicked) return;
            clicked = true;
            try {
              onUndo();
            } finally {
              removeToast(id);
            }
          },
        },
      });
    },
    [addToast, removeToast],
  );

  const contextValue = useMemo<ToastContextType>(
    () => ({
      addToast,
      removeToast,
      showSuccess,
      showError,
      showWarning,
      showInfo,
      showUndo,
    }),
    [addToast, removeToast, showSuccess, showError, showWarning, showInfo, showUndo],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer position="top-end" className="p-3 position-fixed" style={{ zIndex: 1100 }}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}
