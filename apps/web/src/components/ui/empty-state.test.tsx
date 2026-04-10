import { render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state';
import { CheckCircle } from 'lucide-react';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        title="Sin resultados"
        description="No encontramos datos para mostrar."
        icon={CheckCircle}
      />
    );

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.getByText('No encontramos datos para mostrar.')).toBeInTheDocument();
  });
});
