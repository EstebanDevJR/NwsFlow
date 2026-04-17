import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Video, Plus } from 'lucide-react';
import gsap from 'gsap';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Badge } from '@/components/ui/badge';

interface Meeting {
  id: string;
  title: string;
  description: string;
  scheduledAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  meetingUrl?: string;
  leaderId: string;
  holderId: string;
  leader?: { id: string; name: string; email: string };
  holder?: { id: string; name: string; email: string };
}

const meetingSchema = z.object({
  title: z.string().min(3, 'Minimo 3 caracteres'),
  description: z.string().min(5, 'Minimo 5 caracteres'),
  scheduledAt: z.string().min(1, 'Fecha y hora requerida'),
  holderId: z.string().min(1, 'Selecciona un holder'),
  meetingUrl: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || /^https?:\/\//i.test(value), 'La URL debe iniciar con http:// o https://'),
});

type MeetingFormValues = z.infer<typeof meetingSchema>;

function statusLabel(s: Meeting['status']) {
  switch (s) {
    case 'PENDING':
      return 'Pendiente';
    case 'CONFIRMED':
      return 'Confirmada';
    case 'CANCELLED':
      return 'Cancelada';
    case 'COMPLETED':
      return 'Completada';
    default:
      return s;
  }
}

function statusVariant(s: Meeting['status']): 'warning' | 'success' | 'secondary' | 'destructive' | 'outline' {
  switch (s) {
    case 'PENDING':
      return 'warning';
    case 'CONFIRMED':
      return 'success';
    case 'CANCELLED':
      return 'destructive';
    case 'COMPLETED':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function Meetings() {
  const { user } = useAuthStore();
  const { meetings, fetchMeetings, createMeeting, updateMeeting, isLoading } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [holders, setHolders] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWhen, setEditWhen] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingSchema),
    mode: 'onChange',
    defaultValues: { title: '', description: '', scheduledAt: '', holderId: '', meetingUrl: '' },
  });

  useEffect(() => {
    void fetchMeetings();
    void fetchHolders();
    if (containerRef.current) {
      const cards = containerRef.current.querySelectorAll('.gsap-item');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 30, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.1, ease: 'back.out(1.2)' }
      );
    }
  }, []);

  const fetchHolders = async () => {
    try {
      const list = await api.get<Array<{ id: string; name: string; email: string }>>('/users?role=HOLDER&status=active');
      setHolders(list);
    } catch (err) {
      console.error('Failed to fetch holders', err);
    }
  };

  const onSubmit = async (values: MeetingFormValues) => {
    setSubmitError(null);
    try {
      const scheduledAt = new Date(values.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        setSubmitError('Fecha u hora no válida.');
        return;
      }
      await createMeeting({
        title: values.title,
        description: values.description,
        scheduledAt: scheduledAt.toISOString(),
        holderId: values.holderId,
        meetingUrl: values.meetingUrl?.trim() || undefined,
      });
      setShowForm(false);
      reset();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'No se pudo crear la reunión');
    }
  };

  const upcomingMeetings = useMemo(
    () => meetings.filter((m) => m.status === 'PENDING' || m.status === 'CONFIRMED'),
    [meetings]
  );

  const sortedUpcoming = useMemo(() => {
    return [...upcomingMeetings].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [upcomingMeetings]);

  /** Solo reuniones activas en el calendario (misma lógica que «Próximas reuniones»). */
  const meetingsByDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const m of meetings) {
      if (m.status !== 'PENDING' && m.status !== 'CONFIRMED') continue;
      const k = format(new Date(m.scheduledAt), 'yyyy-MM-dd');
      const list = map.get(k);
      if (list) list.push(m);
      else map.set(k, [m]);
    }
    return map;
  }, [meetings]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [calendarMonth]);

  const startEdit = (m: Meeting) => {
    const d = new Date(m.scheduledAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setEditWhen(local);
    setEditingId(m.id);
    setActionError(null);
  };

  const saveReschedule = async (id: string) => {
    setActionError(null);
    try {
      const iso = new Date(editWhen).toISOString();
      await updateMeeting(id, { scheduledAt: iso });
      setEditingId(null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'No se pudo actualizar');
    }
  };

  return (
    <div className="space-y-8" ref={containerRef}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Reuniones</h2>
          <p className="text-muted-foreground mt-1">
            {user?.role === 'LIDER'
              ? 'Agenda reuniones con holders; recibirás confirmación en la app y por correo cuando acepten.'
              : 'Gestiona las propuestas del líder: confirma, reprograma o rechaza. Recibirás avisos en la app y por correo si los tienes activados.'}
          </p>
        </div>
        {user?.role === 'LIDER' && (
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Agendar Reunión
          </Button>
        )}
      </div>

      {actionError && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">{actionError}</p>
      )}

      <Card className="liquid-glass gsap-item p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Calendario</h3>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCalendarMonth((d) => subMonths(d, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center capitalize">
              {format(calendarMonth, 'MMMM yyyy', { locale: es })}
            </span>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCalendarMonth((d) => addMonths(d, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-muted-foreground mb-2">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayMeetings = meetingsByDay.get(key) || [];
            const inMonth = isSameMonth(day, calendarMonth);
            const today = isSameDay(day, new Date());
            return (
              <div
                key={key}
                className={`
                  min-h-[72px] rounded-lg border p-1 text-left transition-colors
                  ${inMonth ? 'border-border/50 bg-background/40' : 'border-transparent bg-muted/10 opacity-50'}
                  ${today ? 'ring-1 ring-primary/50' : ''}
                `}
              >
                <p className={`text-xs font-medium ${inMonth ? 'text-foreground' : 'text-muted-foreground'}`}>{format(day, 'd')}</p>
                <div className="mt-1 space-y-0.5">
                  {dayMeetings.slice(0, 2).map((m) => (
                    <div key={m.id} className="truncate rounded bg-primary/15 px-1 py-0.5 text-[10px] text-primary" title={m.title}>
                      {format(new Date(m.scheduledAt), 'HH:mm')} {m.title}
                    </div>
                  ))}
                  {dayMeetings.length > 2 && <p className="text-[10px] text-muted-foreground">+{dayMeetings.length - 2} más</p>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {showForm && user?.role === 'LIDER' && (
        <Card className="liquid-glass p-6">
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
          >
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            <div>
              <label className="text-sm font-medium">Título</label>
              <Input {...register('title')} />
              {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Descripción</label>
              <textarea
                {...register('description')}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background/50 backdrop-blur-sm px-3 py-2 text-sm"
              />
              {errors.description && <p className="text-xs text-destructive mt-1">{errors.description.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Fecha y Hora</label>
                <Input type="datetime-local" {...register('scheduledAt')} />
                {errors.scheduledAt && <p className="text-xs text-destructive mt-1">{errors.scheduledAt.message}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Holder</label>
                <select
                  {...register('holderId')}
                  className="flex h-10 w-full rounded-md border border-input bg-background/50 backdrop-blur-sm px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar holder...</option>
                  {holders.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                {errors.holderId && <p className="text-xs text-destructive mt-1">{errors.holderId.message}</p>}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">URL de Reunión (opcional)</label>
              <Input placeholder="https://meet.google.com/..." {...register('meetingUrl')} />
              {errors.meetingUrl && <p className="text-xs text-destructive mt-1">{errors.meetingUrl.message}</p>}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={isLoading || isSubmitting}>
                Crear Reunión
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setSubmitError(null); }}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="gsap-item liquid-glass overflow-visible">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Próximas reuniones</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              Estados: pendiente de tu respuesta (holder), confirmada, etc.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {sortedUpcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay reuniones programadas.</p>
            ) : (
              sortedUpcoming.map((meeting) => (
                <div
                  key={meeting.id}
                  className="flex flex-col gap-3 p-4 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <CalendarIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-medium text-foreground truncate">{meeting.title}</h4>
                        <Badge variant={statusVariant(meeting.status)}>{statusLabel(meeting.status)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{meeting.description}</p>
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {format(new Date(meeting.scheduledAt), "d MMM yyyy, HH:mm", { locale: es })}
                        </span>
                        {user?.role === 'LIDER' && meeting.holder && (
                          <span>Holder: {meeting.holder.name}</span>
                        )}
                        {user?.role === 'HOLDER' && meeting.leader && (
                          <span>Líder: {meeting.leader.name}</span>
                        )}
                        {meeting.meetingUrl && (
                          <span className="flex items-center gap-1">
                            <Video className="w-3 h-3" /> Enlace
                          </span>
                        )}
                      </div>
                    </div>
                    {meeting.meetingUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-primary/20 hover:bg-primary/10 shrink-0"
                        onClick={() => window.open(meeting.meetingUrl, '_blank')}
                      >
                        Unirse
                      </Button>
                    )}
                  </div>

                  {user?.role === 'HOLDER' && meeting.status === 'PENDING' && (
                    <div className="flex flex-wrap gap-2 pl-14">
                      <Button
                        size="sm"
                        onClick={async () => {
                          setActionError(null);
                          try {
                            await updateMeeting(meeting.id, { status: 'CONFIRMED' });
                          } catch (e: unknown) {
                            setActionError(e instanceof Error ? e.message : 'Error');
                          }
                        }}
                      >
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => startEdit(meeting)}
                      >
                        Cambiar fecha
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          setActionError(null);
                          try {
                            await updateMeeting(meeting.id, { status: 'CANCELLED' });
                          } catch (e: unknown) {
                            setActionError(e instanceof Error ? e.message : 'Error');
                          }
                        }}
                      >
                        Rechazar
                      </Button>
                    </div>
                  )}

                  {user?.role === 'HOLDER' && meeting.status === 'CONFIRMED' && (
                    <div className="flex flex-wrap gap-2 pl-14">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(meeting)}>
                        Reprogramar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          setActionError(null);
                          try {
                            await updateMeeting(meeting.id, { status: 'CANCELLED' });
                          } catch (e: unknown) {
                            setActionError(e instanceof Error ? e.message : 'Error');
                          }
                        }}
                      >
                        Cancelar reunión
                      </Button>
                    </div>
                  )}

                  {editingId === meeting.id &&
                    user?.role === 'HOLDER' &&
                    (meeting.status === 'PENDING' || meeting.status === 'CONFIRMED') && (
                    <div className="flex flex-col sm:flex-row gap-2 pl-14 items-start sm:items-end">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs text-muted-foreground">Nueva fecha y hora</label>
                        <Input type="datetime-local" value={editWhen} onChange={(e) => setEditWhen(e.target.value)} className="mt-1" />
                      </div>
                      <Button size="sm" onClick={() => void saveReschedule(meeting.id)}>
                        Guardar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cerrar
                      </Button>
                    </div>
                  )}

                  {user?.role === 'LIDER' && (meeting.status === 'PENDING' || meeting.status === 'CONFIRMED') && (
                    <div className="flex flex-wrap gap-2 pl-14">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          setActionError(null);
                          try {
                            await updateMeeting(meeting.id, { status: 'CANCELLED' });
                          } catch (e: unknown) {
                            setActionError(e instanceof Error ? e.message : 'Error');
                          }
                        }}
                      >
                        Cancelar reunión
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {user?.role === 'LIDER' && (
          <Card className="gsap-item liquid-glass">
            <CardHeader>
              <CardTitle className="text-lg font-medium">Holders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {holders.map((holder) => (
                <div key={holder.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-sm font-medium text-white">
                      {holder.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{holder.name}</p>
                      <p className="text-xs text-muted-foreground">{holder.email}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setValue('holderId', holder.id, { shouldValidate: true });
                      setShowForm(true);
                    }}
                  >
                    Agendar
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
