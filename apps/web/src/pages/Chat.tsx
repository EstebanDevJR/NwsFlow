import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Plus, Send, Loader2, Trash2, FileDown } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface ChatUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
}

interface ConversationRow {
  id: string;
  updatedAt: string;
  otherUser: ChatUser | null;
  lastMessage: {
    id: string;
    body: string;
    createdAt: string;
    senderId: string;
    senderName: string;
  } | null;
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  sender: { id: string; name: string; avatar?: string | null };
}

function roleLabel(role: string) {
  switch (role) {
    case 'LIDER':
      return 'Líder';
    case 'HOLDER':
      return 'Holder';
    case 'CAJERO':
      return 'Cajero';
    default:
      return role;
  }
}

export function Chat() {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [contacts, setContacts] = useState<ChatUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [clearingChat, setClearingChat] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId);

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.get<ConversationRow[]>('/chat/conversations');
      setConversations(data);
    } catch {
      setConversations([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const data = await api.get<ChatUser[]>('/chat/contacts');
      setContacts(data);
    } catch {
      setContacts([]);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    void loadContacts();
  }, [loadConversations, loadContacts]);

  const loadMessages = useCallback(
    async (conversationId: string, before?: string) => {
      setLoadingMessages(!before);
      setError(null);
      try {
        const q = new URLSearchParams();
        if (before) q.set('before', before);
        const path = `/chat/conversations/${conversationId}/messages${q.toString() ? `?${q}` : ''}`;
        const res = await api.get<{ messages: ChatMessage[]; nextCursor: string | null }>(path);
        if (before) {
          setMessages((prev) => [...res.messages, ...prev]);
        } else {
          setMessages(res.messages);
        }
        setNextCursor(res.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudieron cargar los mensajes');
      } finally {
        setLoadingMessages(false);
      }
    },
    []
  );

  const markRead = useCallback(async (conversationId: string) => {
    try {
      await api.patch(`/chat/conversations/${conversationId}/read`, {});
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setNextCursor(null);
      return;
    }
    setMessages([]);
    setNextCursor(null);
    void loadMessages(selectedId);
    void markRead(selectedId);
  }, [selectedId, loadMessages, markRead]);

  useEffect(() => {
    if (!messages.length) return;
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedId]);

  useEffect(() => {
    const token = api.getToken();
    if (!token) return;

    const ac = new AbortController();
    let cancelled = false;

    const handleSseEvent = (eventName: string, rawData: string) => {
      if (eventName === 'chat_message') {
        try {
          const data = JSON.parse(rawData) as {
            conversationId: string;
            message: ChatMessage;
          };
          void loadConversations();
          if (data.conversationId === selectedId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === data.message.id)) return prev;
              return [...prev, data.message];
            });
            if (user && data.message.senderId !== user.id) {
              void markRead(data.conversationId);
            }
          }
        } catch {
          /* ignore */
        }
        return;
      }
      if (eventName === 'chat_cleared') {
        try {
          const data = JSON.parse(rawData) as { conversationId: string };
          void loadConversations();
          if (data.conversationId === selectedId) {
            setMessages([]);
            setNextCursor(null);
          }
        } catch {
          /* ignore */
        }
      }
    };

    const runStream = async () => {
      while (!cancelled) {
        try {
          const res = await fetch(`${API_BASE}/sse/events`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: ac.signal,
          });
          if (!res.ok || !res.body) {
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          const decoder = new TextDecoder();
          let buffer = '';
          let eventName = 'message';
          const reader = res.body.getReader();
          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf('\n\n')) !== -1) {
              const block = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              let dataLine = '';
              for (const line of block.split('\n')) {
                if (line.startsWith('event:')) eventName = line.slice(6).trim();
                else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
              }
              if (dataLine) handleSseEvent(eventName, dataLine);
              eventName = 'message';
            }
          }
        } catch {
          if (cancelled || ac.signal.aborted) break;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    };

    void runStream();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [loadConversations, markRead, selectedId, user]);

  const openOrCreate = async (other: ChatUser) => {
    setError(null);
    try {
      const conv = await api.post<{ id: string; otherUser: ChatUser }>('/chat/conversations', {
        otherUserId: other.id,
      });
      setNewChatOpen(false);
      setContactQuery('');
      await loadConversations();
      setSelectedId(conv.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la conversación');
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!selectedId || !text || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await api.post<ChatMessage>(`/chat/conversations/${selectedId}/messages`, { body: text });
      setDraft('');
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === selectedId);
        if (idx === -1) return prev;
        const row = prev[idx];
        const next = [...prev];
        next[idx] = {
          ...row,
          updatedAt: new Date().toISOString(),
          lastMessage: {
            id: msg.id,
            body: msg.body,
            createdAt:
              typeof msg.createdAt === 'string' ? msg.createdAt : new Date(msg.createdAt).toISOString(),
            senderId: msg.senderId,
            senderName: msg.sender.name,
          },
        };
        next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setSending(false);
    }
  };

  const clearChat = async () => {
    if (!selectedId) return;
    if (
      !confirm(
        '¿Eliminar todos los mensajes de esta conversación? La otra persona también dejará de verlos.'
      )
    ) {
      return;
    }
    setClearingChat(true);
    setError(null);
    try {
      await api.delete<{ ok: boolean }>(`/chat/conversations/${selectedId}/messages`);
      setMessages([]);
      setNextCursor(null);
      await loadConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo limpiar el chat');
    } finally {
      setClearingChat(false);
    }
  };

  const exportChatPdf = async () => {
    if (!selectedId || user?.role !== 'HOLDER') return;
    setExportingPdf(true);
    setError(null);
    try {
      await api.downloadBlob(`/chat/conversations/${selectedId}/export`, 'chat.pdf');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar el PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const filteredContacts = contacts.filter((c) => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MessageCircle className="h-7 w-7 text-primary" />
            Mensajes
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.role === 'HOLDER'
              ? 'Puedes escribir a líderes, holders y cajeros.'
              : 'Solo puedes conversar con holders.'}
          </p>
        </div>
        <Button type="button" onClick={() => setNewChatOpen(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Nueva conversación
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-[min(720px,calc(100vh-11rem))] min-h-[400px]">
        <Card className="lg:col-span-2 flex flex-col overflow-hidden py-0 gap-0">
          <CardHeader className="py-3 border-b border-border/60 shrink-0">
            <CardTitle className="text-base">Conversaciones</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {loadingList ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No hay conversaciones aún.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors hover:bg-muted/50',
                        selectedId === c.id && 'bg-primary/10'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium truncate">{c.otherUser?.name ?? 'Usuario'}</span>
                        {c.unreadCount > 0 && (
                          <span className="shrink-0 min-w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                            {c.unreadCount > 9 ? '9+' : c.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{c.otherUser && roleLabel(c.otherUser.role)}</p>
                      {c.lastMessage && (
                        <p className="text-sm text-muted-foreground truncate mt-1">{c.lastMessage.body}</p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 flex flex-col overflow-hidden py-0 gap-0">
          <CardHeader className="py-3 border-b border-border/60 shrink-0 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <CardTitle className="text-base truncate min-w-0">
                {selected?.otherUser ? (
                  <>
                    {selected.otherUser.name}
                    <span className="text-muted-foreground font-normal text-sm ml-2">
                      ({roleLabel(selected.otherUser.role)})
                    </span>
                  </>
                ) : (
                  'Selecciona una conversación'
                )}
              </CardTitle>
              {selectedId && (
                <div className="flex flex-wrap gap-2 shrink-0">
                  {user?.role === 'HOLDER' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={exportingPdf}
                      onClick={() => void exportChatPdf()}
                    >
                      {exportingPdf ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileDown className="h-4 w-4" />
                      )}
                      Exportar PDF
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                    disabled={clearingChat}
                    onClick={() => void clearChat()}
                  >
                    {clearingChat ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Limpiar chat
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 min-h-0">
            {!selectedId ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-6">
                Elige un chat o crea una nueva conversación.
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {nextCursor && (
                    <div className="flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loadingMessages}
                        onClick={() => {
                          const oldest = messages[0]?.id;
                          if (oldest) void loadMessages(selectedId, oldest);
                        }}
                      >
                        Cargar anteriores
                      </Button>
                    </div>
                  )}
                  {loadingMessages && messages.length === 0 ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    messages.map((m) => {
                      const mine = user?.id === m.senderId;
                      return (
                        <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                          <div
                            className={cn(
                              'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                              mine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'
                            )}
                          >
                            {!mine && <p className="text-xs font-medium opacity-80 mb-1">{m.sender.name}</p>}
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            <p
                              className={cn(
                                'text-[10px] mt-1 opacity-70',
                                mine ? 'text-primary-foreground/80' : 'text-muted-foreground'
                              )}
                            >
                              {format(new Date(m.createdAt), "d MMM, HH:mm", { locale: es })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={listEndRef} />
                </div>
                <div className="border-t border-border/60 p-3 flex gap-2 shrink-0">
                  <Input
                    placeholder="Escribe un mensaje…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button type="button" onClick={() => void send()} disabled={sending || !draft.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Nueva conversación</DialogTitle>
            <DialogDescription>
              {user?.role === 'HOLDER'
                ? 'Elige un usuario de la organización.'
                : 'Solo puedes iniciar chat con holders.'}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Buscar por nombre o correo…"
            value={contactQuery}
            onChange={(e) => setContactQuery(e.target.value)}
            className="mb-2"
          />
          <div className="overflow-y-auto flex-1 min-h-[200px] space-y-1 pr-1">
            {filteredContacts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void openOrCreate(c)}
                className="w-full text-left rounded-lg border border-border/60 px-3 py-2 hover:bg-muted/60 transition-colors"
              >
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.email} · {roleLabel(c.role)}
                </p>
              </button>
            ))}
            {filteredContacts.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No hay contactos que coincidan.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
