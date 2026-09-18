import { Bell, ChevronDown, Coins, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TopBarProps {
  className?: string;
  onMenuClick?: () => void;
  onCreditsClick?: () => void;
  credits?: number;
  bankCredits?: number | null;
  showBank?: boolean;
  hideMenu?: boolean;
}

export function TopBar({ className, onMenuClick, onCreditsClick, credits, bankCredits, showBank, hideMenu }: TopBarProps) {
  return (
    <header className={cn('luciana-topbar', className)}>
      <div className="luciana-brand" aria-label="LucIAna Music">
        <img src="/assets/luciana-music-logo.jpeg" alt="Logo de LucIAna Music" className="luciana-brand-logo rounded-full object-cover shadow-sm ring-1 ring-black/10 dark:ring-white/10" />
        <span className="luciana-brand-name">Luc<span>IA</span>na <b>|</b> Music</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button type="button" className="luciana-icon-button hidden sm:flex" aria-label="Notificaciones">
          <Bell className="w-[18px] h-[18px]" />
          <span className="luciana-notification-dot" />
        </button>

        <button type="button" onClick={onCreditsClick} className="luciana-credit-pill">
          <span className="luciana-credit-icon"><Coins className="w-4 h-4" /></span>
          <span className="hidden sm:block text-[11px] text-slate-400 leading-none">Créditos</span>
          <strong>{Number(credits || 0).toLocaleString('es-MX', { maximumFractionDigits: 1 })}</strong>
          <ChevronDown className="w-4 h-4 text-slate-500 hidden sm:block" />
        </button>

        {showBank ? (
          <div className="hidden lg:flex luciana-bank-pill">
            <span>Banco</span>
            <strong>{Number(bankCredits ?? 0).toLocaleString('es-MX')}</strong>
          </div>
        ) : null}

        {!hideMenu ? (
          <button type="button" onClick={onMenuClick} className="luciana-icon-button" aria-label="Abrir menú">
            <Menu className="w-6 h-6" />
          </button>
        ) : null}
      </div>
    </header>
  );
}
