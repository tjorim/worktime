import { TriangleAlert as TriangleAlertIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

import * as m from "@/paraglide/messages.js";
import { logger } from "@/utils/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to console
    logger.error("ErrorBoundary caught an error:", error, errorInfo);

    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // You can also log the error to an error reporting service here
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
    });
  };

  render() {
    if (this.state.hasError) {
      // Render custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="mx-auto mt-6 max-w-6xl px-3">
          <Card>
            <CardHeader className="bg-destructive text-primary-foreground font-semibold">
              <Icon icon={TriangleAlertIcon} className="me-2" />
              {m.error_boundary_heading()}
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertTitle>{m.error_boundary_heading()}</AlertTitle>
                <p>{m.error_boundary_fallback_message()}</p>
                <hr />
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={this.handleReset}>
                    {m.error_boundary_try_again()}
                  </Button>
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    {m.error_boundary_reload()}
                  </Button>
                </div>
              </Alert>

              {import.meta.env.DEV && this.state.error && (
                <Card className="mt-4">
                  <CardHeader>
                    <small className="text-muted-foreground">
                      {m.error_boundary_debug_information()}
                    </small>
                  </CardHeader>
                  <CardContent>
                    <details>
                      <summary className="text-danger-text font-bold mb-2">
                        {this.state.error.name}: {this.state.error.message}
                      </summary>
                      <pre className="text-sm text-muted-foreground max-h-80 overflow-auto">
                        {this.state.error.stack}
                      </pre>
                      {this.state.errorInfo && (
                        <div className="mt-2">
                          <strong>{m.error_boundary_component_stack()}</strong>
                          <pre className="text-sm text-muted-foreground max-h-80 overflow-auto">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </div>
                      )}
                    </details>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Create a higher-order component that renders the given component inside an error boundary.
 *
 * @param Component - Component to render inside the error boundary
 * @param fallback - Optional UI to show when an error is caught
 * @returns A component that renders `Component` wrapped by `ErrorBoundary`
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}
