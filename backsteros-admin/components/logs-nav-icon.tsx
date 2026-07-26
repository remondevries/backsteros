type LogsNavIconProps = {
  className?: string;
};

export function LogsNavIcon({ className }: LogsNavIconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M3 2.75C3 2.33579 3.33579 2 3.75 2H12.25C12.6642 2 13 2.33579 13 2.75V13.25C13 13.6642 12.6642 14 12.25 14H3.75C3.33579 14 3 13.6642 3 13.25V2.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5.5 5H10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M5.5 8H10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M5.5 11H8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
