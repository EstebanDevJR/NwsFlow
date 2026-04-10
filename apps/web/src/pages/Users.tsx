import { useCallback, useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Filter, FilterX, MoreHorizontal, Search, UserPlus, Pencil, UserX } from 'lucide-react';
import gsap from 'gsap';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'LIDER' | 'HOLDER' | 'CAJERO';
  isActive: boolean;
}

type UserListFilters = {
  q: string;
  role: '' | 'LIDER' | 'HOLDER' | 'CAJERO';
  status: '' | 'active' | 'inactive';
};

const defaultUserFilters = (): UserListFilters => ({
  q: '',
  role: '',
  status: '',
});

export function Users() {
  const { user: currentUser } = useAuthStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [filters, setFilters] = useState<UserListFilters>(() => defaultUserFilters());
  const qDebounced = useDebouncedValue(filters.q, 400);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'LIDER' as 'LIDER' | 'HOLDER' | 'CAJERO',
    telegramPairingAllowed: false,
  });

  const loadUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (qDebounced.trim()) params.set('q', qDebounced.trim());
      if (filters.role) params.set('role', filters.role);
      if (filters.status) params.set('status', filters.status);
      const qs = params.toString();
      const data = await api.get<User[]>(`/users${qs ? `?${qs}` : ''}`);
      setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  }, [qDebounced, filters.role, filters.status]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, y: 30, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.2)' }
      );
    }
  }, []);

  const patchFilters = (patch: Partial<UserListFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  };

  const resetFilters = () => {
    setFilters(defaultUserFilters());
  };

  const hasActiveFilters = useMemo(
    () => !!filters.q.trim() || !!filters.role || !!filters.status,
    [filters.q, filters.role, filters.status]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const body: Record<string, string | boolean> = {
          name: formData.name,
          email: formData.email,
        };
        if (editingUser.role !== 'HOLDER') {
          body.role = formData.role;
        }
        if (formData.password.trim()) body.password = formData.password;
        await api.put(`/users/${editingUser.id}`, body);
      } else {
        const payload: Record<string, string | boolean> = {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        };
        if (formData.role === 'HOLDER') {
          payload.telegramPairingAllowed = formData.telegramPairingAllowed;
        }
        await api.post('/users', payload);
      }
      setShowForm(false);
      setEditingUser(null);
      setFormData({ name: '', email: '', password: '', role: 'LIDER', telegramPairingAllowed: false });
      await loadUsers();
    } catch (err) {
      console.error('Failed to save user', err);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('¿Desactivar este usuario? Podrá reactivarse editando su estado si lo permites en el futuro.')) return;
    try {
      await api.delete(`/users/${id}`);
      await loadUsers();
    } catch (err) {
      console.error('Failed to deactivate user', err);
    }
  };

  const handleDeletePermanent = async (id: string, name: string) => {
    if (
      !confirm(
        `¿Eliminar del sistema a «${name}»? Esta acción no se puede deshacer: se borrarán reuniones donde era holder y sus aprobaciones como aprobador.`
      )
    ) {
      return;
    }
    try {
      await api.delete(`/users/${id}/permanent`);
      await loadUsers();
    } catch (err) {
      console.error('Failed to permanently delete user', err);
    }
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role === 'HOLDER' ? 'HOLDER' : user.role,
      telegramPairingAllowed: false,
    });
    setShowForm(true);
  };

  return (
    <div className="space-y-6" ref={containerRef}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Gestión de Usuarios</h2>
          <p className="text-muted-foreground mt-1">Administra los accesos y roles de la plataforma.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => { setShowForm(true); setEditingUser(null); setFormData({ name: '', email: '', password: '', role: 'LIDER', telegramPairingAllowed: false }); }}>
          <UserPlus className="w-4 h-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Filter className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium text-foreground">Filtros</span>
          </div>
          <div className="relative min-w-[min(100%,260px)] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o correo…"
              className="pl-9 bg-background/60"
              value={filters.q}
              onChange={(e) => patchFilters({ q: e.target.value })}
            />
          </div>
          <Select
            value={filters.role || 'all'}
            onValueChange={(v) => patchFilters({ role: v === 'all' ? '' : (v as UserListFilters['role']) })}
          >
            <SelectTrigger className="w-full sm:w-[160px] bg-background/60">
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              <SelectItem value="LIDER">Líder</SelectItem>
              <SelectItem value="HOLDER">Holder</SelectItem>
              <SelectItem value="CAJERO">Cajero</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.status || 'all'}
            onValueChange={(v) => patchFilters({ status: v === 'all' ? '' : (v as UserListFilters['status']) })}
          >
            <SelectTrigger className="w-full sm:w-[160px] bg-background/60">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Activo e inactivo</SelectItem>
              <SelectItem value="active">Solo activos</SelectItem>
              <SelectItem value="inactive">Solo inactivos</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="gap-1.5"
          >
            <FilterX className="h-4 w-4" />
            Limpiar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {hasActiveFilters
            ? `Mostrando ${users.length} usuario${users.length !== 1 ? 's' : ''} con los filtros actuales.`
            : 'Listado completo ordenado por fecha de alta.'}
        </p>
      </div>

      {showForm && (
        <Card className="liquid-glass p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Nombre</label>
                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Contraseña {!editingUser && '(requerida)'}</label>
                <Input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} required={!editingUser} />
              </div>
              <div>
                <label className="text-sm font-medium">Rol</label>
                {editingUser ? (
                  editingUser.role === 'HOLDER' ? (
                    <p className="text-sm py-2">Holder (el rol no se modifica aquí)</p>
                  ) : (
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background/50 backdrop-blur-sm px-3 py-2 text-sm"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as 'LIDER' | 'CAJERO' })}
                    >
                      <option value="LIDER">Líder</option>
                      <option value="CAJERO">Cajero</option>
                    </select>
                  )
                ) : (
                  <>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background/50 backdrop-blur-sm px-3 py-2 text-sm"
                      value={formData.role}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          role: e.target.value as 'LIDER' | 'HOLDER' | 'CAJERO',
                        })
                      }
                    >
                      <option value="LIDER">Líder</option>
                      <option value="HOLDER">Holder</option>
                      <option value="CAJERO">Cajero</option>
                    </select>
                    {formData.role === 'HOLDER' && (
                      <label className="mt-3 flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.telegramPairingAllowed}
                          onChange={(e) =>
                            setFormData({ ...formData, telegramPairingAllowed: e.target.checked })
                          }
                        />
                        Permitir vincular Telegram (bot)
                      </label>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">{editingUser ? 'Actualizar' : 'Crear'}</Button>
              <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setEditingUser(null); }}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden liquid-glass">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-medium">Usuario</th>
                <th className="px-6 py-4 font-medium">Rol</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-sm font-medium text-white">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="outline" className="font-normal">{user.role}</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.isActive ? (
                      <Badge variant="success">Activo</Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(user)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {currentUser && currentUser.id !== user.id ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Más acciones de usuario">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleDeactivate(user.id)}>
                            <UserX className="w-4 h-4" />
                            Desactivar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeletePermanent(user.id, user.name)}
                          >
                            Eliminar del sistema
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    {hasActiveFilters
                      ? 'Ningún usuario coincide con los filtros. Prueba a limpiar o ajustar la búsqueda.'
                      : 'No hay usuarios registrados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
