import type { ReactNode, SVGProps } from "react";
// Small, self-contained line icons. No icon package or remote image is needed.
// Icons supplement visible labels; they do not replace an action's name.
const drawings = {
  search: <>
    <circle
      cx="10.5"
      cy="10.5"
      r="6.5"
    />
    <path d="m16 16 5 5" />
  </>,
  photo: <>
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="3"
    />
    <circle
      cx="8"
      cy="8"
      r="1.5"
    />
    <path d="m3 17 5-5 4 4 4-6 5 7" />
  </>,
  person: <>
    <circle
      cx="12"
      cy="7"
      r="3.5"
    />
    <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
  </>,
  people: <>
    <circle
      cx="9"
      cy="7"
      r="3"
    />
    <path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6m2 4a6 6 0 0 1 3 5v2" />
  </>,
  home: <>
    <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
  </>,
  book: <>
    <path d="M12 5v16M3 3h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z" />
  </>,
  clipboard: <>
    <rect
      x="5"
      y="4"
      width="14"
      height="17"
      rx="2"
    />
    <rect
      x="8"
      y="2"
      width="8"
      height="4"
      rx="1"
    />
    <path d="M9 11h6m-6 5h6" />
  </>,
  calendar: <>
    <rect
      x="3"
      y="5"
      width="18"
      height="16"
      rx="2"
    />
    <path d="M3 10h18M8 3v4m8-4v4M7 14h2m4 0h2m-8 4h2" />
  </>,
  chat: <>
    <path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-6 4V5a2 2 0 0 1 2-2Z" />
    <path d="M7 8h10M7 12h7" />
  </>,
  shield: <>
    <path d="m12 2 9 4v6c0 5-5 9-9 10-4-1-9-5-9-10V6Z" />
    <path d="m8 12 3 3 5-6" />
  </>,
  heart: <path
    d="M20.7 4.8a5.5 5.5 0 0 0-7.8 0l-.9.9-.9-.9a5.5 5.5 0 0 0-7.8 7.8L12 22l8.7-9.4a5.5 5.5 0 0 0 0-7.8Z"
  />,
  mail: <>
    <rect
      x="3"
      y="5"
      width="18"
      height="14"
      rx="2"
    />
    <path d="m3 6 9 7 9-7" />
  </>,
  lock: <>
    <rect
      x="5"
      y="10"
      width="14"
      height="11"
      rx="2"
    />
    <path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2" />
  </>,
  refresh: <>
    <path d="M20 7v5h-5M4 17v-5h5" />
    <path d="M5.6 6.3A8 8 0 0 1 19.7 10M4.3 14a8 8 0 0 0 14.1 3.7" />
  </>,
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
  arrowLeft: <path d="M20 12H4m6-6-6 6 6 6" />,
  arrowDown: <path d="M12 4v16m-6-6 6 6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  clock: <>
    <circle
      cx="12"
      cy="12"
      r="9"
    />
    <path d="M12 7v5l3 2" />
  </>,
  alert: <>
    <path d="m12 3 10 18H2Z" />
    <path d="M12 9v5m0 3v.1" />
  </>,
  info: <>
    <circle
      cx="12"
      cy="12"
      r="9"
    />
    <path d="M12 11v6m0-10v.1" />
  </>,
  bell: <>
    <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3a2 2 0 0 0 4 0" />
  </>,
  phone: <path d="M6 3h3l2 5-3 2a14 14 0 0 0 6 6l2-3 5 2v3a3 3 0 0 1-3 3A18 18 0 0 1 3 6a3 3 0 0 1 3-3Z" />,
  location: <>
    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
    <circle
      cx="12"
      cy="10"
      r="2.5"
    />
  </>,
  card: <>
    <rect
      x="2"
      y="4"
      width="20"
      height="16"
      rx="3"
    />
    <path d="M2 9h20M6 15h4" />
  </>,
  database: <>
    <ellipse
      cx="12"
      cy="5"
      rx="8"
      ry="3"
    />
    <path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" />
  </>,
  settings: <>
    <circle
      cx="12"
      cy="12"
      r="4"
    />
    <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
  </>,
  logout: <>
    <path d="M10 3H4v18h6m5-15 6 6-6 6m-8-6h14" />
  </>,
} satisfies Record<string, ReactNode>;
export type PortalIconName = keyof typeof drawings;

type PortalIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: PortalIconName;
};

export function PortalIcon({ name, ...props }: PortalIconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {drawings[name]}
    </svg>
  );
}
