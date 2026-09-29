import { useEffect, useRef, useState } from 'react';
import { BarChart3, Bell, ChevronRight, Coins, CreditCard, FileText, HelpCircle, MessageSquare, RefreshCcw, Share, Shield, UserCog, Users } from 'lucide-react';
import { useUserCredits } from '@/hooks/useUserCredits';
import { signInWithGoogle, supabaseBrowser } from '@/lib/supabaseBrowser';
import { isAdminEmail } from '@/lib/authz';
import { cn } from '@/lib/utils';

export function SettingsView({ onClose, onOpenPricing, onOpenUpdates, initialOffice = false, pageMode = false, onToast }: { onClose: () => void; onOpenPricing?: () => void; onOpenUpdates?: () => void; initialOffice?: boolean; pageMode?: boolean; onToast?: (msg: string | { title?: string; message: string; tone?: 'error' | 'success' | 'warning' | 'info' }) => void }) {
  const notify = (msg: string | { title?: string; message: string; tone?: 'error' | 'success' | 'warning' | 'info' }) => {
    try {
      if (typeof onToast === 'function') onToast(msg);
      else if (typeof msg === 'string') window.alert(msg);
      else window.alert(`${msg.title ? `${msg.title}\n\n` : ''}${msg.message || ''}`);
    } catch {
      try {
        if (typeof msg === 'string') window.alert(msg);
        else window.alert(`${msg.title ? `${msg.title}\n\n` : ''}${msg.message || ''}`);
      } catch {}
    }
  };
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const { credits, creditsExpiresAt, planExpiresAt, refreshCredits } = useUserCredits();
  const [userName, setUserName] = useState('Usuario');
  const [userInitial, setUserInitial] = useState('U');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  const [isOfficeOpen, setIsOfficeOpen] = useState(initialOffice);
  const [officeTab, setOfficeTab] = useState<'resumen' | 'colaboradores'>('resumen');
  const [officeSaldoOpen, setOfficeSaldoOpen] = useState(false);
  const [officeMensajesOpen, setOfficeMensajesOpen] = useState(false);
  const [officeCreditosOpen, setOfficeCreditosOpen] = useState(false);
  const [officePlanesOpen, setOfficePlanesOpen] = useState(false);
  const [officeReporteOpen, setOfficeReporteOpen] = useState(false);
  const [officeVentasOpen, setOfficeVentasOpen] = useState(false);
  const [officeUsersActivityOpen, setOfficeUsersActivityOpen] = useState(false);
  const [officeUsersActivityTab, setOfficeUsersActivityTab] = useState<'active' | 'inactive'>('active');
  const [officeLoading, setOfficeLoading] = useState(false);
  const [officeError, setOfficeError] = useState('');
  const [officeData, setOfficeData] = useState<any>(null);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantCredits, setGrantCredits] = useState('50');
  const [grantPackage, setGrantPackage] = useState<string>('custom');
  const [grantBusy, setGrantBusy] = useState(false);
  const [takeEmail, setTakeEmail] = useState('');
  const [takeCredits, setTakeCredits] = useState('50');
  const [takeBusy, setTakeBusy] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackWhatsapp, setFeedbackWhatsapp] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [adminUnreadFeedback, setAdminUnreadFeedback] = useState(0);
  const [planEmail, setPlanEmail] = useState('');
  const [planSearchBusy, setPlanSearchBusy] = useState(false);
  const [planSearchError, setPlanSearchError] = useState('');
  const [planUserDetail, setPlanUserDetail] = useState<any>(null);
  const [planAssignables, setPlanAssignables] = useState<any>({ mini_packs: [], plans: [] });
  const [planAssignablesLoading, setPlanAssignablesLoading] = useState(false);
  const [planAssignPackageId, setPlanAssignPackageId] = useState('');
  const [planAssignBusy, setPlanAssignBusy] = useState(false);
  const [planAssignResult, setPlanAssignResult] = useState<any>(null);
  const [planOverrideBusy, setPlanOverrideBusy] = useState(false);
  const [planKey, setPlanKey] = useState<'ninguno' | 'inicio' | 'productor'>('inicio');
  const [planCreditsMode, setPlanCreditsMode] = useState<'none' | 'default' | 'set'>('none');
  const [planCreditsManual, setPlanCreditsManual] = useState('0');
  const [planBusy, setPlanBusy] = useState(false);
  const [officeMiniPacks, setOfficeMiniPacks] = useState<any[]>([]);
  const [officeMiniPackKey, setOfficeMiniPackKey] = useState('');
  const [officeMiniPackBusy, setOfficeMiniPackBusy] = useState(false);
  const [officeMiniPackError, setOfficeMiniPackError] = useState('');
  const [isUsersOpen, setIsUsersOpen] = useState(false);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [usersList, setUsersList] = useState<Array<{ id: string; email: string; created_at: string; full_name?: string; birthdate?: string }>>([]);
  const [usersTotal, setUsersTotal] = useState<number | null>(null);
  const [isUserDetailOpen, setIsUserDetailOpen] = useState(false);
  const [userDetailEmail, setUserDetailEmail] = useState('');
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [userDetailError, setUserDetailError] = useState('');
  const [userDetailData, setUserDetailData] = useState<any>(null);
  const [collaboratorSearch, setCollaboratorSearch] = useState('');
  const [collaboratorSearchLoading, setCollaboratorSearchLoading] = useState(false);
  const [collaboratorSearchError, setCollaboratorSearchError] = useState('');
  const [collaboratorSearchResults, setCollaboratorSearchResults] = useState<Array<{ id: string; email: string; full_name?: string; created_at?: string }>>([]);
  const [selectedCollaborator, setSelectedCollaborator] = useState<{ id: string; email: string; full_name?: string } | null>(null);
  const [collaboratorCommissionValue, setCollaboratorCommissionValue] = useState('50');
  const [collaboratorAssignBusy, setCollaboratorAssignBusy] = useState(false);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [collaboratorsError, setCollaboratorsError] = useState('');
  const [collaboratorsList, setCollaboratorsList] = useState<any[]>([]);
  const [collaboratorsPeriod, setCollaboratorsPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [collaboratorsReportLoading, setCollaboratorsReportLoading] = useState(false);
  const [collaboratorsReportError, setCollaboratorsReportError] = useState('');
  const [collaboratorsReport, setCollaboratorsReport] = useState<any[]>([]);
  const officeCreditosRef = useRef<HTMLDivElement | null>(null);
  const initialOfficeLoadedRef = useRef(false);

  const TELEGRAM_GROUP_URL = 'https://t.me/+sgw5bsAX9utmZDEx';
  const TELEGRAM_INVITE_HASH = 'sgw5bsAX9utmZDEx';
  const TELEGRAM_APP_URL = `tg://join?invite=${TELEGRAM_INVITE_HASH}`;

  // Paquetes predefinidos de créditos - SOLO Pack Inicio de $350 (PROMO)
  const creditPackages = [
    { id: 'custom', name: 'Personalizado', credits: 0, description: 'Ingresa cantidad manual' },
    { id: 'inicio', name: 'Pack Inicio', credits: 1200, description: '$350 MXN (PROMO) - 200 canciones' },
  ];

  const openExternalUrl = (url: string) => {
    const safe = (url || '').toString().trim();
    if (!safe) return;
    try {
      const w = window.open(safe, '_blank', 'noopener,noreferrer');
      if (w) {
        try {
          (w as any).opener = null;
        } catch {}
        return;
      }
    } catch {}
    try {
      const a = document.createElement('a');
      a.href = safe;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      try { document.body.appendChild(a); } catch {}
      a.click();
      try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
      return;
    } catch {}
    try {
      window.location.href = safe;
    } catch {}
  };

  const openTelegramGroup = () => {
    const tryOpen = (url: string) => {
      const safe = (url || '').toString().trim();
      if (!safe) return false;
      try {
        const a = document.createElement('a');
        a.href = safe;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        try { document.body.appendChild(a); } catch {}
        a.click();
        try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
        return true;
      } catch {
        return false;
      }
    };

    const opened = tryOpen(TELEGRAM_APP_URL);
    if (!opened) {
      openExternalUrl(TELEGRAM_GROUP_URL);
      return;
    }

    window.setTimeout(() => {
      if (document.hidden) return;
      openExternalUrl(TELEGRAM_GROUP_URL);
    }, 900);
  };

  const focusCreditos = (mode: 'grant' | 'take', email: string) => {
    const e = (email || '').toString().trim().toLowerCase();
    if (!e) return;
    setIsUserDetailOpen(false);
    setUserDetailEmail(e);
    setOfficeCreditosOpen(true);
    if (mode === 'grant') setGrantEmail(e);
    if (mode === 'take') setTakeEmail(e);
    window.setTimeout(() => {
      try {
        officeCreditosRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' } as any);
      } catch {
        try {
          officeCreditosRef.current?.scrollIntoView?.();
        } catch {
        }
      }
    }, 80);
  };

  useEffect(() => {
    if (!supabaseBrowser) return;
    supabaseBrowser.auth
      .getUser()
      .then(({ data }) => {
        const email = (data?.user?.email || '').toString().trim().toLowerCase();
        if (isAdminEmail(email)) setIsAdmin(true);
      })
      .catch(() => {});

    supabaseBrowser.auth
      .getSession()
      .then(async ({ data }) => {
        const token = data?.session?.access_token;
        if (!token) return;
        const r = await fetch('/api/account/balance', { headers: { authorization: `Bearer ${token}` } }).catch(() => null as any);
        if (!r?.ok) return;
        const out = await r.json().catch(() => ({}));
        setIsAdmin((prev) => prev || Boolean(out?.is_admin));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!supabaseBrowser) return;
    supabaseBrowser.auth
      .getUser()
      .then(({ data }) => {
        const user = data?.user;
        const email = (user?.email || '').toString().trim();
        if (isAdminEmail(email)) setIsAdmin(true);
        const meta: any = user?.user_metadata || {};
        const name = (meta?.full_name || meta?.name || '').toString().trim();
        const display = (name || email || 'Usuario').toString().trim();
        setUserName(display);
        setUserInitial(display.slice(0, 1).toUpperCase() || 'U');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!supabaseBrowser) return;
    if (!isAdmin) return;
    let alive = true;
    const load = async () => {
      try {
        const { data } = await supabaseBrowser.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return;
        const r = await fetch('/api/admin/feedback?mode=count', { headers: { authorization: `Bearer ${token}` } }).catch(() => null as any);
        if (!r?.ok) return;
        const out = await r.json().catch(() => ({}));
        if (!alive) return;
        setAdminUnreadFeedback(Number(out?.unread_count ?? 0) || 0);
      } catch {
      }
    };
    load().catch(() => {});
    const id = window.setInterval(() => load().catch(() => {}), 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [isAdmin]);

  // Actualizar créditos cuando se selecciona un paquete
  useEffect(() => {
    if (grantPackage === 'custom') {
      // Mantener el valor personalizado
      return;
    }
    
    const selectedPackage = creditPackages.find(pkg => pkg.id === grantPackage);
    if (selectedPackage && selectedPackage.credits > 0) {
      setGrantCredits(selectedPackage.credits.toString());
    }
  }, [grantPackage]);

  const signOut = async () => {
    if (!supabaseBrowser) return;
    setIsAuthBusy(true);
    try {
      await supabaseBrowser.auth.signOut().catch(() => {});
      await refreshCredits();
      alert('Sesión cerrada.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const openOffice = async () => {
    if (!supabaseBrowser) return;
    setIsOfficeOpen(true);
    setOfficeError('');
    setOfficeData(null);
    setOfficeLoading(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setOfficeError('No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/admin/stats', { headers: { authorization: `Bearer ${token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setOfficeError((out?.error || 'No pude cargar tu reporte.').toString());
        return;
      }

      let balance: any = null;
      try {
        const rb = await fetch('/api/account/balance', { headers: { authorization: `Bearer ${token}` } });
        const ob = await rb.json().catch(() => ({}));
        if (rb.ok) balance = ob;
        else balance = { error: ob?.error || 'No pude consultar saldo.' };
      } catch {
        balance = { error: 'No pude consultar saldo.' };
      }

      let diag: any = null;
      try {
        const rd = await fetch('/api/admin/diag', { headers: { authorization: `Bearer ${token}` } });
        const od = await rd.json().catch(() => ({}));
        if (rd.ok) diag = od;
        else diag = { error: od?.error || 'No pude diagnosticar.' };
      } catch {
        diag = { error: 'No pude diagnosticar.' };
      }

      let feedback: any = null;
      try {
        const rf = await fetch('/api/admin/feedback', { headers: { authorization: `Bearer ${token}` } });
        const of = await rf.json().catch(() => ({}));
        if (rf.ok) feedback = of;
        else feedback = { error: of?.error || 'No pude cargar mensajes.' };
      } catch {
        feedback = { error: 'No pude cargar mensajes.' };
      }

      const unread = Number(feedback?.unread_count ?? 0) || 0;
      setAdminUnreadFeedback(unread);
      setOfficeData({ ...out, balance, diag, feedback });
    } finally {
      setOfficeLoading(false);
    }
  };

  useEffect(() => {
    if (!initialOffice || !isAdmin || initialOfficeLoadedRef.current) return;
    initialOfficeLoadedRef.current = true;
    openOffice().catch(() => {});
  }, [initialOffice, isAdmin]);

  const loadCollaboratorsData = async (periodOverride?: 'day' | 'week' | 'month') => {
    if (!supabaseBrowser) return;
    const period = periodOverride || collaboratorsPeriod;
    setCollaboratorsLoading(true);
    setCollaboratorsReportLoading(true);
    setCollaboratorsError('');
    setCollaboratorsReportError('');
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setCollaboratorsError('No se pudo iniciar sesión.');
        setCollaboratorsReportError('No se pudo iniciar sesión.');
        return;
      }

      const [collaboratorsRes, reportRes] = await Promise.all([
        fetch('/api/admin/collaborators', { headers: { authorization: `Bearer ${token}` } }),
        fetch(`/api/admin/commissions-report?period=${encodeURIComponent(period)}`, { headers: { authorization: `Bearer ${token}` } }),
      ]);

      const collaboratorsOut = await collaboratorsRes.json().catch(() => ({}));
      const reportOut = await reportRes.json().catch(() => ({}));

      if (!collaboratorsRes.ok) {
        setCollaboratorsError((collaboratorsOut?.detail || collaboratorsOut?.error || 'No pude cargar colaboradores.').toString());
      } else {
        setCollaboratorsList(Array.isArray(collaboratorsOut?.items) ? collaboratorsOut.items : []);
      }

      if (!reportRes.ok) {
        setCollaboratorsReportError((reportOut?.detail || reportOut?.error || 'No pude cargar el reporte de comisiones.').toString());
      } else {
        setCollaboratorsReport(Array.isArray(reportOut?.items) ? reportOut.items : []);
      }
    } finally {
      setCollaboratorsLoading(false);
      setCollaboratorsReportLoading(false);
    }
  };

  const searchCollaboratorByEmail = async () => {
    if (!supabaseBrowser) return;
    const search = collaboratorSearch.trim().toLowerCase();
    if (!search) {
      setCollaboratorSearchError('Escribe un correo para buscar.');
      setCollaboratorSearchResults([]);
      return;
    }
    setCollaboratorSearchLoading(true);
    setCollaboratorSearchError('');
    setCollaboratorSearchResults([]);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setCollaboratorSearchError('No se pudo iniciar sesión.');
        return;
      }
      const url = `/api/admin/users?limit=20&mode=real&search=${encodeURIComponent(search)}`;
      const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setCollaboratorSearchError((out?.detail || out?.error || 'No pude buscar ese correo.').toString());
        return;
      }
      const items = Array.isArray(out?.items) ? out.items : [];
      const mapped = items
        .map((x: any) => ({
          id: String(x?.id || ''),
          email: String(x?.email || '').trim().toLowerCase(),
          full_name: String(x?.full_name || '').trim(),
          created_at: String(x?.created_at || '').trim(),
        }))
        .filter((x: any) => x.email);
      setCollaboratorSearchResults(mapped);
      if (mapped.length === 0) setCollaboratorSearchError('No encontré usuarios con ese correo.');
    } finally {
      setCollaboratorSearchLoading(false);
    }
  };

  const saveCollaborator = async () => {
    if (!supabaseBrowser) return;
    const email = String(selectedCollaborator?.email || '').trim().toLowerCase();
    const commission = Number((collaboratorCommissionValue || '').toString().trim().replaceAll(',', '.'));
    if (!email) {
      alert('Primero selecciona un usuario.');
      return;
    }
    if (!Number.isFinite(commission) || commission < 0) {
      alert('Pon una comisión válida en pesos.');
      return;
    }
    setCollaboratorAssignBusy(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        alert('No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/admin/collaborators/assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, role: 'empleado', commission_value: commission }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (out?.error || out?.detail || 'No pude guardar el colaborador.').toString();
        const id = (out?.error_id || '').toString();
        alert([msg, id ? `(Error ${id})` : ''].filter(Boolean).join(' '));
        return;
      }
      alert('Listo. Colaborador guardado.');
      await loadCollaboratorsData();
    } finally {
      setCollaboratorAssignBusy(false);
    }
  };

  useEffect(() => {
    if (!isAdmin || !isOfficeOpen || officeTab !== 'colaboradores') return;
    loadCollaboratorsData().catch(() => {});
  }, [isAdmin, isOfficeOpen, officeTab, collaboratorsPeriod]);

  const grant = async () => {
    if (!supabaseBrowser) return;
    const email = (grantEmail || '').toString().trim().toLowerCase();
    const n = Number((grantCredits || '').toString().trim().replaceAll(',', '.'));
    if (!email) {
      alert('Pon el correo del usuario.');
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      alert('Pon una cantidad válida de créditos.');
      return;
    }
    setGrantBusy(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        alert('No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/admin/grant-credits', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, credits: n }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (out?.error || 'No pude enviar créditos.').toString();
        const detail = (out?.detail || '').toString();
        const id = (out?.error_id || '').toString();
        const idBlock = id ? `(Error ${id})` : '';
        alert([msg, detail, idBlock].filter(Boolean).join('\n'));
        return;
      }
      alert(`Listo. Se enviaron ${n} créditos a ${email}.`);
      openOffice().catch(() => {});
    } finally {
      setGrantBusy(false);
    }
  };

  const takeBack = async () => {
    if (!supabaseBrowser) return;
    const email = (takeEmail || '').toString().trim().toLowerCase();
    const n = Number((takeCredits || '').toString().trim().replaceAll(',', '.'));
    if (!email) {
      alert('Pon el correo del usuario.');
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      alert('Pon una cantidad válida de créditos.');
      return;
    }
    setTakeBusy(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        alert('No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/admin/transfer-credits', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, credits: n }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (out?.error || 'No pude quitar créditos.').toString();
        const detail = (out?.detail || '').toString();
        const id = (out?.error_id || '').toString();
        const idBlock = id ? `(Error ${id})` : '';
        alert([msg, detail, idBlock].filter(Boolean).join('\n'));
        return;
      }
      const fb = Number(out?.from_credits_before ?? NaN);
      const fa = Number(out?.from_credits_after ?? NaN);
      const tb = Number(out?.to_credits_before ?? NaN);
      const ta = Number(out?.to_credits_after ?? NaN);
      const lines = [
        `Listo.`,
        Number.isFinite(fb) && Number.isFinite(fa) ? `Usuario (${email}): ${fb} → ${fa} créditos` : `Usuario (${email}): actualizado`,
        Number.isFinite(tb) && Number.isFinite(ta) ? `Tu saldo interno (banco): ${tb} → ${ta} créditos` : `Tu saldo interno (banco): actualizado`,
        `Nota: tu saldo REAL (plataforma/Suno) no cambia con esto.`,
      ];
      alert(lines.join('\n'));
      await refreshCredits().catch(() => {});
      openOffice().catch(() => {});
    } finally {
      setTakeBusy(false);
    }
  };

  const submitFeedback = async () => {
    if (!supabaseBrowser) return;
    const name = feedbackName.trim();
    const whatsapp = feedbackWhatsapp.trim();
    const text = feedbackText.trim();
    if (!name) {
      alert('Pon tu nombre.');
      return;
    }
    if (!whatsapp) {
      alert('Pon tu WhatsApp.');
      return;
    }
    if (!text) {
      alert('Escribe tu mensaje.');
      return;
    }
    setFeedbackBusy(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        alert('No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/support/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, whatsapp, message: text }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert((out?.error || 'No pude enviar tu mensaje.').toString());
        return;
      }
      alert('Listo. Recibimos tu mensaje.');
      setIsFeedbackOpen(false);
      setFeedbackText('');
    } finally {
      setFeedbackBusy(false);
    }
  };

  const fmtDate = (raw: any): string => {
    if (!raw) return '—';
    const d = new Date(raw);
    const n = d.getTime();
    if (!Number.isFinite(n)) return String(raw);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const officePlanesFetchUserDetail = async (email: string): Promise<boolean> => {
    if (!supabaseBrowser) return false;
    const e = (email || '').toString().trim().toLowerCase();
    if (!e) return false;
    setPlanSearchError('');
    setPlanSearchBusy(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setPlanSearchError('Sesión expirada. Cierra sesión y vuelve a entrar.');
        return false;
      }
      const r = await fetch(`/api/admin/user-detail?email=${encodeURIComponent(e)}`, { headers: { authorization: `Bearer ${token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPlanSearchError((out?.error || 'No pude buscar el usuario').toString());
        setPlanUserDetail(null);
        return false;
      }
      setPlanUserDetail(out || null);
      setPlanAssignResult(null);
      // cargar assignables
      try {
        setPlanAssignablesLoading(true);
        const r2 = await fetch(`/api/admin/assignable-packages?email=${encodeURIComponent(e)}`, { headers: { authorization: `Bearer ${token}` } });
        const out2 = await r2.json().catch(() => ({}));
        if (r2.ok) {
          setPlanAssignables({
            mini_packs: Array.isArray(out2?.mini_packs) ? out2.mini_packs : [],
            plans: Array.isArray(out2?.plans) ? out2.plans : [],
          });
          const firstMini = (out2?.mini_packs || [])[0];
          const firstPlan = (out2?.plans || [])[0];
          setPlanAssignPackageId(firstMini?.id || firstPlan?.id || '');
        }
      } catch {
      } finally {
        setPlanAssignablesLoading(false);
      }
      return true;
    } finally {
      setPlanSearchBusy(false);
    }
  };

  const searchPlanUser = async () => {
    await officePlanesFetchUserDetail(planEmail);
  };

  const assignPlanPackage = async () => {
    if (!supabaseBrowser) return;
    const email = planEmail.trim().toLowerCase();
    if (!email) {
      notify({ title: 'Falta el correo', message: 'Primero busca un usuario por correo.', tone: 'warning' });
      return;
    }
    if (!planAssignPackageId) {
      notify({ title: 'Selecciona un paquete', message: 'Elige un paquete en el selector “Asignar paquete”.', tone: 'warning' });
      return;
    }
    setPlanAssignBusy(true);
    setPlanAssignResult(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        notify({ title: 'Sesión expirada', message: 'Cierra sesión y vuelve a entrar con tu cuenta de administrador.', tone: 'error' });
        return;
      }
      const r = await fetch('/api/admin/assign-package', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, package_id: planAssignPackageId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        notify({
          title: 'No se pudo asignar el paquete',
          message: (out?.error || 'Error desconocido').toString() + (out?.detail ? `\n\nDetalle: ${out.detail}` : ''),
          tone: 'error',
        });
        return;
      }
      setPlanAssignResult(out || null);
      notify({
        title: 'Paquete asignado',
        message: `Se asignó correctamente. Saldo nuevo real: ${Number(out?.credits_after_real ?? 0).toFixed(2)} créditos.`,
        tone: 'success',
      });
      // Actualizar detalle
      await officePlanesFetchUserDetail(email);
    } finally {
      setPlanAssignBusy(false);
    }
  };

  const toggleVoiceCloneOverride = async (action: 'enable' | 'disable') => {
    if (!supabaseBrowser) return;
    const email = planEmail.trim().toLowerCase();
    if (!email) return;
    setPlanOverrideBusy(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      const r = await fetch('/api/admin/voice-clone-override', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, action }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        notify({
          title: action === 'enable' ? 'No se pudo desbloquear' : 'No se pudo quitar el desbloqueo',
          message: (out?.error || 'Error desconocido').toString(),
          tone: 'error',
        });
        return;
      }
      notify({
        title: action === 'enable' ? 'Clonador desbloqueado' : 'Desbloqueo revocado',
        message: action === 'enable' ? 'El usuario ya puede crear voces sin límite.' : 'Se quitó el desbloqueo manual. Ahora el usuario requiere Pack Inicio vigente para crear voces.',
        tone: 'success',
      });
      await officePlanesFetchUserDetail(email);
    } finally {
      setPlanOverrideBusy(false);
    }
  };

  const markFeedbackRead = async (id: string) => {
    if (!supabaseBrowser) return;
    const clean = (id || '').toString().trim();
    if (!clean) return;
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      await fetch('/api/admin/feedback-mark-read', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: clean }),
      }).catch(() => null as any);
      openOffice().catch(() => {});
    } catch {
    }
  };

  const loadUsers = async (search: string) => {
    if (!supabaseBrowser) return;
    setUsersLoading(true);
    setUsersError('');
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setUsersError('No se pudo iniciar sesión.');
        return;
      }
      const url = `/api/admin/users?limit=200&mode=real&search=${encodeURIComponent((search || '').toString())}`;
      const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      const text = await r.text().catch(() => '');
      let out: any = {};
      try {
        out = text ? JSON.parse(text) : {};
      } catch {
        out = {};
      }
      if (!r.ok) {
        const msg = (out?.error || '').toString().trim() || `No pude cargar usuarios (HTTP ${r.status}).`;
        const detail = (out?.detail || '').toString().trim();
        const raw = !out?.error && !out?.detail ? text.slice(0, 200).trim() : '';
        setUsersError([msg, detail, raw].filter(Boolean).join('\n'));
        return;
      }
      const items = Array.isArray(out?.items) ? out.items : [];
      if (typeof out?.total_filtered === 'number') setUsersTotal(out.total_filtered);
      else if (typeof out?.total_non_admin === 'number') setUsersTotal(out.total_non_admin);
      else setUsersTotal(typeof out?.total === 'number' ? out.total : null);
      setUsersList(
        items
          .map((x: any) => ({
            id: String(x?.id || ''),
            email: String(x?.email || ''),
            created_at: String(x?.created_at || ''),
            full_name: String(x?.full_name || ''),
            birthdate: String(x?.birthdate || ''),
          }))
          .filter((x: any) => x.email)
      );
    } finally {
      setUsersLoading(false);
    }
  };

  const openUserDetail = async (email: string) => {
    if (!supabaseBrowser) return;
    const e = (email || '').toString().trim().toLowerCase();
    if (!e) return;
    setIsUserDetailOpen(true);
    setUserDetailEmail(e);
    setUserDetailLoading(true);
    setUserDetailError('');
    setUserDetailData(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setUserDetailError('No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch(`/api/admin/user-detail?email=${encodeURIComponent(e)}`, { headers: { authorization: `Bearer ${token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setUserDetailError((out?.detail || out?.error || 'No pude cargar el usuario.').toString());
        return;
      }
      setUserDetailData(out);
    } finally {
      setUserDetailLoading(false);
    }
  };

  const deleteUser = async (email: string) => {
    if (!supabaseBrowser) return;
    const e = (email || '').toString().trim().toLowerCase();
    if (!e) return;
    const ok = window.confirm(`¿Borrar el usuario?\n\n${e}\n\nEsto elimina su cuenta y datos (biblioteca, transacciones, perfil).`);
    if (!ok) return;
    const ok2 = window.confirm(`CONFIRMACIÓN FINAL:\n\n¿Seguro que quieres ELIMINAR definitivamente a:\n${e}\n\nEsta acción NO se puede deshacer.`);
    if (!ok2) return;
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        alert('No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: e }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert((out?.detail || out?.error || 'No pude borrar el usuario.').toString());
        return;
      }
      alert('Listo. Usuario borrado.');
      setIsUserDetailOpen(false);
      setUserDetailData(null);
      loadUsers(usersSearch).catch(() => {});
      openOffice().catch(() => {});
    } catch {
      alert('No pude borrar el usuario.');
    }
  };

  if (isOfficeOpen) {
    const users = officeData?.users || {};
    const userActivity = officeData?.user_activity || {};
    const activeUsers = Array.isArray(userActivity?.active) ? userActivity.active : [];
    const inactiveUsers = Array.isArray(userActivity?.inactive) ? userActivity.inactive : [];
    const visibleUsers = officeUsersActivityTab === 'active' ? activeUsers : inactiveUsers;
    const payments = officeData?.payments || {};
    const daily = Array.isArray(payments?.daily_7d) ? payments.daily_7d : [];
    const balance = officeData?.balance || {};
    const maxDailySales = Math.max(1, ...daily.map((item: any) => Number(item?.mxn ?? item?.amount ?? item?.total ?? 0) || 0));
    const diag = officeData?.diag || {};
    const feedback = officeData?.feedback || {};
    const feedbackItems = Array.isArray(feedback?.items) ? feedback.items : [];
    const totalUsersNoAdmin = Number(users?.total ?? 0) || 0;
    const active30dNoAdmin = Number(users?.active30d ?? 0) || 0;
    const new7dNoAdmin = Number(users?.new7d ?? 0) || 0;
    const totalUsersReal = Number(users?.real_total ?? 0) || 0;
    const active30dReal = Number(users?.real_active30d ?? 0) || 0;
    const new7dReal = Number(users?.real_new7d ?? 0) || 0;
    const employeeCollaborators = collaboratorsList.filter((item: any) => String(item?.role || '').trim().toLowerCase() === 'empleado');
    const collaboratorReportMap = new Map(
      collaboratorsReport.map((item: any) => [String(item?.seller_user_id || '').trim(), item])
    );
    const productLabels: Record<string, string> = {
      cancion_generada: 'Canción Generada',
      karaoke_audio: 'Karaoke Audio',
      karaoke_video: 'Karaoke Video',
    };
    const fmtOfficeDate = (iso: string) => {
      const clean = (iso || '').toString().trim();
      if (!clean) return '—';
      try {
        const d = new Date(clean);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch {
        return '—';
      }
    };

    return (
      <div className={cn('flex flex-col overflow-y-auto animate-in slide-in-from-right-8 duration-300 bg-gradient-to-b from-[#0b1224] via-[#070a12] to-black/95 backdrop-blur-3xl', pageMode ? 'relative flex-1 min-h-0 z-0' : 'fixed inset-0 z-[100] pb-safe')}>
        <div className="flex items-center gap-4 px-5 py-4 sticky top-0 bg-gradient-to-r from-[#070a12]/95 via-indigo-950/45 to-[#070a12]/95 z-10 backdrop-blur-xl border-b border-white/10">
          {!pageMode ? (
            <button onClick={() => setIsOfficeOpen(false)} className="p-2 text-slate-300 hover:text-white glass-card rounded-full">
              <ChevronRight className="w-6 h-6 rotate-180" />
            </button>
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300"><Shield className="h-5 w-5" /></span>
          )}
          <div><div className="text-white font-extrabold">Oficina</div><div className="text-[10px] text-slate-400">Panel de administración</div></div>
          {pageMode ? <button type="button" onClick={() => openOffice().catch(() => {})} disabled={officeLoading} className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-[11px] font-bold text-slate-200 hover:bg-white/10 disabled:opacity-50"><RefreshCcw className={cn('h-4 w-4', officeLoading && 'animate-spin')} />Actualizar</button> : null}
        </div>

        <div className={cn('p-5 lg:p-6 space-y-5 mx-auto w-full', pageMode ? 'max-w-[1500px]' : 'max-w-3xl')}>
          {officeError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-sm text-red-200">
              {officeError}
            </div>
          )}

          <div className={cn('grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-2', pageMode && 'hidden')}>
            <button
              onClick={() => setOfficeTab('resumen')}
              className={cn(
                'rounded-2xl px-4 py-3 text-sm font-extrabold transition-colors',
                officeTab === 'resumen' ? 'bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              )}
            >
              Resumen
            </button>
            <button
              onClick={() => setOfficeTab('colaboradores')}
              className={cn(
                'rounded-2xl px-4 py-3 text-sm font-extrabold transition-colors',
                officeTab === 'colaboradores' ? 'bg-emerald-500 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              )}
            >
              Colaboradores
            </button>
          </div>

          {officeTab === 'resumen' ? (
            <>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Usuarios', value: totalUsersReal, detail: `Activos: ${active30dReal} · Nuevos: ${new7dReal}`, image: '/assets/tool-clone-voice.png', tone: 'border-emerald-400/25 text-emerald-300', icon: Users },
              { label: 'Ventas hoy', value: `$${Number(payments?.today?.mxn ?? 0).toFixed(0)}`, detail: `${Number(payments?.today?.count ?? 0)} pagos`, image: '/assets/tool-mastering.png', tone: 'border-cyan-400/25 text-cyan-300', icon: CreditCard },
              { label: 'Ventas del mes', value: `$${Number(payments?.month?.mxn ?? 0).toFixed(0)}`, detail: `${Number(payments?.month?.count ?? 0)} pagos`, image: '/assets/tool-create-music.png', tone: 'border-fuchsia-400/25 text-fuchsia-300', icon: BarChart3 },
              { label: 'Saldo plataforma externa (Suno)', value: balance?.provider_credits == null ? '—' : Number(balance.provider_credits).toLocaleString('es-MX'), detail: 'Créditos disponibles', image: '/assets/tool-wav-audio.png', tone: 'border-amber-400/25 text-amber-300', icon: Coins },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className={cn('relative min-h-[138px] overflow-hidden rounded-2xl border bg-[#0b1020]', card.tone)}>
                  <img src={card.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#070a12] via-[#070a12]/90 to-[#070a12]/35" />
                  <div className="relative flex h-full flex-col justify-between p-4">
                    <div className="flex items-center justify-between gap-3"><div className="text-[11px] font-extrabold uppercase tracking-[0.12em]">{card.label}</div><Icon className="h-5 w-5 opacity-90" /></div>
                    <div><div className="mt-4 text-3xl font-black text-white">{card.value}</div><div className="mt-1 text-[11px] font-medium text-slate-300">{card.detail}</div></div>
                  </div>
                </div>
              );
            })}
          </div>

          {pageMode ? (
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.15fr_1.15fr]">
              <section className="rounded-3xl border border-white/10 bg-[#090e1a]/95 p-5 shadow-2xl shadow-black/30">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-cyan-300">Actividad reciente</div>
                    <div className="mt-1 text-[10px] text-slate-500">Movimientos más recientes</div>
                  </div>
                  <Bell className="h-5 w-5 text-slate-600" />
                </div>
                <div className="space-y-2">
                  {(activeUsers.length ? activeUsers.slice(0, 3) : [
                    { full_name: 'Sin actividad reciente', email: 'Los movimientos aparecerán aquí' },
                  ]).map((item: any, index: number) => (
                    <button key={item?.id || item?.email || index} type="button" onClick={() => activeUsers.length && item?.email && openUserDetail(String(item.email))} className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.025] p-3 text-left hover:bg-white/[0.06]">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', activeUsers.length ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.85)]' : 'bg-slate-600')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-slate-100">{String(item?.full_name || item?.email || 'Usuario')}</span>
                        <span className="mt-0.5 block truncate text-[9px] text-slate-500">{activeUsers.length ? (item?.last_sign_in_at ? fmtOfficeDate(String(item.last_sign_in_at)) : String(item?.email || 'Actividad registrada')) : String(item?.email || '')}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-700" />
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setOfficeUsersActivityOpen(true)} className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-[10px] font-bold text-slate-200 hover:bg-white/10">Ver toda la actividad</button>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#090e1a]/95 p-5 shadow-2xl shadow-black/30">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-300">Ventas por día</div>
                    <div className="mt-1 text-[10px] text-slate-500">Últimos 7 días</div>
                  </div>
                  <BarChart3 className="h-5 w-5 text-violet-400" />
                </div>
                <div className="relative flex h-36 items-end gap-2 overflow-hidden rounded-2xl border border-white/5 bg-black/20 px-3 pb-3 pt-5">
                  <div className="pointer-events-none absolute inset-x-3 top-1/3 border-t border-dashed border-white/[0.07]" />
                  <div className="pointer-events-none absolute inset-x-3 top-2/3 border-t border-dashed border-white/[0.07]" />
                  {(daily.length ? daily.slice(-7) : Array.from({ length: 7 }, (_, index) => ({ label: `${index + 1}`, mxn: 0 }))).map((item: any, index: number) => {
                    const amount = Number(item?.mxn ?? item?.amount ?? item?.total ?? 0) || 0;
                    const height = amount > 0 ? Math.max(14, Math.round((amount / maxDailySales) * 100)) : 6;
                    return (
                      <div key={item?.date || item?.day || index} className="group z-[1] flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                        <div className="relative w-full flex-1"><div className="absolute bottom-0 w-full rounded-t-md bg-gradient-to-t from-violet-700 via-violet-500 to-fuchsia-400 shadow-[0_0_14px_rgba(168,85,247,.3)] transition-all group-hover:brightness-125" style={{ height: `${height}%` }} title={`$${amount.toFixed(0)}`} /></div>
                        <span className="max-w-full truncate text-[8px] text-slate-500">{String(item?.label || item?.day || item?.date || index + 1).slice(-5)}</span>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={() => setOfficeReporteOpen(true)} className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-[10px] font-bold text-slate-200 hover:bg-white/10">Ver reporte completo</button>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#090e1a]/95 p-5 shadow-2xl shadow-black/30">
                <div className="mb-4 text-xs font-extrabold uppercase tracking-[0.12em] text-blue-300">Accesos rápidos</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { label: 'Créditos de usuarios', detail: 'Enviar o quitar créditos', icon: Coins, action: () => setOfficeCreditosOpen(true), color: 'text-blue-300' },
                    { label: 'Planes', detail: 'Cambiar planes y créditos', icon: CreditCard, action: () => setOfficePlanesOpen(true), color: 'text-emerald-300' },
                    { label: 'Usuarios', detail: 'Buscar y administrar', icon: Users, action: () => setOfficeUsersActivityOpen(true), color: 'text-cyan-300' },
                    { label: 'Ventas y reportes', detail: 'Ver reportes y estadísticas', icon: BarChart3, action: () => setOfficeReporteOpen(true), color: 'text-rose-300' },
                    { label: 'Mensajes', detail: 'Mensajes del sistema', icon: MessageSquare, action: () => setOfficeMensajesOpen(true), color: 'text-fuchsia-300' },
                    { label: 'Colaboradores', detail: 'Gestionar colaboradores', icon: UserCog, action: () => setOfficeTab('colaboradores'), color: 'text-orange-300' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.label} type="button" onClick={item.action} className="group flex min-h-[68px] items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 text-left hover:border-violet-400/25 hover:bg-white/[0.06]">
                        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5', item.color)}><Icon className="h-[18px] w-[18px]" /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold text-white">{item.label}</span><span className="mt-1 block truncate text-[8px] text-slate-500">{item.detail}</span></span>
                        <ChevronRight className="h-4 w-4 text-slate-700 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : null}

          <div className="bg-gradient-to-r from-emerald-500/10 via-white/5 to-transparent border border-emerald-400/15 rounded-3xl p-5">
            <button onClick={() => setOfficeUsersActivityOpen((v) => !v)} className="w-full flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-white font-extrabold">Usuarios activos e inactivos</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Activos: {activeUsers.length} • Inactivos: {inactiveUsers.length}
                </div>
              </div>
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full px-4 py-2 text-xs font-extrabold text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 hover:opacity-90 transition-opacity border border-white/10">
                {officeUsersActivityOpen ? 'Ocultar' : 'Ver'}
              </div>
            </button>

            {officeUsersActivityOpen ? (
              <div className="mt-4">
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
                  <button
                    onClick={() => setOfficeUsersActivityTab('active')}
                    className={cn(
                      'rounded-2xl px-4 py-3 text-sm font-extrabold transition-colors',
                      officeUsersActivityTab === 'active' ? 'bg-emerald-500 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    )}
                  >
                    Activos
                  </button>
                  <button
                    onClick={() => setOfficeUsersActivityTab('inactive')}
                    className={cn(
                      'rounded-2xl px-4 py-3 text-sm font-extrabold transition-colors',
                      officeUsersActivityTab === 'inactive' ? 'bg-violet-500 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    )}
                  >
                    Inactivos
                  </button>
                </div>

                <div className="mt-3 text-[11px] text-slate-400">
                  {officeUsersActivityTab === 'active'
                    ? 'Ordenados del que más canciones lleva este mes al que menos.'
                    : 'Usuarios sin plan activo en este momento.'}
                </div>

                <div className="mt-3 max-h-[360px] overflow-y-auto rounded-2xl border border-white/10">
                  <div className="grid grid-cols-1 divide-y divide-white/5">
                    {visibleUsers.length === 0 ? (
                      <div className="p-4 text-sm text-slate-400">
                        {officeUsersActivityTab === 'active' ? 'No hay usuarios con plan activo ahora mismo.' : 'No hay usuarios inactivos ahora mismo.'}
                      </div>
                    ) : (
                      visibleUsers.map((u: any, idx: number) => {
                        const email = String(u?.email || '').trim();
                        const fullName = String(u?.full_name || '').trim();
                        const songsThisMonth = Number(u?.songs_this_month ?? 0) || 0;
                        const planKey = String(u?.plan_key || 'ninguno').trim();
                        const expiresAt = String(u?.plan_expires_at || '').trim();
                        const lastSignIn = String(u?.last_sign_in_at || '').trim();
                        return (
                          <button
                            key={u?.id || email || idx}
                            type="button"
                            onClick={() => {
                              if (email) openUserDetail(email);
                            }}
                            className="p-4 w-full text-left hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-white font-extrabold truncate">
                                  {officeUsersActivityTab === 'active' ? `${idx + 1}. ` : ''}
                                  {email || '—'}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {fullName || 'Sin nombre'} • Plan: {planKey || 'ninguno'}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {officeUsersActivityTab === 'active'
                                    ? `Vence: ${fmtOfficeDate(expiresAt)}`
                                    : `Último acceso: ${fmtOfficeDate(lastSignIn)}`}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className={cn('text-lg font-extrabold', officeUsersActivityTab === 'active' ? 'text-emerald-300' : 'text-violet-300')}>
                                  {songsThisMonth}
                                </div>
                                <div className="text-[11px] text-slate-400">canciones este mes</div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="bg-gradient-to-r from-emerald-500/10 via-white/5 to-transparent border border-emerald-400/15 rounded-3xl p-5">
            <button
              onClick={() => {
                setIsUsersOpen((v) => {
                  const next = !v;
                  if (!v && usersList.length === 0 && !usersLoading) loadUsers(usersSearch).catch(() => {});
                  return next;
                });
              }}
              className="w-full flex items-center justify-between"
            >
              <div>
                <div className="text-white font-extrabold">Correos de usuarios</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Registros (reales, sin pruebas): {usersTotal != null ? usersTotal : totalUsersReal}
                </div>
              </div>
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full px-4 py-2 text-xs font-extrabold text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 hover:opacity-90 transition-opacity border border-white/10">
                {isUsersOpen ? 'Ocultar' : 'Ver'}
              </div>
            </button>

            {isUsersOpen ? (
              <div className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-3 flex items-center gap-2">
                    <button
                      onClick={() => {
                        loadUsers(usersSearch).catch(() => {});
                      }}
                      className={cn(
                        'h-[40px] px-4 rounded-full border text-xs font-extrabold transition-colors',
                        'bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 border-white'
                      )}
                      disabled={usersLoading}
                    >
                      Solo reales
                    </button>
                  </div>
                  <input
                    value={usersSearch}
                    onChange={(e) => setUsersSearch(e.target.value)}
                    placeholder="Buscar correo…"
                    className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 md:col-span-2"
                  />
                  <button
                    onClick={() => loadUsers(usersSearch).catch(() => {})}
                    disabled={usersLoading}
                    className="bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60"
                  >
                    {usersLoading ? 'Buscando…' : 'Buscar'}
                  </button>
                </div>

                {usersError ? (
                  <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">{usersError}</div>
                ) : null}

                <div className="mt-3 text-[11px] text-slate-400">
                  Mostrando: {usersList.length} correos
                  {usersTotal != null ? ` (Total: ${usersTotal})` : ''}
                </div>

                <div className="mt-3 max-h-[320px] overflow-y-auto rounded-2xl border border-white/10">
                  <div className="grid grid-cols-1 divide-y divide-white/5">
                    {usersList.length === 0 ? (
                      <div className="p-4 text-sm text-slate-400">{usersLoading ? 'Cargando…' : 'No encontré usuarios con esa búsqueda.'}</div>
                    ) : (
                      usersList.map((u) => {
                        let dateLabel = '';
                        try {
                          const d = new Date(u.created_at);
                          if (!Number.isNaN(d.getTime())) dateLabel = d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
                        } catch {
                          dateLabel = '';
                        }
                        const nm = (u.full_name || '').toString().trim();
                        const bd = (u.birthdate || '').toString().trim();
                        return (
                          <button
                            key={u.id || u.email}
                            type="button"
                            onClick={() => openUserDetail(u.email)}
                            className="p-4 w-full flex items-center justify-between gap-3 hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="min-w-0">
                              <div className="text-slate-100 font-semibold truncate">{u.email}</div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {nm ? nm : '—'}
                                {bd ? ` • Nac: ${bd}` : ''}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">{dateLabel ? `Registro: ${dateLabel}` : '—'}</div>
                            </div>
                            <div className="text-[11px] text-emerald-200 shrink-0">Ver</div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="bg-gradient-to-r from-violet-500/10 via-white/5 to-transparent border border-violet-400/15 rounded-3xl p-5">
            <button onClick={() => setOfficeReporteOpen((v) => !v)} className="w-full flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-white font-extrabold">Reporte</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Hoy: ${Number(payments?.today?.mxn ?? 0).toFixed(0)} • Mes: ${Number(payments?.month?.mxn ?? 0).toFixed(0)}
                </div>
              </div>
              <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full px-4 py-2 text-xs font-extrabold text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 hover:opacity-90 transition-opacity border border-white/10">
                {officeReporteOpen ? 'Ocultar' : 'Ver'}
              </div>
            </button>

            {officeReporteOpen ? (
              <>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                    <div className="text-xs text-slate-300 font-semibold">Semana</div>
                    <div className="text-xl text-white font-extrabold mt-1">${Number(payments?.week?.mxn ?? 0).toFixed(0)}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{Number(payments?.week?.count ?? 0)} pagos</div>
                  </div>
                  <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                    <div className="text-xs text-slate-300 font-semibold">Mes</div>
                    <div className="text-xl text-white font-extrabold mt-1">${Number(payments?.month?.mxn ?? 0).toFixed(0)}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{Number(payments?.month?.count ?? 0)} pagos</div>
                  </div>
                  <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                    <div className="text-xs text-slate-300 font-semibold">Total</div>
                    <div className="text-xl text-white font-extrabold mt-1">${Number(payments?.all?.mxn ?? 0).toFixed(0)}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{Number(payments?.all?.count ?? 0)} pagos</div>
                  </div>
                </div>
                <button
                  onClick={() => openOffice().catch(() => {})}
                  disabled={officeLoading}
                  className="mt-4 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60"
                >
                  {officeLoading ? 'Actualizando…' : 'Actualizar'}
                </button>
              </>
            ) : null}
          </div>

          <div className="bg-gradient-to-r from-cyan-500/10 via-white/5 to-transparent border border-cyan-400/15 rounded-3xl p-5">
            <button onClick={() => setOfficeVentasOpen((v) => !v)} className="w-full flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-white font-extrabold">Ventas por día</div>
                <div className="text-[11px] text-slate-400 mt-1">Últimos 7 días</div>
              </div>
              <div className="bg-gradient-to-r from-cyan-400 to-indigo-400 rounded-full px-4 py-2 text-xs font-extrabold text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 hover:opacity-90 transition-opacity border border-white/10">
                {officeVentasOpen ? 'Ocultar' : 'Ver'}
              </div>
            </button>

            {officeVentasOpen ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
                <div className="grid grid-cols-3 bg-black/30 px-4 py-2 text-[11px] text-slate-300 font-semibold">
                  <div>Día</div>
                  <div className="text-center">Pagos</div>
                  <div className="text-right">MXN</div>
                </div>
                <div className="divide-y divide-white/5">
                  {(daily.length ? daily : new Array(7).fill(null)).map((row: any, idx: number) => {
                    const day = (row?.day || '').toString();
                    const count = Number(row?.count ?? 0);
                    const mxn = Number(row?.mxn ?? 0);
                    const bg =
                      idx % 3 === 0
                        ? 'from-emerald-500/10'
                        : idx % 3 === 1
                          ? 'from-cyan-500/10'
                          : 'from-violet-500/10';
                    return (
                      <div key={day || idx} className={`grid grid-cols-3 px-4 py-3 text-sm bg-gradient-to-r ${bg} to-transparent`}>
                        <div className="text-slate-200 font-semibold">{day || '—'}</div>
                        <div className="text-center text-slate-300">{Number.isFinite(count) ? count : 0}</div>
                        <div className="text-right text-white font-extrabold">${Number.isFinite(mxn) ? mxn.toFixed(0) : '0'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="bg-gradient-to-r from-yellow-500/10 via-white/5 to-transparent border border-yellow-400/15 rounded-3xl p-5">
            <button onClick={() => setOfficeSaldoOpen((v) => !v)} className="w-full flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-white font-extrabold">Saldo</div>
                <div className="text-[11px] text-slate-400 mt-1 truncate">
                  Plataforma externa (Suno): {balance?.provider_credits == null ? '—' : Number(balance?.provider_credits ?? 0).toString()}
                </div>
              </div>
              <div className="bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full px-4 py-2 text-xs font-extrabold text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 hover:opacity-90 transition-opacity border border-white/10">
                {officeSaldoOpen ? 'Ocultar' : 'Ver'}
              </div>
            </button>

            {officeSaldoOpen ? (
              <>
                <div className="mt-3 text-[11px] text-slate-400">{(balance?.source || '').toString() || '—'}</div>
                {balance?.error ? (
                  <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">
                    {(balance?.error || 'No pude consultar saldo.').toString()}
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                      <div className="text-xs text-slate-300 font-semibold">Plataforma externa (Suno)</div>
                      <div className="text-xl text-white font-extrabold mt-1">{balance?.provider_credits == null ? '—' : Number(balance?.provider_credits ?? 0).toString()}</div>
                    </div>
                    <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                      <div className="text-xs text-slate-300 font-semibold">Créditos mostrados</div>
                      <div className="text-xl text-white font-extrabold mt-1">{Number(balance?.credits ?? 0).toString()}</div>
                    </div>
                  </div>
                )}
                {balance?.provider_error ? (
                  <div className="mt-3 text-[11px] text-slate-400">
                    Estado externo: {(balance?.provider_error || '').toString()}
                  </div>
                ) : null}
                {diag?.error ? (
                  <div className="mt-3 text-[11px] text-slate-400">
                    Diagnóstico: {(diag?.error || '').toString()}
                  </div>
                ) : diag?.provider || diag?.env ? (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                      <div className="text-xs text-slate-300 font-semibold">Variables (Vercel)</div>
                      <div className="mt-2 space-y-1 text-[11px] text-slate-300">
                        <div>SUPABASE_URL: {diag?.env?.has_supabase_url ? 'OK' : 'FALTA'}</div>
                        <div>SUPABASE_ANON_KEY: {diag?.env?.has_supabase_anon ? 'OK' : 'FALTA'}</div>
                        <div>SUPABASE_SERVICE_ROLE_KEY: {diag?.env?.has_supabase_service ? 'OK' : 'FALTA'}</div>
                        <div>Servicio Suno (URL): {diag?.env?.has_suno_base ? 'OK' : 'FALTA'}</div>
                        <div>Servicio Suno (clave): {diag?.env?.has_suno_key ? 'OK' : 'FALTA'}</div>
                      </div>
                    </div>
                    <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                      <div className="text-xs text-slate-300 font-semibold">Prueba plataforma externa</div>
                      <div className="mt-2 text-[11px] text-slate-300">
                        <div>HTTP: {Number(diag?.provider?.status ?? 0).toString() || '—'}</div>
                        <div>code: {diag?.provider?.code == null ? '—' : Number(diag?.provider?.code ?? 0).toString()}</div>
                        <div>credits: {diag?.provider?.credits == null ? '—' : Number(diag?.provider?.credits ?? 0).toString()}</div>
                      </div>
                      {diag?.provider?.error ? (
                        <div className="mt-2 text-[11px] text-red-200">{String(diag?.provider?.error || '').slice(0, 200)}</div>
                      ) : diag?.provider?.text ? (
                        <div className="mt-2 text-[11px] text-slate-400 break-words">{String(diag?.provider?.text || '').slice(0, 240)}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="bg-gradient-to-r from-emerald-500/10 via-white/5 to-transparent border border-emerald-400/15 rounded-3xl p-5">
            <button onClick={() => setOfficeMensajesOpen((v) => !v)} className="w-full flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-white font-extrabold">Mensajes</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {Number(feedback?.unread_count ?? 0) ? `${Number(feedback?.unread_count ?? 0)} sin leer` : '—'}
                </div>
              </div>
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full px-4 py-2 text-xs font-extrabold text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 hover:opacity-90 transition-opacity border border-white/10">
                {officeMensajesOpen ? 'Ocultar' : 'Ver'}
              </div>
            </button>

            {officeMensajesOpen ? (
              feedback?.error ? (
                <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">
                  {(feedback?.error || 'No pude cargar mensajes.').toString()}
                </div>
              ) : feedbackItems.length === 0 ? (
                <div className="mt-3 text-sm text-slate-400">Aún no hay mensajes.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {feedbackItems.slice(0, 30).map((m: any) => {
                    const id = String(m?.id || '');
                    const name = String(m?.name || 'Usuario');
                    const whatsapp = String(m?.whatsapp || '');
                    const msg = String(m?.message || '');
                    const isRead = Boolean(m?.is_read);
                    const createdAt = String(m?.created_at || '');
                    let dateLabel = createdAt;
                    try {
                      const d = new Date(createdAt);
                      if (!Number.isNaN(d.getTime())) dateLabel = d.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                    } catch {
                    }
                    return (
                      <div key={id} className={cn('bg-black/20 border border-white/10 rounded-2xl p-4', !isRead ? 'ring-1 ring-emerald-500/30' : '')}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-white font-extrabold truncate">{name}</div>
                            <div className="text-[11px] text-slate-400 truncate">{whatsapp ? `WhatsApp: ${whatsapp}` : '—'}</div>
                          </div>
                          <div className="text-[11px] text-slate-400 shrink-0">{dateLabel}</div>
                        </div>
                        <div className="mt-3 text-sm text-slate-200 whitespace-pre-wrap break-words">{msg}</div>
                        {!isRead && id ? (
                          <button
                            onClick={() => markFeedbackRead(id)}
                            className="mt-3 bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 rounded-full px-4 py-2 text-xs font-extrabold transition-colors"
                          >
                            Marcar como leído
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )
            ) : null}
          </div>

          <div ref={officeCreditosRef} className="bg-gradient-to-r from-rose-500/10 via-white/5 to-transparent border border-rose-400/15 rounded-3xl p-5">
            <button onClick={() => setOfficeCreditosOpen((v) => !v)} className="w-full flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-white font-extrabold">Créditos de usuarios</div>
                <div className="text-[11px] text-slate-400 mt-1">Enviar / quitar créditos a usuarios</div>
              </div>
              <div className="bg-gradient-to-r from-rose-400 to-fuchsia-400 rounded-full px-4 py-2 text-xs font-extrabold text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 hover:opacity-90 transition-opacity border border-white/10">
                {officeCreditosOpen ? 'Ocultar' : 'Ver'}
              </div>
            </button>

            {officeCreditosOpen ? (
              <>
                <div className="mt-4 text-white font-extrabold">Enviar créditos</div>
                
                <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    value={grantEmail}
                    onChange={(e) => setGrantEmail(e.target.value)}
                    placeholder="correo@gmail.com"
                    className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 md:col-span-2"
                  />
                  <select
                    value={grantPackage}
                    onChange={(e) => setGrantPackage(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                  >
                    {creditPackages.map(pkg => (
                      <option key={pkg.id} value={pkg.id} className="bg-[#0b0f16] text-slate-200">
                        {pkg.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={grantCredits}
                    onChange={(e) => setGrantCredits(e.target.value)}
                    placeholder="Créditos"
                    className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                  />
                </div>
                
                <div className="mt-3 flex justify-between items-center">
                  <div className="text-[11px] text-slate-400">
                    {grantPackage === 'custom' 
                      ? 'Ingresa la cantidad de créditos manualmente' 
                      : `Paquete seleccionado: ${creditPackages.find(p => p.id === grantPackage)?.description || ''}`}
                  </div>
                  <button
                    onClick={() => grant().catch(() => {})}
                    disabled={grantBusy}
                    className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 rounded-2xl px-6 py-3 font-extrabold text-sm disabled:opacity-60"
                  >
                    {grantBusy ? 'Enviando…' : 'Enviar créditos'}
                  </button>
                </div>
                
                <div className="mt-3 text-[11px] text-slate-400">Se suma al saldo interno del usuario.</div>

                <div className="mt-6 text-white font-extrabold">Quitar créditos (regresármelos)</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    value={takeEmail}
                    onChange={(e) => setTakeEmail(e.target.value)}
                    placeholder="correo@gmail.com"
                    className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                  />
                  <input
                    value={takeCredits}
                    onChange={(e) => setTakeCredits(e.target.value)}
                    placeholder="Créditos"
                    className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                  />
                  <button
                    onClick={() => takeBack().catch(() => {})}
                    disabled={takeBusy}
                    className="bg-red-500 hover:bg-red-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60"
                  >
                    {takeBusy ? 'Quitando…' : 'Quitar'}
                  </button>
                </div>
                <div className="mt-3 text-[11px] text-slate-400">Se descuenta del usuario.</div>
              </>
            ) : null}
          </div>

          <div className="bg-gradient-to-r from-indigo-500/10 via-white/5 to-transparent border border-indigo-400/15 rounded-3xl p-5">
            <button onClick={() => setOfficePlanesOpen((v) => !v)} className="w-full flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-white font-extrabold">Planes / Créditos / Clonador</div>
                <div className="text-[11px] text-slate-400 mt-1">Buscar usuario, asignar paquetes y gestionar el clonador</div>
              </div>
              <div className="bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full px-4 py-2 text-xs font-extrabold text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 hover:opacity-90 transition-opacity border border-white/10">
                {officePlanesOpen ? 'Ocultar' : 'Ver'}
              </div>
            </button>

            {officePlanesOpen ? (
              <>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    value={planEmail}
                    onChange={(e) => setPlanEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void searchPlanUser();
                    }}
                    placeholder="correo@ejemplo.com"
                    className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 md:col-span-3"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => searchPlanUser().catch(() => {})}
                      disabled={planSearchBusy}
                      className="bg-indigo-500 hover:bg-indigo-400 text-white rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)]"
                    >
                      {planSearchBusy ? '…' : 'Buscar'}
                    </button>
                    <button
                      onClick={() => planEmail ? officePlanesFetchUserDetail(planEmail).catch(() => {}) : null}
                      disabled={planSearchBusy || !planEmail}
                      className="bg-white/5 hover:bg-white/10 text-slate-200 rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60 border border-white/10"
                      title="Volver a consultar datos desde Supabase/backend"
                    >
                      Actualizar
                    </button>
                  </div>
                </div>
                {planSearchError ? (
                  <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">{planSearchError}</div>
                ) : null}

                {planUserDetail ? (
                  <>
                    {/* Tarjeta resumen */}
                    <div className="mt-4 rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-extrabold">Correo</div>
                          <div className="text-white font-extrabold mt-2 break-words">
                            {String(planUserDetail?.user?.profile?.email ?? planEmail)}
                          </div>
                        </div>
                        <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-extrabold">Plan actual</div>
                          <div className="mt-2">
                            <div className="text-white font-extrabold">
                              {String(planUserDetail?.plan?.plan_key ?? 'ninguno')}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1">
                              {planUserDetail?.plan?.plan_active ? (
                                <>🟢 Activo hasta {fmtDate(planUserDetail?.plan?.plan_expires_at)}</>
                              ) : planUserDetail?.plan?.plan_expires_at ? (
                                <>🔴 Vence: {fmtDate(planUserDetail?.plan?.plan_expires_at)}</>
                              ) : (
                                <>—</>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-extrabold">Créditos disponibles (REAL)</div>
                          <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                            <div className="text-white font-extrabold text-xl">
                              {Number(planUserDetail?.credits?.total ?? 0).toFixed(2)}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              perfil {Number(planUserDetail?.credits?.profile_credits ?? 0).toFixed(0)} + lotes {Number(planUserDetail?.credits?.batch_credits ?? 0).toFixed(0)}
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">Vence: {fmtDate(planUserDetail?.credits?.credits_expires_at)}</div>
                        </div>
                        <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-extrabold">Estado clonador de voz</div>
                          <div className="mt-2">
                            {planUserDetail?.voice_access?.ok ? (
                              <>
                                {planUserDetail?.voice_access?.reason === 'grandfather' ? (
                                  <div className="text-emerald-300 font-extrabold">🟢 Acceso permanente — Cliente anterior</div>
                                ) : planUserDetail?.voice_access?.reason === 'override_admin' ? (
                                  <div className="text-emerald-300 font-extrabold">🟢 Desbloqueado manualmente (admin)</div>
                                ) : planUserDetail?.voice_access?.reason === 'inicio_active' || planUserDetail?.voice_access?.reason === 'inicio_admin_active' ? (
                                  <div className="text-emerald-300 font-extrabold">
                                    🟢 Acceso por Pack Inicio — vence {fmtDate(planUserDetail?.voice_access?.expiresAt)}
                                  </div>
                                ) : (
                                  <div className="text-emerald-300 font-extrabold">🟢 Acceso habilitado</div>
                                )}
                              </>
                            ) : (
                              <div className="text-red-300 font-extrabold">🔴 Sin acceso al clonador</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Última asignación administrativa */}
                      {planUserDetail?.last_admin_grant ? (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-extrabold">Última asignación administrativa</div>
                          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <div className="text-[11px] text-slate-400">Grant kind</div>
                              <div className="text-white font-extrabold">{String(planUserDetail.last_admin_grant.grant_kind || '')}</div>
                            </div>
                            <div>
                              <div className="text-[11px] text-slate-400">Créditos otorgados</div>
                              <div className="text-white font-extrabold">{Number(planUserDetail.last_admin_grant.credits_granted ?? 0).toFixed(0)}</div>
                            </div>
                            <div>
                              <div className="text-[11px] text-slate-400">Fecha</div>
                              <div className="text-white font-extrabold">{fmtDate(planUserDetail.last_admin_grant.granted_at)}</div>
                            </div>
                            <div>
                              <div className="text-[11px] text-slate-400">Estado</div>
                              <div className="text-white font-extrabold">
                                {planUserDetail.last_admin_grant.revoked_at
                                  ? `Revocado ${fmtDate(planUserDetail.last_admin_grant.revoked_at)}`
                                  : planUserDetail.last_admin_grant.expires_at
                                    ? `Vence ${fmtDate(planUserDetail.last_admin_grant.expires_at)}`
                                    : 'Activo'}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Asignar paquete */}
                    <div className="mt-4 rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/5 to-transparent p-5">
                      <div className="text-white font-extrabold">Asignar paquete</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Información desde las fuentes canónicas del backend (PACKS + CANONICAL_CREDIT_PACKS).
                      </div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          {planAssignablesLoading ? (
                            <div className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-slate-400">Cargando paquetes…</div>
                          ) : (
                            <select
                              value={planAssignPackageId}
                              onChange={(e) => setPlanAssignPackageId(e.target.value)}
                              style={{ colorScheme: 'dark' }}
                              className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                            >
                              {(() => {
                                const mini = (planAssignables?.mini_packs || []).map((p: any) => (
                                  <optgroup key="mini" label="MINI PACKS">
                                    {(planAssignables?.mini_packs || []).map((mp: any) => (
                                      <option key={mp.id} value={mp.id} className="bg-[#0b0f16] text-slate-200">
                                        📦 MINI {mp.label} — ${Number(mp.price_mxn ?? 0).toFixed(0)} — {Number(mp.songs ?? 0)} canciones — {Number(mp.credits_nominal ?? 0)} créditos
                                      </option>
                                    ))}
                                  </optgroup>
                                )) as any;
                                const plans = (planAssignables?.plans || []).map((p: any) => (
                                  <option key={p.id} value={p.id} className="bg-[#0b0f16] text-slate-200">
                                    {p.kind === 'service' ? '⭐ SERVICIO' : '💎 PLAN'} {p.label} — ${Number(p.price_mxn ?? 0).toFixed(0)}{p.songs ? ` — ${Number(p.songs)} canciones` : ''}{p.credits_nominal ? ` — ${Number(p.credits_nominal)} créditos` : ''}
                                  </option>
                                ));
                                return [plans].flat();
                              })()}
                            </select>
                          )}
                        </div>
                        <button
                          onClick={() => assignPlanPackage().catch(() => {})}
                          disabled={planAssignBusy || !planAssignPackageId || planAssignablesLoading}
                          className="bg-emerald-500 hover:bg-emerald-400 text-gray-900 rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)]"
                        >
                          {planAssignBusy ? 'Asignando…' : 'Asignar paquete'}
                        </button>
                      </div>

                      {/* Preview del paquete seleccionado */}
                      {(() => {
                        const mp = (planAssignables?.mini_packs || []).find((p: any) => p.id === planAssignPackageId);
                        const pl = (planAssignables?.plans || []).find((p: any) => p.id === planAssignPackageId);
                        const pkg = mp || pl;
                        if (!pkg) return null;
                        return (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div>
                                <div className="text-white font-extrabold text-lg">
                                  {pkg.kind === 'service' ? 'Servicio ·' : pkg.kind === 'mini_pack' ? 'Mini pack ·' : 'Plan ·'} {pkg.label}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-1">{pkg.notes || ''}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-slate-400 text-[11px]">Precio</div>
                                <div className="text-white font-extrabold text-xl">${Number(pkg.price_mxn ?? 0).toFixed(0)}</div>
                              </div>
                            </div>
                            <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                              <div className="bg-black/30 border border-white/10 rounded-2xl p-3">
                                <div className="text-[11px] text-slate-400">Canciones</div>
                                <div className="text-white font-extrabold text-lg">{Number(pkg.songs ?? 0)}</div>
                              </div>
                              <div className="bg-black/30 border border-white/10 rounded-2xl p-3">
                                <div className="text-[11px] text-slate-400">Créditos nominales</div>
                                <div className="text-white font-extrabold text-lg">{Number(pkg.credits_nominal ?? 0).toFixed(0)}</div>
                              </div>
                              <div className="bg-black/30 border border-white/10 rounded-2xl p-3">
                                <div className="text-[11px] text-slate-400">Créditos REALMENTE agregados</div>
                                <div className="text-emerald-300 font-extrabold text-lg">
                                  +{Number(pkg.credits_actual_add ?? 0).toFixed(2)}
                                  {Number(pkg.credits_actual_add ?? 0) < Number(pkg.credits_nominal ?? 0) ? (
                                    <div className="text-[10px] text-amber-300 mt-1">CAP {Number(pkg.current_cap ?? 0)} aplicado</div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="bg-black/30 border border-white/10 rounded-2xl p-3">
                                <div className="text-[11px] text-slate-400">Saldo actual</div>
                                <div className="text-white font-extrabold text-lg">{Number(pkg.current_credits_total ?? 0).toFixed(2)}</div>
                              </div>
                              <div className="bg-black/30 border border-white/10 rounded-2xl p-3">
                                <div className="text-[11px] text-slate-400">Saldo después (estimado)</div>
                                <div className="text-emerald-300 font-extrabold text-lg">{Number(pkg.credits_after_estimated ?? 0).toFixed(2)}</div>
                              </div>
                            </div>
                            {(pkg.validity_days_credits || pkg.validity_days_plan) ? (
                              <div className="mt-3 text-[11px] text-slate-400 flex items-center gap-3 flex-wrap">
                                {pkg.validity_days_plan ? <span>📅 Plan activo: {Number(pkg.validity_days_plan)} días</span> : null}
                                {pkg.validity_days_credits ? <span>⏳ Créditos: {Number(pkg.validity_days_credits)} días</span> : null}
                                {pkg.batch_expires_days ? <span>📦 Expiración del lote: {Number(pkg.batch_expires_days)} días</span> : null}
                                {pkg.voice_access ? <span className="text-emerald-300 font-extrabold">🎤 Incluye acceso clonador de voz (30 días)</span> : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      {/* Resultado después de asignar */}
                      {planAssignResult ? (
                        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="text-emerald-300 font-extrabold">✅ Resultado de la asignación (desde backend)</div>
                            <button
                              onClick={() => planEmail ? officePlanesFetchUserDetail(planEmail).catch(() => {}) : null}
                              className="bg-white/5 hover:bg-white/10 text-slate-200 rounded-2xl px-4 py-2 font-extrabold text-xs border border-white/10"
                            >
                              [ Actualizar ]
                            </button>
                          </div>
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                            <div className="bg-black/20 border border-white/10 rounded-2xl p-3">
                              <div className="text-[11px] text-slate-400">Saldo ANTERIOR</div>
                              <div className="text-white font-extrabold text-lg">{Number(planAssignResult.credits_before ?? 0).toFixed(2)}</div>
                            </div>
                            <div className="bg-black/20 border border-white/10 rounded-2xl p-3">
                              <div className="text-[11px] text-slate-400">Créditos agregados (real)</div>
                              <div className="text-emerald-300 font-extrabold text-lg">+{Number(planAssignResult.credits_added_real ?? 0).toFixed(2)}</div>
                              <div className="text-[10px] text-slate-500 mt-1">nominal: {Number(planAssignResult.credits_granted_nominal ?? 0).toFixed(0)}</div>
                            </div>
                            <div className="bg-black/20 border border-white/10 rounded-2xl p-3">
                              <div className="text-[11px] text-slate-400">CAP aplicado</div>
                              <div className="text-white font-extrabold text-lg">{Number(planAssignResult.cap_applied ?? 0).toFixed(0)}</div>
                            </div>
                            <div className="bg-black/20 border border-white/10 rounded-2xl p-3">
                              <div className="text-[11px] text-slate-400">Saldo NUEVO (REAL)</div>
                              <div className="text-emerald-300 font-extrabold text-lg">{Number(planAssignResult.credits_after_real ?? 0).toFixed(2)}</div>
                              <div className="text-[10px] text-slate-500 mt-1">Vence: {fmtDate(planAssignResult.credits_expires_at_new)}</div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Override manual del clonador */}
                    <div className="mt-4 rounded-3xl border border-white/10 bg-gradient-to-br from-amber-500/5 to-transparent p-5">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-white font-extrabold">🎤 Acceso manual al Clonador</div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            Desbloqueo administrativo separado del paquete $350 y de clientes anteriores. No modifica <code className="bg-black/30 px-1 rounded">voice_clone_grandfathered</code>.
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-black/20 border border-white/10 rounded-2xl p-4 md:col-span-1">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-extrabold">Estado actual (desde backend)</div>
                          <div className="mt-2">
                            {planUserDetail?.voice_access?.ok ? (
                              <>
                                {planUserDetail?.voice_access?.reason === 'grandfather' ? (
                                  <div className="text-emerald-300 font-extrabold">🟢 Acceso permanente — Cliente anterior</div>
                                ) : planUserDetail?.voice_access?.reason === 'override_admin' ? (
                                  <div className="text-emerald-300 font-extrabold">🟢 Desbloqueado manualmente</div>
                                ) : planUserDetail?.voice_access?.reason === 'inicio_active' || planUserDetail?.voice_access?.reason === 'inicio_admin_active' ? (
                                  <div className="text-emerald-300 font-extrabold">
                                    🟢 Pack Inicio vigente hasta {fmtDate(planUserDetail?.voice_access?.expiresAt)}
                                  </div>
                                ) : (
                                  <div className="text-emerald-300 font-extrabold">🟢 Acceso habilitado</div>
                                )}
                              </>
                            ) : (
                              <div className="text-red-300 font-extrabold">🔴 Sin acceso al clonador</div>
                            )}
                          </div>
                        </div>
                        <div className="bg-black/20 border border-white/10 rounded-2xl p-4 md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            onClick={() => toggleVoiceCloneOverride('enable').catch(() => {})}
                            disabled={planOverrideBusy || planUserDetail?.voice_access?.reason === 'grandfather'}
                            title={planUserDetail?.voice_access?.reason === 'grandfather' ? 'Cliente anterior ya tiene acceso permanente' : 'Desbloquear clonador de manera ilimitada (sin fecha)'}
                            className="bg-emerald-500 hover:bg-emerald-400 text-gray-900 rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] disabled:grayscale"
                          >
                            {planOverrideBusy ? '…' : 'DESBLOQUEAR CLONADOR'}
                          </button>
                          <button
                            onClick={() => toggleVoiceCloneOverride('disable').catch(() => {})}
                            disabled={planOverrideBusy || planUserDetail?.voice_access?.reason === 'grandfather' || planUserDetail?.voice_access?.reason !== 'override_admin'}
                            title={planUserDetail?.voice_access?.reason === 'grandfather' ? 'No puedes quitar acceso permanente de cliente anterior desde aquí' : planUserDetail?.voice_access?.reason !== 'override_admin' ? 'No hay un desbloqueo manual activo' : 'Revocar el desbloqueo manual actual (no borra historial)'}
                            className="bg-red-500 hover:bg-red-400 text-gray-900 rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] disabled:grayscale"
                          >
                            {planOverrideBusy ? '…' : 'QUITAR DESBLOQUEO'}
                          </button>
                        </div>
                      </div>
                      {planUserDetail?.voice_access?.reason === 'grandfather' ? (
                        <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-xs text-amber-200">
                          ℹ️ Este usuario es un cliente anterior (<code>voice_clone_grandfathered = TRUE</code>). Su acceso es permanente y no debe ser modificado desde esta herramienta.
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  !planSearchBusy && !planSearchError ? (
                    <div className="mt-4 text-sm text-slate-400">Introduce un correo y haz clic en Buscar.</div>
                  ) : null
                )}
              </>
            ) : null}
          </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-emerald-500/10 via-white/5 to-transparent border border-emerald-400/15 rounded-3xl p-5">
                <div className="text-white font-extrabold">Buscar por correo</div>
                <div className="text-[11px] text-slate-400 mt-1">Busca al usuario y asígnalo como empleado.</div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    value={collaboratorSearch}
                    onChange={(e) => setCollaboratorSearch(e.target.value)}
                    placeholder="correo@gmail.com"
                    className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 md:col-span-3"
                  />
                  <button
                    onClick={() => searchCollaboratorByEmail().catch(() => {})}
                    disabled={collaboratorSearchLoading}
                    className="bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60"
                  >
                    {collaboratorSearchLoading ? 'Buscando…' : 'Buscar'}
                  </button>
                </div>

                {collaboratorSearchError ? (
                  <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">{collaboratorSearchError}</div>
                ) : null}

                {collaboratorSearchResults.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-white/10 overflow-hidden">
                    <div className="divide-y divide-white/5">
                      {collaboratorSearchResults.map((item) => {
                        const isSelected = selectedCollaborator?.email === item.email;
                        return (
                          <button
                            key={item.id || item.email}
                            type="button"
                            onClick={() => {
                              setSelectedCollaborator({ id: item.id, email: item.email, full_name: item.full_name });
                              const existing = employeeCollaborators.find((x: any) => String(x?.email || '').trim().toLowerCase() === item.email);
                              setCollaboratorCommissionValue(String(Number(existing?.commission_value ?? 50) || 50));
                            }}
                            className={cn('w-full p-4 text-left transition-colors', isSelected ? 'bg-emerald-500/15' : 'hover:bg-white/5')}
                          >
                            <div className="text-white font-extrabold truncate">{item.email}</div>
                            <div className="text-[11px] text-slate-400 truncate">{item.full_name || 'Sin nombre'}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="bg-gradient-to-r from-indigo-500/10 via-white/5 to-transparent border border-indigo-400/15 rounded-3xl p-5">
                <div className="text-white font-extrabold">Asignación</div>
                <div className="text-[11px] text-slate-400 mt-1">Solo se asigna el role empleado en esta fase.</div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 md:col-span-2">
                    <div className="text-[11px] text-slate-400 font-semibold">Usuario seleccionado</div>
                    <div className="text-white font-extrabold mt-1 break-words">{selectedCollaborator?.email || 'Selecciona un correo arriba'}</div>
                    <div className="text-[11px] text-slate-500 mt-1">{selectedCollaborator?.full_name || '—'}</div>
                  </div>
                  <div className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3">
                    <div className="text-[11px] text-slate-400 font-semibold">Role</div>
                    <div className="text-white font-extrabold mt-1">empleado</div>
                  </div>
                  <input
                    value={collaboratorCommissionValue}
                    onChange={(e) => setCollaboratorCommissionValue(e.target.value)}
                    placeholder="50"
                    className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                  />
                  <div className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 md:col-span-2 text-sm text-slate-300">
                    El backend forzará countdown obligatorio y ocultará cualquier dato de pago manual.
                  </div>
                </div>

                <button
                  onClick={() => saveCollaborator().catch(() => {})}
                  disabled={collaboratorAssignBusy || !selectedCollaborator}
                  className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60"
                >
                  {collaboratorAssignBusy ? 'Guardando…' : 'Guardar'}
                </button>
              </div>

              <div className="bg-gradient-to-r from-cyan-500/10 via-white/5 to-transparent border border-cyan-400/15 rounded-3xl p-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-white font-extrabold">Colaboradores activos</div>
                    <div className="text-[11px] text-slate-400 mt-1">Lista de empleados y lo generado en el periodo.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={collaboratorsPeriod}
                      onChange={(e) => setCollaboratorsPeriod(e.target.value as 'day' | 'week' | 'month')}
                      style={{ colorScheme: 'dark' }}
                      className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                    >
                      <option value="day" className="bg-[#0b0f16] text-slate-200">Día</option>
                      <option value="week" className="bg-[#0b0f16] text-slate-200">Semana</option>
                      <option value="month" className="bg-[#0b0f16] text-slate-200">Mes</option>
                    </select>
                    <button
                      onClick={() => loadCollaboratorsData().catch(() => {})}
                      disabled={collaboratorsLoading || collaboratorsReportLoading}
                      className="bg-white/5 hover:bg-white/10 text-slate-200 rounded-2xl px-4 py-3 font-extrabold text-sm border border-white/10 disabled:opacity-60"
                    >
                      Actualizar
                    </button>
                  </div>
                </div>

                {collaboratorsError ? (
                  <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">{collaboratorsError}</div>
                ) : null}
                {collaboratorsReportError ? (
                  <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">{collaboratorsReportError}</div>
                ) : null}

                <div className="mt-4 rounded-2xl border border-white/10 overflow-hidden">
                  <div className="grid grid-cols-1 divide-y divide-white/5">
                    {employeeCollaborators.length === 0 ? (
                      <div className="p-4 text-sm text-slate-400">
                        {collaboratorsLoading ? 'Cargando colaboradores…' : 'No hay empleados asignados todavía.'}
                      </div>
                    ) : (
                      employeeCollaborators.map((item: any) => {
                        const sellerId = String(item?.user_id || '').trim();
                        const report = collaboratorReportMap.get(sellerId) || {};
                        const products = Array.isArray(report?.products) ? report.products : [];
                        return (
                          <div key={sellerId || item?.email} className="p-4 bg-gradient-to-r from-white/[0.03] to-transparent">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-white font-extrabold break-words">{String(item?.email || '—')}</div>
                                <div className="text-[11px] text-slate-400 mt-1">
                                  Comisión asignada: ${Number(item?.commission_value ?? 0).toFixed(0)} MXN
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2 md:min-w-[260px]">
                                <div className="bg-black/20 border border-white/10 rounded-2xl p-3 text-center">
                                  <div className="text-[11px] text-slate-400">Total</div>
                                  <div className="text-white font-extrabold">${Number(report?.total_mxn ?? 0).toFixed(0)}</div>
                                </div>
                                <div className="bg-black/20 border border-white/10 rounded-2xl p-3 text-center">
                                  <div className="text-[11px] text-slate-400">Pendiente</div>
                                  <div className="text-yellow-300 font-extrabold">${Number(report?.pending_mxn ?? 0).toFixed(0)}</div>
                                </div>
                                <div className="bg-black/20 border border-white/10 rounded-2xl p-3 text-center">
                                  <div className="text-[11px] text-slate-400">Pagado</div>
                                  <div className="text-emerald-300 font-extrabold">${Number(report?.paid_mxn ?? 0).toFixed(0)}</div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                              {['cancion_generada', 'karaoke_audio', 'karaoke_video'].map((productType) => {
                                const found = products.find((p: any) => String(p?.product_type || '').trim() === productType) || {};
                                return (
                                  <div key={productType} className="bg-black/20 border border-white/10 rounded-2xl p-4">
                                    <div className="text-xs text-slate-300 font-semibold">{productLabels[productType]}</div>
                                    <div className="text-lg text-white font-extrabold mt-1">${Number(found?.total_mxn ?? 0).toFixed(0)}</div>
                                    <div className="text-[11px] text-slate-400 mt-1">
                                      Pendiente: ${Number(found?.pending_mxn ?? 0).toFixed(0)} • Pagado: ${Number(found?.paid_mxn ?? 0).toFixed(0)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isUserDetailOpen ? (
            <div className="fixed inset-0 z-[200] bg-black/70 flex items-end md:items-center justify-center">
              <button className="absolute inset-0 w-full h-full" onClick={() => setIsUserDetailOpen(false)} aria-label="Cerrar" />
              <div className="relative w-full md:max-w-[640px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <div className="text-white font-extrabold">Usuario</div>
                  <button
                    onClick={() => setIsUserDetailOpen(false)}
                    className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-5">
                  {userDetailLoading ? (
                    <div className="text-sm text-slate-300">Cargando…</div>
                  ) : userDetailError ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">{userDetailError}</div>
                  ) : (
                    (() => {
                      const u = userDetailData?.user || {};
                      const plan = userDetailData?.plan || {};
                      const email = String(u?.email || userDetailEmail || '').trim();
                      const fullName = String(u?.full_name || '').trim();
                      const birth = String(u?.birthdate || '').trim();
                      const createdAt = String(u?.created_at || '').trim();
                      const lastIn = String(u?.last_sign_in_at || '').trim();
                      const planKey = String(plan?.plan_key || 'ninguno').trim();
                      const planActive = Boolean(plan?.plan_active);
                      const planExp = plan?.plan_expires_at ? String(plan.plan_expires_at) : '';
                      const bank = userDetailData?.internal_credits;

                      const fmt = (iso: string) => {
                        try {
                          const d = new Date(iso);
                          if (Number.isNaN(d.getTime())) return iso;
                          return d.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                        } catch {
                          return iso;
                        }
                      };

                      return (
                        <div className="space-y-4">
                          <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                            <div className="text-xs text-slate-400 font-semibold">Correo</div>
                            <div className="text-white font-extrabold break-words">{email || '—'}</div>
                            <div className="mt-2 text-xs text-slate-400 font-semibold">Nombre</div>
                            <div className="text-slate-200">{fullName || '—'}</div>
                            <div className="mt-2 text-xs text-slate-400 font-semibold">Nacimiento</div>
                            <div className="text-slate-200">{birth || '—'}</div>
                            <div className="mt-2 text-xs text-slate-400 font-semibold">Registro</div>
                            <div className="text-slate-200">{createdAt ? fmt(createdAt) : '—'}</div>
                            <div className="mt-2 text-xs text-slate-400 font-semibold">Último acceso</div>
                            <div className="text-slate-200">{lastIn ? fmt(lastIn) : '—'}</div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                              <div className="text-xs text-slate-400 font-semibold">Créditos del usuario</div>
                              <div className="text-white font-extrabold">{bank == null ? '—' : Number(bank).toString()} créditos</div>
                            </div>
                            <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                              <div className="text-xs text-slate-400 font-semibold">Plan</div>
                              <div className="text-white font-extrabold">{planKey}</div>
                              <div className="text-[11px] text-slate-400 mt-1">{planKey === 'ninguno' ? '—' : planActive ? 'Activo' : 'Vencido'}</div>
                              {planExp ? <div className="text-[11px] text-slate-500 mt-1">Vence: {fmt(planExp)}</div> : null}
                            </div>
                          </div>

                          <div className="flex flex-col md:flex-row gap-3">
                            <button
                              onClick={() => {
                                if (!email) return;
                                focusCreditos('grant', email);
                              }}
                              className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 rounded-2xl px-4 py-3 font-extrabold text-sm"
                            >
                              Preparar: Enviar créditos
                            </button>
                            <button
                              onClick={() => {
                                if (!email) return;
                                focusCreditos('take', email);
                              }}
                              className="flex-1 bg-red-500 hover:bg-red-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 rounded-2xl px-4 py-3 font-extrabold text-sm"
                            >
                              Preparar: Quitar créditos
                            </button>
                          </div>

                          <button
                            onClick={() => deleteUser(email)}
                            className="w-full bg-white/5 hover:bg-white/10 text-red-200 border border-red-500/30 rounded-2xl px-4 py-3 font-extrabold text-sm"
                          >
                            Borrar usuario
                          </button>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto animate-in slide-in-from-right-8 duration-300 z-[100] bg-gradient-to-b from-[#0b1224] via-[#070a12] to-black/95 backdrop-blur-3xl fixed inset-0 pb-safe">
      <div className="flex items-center gap-4 p-4 sticky top-0 bg-gradient-to-r from-black/40 via-indigo-950/40 to-black/30 z-10 backdrop-blur-xl border-b border-white/10">
        <button onClick={onClose} className="p-2 text-slate-300 hover:text-white glass-card rounded-full">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
      </div>

      <div className="p-6 space-y-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-2xl font-extrabold text-white shadow-inner">
            {userInitial}
          </div>
          <h2 className="text-2xl font-bold text-white">{userName}</h2>
        </div>

        <div className="bg-gradient-to-r from-yellow-500/20 to-transparent border border-yellow-400/20 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 font-bold text-xs">♪</div>
              <span className="font-semibold text-slate-200">{credits} Créditos</span>
              <HelpCircle className="w-4 h-4 text-slate-500" />
            </div>
            <button 
              onClick={() => {
                onOpenPricing?.();
                onClose();
              }}
              className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 font-extrabold text-xs px-4 py-2 rounded-full transition-colors"
            >
              Obtener más canciones
            </button>
          </div>
          
          <div className="flex flex-col gap-1.5 mt-2">
            {planExpiresAt && (
              <div className="text-[11px] text-slate-300">
                <span className="font-semibold text-emerald-400">Plan activo hasta: </span>
                {new Date(planExpiresAt).toLocaleDateString('es-MX', { 
                  weekday: 'short', 
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </div>
            )}
            
            {creditsExpiresAt && (
              <div className="text-[11px] text-slate-400">
                <span className="font-semibold text-yellow-500/80">Saldo disponible hasta: </span>
                {new Date(creditsExpiresAt).toLocaleDateString('es-MX', { 
                  weekday: 'short', 
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </div>
            )}
          </div>
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <Share className="w-5 h-5 text-slate-400" /> Compartir LucIAna
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5"
            onClick={() => openTelegramGroup()}
          >
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <MessageSquare className="w-5 h-5 text-slate-400" /> Grupo de Telegram
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            onClick={() => {
              setFeedbackName((prev) => prev || userName);
              setIsFeedbackOpen(true);
            }}
          >
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <span className="text-lg">⭐</span> Ayúdanos a mejorar
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {isAdmin && (
          <div className="glass-card rounded-2xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              onClick={() => {
                setOfficeTab('resumen');
                openOffice().catch(() => {});
              }}
            >
              <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
                <div className="relative">
                  <Shield className="w-5 h-5 text-yellow-300" />
                  {adminUnreadFeedback > 0 ? <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-[2px] border-black" /> : null}
                </div>
                OFICINA
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        )}

        <div className="glass-card rounded-2xl overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <HelpCircle className="w-5 h-5 text-slate-400" /> Preguntas frecuentes
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <FileText className="w-5 h-5 text-slate-400" /> Términos de Servicio
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <Shield className="w-5 h-5 text-slate-400" /> Política de Privacidad
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            onClick={() => {
              onOpenUpdates?.();
              onClose();
            }}
          >
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <Bell className="w-5 h-5 text-slate-400" /> Actualizaciones
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {isFeedbackOpen && (
          <div className="fixed inset-0 z-[200] bg-black/70 flex items-end md:items-center justify-center">
            <button className="absolute inset-0 w-full h-full" onClick={() => setIsFeedbackOpen(false)} aria-label="Cerrar" />
            <div className="relative w-full md:max-w-[560px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="text-white font-extrabold">Ayúdanos a mejorar</div>
                <button onClick={() => setIsFeedbackOpen(false)} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
                  ✕
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold">Nombre</div>
                  <input
                    value={feedbackName}
                    onChange={(e) => setFeedbackName(e.target.value)}
                    className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                    placeholder="Tu nombre"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold">WhatsApp</div>
                  <input
                    value={feedbackWhatsapp}
                    onChange={(e) => setFeedbackWhatsapp(e.target.value)}
                    className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                    placeholder="Ej: +52 999 000 0000"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold">Mensaje</div>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 min-h-[140px] resize-none"
                    placeholder="Cuéntanos qué mejorar o qué error viste…"
                  />
                </div>
              </div>
              <div className="p-5 border-t border-white/10 flex items-center gap-3">
                <button
                  onClick={() => setIsFeedbackOpen(false)}
                  className="w-[140px] bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 h-[48px] rounded-full font-extrabold text-sm transition-colors"
                  disabled={feedbackBusy}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => submitFeedback().catch(() => {})}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
                  disabled={feedbackBusy}
                >
                  {feedbackBusy ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm font-medium text-slate-200 mb-4">Síguenos</p>
          <div className="flex items-center justify-center gap-4">
            {['youtube', 'tiktok', 'discord', 'x'].map(social => (
              <button key={social} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors uppercase text-[10px] font-bold">
                {social.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>

        <div className="py-3 text-center">
           <button
             onClick={() => {
               if (isStartingLogin) return;
               setIsStartingLogin(true);
               signInWithGoogle()
                 .then((r) => {
                   if (!r.ok) alert(r.error);
                 })
                 .catch(() => alert('No pude iniciar sesión con Google.'))
                 .finally(() => setIsStartingLogin(false));
             }}
             disabled={isStartingLogin}
             className="mb-4 text-slate-200 text-sm font-semibold hover:text-white transition-colors underline underline-offset-4 disabled:opacity-60"
           >
             {isStartingLogin ? 'Abriendo Google…' : 'Entrar con Google'}
           </button>
           <button
             onClick={() => signOut().catch(() => {})}
             disabled={isAuthBusy}
             className="text-slate-400 text-sm font-medium hover:text-white transition-colors underline underline-offset-4 disabled:opacity-60"
           >
             {isAuthBusy ? 'Cerrando sesión…' : 'Cerrar sesión'}
           </button>
        </div>
      </div>
    </div>
  );
}
