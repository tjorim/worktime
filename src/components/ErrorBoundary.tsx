import React, { Component, type ErrorInfo, type ReactNode } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Container from "react-bootstrap/Container";

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
    console.error("ErrorBoundary caught an error:", error, errorInfo);

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
        <Container className="mt-4">
          <Card>
            <Card.Header className="text-bg-danger fw-semibold">
              <i className="bi bi-exclamation-triangle me-2" aria-hidden="true"></i>
              Something went wrong
            </Card.Header>
            <Card.Body>
              <Alert variant="danger">
                <Alert.Heading>Application Error</Alert.Heading>
                <p>
                  We're sorry, but something unexpected happened. Click{" "}
                  <strong>Try Again</strong> first; if the error persists, use{" "}
                  <strong>Reload Page</strong>. Contact support if the problem persists.
                </p>
                <hr />
                <div className="d-flex gap-2">
                  <Button variant="outline-danger" onClick={this.handleReset}>
                    Try Again
                  </Button>
                  <Button variant="outline-secondary" onClick={() => window.location.reload()}>
                    Reload Page
                  </Button>
                </div>
              </Alert>

              {import.meta.env.DEV && this.state.error && (
                <Card className="mt-3">
                  <Card.Header>
                    <small className="text-muted">Debug Information</small>
                  </Card.Header>
                  <Card.Body>
                    <details>
                      <summary className="text-danger fw-bold mb-2">
                        {this.state.error.name}: {this.state.error.message}
                      </summary>
                      <pre className="small text-muted error-stack-trace">
                        {this.state.error.stack}
                      </pre>
                      {this.state.errorInfo && (
                        <div className="mt-2">
                          <strong>Component Stack:</strong>
                          <pre
                            className="small text-muted error-stack-trace"
                          >
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </div>
                      )}
                    </details>
                  </Card.Body>
                </Card>
              )}
            </Card.Body>
          </Card>
        </Container>
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
