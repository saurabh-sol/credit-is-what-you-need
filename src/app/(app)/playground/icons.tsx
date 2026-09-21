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
