import { useState } from 'react';
import { API_BASE_URL } from '../../services/api/base';

/**
 * Kunden-Avatar (CRM-Politur 13.11.2026): zeigt das gecachte Firmenlogo
 * (Favicon-Service / manueller Upload), sonst zwei Initialen auf einer
 * dezenten Tönung der Kundenfarbe — statt der früheren Vollton-Quadrate.
 */

// logo_url ist ein relativer API-Pfad (/api/uploads/customer-logos/…).
// Auf Prod ist das same-origin; im Dev läuft die API auf einem anderen
// Port → Origin aus VITE_API_URL voranstellen.
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

export function customerLogoSrc(logoUrl?: string | null): string | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith('http')) return logoUrl;
  return `${API_ORIGIN}${logoUrl}`;
}

export function customerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return `rgba(107, 114, 128, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface CustomerAvatarProps {
  name: string;
  color?: string | null;
  logoUrl?: string | null;
  /** Kantenlänge: sm=28px (Listenzeilen), md=36px (Karten), lg=48px (Hub-Header) */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<CustomerAvatarProps['size']>, string> = {
  sm: 'w-7 h-7 text-[10px] rounded-lg',
  md: 'w-9 h-9 text-xs rounded-xl',
  lg: 'w-12 h-12 text-sm rounded-xl',
};

export default function CustomerAvatar({ name, color, logoUrl, size = 'md', className = '' }: CustomerAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = customerLogoSrc(logoUrl);
  const baseColor = color || '#6b7280';

  if (src && !imageFailed) {
    return (
      <span
        className={`${SIZE_CLASSES[size]} shrink-0 inline-flex items-center justify-center overflow-hidden bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border ${className}`}
      >
        <img
          src={src}
          alt=""
          loading="lazy"
          className="w-full h-full object-contain p-0.5"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`${SIZE_CLASSES[size]} shrink-0 inline-flex items-center justify-center font-semibold select-none ${className}`}
      style={{ backgroundColor: hexToRgba(baseColor, 0.14), color: baseColor }}
    >
      {customerInitials(name)}
    </span>
  );
}
