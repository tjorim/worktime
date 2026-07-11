import Spinner from "react-bootstrap/Spinner";

export function AuthCallbackPage() {
  return (
    <main className="container py-5 text-center" aria-labelledby="auth-callback-title">
      <Spinner animation="border" role="status" className="mb-3">
        <span className="visually-hidden">Completing sign-in...</span>
      </Spinner>
      <h1 id="auth-callback-title" className="h4 mb-2">
        Completing sign-in
      </h1>
      <p className="text-muted mb-0">Please wait while Worktime finishes connecting your account.</p>
    </main>
  );
}
