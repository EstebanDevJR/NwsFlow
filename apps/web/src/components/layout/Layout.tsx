import React, { useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from '@/lib/api';
import {
  LayoutDashboard,
  FileText,
  Users,
  Calendar,
  LogOut,
  Sun,
  Moon,
  CreditCard,
  CheckCircle,
  Bell,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NwsPayFlowLogo } from '@/components/NwsPayFlowLogo';
import gsap from 'gsap';

type AppNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link?: string | null;
};

/** Ruta de la SPA según `link` guardado o tipo (notificaciones antiguas sin `link`). */
function resolveNotificationPath(n: Pick<AppNotification, 'type' | 'link'>): string {
  if (n.link && n.link.startsWith('/')) return n.link;
  const t = n.type;
  if (t.startsWith('MEETING_')) return '/meetings';
  if (t === 'PAYMENT_CREATED') return '/approvals';
  if (t.startsWith('PAYMENT_')) return '/payments';
  if (t.startsWith('SLA_')) return '/payments';
  if (t === 'BUDGET_ALERT') return '/reports';
  return '/';
}

export function Layout() {
  const { user, logout, theme, toggleTheme } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const navItemsRef = useRef<HTMLDivElement>(null);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [notificationsTotal, setNotificationsTotal] = React.useState(0);
  const [chatUnread, setChatUnread] = React.useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    try {
      const v =
        localStorage.getItem('nwspayflow-sidebar-collapsed') ?? localStorage.getItem('payflow-sidebar-collapsed');
      return v === '1';
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('nwspayflow-sidebar-collapsed', sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    // Page transition animation
    if (contentRef.current) {
      gsap.fromTo(contentRef.current, 
        { opacity: 0, y: 15, scale: 0.98 }, 
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' }
      );
    }
  }, [location.pathname]);

  useEffect(() => {
    if (navItemsRef.current) {
      const items = navItemsRef.current.children;
      gsap.fromTo(items,
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out', delay: 0.2 }
      );
    }
  }, [user, sidebarCollapsed]);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const res = await api.get<{
          data: AppNotification[];
          meta: { unread: number; total: number };
        }>('/notifications?limit=20');
        setNotifications(res.data);
        setUnreadCount(res.meta.unread);
        setNotificationsTotal(res.meta.total);
      } catch {
        setNotifications([]);
        setUnreadCount(0);
        setNotificationsTotal(0);
      }
    };

    void loadNotifications();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadNotifications();
      }
    }, 20000);

    return () => window.clearInterval(interval);
  }, [location.pathname]);

  React.useEffect(() => {
    const loadChatUnread = async () => {
      try {
        const r = await api.get<{ count: number }>('/chat/unread-count');
        setChatUnread(r.count);
      } catch {
        setChatUnread(0);
      }
    };
    void loadChatUnread();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadChatUnread();
      }
    }, 25000);
    return () => window.clearInterval(interval);
  }, [location.pathname]);

  if (!user) return null;

  type NavItem = { icon: any; label: string; path: string };
  type NavSection = { key: string; label: string; items: NavItem[] };

  const getNavSections = (): NavSection[] => {
    let sections: NavSection[] = [];
    switch (user.role) {
      case 'LIDER':
        sections = [
          {
            key: 'principal',
            label: 'Principal',
            items: [{ icon: LayoutDashboard, label: 'Dashboard', path: '/' }],
          },
          {
            key: 'operaciones',
            label: 'Operaciones',
            items: [
              { icon: FileText, label: 'Nueva Solicitud', path: '/request/new' },
              { icon: CheckCircle, label: 'Historial', path: '/history' },
              { icon: Calendar, label: 'Reuniones', path: '/meetings' },
            ],
          },
          {
            key: 'comunicacion',
            label: 'Comunicación',
            items: [{ icon: MessageCircle, label: 'Mensajes', path: '/chat' }],
          },
        ];
        break;
      case 'HOLDER':
        sections = [
          {
            key: 'principal',
            label: 'Principal',
            items: [{ icon: LayoutDashboard, label: 'Dashboard', path: '/' }],
          },
          {
            key: 'prioridad-alta',
            label: 'Prioridad Alta',
            items: [
              { icon: CheckCircle, label: 'Aprobaciones', path: '/approvals' },
              { icon: CreditCard, label: 'Pagos Pendientes', path: '/payments' },
            ],
          },
          {
            key: 'gestion',
            label: 'Gestión',
            items: [
              { icon: CreditCard, label: 'Ingresos', path: '/incomes' },
              { icon: CreditCard, label: 'Pagos Ejecutados', path: '/executed' },
              { icon: FileText, label: 'Reportes', path: '/reports' },
              { icon: Users, label: 'Usuarios', path: '/users' },
              { icon: Calendar, label: 'Reuniones', path: '/meetings' },
            ],
          },
          {
            key: 'comunicacion',
            label: 'Comunicación',
            items: [{ icon: MessageCircle, label: 'Mensajes', path: '/chat' }],
          },
        ];
        break;
      case 'CAJERO':
        sections = [
          {
            key: 'principal',
            label: 'Principal',
            items: [{ icon: LayoutDashboard, label: 'Dashboard', path: '/' }],
          },
          {
            key: 'prioridad-alta',
            label: 'Prioridad Alta',
            items: [
              { icon: CheckCircle, label: 'Aprobaciones', path: '/approvals' },
              { icon: CreditCard, label: 'Pagos Pendientes', path: '/payments' },
            ],
          },
          {
            key: 'gestion',
            label: 'Gestión',
            items: [
              { icon: CreditCard, label: 'Ingresos', path: '/incomes' },
              { icon: CheckCircle, label: 'Historial', path: '/history' },
            ],
          },
          {
            key: 'comunicacion',
            label: 'Comunicación',
            items: [{ icon: MessageCircle, label: 'Mensajes', path: '/chat' }],
          },
        ];
        break;
      default:
        sections = [];
    }

    sections.push({
      key: 'sistema',
      label: 'Sistema',
      items: [{ icon: SettingsIcon, label: 'Configuración', path: '/settings' }],
    });
    return sections;
  };

  const navSections = getNavSections();

  return (
    <div className="flex h-screen w-full overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={cn(
          'liquid-glass border-r border-border/50 flex flex-col transition-[width] duration-300 ease-out z-20 shrink-0',
          sidebarCollapsed ? 'w-[4.25rem]' : 'w-64'
        )}
      >
        <div
          className={cn(
            'border-b border-border/50 flex shrink-0',
            sidebarCollapsed ? 'flex-col items-center gap-2 py-3 px-2' : 'h-16 items-center justify-between px-4'
          )}
        >
          <div
            className={cn(
              'flex items-center gap-2 font-semibold text-lg tracking-tight min-w-0',
              sidebarCollapsed && 'justify-center'
            )}
          >
            <div className="w-8 h-8 shrink-0 rounded-lg overflow-hidden shadow-md ring-1 ring-white/10">
              <NwsPayFlowLogo className="h-full w-full" />
            </div>
            {!sidebarCollapsed && <span className="gradient-text truncate">NWSPayFlow</span>}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        <div
          className={cn('flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden', sidebarCollapsed ? 'px-2' : 'px-3')}
          ref={navItemsRef}
        >
          {navSections.map((section, sectionIdx) => (
            <div key={section.key} className={cn(sectionIdx > 0 && 'mt-3 pt-3 border-t border-border/40')}>
              {!sidebarCollapsed && (
                <p className="px-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">{section.label}</p>
              )}
              {section.items.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    'w-full flex items-center rounded-lg text-sm font-medium transition-all duration-200 group',
                    sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                    location.pathname === item.path
                      ? 'bg-primary/15 text-primary shadow-sm'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <span className="relative inline-flex shrink-0">
                    <item.icon
                      className={cn(
                        'w-4 h-4 transition-transform duration-200 group-hover:scale-110',
                        location.pathname === item.path ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    {item.path === '/chat' && chatUnread > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-0.5 rounded-full bg-primary text-[10px] font-semibold leading-[18px] text-primary-foreground text-center">
                        {chatUnread > 9 ? '9+' : chatUnread}
                      </span>
                    )}
                  </span>
                  {!sidebarCollapsed && <span className="truncate text-left">{item.label}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div
          className={cn(
            'border-t border-border/50 bg-background/20',
            sidebarCollapsed ? 'p-2 flex flex-col items-center gap-2' : 'p-4'
          )}
        >
          <div
            className={cn(
              'flex items-center gap-3 mb-2',
              sidebarCollapsed ? 'flex-col mb-0' : 'mb-4 px-2'
            )}
          >
            {user.avatar ? (
              <img
                src={user.avatar}
                alt=""
                title={sidebarCollapsed ? user.name : undefined}
                className="w-10 h-10 rounded-full object-cover shadow-md ring-2 ring-border/50 shrink-0"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-sm font-medium text-white shadow-md shrink-0"
                title={sidebarCollapsed ? user.name : undefined}
              >
                {user.name.charAt(0)}
              </div>
            )}
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.role}</p>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            title={sidebarCollapsed ? 'Cerrar sesión' : undefined}
            className={cn(
              'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
              sidebarCollapsed ? 'h-9 w-9 p-0 justify-center' : 'w-full justify-start'
            )}
            onClick={() => {
              api.post('/auth/logout').catch(() => {});
              logout();
              navigate('/login');
            }}
          >
            <LogOut className={cn('w-4 h-4', !sidebarCollapsed && 'mr-2')} />
            {!sidebarCollapsed && 'Cerrar Sesión'}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        {/* Header */}
        <header className="h-16 liquid-glass border-b-0 border-b border-border/50 flex items-center justify-between px-8 z-10">
          <h1 className="text-lg font-medium capitalize">
            {(() => {
              if (location.pathname === '/') return 'Dashboard';
              const seg = location.pathname.split('/').filter(Boolean)[0] ?? '';
              const titles: Record<string, string> = {
                request: 'Nueva solicitud',
                history: 'Historial',
                approvals: 'Aprobaciones',
                payments: 'Pagos pendientes',
                reports: 'Reportes',
                incomes: 'Ingresos',
                users: 'Usuarios',
                executed: 'Pagos ejecutados',
                meetings: 'Reuniones',
                settings: 'Configuración',
                chat: 'Mensajes',
              };
              return titles[seg] ?? seg.replace(/-/g, ' ');
            })()}
          </h1>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-background/50 backdrop-blur-sm relative"
              onClick={() => setNotificationsOpen((v) => !v)}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] px-1 rounded-full bg-destructive text-white text-[10px] flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full bg-background/50 backdrop-blur-sm">
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </Button>
          </div>
        </header>
        {notificationsOpen && (
          <div className="absolute top-16 right-8 z-30 w-[min(24rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex flex-col bg-card border border-border rounded-lg shadow-lg overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between gap-2 shrink-0">
              <div>
                <h3 className="text-sm font-semibold">Notificaciones</h3>
                {notificationsTotal > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {notifications.length < notificationsTotal
                      ? `Mostrando ${notifications.length} de ${notificationsTotal}`
                      : `${notificationsTotal} reciente${notificationsTotal !== 1 ? 's' : ''}`}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="text-xs text-primary shrink-0"
                onClick={async () => {
                  await api.patch('/notifications/read-all');
                  setUnreadCount(0);
                  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                }}
              >
                Marcar todas
              </button>
            </div>
            <div className="max-h-[min(360px,50vh)] overflow-y-auto overscroll-y-contain divide-y divide-border">
              {notifications.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Sin notificaciones recientes.</p>
              ) : (
                notifications.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    className={cn(
                      'w-full text-left p-3 hover:bg-muted/40 transition-colors cursor-pointer',
                      !n.read && 'bg-primary/5'
                    )}
                    onClick={async () => {
                      if (!n.read) {
                        await api.patch(`/notifications/${n.id}/read`);
                        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                        setUnreadCount((u) => Math.max(0, u - 1));
                      }
                      setNotificationsOpen(false);
                      navigate(resolveNotificationPath(n));
                    }}
                  >
                    <p className="text-sm font-medium line-clamp-2">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{n.message}</p>
                  </button>
                ))
              )}
            </div>
            <div className="px-3 py-2 border-t border-border bg-muted/20 shrink-0">
              <p className="text-[11px] text-muted-foreground text-center">
                Caducan automáticamente a los 3 días.
              </p>
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8" ref={contentRef}>
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
