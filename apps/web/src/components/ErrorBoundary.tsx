import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundaryClass extends Component<Props, ErrorBoundaryState> {
  declare props: Props;
  declare state: ErrorBoundaryState;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('UI error captured by ErrorBoundary:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Algo salió mal</h2>
            <p className="text-sm text-muted-foreground">
              Ocurrió un error inesperado en la interfaz. Puedes recargar la página para continuar.
            </p>
            <Button onClick={() => window.location.reload()}>
              Recargar
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ErrorBoundary = ErrorBoundaryClass;