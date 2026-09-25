import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { reportClientError } from './lib/api';
import { ThemeProvider } from './components/ThemeProvider';
import { ErrorBoundary } from './components/ErrorBoundary';

window.onerror = (message, source, lineno, colno, error) => {
  reportClientError({
    message: String(message),
    stack: error?.stack ?? `${source}:${lineno}:${colno}`,
    route: window.location.pathname,
  });
};

window.onunhandledrejection = (event) => {
  reportClientError({
    message: `Unhandled promise rejection: ${String(event.reason)}`,
    stack: event.reason?.stack ?? '',
    route: window.location.pathname,
  });
};


createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </ThemeProvider>
);
