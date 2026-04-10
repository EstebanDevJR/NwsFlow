import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Lock } from 'lucide-react';
import gsap from 'gsap';
import { NwsPayFlowLogo } from '@/components/NwsPayFlowLogo';

function loginFailureMessage(err: unknown): string {
  if (err instanceof TypeError) {
    return 'No hay conexión con el servidor. Comprueba tu red o que la API esté disponible.';
  }
  const raw = err instanceof Error ? err.message : '';
  if (!raw) return 'No se pudo iniciar sesión. Intenta de nuevo.';
  const lower = raw.toLowerCase();
  if (lower.includes('invalid credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (lower.includes('validation')) {
    return 'Revisa el formato del correo y la contraseña.';
  }
  return raw;
}

export function Login() {
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cardRef.current) {
      gsap.fromTo(cardRef.current,
        { opacity: 0, y: 30, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'power3.out' }
      );
    }

  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await login(email, password);
      navigate('/');
    } catch (err: unknown) {
      setError(loginFailureMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden">
      <Card ref={cardRef} className="w-full max-w-md shadow-2xl relative z-10">
        <CardHeader className="space-y-3 text-center pb-8">
          <div className="mx-auto w-14 h-14 rounded-xl overflow-hidden mb-2 shadow-lg ring-1 ring-border/60">
            <NwsPayFlowLogo size={56} />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">Bienvenido a NWSPayFlow</CardTitle>
          <CardDescription>
            Plataforma de gestión de pagos y aprobaciones
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Email</label>
                <Input 
                  required
                  type="email"
                  placeholder="usuario@empresa.com" 
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  className="bg-background/50 backdrop-blur-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Contraseña</label>
                <Input 
                  required
                  type="password" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  className="bg-background/50 backdrop-blur-sm"
                />
              </div>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={loading}>
              <Lock className="w-4 h-4 mr-2" />
              {loading ? 'Iniciando...' : 'Iniciar Sesión'}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              El acceso lo gestionan los holders de tu organización.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
