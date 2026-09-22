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
export const MicIcon = icon(
  <>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5v3M9 20.5h6" />
  </>,
);
export const PaperclipIcon = icon(<path d="m16.5 8.5-7 7a2.1 2.1 0 0 1-3-3l8-8a3.5 3.5 0 0 1 5 5l-8.5 8.5a5 5 0 0 1-7-7l7-7" />);
export const SpeakerIcon = icon(
  <>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />
  </>,
);
export const TrashIcon = icon(<path d="M5 7h14M9.5 7V4.5h5V7M7 7l.8 12.5h8.4L17 7M10 10.5v6M14 10.5v6" />);
export const ChatIcon = icon(<path d="M5 6.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7l-4.5 3.5V16.5H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />);
export const ColumnsIcon = icon(
  <>
    <rect x="3.5" y="5" width="7.5" height="14" rx="1.5" />
    <rect x="13" y="5" width="7.5" height="14" rx="1.5" />
  </>,
);
export const LibraryIcon = icon(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8.5 9.5v10" />
  </>,
);
export const PencilIcon = icon(<path d="m4 20 4.5-1L19 8.5a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" />);
