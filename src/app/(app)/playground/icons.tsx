// Two marks the shared icon family lacks, drawn to the same rules:
// 24×24, stroked at 1.6, inheriting the text color.

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

export const ChevronDownIcon = icon(<path d="m6.5 9.5 5.5 5.5 5.5-5.5" />);
export const PersonIcon = icon(
  <>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5c.8-3.4 3.5-5 7-5s6.2 1.6 7 5" />
  </>,
);
export const TextIcon = icon(<path d="M5 7h14M5 12h14M5 17h9" />);
export const ImageIcon = icon(
  <>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="m20 15-4.5-4.5L8 18" />
  </>,
);
export const VideoIcon = icon(
  <>
    <rect x="3.5" y="6.5" width="12" height="11" rx="2" />
    <path d="m15.5 10.5 5-2.5v8l-5-2.5" />
  </>,
);
export const GaugeIcon = icon(
  <>
    <path d="M4 15.5a8 8 0 0 1 16 0" />
    <path d="m12 15.5 3.5-4.5" />
    <path d="M4 19.5h16" />
  </>,
);
export const SparkIcon = icon(<path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2 2M15 15l2 2M7 17l2-2M15 9l2-2" />);
