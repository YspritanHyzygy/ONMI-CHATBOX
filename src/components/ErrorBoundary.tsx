import React, { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // 更新 state 使下一次渲染能够显示降级后的 UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Do not dump arbitrary Error objects: provider/client errors can retain
    // request details or user content. Component names are sufficient for a
    // local render diagnostic.
    console.error('ONMI UI render error:', {
      name: error.name,
      componentStack: errorInfo.componentStack,
    });
    
    // 调用可选的错误处理回调
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      // 你可以自定义降级后的 UI 并渲染
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <main className="min-h-screen bg-background flex items-center justify-center p-6">
          <section className="max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
            <h1 className="mt-3 text-lg font-semibold">ONMI Chatbox could not render this page</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your local data was not changed. Try rendering the page again, or reload if the error continues.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" className="rounded border px-3 py-2 text-sm" onClick={this.reset}>Try again</button>
              <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => window.location.reload()}>Reload</button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
