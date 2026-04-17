import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore, User } from '@/store/useAuthStore';
import {
  Bell,
  CheckCircle,
  Camera,
  Link2,
  MessageCircle,
  Send,
  Shield,
  User as UserIcon,
  Users,
  XCircle,
} from 'lucide-react';
import gsap from 'gsap';
import { api } from '@/lib/api';

export function Settings() {
  const { user, setUser } = useAuthStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [inAppNotifications, setInAppNotifications] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [telegramCodeInput, setTelegramCodeInput] = useState('');
  const [telegramValidateLoading, setTelegramValidateLoading] = useState(false);
  const [pairFeedback, setPairFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [holders, setHolders] = useState<
    Array<{
      id: string;
      name: string;
      email: string;
      isActive: boolean;
      telegramPairingAllowed: boolean;
      telegramId: string | null;
    }>
  >([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [holderToggleId, setHolderToggleId] = useState<string | null>(null);

  const refreshMe = async () => {
    const u = await api.get<User>('/auth/me');
    setUser(u);
  };

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setEmailNotifications(user.emailNotifications ?? true);
      setInAppNotifications(user.inAppNotifications ?? true);
    }
  }, [user]);

  useEffect(() => {
    if (containerRef.current) {
      const cards = containerRef.current.querySelectorAll('.gsap-card');
      gsap.fromTo(cards,
        { opacity: 0, y: 30, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.1, ease: 'back.out(1.2)' }
      );
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'HOLDER') return;
    let cancelled = false;
    setHoldersLoading(true);
    api
      .get<
        Array<{
          id: string;
          name: string;
          email: string;
          isActive: boolean;
          telegramPairingAllowed: boolean;
          telegramId: string | null;
        }>
      >('/users/telegram-access')
      .then((data) => {
        if (!cancelled) setHolders(data);
      })
      .catch(() => {
        if (!cancelled) setHolders([]);
      })
      .finally(() => {
        if (!cancelled) setHoldersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.role, user?.id]);

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-4xl" ref={containerRef}>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Configuración</h2>
        <p className="text-muted-foreground mt-1">Gestiona tu cuenta y preferencias de la plataforma.</p>
      </div>

      <div className="grid gap-6">
        <Card className="gsap-card liquid-glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-primary" />
              <CardTitle>Perfil</CardTitle>
            </div>
            <CardDescription>
              Información personal y detalles de tu cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="relative shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setAvatarUploading(true);
                    setSaveMsg('');
                    try {
                      const fd = new FormData();
                      fd.append('avatar', file);
                      const updated = await api.post<User>('/upload/avatar', fd);
                      setUser(updated);
                      setSaveMsg('Foto de perfil actualizada.');
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : '';
                      setSaveMsg(
                        msg ? `No se pudo subir la imagen: ${msg}` : 'No se pudo subir la imagen.'
                      );
                    } finally {
                      setAvatarUploading(false);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="group relative w-24 h-24 rounded-full overflow-hidden ring-2 ring-border/60 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-2xl font-semibold text-white">
                      {user.name.charAt(0)}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Camera className="w-8 h-8 text-white" />
                  </div>
                </button>
                <p className="text-xs text-muted-foreground mt-2 max-w-[10rem]">
                  {avatarUploading ? 'Subiendo…' : 'JPEG, PNG, WebP o GIF, máx. 2 MB.'}
                </p>
              </div>
              <div className="flex-1 space-y-4 w-full min-w-0">
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre completo</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background/50 backdrop-blur-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-background/50 backdrop-blur-sm"
                autoComplete="email"
              />
              <p className="text-xs text-muted-foreground">Debe ser único en la plataforma.</p>
            </div>
            <div className="grid gap-2">
              <Label>Rol actual</Label>
              <div className="text-sm font-medium px-3 py-2 bg-muted/30 rounded-md border border-border/50 w-fit">
                {user.role}
              </div>
            </div>
              </div>
            </div>
            {saveMsg && <p className="text-sm text-muted-foreground">{saveMsg}</p>}
            <Button
              type="button"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={
                saving ||
                (!name.trim()) ||
                (!email.trim()) ||
                (name.trim() === user.name &&
                  email.trim().toLowerCase() === user.email.toLowerCase() &&
                  emailNotifications === (user.emailNotifications ?? true) &&
                  inAppNotifications === (user.inAppNotifications ?? true))
              }
              onClick={async () => {
                setSaving(true);
                setSaveMsg('');
                try {
                  const payload: Record<string, unknown> = {
                    name: name.trim(),
                    emailNotifications,
                    inAppNotifications,
                  };
                  if (email.trim().toLowerCase() !== user.email.toLowerCase()) {
                    payload.email = email.trim();
                  }
                  const updated = await api.patch<User>('/auth/me', payload);
                  setUser(updated);
                  setEmail(updated.email);
                  setSaveMsg('Perfil actualizado.');
                } catch {
                  setSaveMsg('No se pudo guardar.');
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </CardContent>
        </Card>

        <Card className="gsap-card liquid-glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <CardTitle>Notificaciones</CardTitle>
            </div>
            <CardDescription>
              Configura cómo y cuándo recibes alertas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
              <div className="space-y-0.5">
                <Label className="text-base">Notificaciones por Email</Label>
                <p className="text-sm text-muted-foreground">Recibe correos sobre nuevas solicitudes y cambios de estado.</p>
              </div>
              <input
                type="checkbox"
                className="toggle"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
              <div className="space-y-0.5">
                <Label className="text-base">Alertas en la Plataforma</Label>
                <p className="text-sm text-muted-foreground">Muestra notificaciones emergentes dentro de la app.</p>
              </div>
              <input
                type="checkbox"
                className="toggle"
                checked={inAppNotifications}
                onChange={(e) => setInAppNotifications(e.target.checked)}
              />
            </div>
          </CardContent>
        </Card>

        {(user.role === 'HOLDER' || user.role === 'CAJERO') && (
          <Card className="gsap-card liquid-glass overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Telegram
                      {user.telegramId && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          <Link2 className="h-3 w-3" />
                          Conectado
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1 max-w-prose">
                      Vincula el bot para aprobar solicitudes de pago desde Telegram. Las reuniones se avisan en la app y
                      por correo.
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!user.telegramPairingAllowed ? (
                <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p>
                    Tu usuario no tiene permiso para vincular Telegram. Un holder administrador debe activar
                    &quot;Permitir vinculación&quot; en la sección de holders/cajeros.
                  </p>
                </div>
              ) : user.telegramId ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div className="space-y-1 text-sm">
                      <p className="font-medium text-foreground">Cuenta vinculada</p>
                      <p className="text-muted-foreground">
                        El bot reconocerá tu cuenta para aprobar o rechazar solicitudes desde Telegram.
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Si cambias de cuenta de Telegram, desvincula aquí y pide un código nuevo con{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/codigo</code> en el bot.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={async () => {
                      setPairFeedback(null);
                      try {
                        await api.delete('/telegram/pairing');
                        setTelegramCodeInput('');
                        await refreshMe();
                        setPairFeedback({
                          ok: true,
                          text: 'Desvinculación correcta. Puedes emparejar de nuevo con un código nuevo desde Telegram.',
                        });
                      } catch {
                        setPairFeedback({ ok: false, text: 'No se pudo desvincular. Intenta de nuevo.' });
                      }
                    }}
                  >
                    Desvincular Telegram
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-3">
                    {[
                      {
                        step: 1,
                        body: (
                          <>
                            En Telegram, abre el bot y envía{' '}
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/codigo</code>
                          </>
                        ),
                      },
                      { step: 2, body: <>Copia el código de 6 caracteres que muestra el bot.</> },
                      {
                        step: 3,
                        body: <>Pégalo abajo y pulsa Validar para emparejar esta cuenta con ese Telegram.</>,
                      },
                    ].map(({ step, body }) => (
                      <div key={step} className="flex gap-3 text-sm text-muted-foreground">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">
                          {step}
                        </span>
                        <p className="pt-0.5 leading-relaxed">{body}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/15 p-4">
                    <Label htmlFor="telegram-pair-code" className="text-foreground">
                      Código de vinculación
                    </Label>
                    <Input
                      id="telegram-pair-code"
                      value={telegramCodeInput}
                      onChange={(e) => {
                        const v = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
                        setTelegramCodeInput(v);
                        setPairFeedback(null);
                      }}
                      placeholder="Ej: A3K9X2"
                      className="font-mono tracking-[0.2em] bg-background/80 backdrop-blur-sm max-w-xs border-primary/20"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <Button
                    type="button"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={telegramValidateLoading || telegramCodeInput.length !== 6}
                    onClick={async () => {
                      setPairFeedback(null);
                      setTelegramValidateLoading(true);
                      try {
                        const res = await api.post<{ ok: boolean; name: string }>('/telegram/pairing-validate', {
                          code: telegramCodeInput,
                        });
                        setTelegramCodeInput('');
                        await refreshMe();
                        setPairFeedback({
                          ok: true,
                          text: `Emparejamiento exitoso. Tu Telegram quedó vinculado con la cuenta de ${res.name}.`,
                        });
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : 'No se pudo validar el código.';
                        setPairFeedback({ ok: false, text: msg });
                      } finally {
                        setTelegramValidateLoading(false);
                      }
                    }}
                  >
                    {telegramValidateLoading ? 'Validando…' : 'Validar y emparejar'}
                  </Button>
                </div>
              )}
              {pairFeedback && (
                <div
                  className={`flex items-start gap-2 text-sm rounded-lg p-3 border ${
                    pairFeedback.ok
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                      : 'border-destructive/40 bg-destructive/10 text-destructive'
                  }`}
                >
                  {pairFeedback.ok ? (
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{pairFeedback.text}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {user.role === 'HOLDER' && (
          <Card className="gsap-card liquid-glass">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <CardTitle>Acceso Telegram (Holders/Cajeros)</CardTitle>
              </div>
              <CardDescription>
                Activa el permiso de vinculación solo para los usuarios (holder/cajero) que deben usar el bot (por ejemplo, los de cada
                rango de aprobación).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {holdersLoading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : holders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay otros holders listados.</p>
              ) : (
                <div className="space-y-3">
                  {holders.map((h) => (
                    <div
                      key={h.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-border/50 bg-muted/20"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{h.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{h.email}</p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              h.telegramId
                                ? 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'border border-border/60 bg-muted/40 text-muted-foreground'
                            }`}
                          >
                            {h.telegramId ? 'Telegram conectado' : 'Telegram sin vincular'}
                          </span>
                          {!h.isActive ? (
                            <span className="text-[11px] text-muted-foreground">· inactivo</span>
                          ) : null}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm shrink-0 cursor-pointer">
                        <span className="text-muted-foreground">Permitir vinculación</span>
                        <input
                          type="checkbox"
                          className="toggle"
                          checked={h.telegramPairingAllowed}
                          disabled={holderToggleId === h.id}
                          onChange={async (e) => {
                            const next = e.target.checked;
                            setHolderToggleId(h.id);
                            try {
                              await api.patch(`/users/telegram-access/${h.id}`, { telegramPairingAllowed: next });
                              setHolders((prev) => prev.map((x) => (x.id === h.id ? { ...x, telegramPairingAllowed: next } : x)));
                              if (h.id === user.id) {
                                await refreshMe();
                              }
                            } catch {
                              /* revert visual */
                              setHolders((prev) => [...prev]);
                            } finally {
                              setHolderToggleId(null);
                            }
                          }}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="gsap-card liquid-glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <CardTitle>Seguridad</CardTitle>
            </div>
            <CardDescription>
              Protege tu cuenta y gestiona tus contraseñas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="current-password">Contraseña actual</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="bg-background/50 backdrop-blur-sm"
                placeholder="••••••••"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-background/50 backdrop-blur-sm"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">Confirmar nueva contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-background/50 backdrop-blur-sm"
                placeholder="Repite la nueva contraseña"
              />
            </div>
            {pwdMsg && (
              <div className={`flex items-center gap-2 text-sm ${pwdMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                {pwdMsg.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {pwdMsg.text}
              </div>
            )}
            <Button
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10"
              disabled={pwdSaving || !currentPassword || !newPassword || !confirmPassword}
              onClick={async () => {
                if (newPassword !== confirmPassword) {
                  setPwdMsg({ text: 'Las contraseñas nuevas no coinciden.', ok: false });
                  return;
                }
                if (newPassword.length < 6) {
                  setPwdMsg({ text: 'La nueva contraseña debe tener al menos 6 caracteres.', ok: false });
                  return;
                }
                setPwdSaving(true);
                setPwdMsg(null);
                try {
                  await api.post('/auth/change-password', { currentPassword, newPassword });
                  setPwdMsg({ text: 'Contraseña actualizada correctamente.', ok: true });
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                } catch (err: any) {
                  const msg = err?.message || 'No se pudo actualizar la contraseña.';
                  setPwdMsg({ text: msg, ok: false });
                } finally {
                  setPwdSaving(false);
                }
              }}
            >
              {pwdSaving ? 'Actualizando...' : 'Actualizar Contraseña'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
