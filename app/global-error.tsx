"use client";

/**
 * Last-resort boundary for errors thrown in the ROOT layout tree (providers,
 * theme, fonts) — the one place `app/error.tsx` cannot reach, because that
 * boundary lives inside the layout that just failed.
 *
 * Without this file Next renders a blank document, which is what users reported
 * as "white screen": no message, no way back, nothing to report. This replaces
 * the whole document (hence its own <html>/<body>) with something that says what
 * happened and offers the two things that actually recover it — a reload, and a
 * trip to the login screen for a session that has gone bad.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#0b0b0f",
          color: "#e8e8ea",
        }}
      >
        <main style={{ maxWidth: "28rem", width: "100%" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 .5rem" }}>
            Something broke while loading the app
          </h1>
          <p
            style={{
              margin: "0 0 1rem",
              fontSize: ".875rem",
              lineHeight: 1.6,
              color: "#a1a1aa",
            }}
          >
            This is usually a stale browser cache after a release, or a sign-in
            session that expired badly. Reloading fixes most of it; signing in
            again fixes the rest.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "0 0 1rem",
                fontSize: ".75rem",
                color: "#71717a",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                cursor: "pointer",
                border: 0,
                borderRadius: ".5rem",
                padding: ".55rem 1rem",
                fontSize: ".875rem",
                fontWeight: 500,
                background: "#6366f1",
                color: "#fff",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              // A hard reload, not router navigation: if the failure is a stale
              // chunk, the running bundle is exactly what can't be trusted.
              onClick={() => window.location.reload()}
              style={{
                cursor: "pointer",
                borderRadius: ".5rem",
                padding: ".55rem 1rem",
                fontSize: ".875rem",
                fontWeight: 500,
                background: "transparent",
                color: "#e8e8ea",
                border: "1px solid #3f3f46",
              }}
            >
              Reload the page
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/login";
              }}
              style={{
                cursor: "pointer",
                borderRadius: ".5rem",
                padding: ".55rem 1rem",
                fontSize: ".875rem",
                fontWeight: 500,
                background: "transparent",
                color: "#e8e8ea",
                border: "1px solid #3f3f46",
              }}
            >
              Sign in again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
