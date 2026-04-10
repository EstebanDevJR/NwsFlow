import { create } from 'zustand';
import { api } from '@/lib/api';

export type Role = 'LIDER' | 'HOLDER' | 'CAJERO';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  telegramId?: string | null;
  telegramPairingAllowed?: boolean;
  emailNotifications?: boolean;
  inAppNotifications?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  theme: 'light' | 'dark';
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string }) => Promise<void>;
  logout: () => void;
  toggleTheme: () => void;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  theme: 'light',
  isLoading: true,

  login: async (email, password) => {
    const data = await api.post<{ accessToken: string; user: User }>('/auth/login', { email, password });
    api.setToken(data.accessToken);
    set({ user: data.user, isAuthenticated: true, isLoading: false });
  },

  register: async (userData) => {
    await api.post('/auth/register', { ...userData, role: 'LIDER' as const });
  },

  logout: () => {
    api.setToken(null);
    set({ user: null, isAuthenticated: false });
    window.location.href = '/login';
  },

  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme);
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { theme: newTheme };
    }),

  setUser: (user) => set({ user }),

  checkAuth: async () => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (saved === 'dark' || saved === 'light') {
      set({ theme: saved });
      document.documentElement.classList.toggle('dark', saved === 'dark');
    } else if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      set({ theme: 'dark' });
      document.documentElement.classList.add('dark');
    }

    const token = api.getToken();
    if (!token) {
      set({ isLoading: false });
      return;
    }

    try {
      const user = await api.get<User>('/auth/me');
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      api.setToken(null);
      set({ isLoading: false });
    }
  },
}));
