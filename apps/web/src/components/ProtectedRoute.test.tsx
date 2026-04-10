import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReactNode } from 'react';
import { ProtectedRoute } from './ProtectedRoute';

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: vi.fn(),
}));

import { useAuthStore } from '@/store/useAuthStore';

const mockedStore = useAuthStore as unknown as ReturnType<typeof vi.fn>;

function renderWithRoutes(ui: ReactNode, initialPath = '/private') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/" element={<div>Home page</div>} />
        <Route path="/private" element={ui} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('redirects to login when not authenticated', () => {
    mockedStore.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
    });

    renderWithRoutes(
      <ProtectedRoute>
        <div>Private content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('renders children when authenticated and role allowed', () => {
    mockedStore.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'HOLDER' },
      isLoading: false,
    });

    renderWithRoutes(
      <ProtectedRoute allowedRoles={['HOLDER']}>
        <div>Private content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Private content')).toBeInTheDocument();
  });

  it('redirects to home when role not allowed', () => {
    mockedStore.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'LIDER' },
      isLoading: false,
    });

    renderWithRoutes(
      <ProtectedRoute allowedRoles={['HOLDER']}>
        <div>Private content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Home page')).toBeInTheDocument();
  });

  it('shows loading spinner while auth check runs', () => {
    mockedStore.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: true,
    });

    renderWithRoutes(
      <ProtectedRoute>
        <div>Private content</div>
      </ProtectedRoute>
    );

    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders children when authenticated and allowedRoles is omitted', () => {
    mockedStore.mockReturnValue({
      isAuthenticated: true,
      user: { role: 'LIDER' },
      isLoading: false,
    });

    renderWithRoutes(
      <ProtectedRoute>
        <div>Private content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Private content')).toBeInTheDocument();
  });
});
