import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Toast from "react-bootstrap/Toast";
import ToastContainer from "react-bootstrap/ToastContainer";

export interface ToastMessage {
  id: string;
  message: string;
  variant?: "success" | "danger" | "warning" | "info";
  icon?: string;
  delay?: number;
  autohide?: boolean;
}

interface ToastContextType {
  addToast: (message: Omit<ToastMessage, "id">) => void;
  removeToast: (id: string) => void;
  showSuccess: (message: string, icon?: string) => void;
  showError: (message: string, icon?: string) => void;
  showWarning: (message: string, icon?: string) => void;
  showInfo: (message: string, icon?: string) => void;
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
      delay: 4000,
      autohide: true,
      variant: "info",
      ...toast,
    };
    setToasts((prevToasts) => [...prevToasts, newToast]);
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
      addToast({ message, variant: "danger", icon: icon ?? "bi-x-circle-fill" });
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

  const contextValue = useMemo<ToastContextType>(
    () => ({
      addToast,
      removeToast,
      showSuccess,
      showError,
      showWarning,
      showInfo,
    }),
    [addToast, removeToast, showSuccess, showError, showWarning, showInfo],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer position="top-end" className="p-3 position-fixed" style={{ zIndex: 1100 }}>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            onClose={() => removeToast(toast.id)}
            show={true}
            autohide={toast.autohide}
            delay={toast.delay}
            bg={toast.variant}
          >
            <Toast.Body className="d-flex align-items-center">
              {toast.icon && (
                <i className={`bi ${toast.icon} me-2`} aria-hidden="true"></i>
              )}
              <span className={toast.variant === "warning" ? "text-dark" : "text-white"}>
                {toast.message}
              </span>
            </Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}
