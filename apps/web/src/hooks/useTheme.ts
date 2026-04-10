import { useAuthStore } from '@/store/useAuthStore';

/** Theme lives in `useAuthStore` (localStorage + DOM). Use this hook for a thin alias. */
export function useTheme() {
  const theme = useAuthStore((s) => s.theme);
  const toggleTheme = useAuthStore((s) => s.toggleTheme);
  return { theme, toggleTheme };
}
