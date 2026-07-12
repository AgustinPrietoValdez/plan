import type { CSSProperties } from "react";

interface IconProps {
  size?: number;
  stroke?: number;
  fill?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

interface InternalProps extends IconProps {
  d?: string;
  children?: React.ReactNode;
}

const Icon = ({ d, size = 16, stroke = 1.6, fill = "none", children, ...rest }: InternalProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {d ? <path d={d} /> : children}
  </svg>
);

export const IChevL = (p: IconProps) => <Icon {...p} d="M15 18l-6-6 6-6" />;
export const IChevR = (p: IconProps) => <Icon {...p} d="M9 6l6 6-6 6" />;
export const IChevD = (p: IconProps) => <Icon {...p} d="M6 9l6 6 6-6" />;
export const IChevU = (p: IconProps) => <Icon {...p} d="M18 15l-6-6-6 6" />;
export const IPlus = (p: IconProps) => <Icon {...p} d="M12 5v14M5 12h14" />;
export const IRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 12a9 9 0 0 1-15.5 6.3M3 12a9 9 0 0 1 15.5-6.3" />
    <path d="M21 4v5h-5M3 20v-5h5" />
  </Icon>
);
export const IEye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const IEyeOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <path d="M1 1l22 22" />
  </Icon>
);
export const ISearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Icon>
);
export const ICheck = (p: IconProps) => <Icon {...p} d="M5 12l4.5 4.5L19 7" stroke={p.stroke ?? 2.2} />;
export const ICal = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
    <path d="M3 9h18M8 3v3M16 3v3" />
  </Icon>
);
export const IList = (p: IconProps) => (
  <Icon {...p} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
);
export const IInbox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
  </Icon>
);
export const IFlag = (p: IconProps) => <Icon {...p} d="M4 21V4M4 4h13l-2 4 2 4H4" />;
export const IClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
export const IRecurring = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 0115-6.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 01-15 6.7L3 16" />
    <path d="M3 21v-5h5" />
  </Icon>
);
export const IX = (p: IconProps) => <Icon {...p} d="M6 6l12 12M18 6l-12 12" />;
export const IEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17 3a2.83 2.83 0 014 4L7 21l-4 1 1-4z" />
  </Icon>
);
export const ITrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
  </Icon>
);
export const ICircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
  </Icon>
);
export const IFilter = (p: IconProps) => <Icon {...p} d="M4 5h16l-6 8v6l-4-2v-4z" />;
export const IGrip = (p: IconProps) => (
  <Icon {...p} d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" stroke={p.stroke ?? 2.4} />
);
export const IHabit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2.5l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8z" />
  </Icon>
);
export const IFork = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 2v7a2 2 0 002 2v11" />
    <path d="M11 2v7a2 2 0 01-2 2" />
    <path d="M17 2v20M17 9c2 0 3-1.5 3-3.5S19 2 17 2" />
  </Icon>
);
export const ICart = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="21" r="1.5" />
    <circle cx="18" cy="21" r="1.5" />
    <path d="M2 3h3l2.5 13a2 2 0 002 1.6h8a2 2 0 002-1.5L21 7H6" />
  </Icon>
);
export const IAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l10 17H2z" />
    <path d="M12 10v5M12 18h.01" />
  </Icon>
);
export const IBolt = (p: IconProps) => <Icon {...p} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />;
export const IBox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 8v12a1 1 0 01-1 1H4a1 1 0 01-1-1V8" />
    <path d="M1 3h22v5H1zM10 12h4" />
  </Icon>
);
