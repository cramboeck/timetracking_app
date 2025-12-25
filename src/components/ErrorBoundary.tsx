import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, Copy, Check } from 'lucide-react';

interface ErrorInfo {
  componentStack: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree,
 * logs the error, and displays a fallback UI.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to console
    console.error('ErrorBoundary caught an error:', error);
    console.error('Component stack:', errorInfo.componentStack);

    // Store error info for display
    this.setState({ errorInfo });

    // Here you could also send the error to an error reporting service
    // Example: Sentry.captureException(error, { extra: errorInfo });
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    });
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleCopyError = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    const errorText = `
Error: ${error?.message || 'Unknown error'}
Stack: ${error?.stack || 'No stack trace'}
Component Stack: ${errorInfo?.componentStack || 'No component stack'}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}
Time: ${new Date().toISOString()}
    `.trim();

    try {
      await navigator.clipboard.writeText(errorText);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (err) {
      console.error('Failed to copy error:', err);
    }
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, copied } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Custom fallback provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-dark-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white dark:bg-dark-100 rounded-2xl shadow-xl border border-gray-200 dark:border-dark-200 overflow-hidden">
            {/* Header */}
            <div className="bg-red-50 dark:bg-red-900/20 px-6 py-8 text-center border-b border-red-100 dark:border-red-900/30">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Etwas ist schiefgelaufen
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Ein unerwarteter Fehler ist aufgetreten. Keine Sorge, Ihre Daten sind sicher.
              </p>
            </div>

            {/* Error Details (collapsible) */}
            <details className="group">
              <summary className="px-6 py-3 bg-gray-50 dark:bg-dark-50 cursor-pointer flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                <Bug size={16} />
                <span>Technische Details anzeigen</span>
              </summary>
              <div className="px-6 py-4 bg-gray-50 dark:bg-dark-50 border-t border-gray-100 dark:border-dark-200">
                <div className="bg-gray-900 dark:bg-black rounded-lg p-4 overflow-auto max-h-48">
                  <code className="text-xs text-red-400 font-mono whitespace-pre-wrap break-all">
                    {error?.message || 'Unknown error'}
                    {error?.stack && (
                      <>
                        {'\n\n'}
                        {error.stack}
                      </>
                    )}
                  </code>
                </div>
                <button
                  onClick={this.handleCopyError}
                  className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check size={14} className="text-green-500" />
                      Kopiert!
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Fehlerdetails kopieren
                    </>
                  )}
                </button>
              </div>
            </details>

            {/* Actions */}
            <div className="px-6 py-6 space-y-3">
              <button
                onClick={this.handleRetry}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-primary hover:bg-accent-dark text-white rounded-xl font-medium transition-colors"
              >
                <RefreshCw size={18} />
                Erneut versuchen
              </button>

              <div className="flex gap-3">
                <button
                  onClick={this.handleGoHome}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-dark-200 hover:bg-gray-200 dark:hover:bg-dark-300 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors"
                >
                  <Home size={18} />
                  Zur Startseite
                </button>
                <button
                  onClick={this.handleReload}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-dark-200 hover:bg-gray-200 dark:hover:bg-dark-300 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors"
                >
                  <RefreshCw size={18} />
                  Seite neu laden
                </button>
              </div>
            </div>

            {/* Footer hint */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-dark-50 border-t border-gray-100 dark:border-dark-200">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Wenn das Problem weiterhin besteht, kontaktieren Sie bitte den Support.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
