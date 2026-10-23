/** App icons: one 20px grid, 1.75 round stroke, currentColor, matching @mft/ui's internal glyphs. Decorative. */
import type { ReactNode } from "react";

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const DashboardIcon = () => (
  <Icon>
    <rect x="3" y="3" width="6" height="8" rx="1.5" />
    <rect x="11" y="3" width="6" height="5" rx="1.5" />
    <rect x="11" y="10" width="6" height="7" rx="1.5" />
    <rect x="3" y="13" width="6" height="4" rx="1.5" />
  </Icon>
);

/** Money out: arrow leaving to the upper right. */
export const ExpensesIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="7.25" />
    <path d="M7.5 12.5l5-5M8.5 7.5h4v4" />
  </Icon>
);

/** Money in: arrow arriving at the lower left. */
export const IncomeIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="7.25" />
    <path d="M12.5 7.5l-5 5M11.5 12.5h-4v-4" />
  </Icon>
);

export const BudgetIcon = () => (
  <Icon>
    <path d="M10 2.75A7.25 7.25 0 1 0 17.25 10H10z" />
    <path d="M12.5 2.95A7.27 7.27 0 0 1 17.05 7.5H12.5z" />
  </Icon>
);

export const ReportIcon = () => (
  <Icon>
    <path d="M3 17h14" />
    <rect x="4.5" y="9" width="3" height="5.5" rx="1" />
    <rect x="8.5" y="5" width="3" height="9.5" rx="1" />
    <rect x="12.5" y="11" width="3" height="3.5" rx="1" />
  </Icon>
);

export const SettingsIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="2.5" />
    <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
  </Icon>
);

export const MenuIcon = () => (
  <Icon>
    <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M5 5l10 10M15 5L5 15" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M10 4v12M4 10h12" />
  </Icon>
);

export const ChevronLeftIcon = () => (
  <Icon size={16}>
    <path d="M12 4l-6 6 6 6" />
  </Icon>
);

export const ChevronRightIcon = () => (
  <Icon size={16}>
    <path d="M8 4l6 6-6 6" />
  </Icon>
);

export const AlertIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="7.25" />
    <path d="M10 6.5v4.25M10 13.5v.01" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon size={16}>
    <circle cx="9" cy="9" r="5.25" />
    <path d="M13 13l3.5 3.5" />
  </Icon>
);

export const TagIcon = () => (
  <Icon>
    <path d="M3 10.6V4.5A1.5 1.5 0 0 1 4.5 3h6.1a1.5 1.5 0 0 1 1.06.44l5 5a1.5 1.5 0 0 1 0 2.12l-6.1 6.1a1.5 1.5 0 0 1-2.12 0l-5-5A1.5 1.5 0 0 1 3 10.6z" />
    <circle cx="7" cy="7" r="1.25" />
  </Icon>
);

export const CardIcon = () => (
  <Icon>
    <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
    <path d="M2.5 8h15M5.5 12.5h3" />
  </Icon>
);

export const BellIcon = () => (
  <Icon>
    <path d="M5 8a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5h-13S5 12 5 8z" />
    <path d="M8.5 16.5a1.6 1.6 0 0 0 3 0" />
  </Icon>
);

export const PencilIcon = () => (
  <Icon size={16}>
    <path d="M12.5 4.5l3 3L7 16H4v-3l8.5-8.5z" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon size={16}>
    <path d="M4 6h12M8 6V4.5h4V6M6 6l.8 10h6.4L14 6" />
  </Icon>
);

export const ChevronDownIcon = () => (
  <Icon size={16}>
    <path d="M5 8l5 5 5-5" />
  </Icon>
);

export const LogoutIcon = () => (
  <Icon size={16}>
    <path d="M12 6V4.5A1.5 1.5 0 0 0 10.5 3h-5A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17h5a1.5 1.5 0 0 0 1.5-1.5V14" />
    <path d="M9 10h8M14 7l3 3-3 3" />
  </Icon>
);
