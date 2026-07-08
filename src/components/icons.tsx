// Minimal inline stroke icons (currentColor). Sized via CSS.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const IconOverview = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconThroughput = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 16l5-6 4 4 5-8 4 5" />
    <path d="M3 20h18" opacity="0.5" />
  </svg>
);

export const IconSources = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z" />
    <path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" opacity="0.6" />
  </svg>
);

export const IconRoutes = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="6" cy="5.5" r="2" />
    <circle cx="18" cy="5.5" r="2" />
    <circle cx="12" cy="18.5" r="2" />
    <path d="M6 7.5v2c0 2.2 1.8 4 4 4h2M18 7.5v2c0 2.2-1.8 4-4 4h-2" />
    <path d="M12 13.5v3" />
  </svg>
);

export const IconDest = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 20h16" />
  </svg>
);

export const IconNodes = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="6" rx="1.6" />
    <rect x="3" y="14" width="18" height="6" rx="1.6" />
    <circle cx="7" cy="7" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="7" cy="17" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconValue = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9.5 9.2c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2-1.1 1.8-2.5 1.8-2.5.7-2.5 1.9 1.1 2 2.5 2 2.5-.8 2.5-2" />
  </svg>
);

export const IconRefresh = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 11a8 8 0 0 0-14-5l-2 2" />
    <path d="M4 5v4h4" />
    <path d="M4 13a8 8 0 0 0 14 5l2-2" />
    <path d="M20 19v-4h-4" />
  </svg>
);

export const IconClock = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconWarn = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l9 16H3z" />
    <path d="M12 10v4M12 17.5v.01" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const IconBell = (p: P) => (
  <svg {...base} {...p}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9z" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export const IconChevron = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
