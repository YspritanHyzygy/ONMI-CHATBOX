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
    // 你同样可以将错误日志上报给服务器
    console.error('ErrorBoundary 捕获到错误:', error, errorInfo);
    
    // 调用可选的错误处理回调
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      // 你可以自定义降级后的 UI 并渲染
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center space-x-2 text-red-700">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">组件加载失败，请刷新页面重试</span>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;