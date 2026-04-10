import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function CrashingComponent() {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <div>Contenido estable</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Contenido estable')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <CrashingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Algo salió mal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
    spy.mockRestore();
  });
});
