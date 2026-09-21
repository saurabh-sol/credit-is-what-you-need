// One small icon family: 24×24, stroked at 1.6, inheriting the text color.

type IconProps = { className?: string };

const icon = (paths: React.ReactNode) =>
  function Icon({ className = "size-4" }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={`${className} shrink-0 fill-none stroke-current`}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {paths}
      </svg>
    );
  };

export const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
  </>,
);
export const ArrowRightIcon = icon(<path d="M5 12h14m-5.5-5.5L19 12l-5.5 5.5" />);
export const ArrowUpRightIcon = icon(<path d="M7 17 17 7M8.5 7H17v8.5" />);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const MenuIcon = icon(<path d="M4 8h16M4 16h16" />);
export const CloseIcon = icon(<path d="m6 6 12 12M18 6 6 18" />);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </>,
);
export const PlayIcon = icon(<path d="M8 5.5v13l10.5-6.5L8 5.5Z" />);
export const SendIcon = icon(<path d="M12 19V5m-6 6 6-6 6 6" />);
export const StopIcon = icon(<rect x="7" y="7" width="10" height="10" rx="2" />);
export const WalletIcon = icon(
  <>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17a2 2 0 0 1 2 2v1" />
    <path d="M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5H18a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 1 4 7.5Z" />
    <path d="M16 13.75h.01" />
  </>,
);
export const KeyIcon = icon(
  <>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="M10.7 12.3 20 3m-4 4 3 3m-6-1 2.5 2.5" />
  </>,
);
export const TerminalIcon = icon(
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="3" />
    <path d="m7.5 10 3 2.5-3 2.5M13 15h3.5" />
  </>,
);
export const SparkIcon = icon(<path d="M12 3c.6 4.7 2.3 6.4 9 9-6.7 2.6-8.4 4.3-9 9-.6-4.7-2.3-6.4-9-9 6.7-2.6 8.4-4.3 9-9Z" />);
export const CoinsIcon = icon(
  <>
    <ellipse cx="9" cy="8" rx="5.5" ry="3" />
    <path d="M3.5 8v4c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3V8" />
    <path d="M14.5 11.2c3 .1 6 1.3 6 3v4c0 1.7-2.5 3-5.5 3s-5.5-1.3-5.5-3v-2.7" />
  </>,
);
export const UsersIcon = icon(
  <>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 19.5c.6-3.4 3.2-5 6.5-5s5.9 1.6 6.5 5M16 5.2a3.5 3.5 0 0 1 0 6.6m2.3 3.1c1.7.7 2.8 2.2 3.2 4.6" />
  </>,
);
export const BoltIcon = icon(<path d="M13 3 5 13.5h6L10 21l9-11h-6.5L13 3Z" />);
export const ShieldIcon = icon(<path d="M12 3.5 5 6v5.5c0 4.3 2.7 7.6 7 9 4.3-1.4 7-4.7 7-9V6l-7-2.5Zm-3 8.7 2.2 2.2 3.8-4" />);
