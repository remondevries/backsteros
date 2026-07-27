type DashboardNavIconProps = {
  className?: string;
};

export function DashboardNavIcon({ className }: DashboardNavIconProps) {
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
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1.75 1C1.33579 1 1 1.33579 1 1.75V6.25C1 6.66421 1.33579 7 1.75 7H6.25C6.66421 7 7 6.66421 7 6.25V1.75C7 1.33579 6.66421 1 6.25 1H1.75ZM2.5 5.5V2.5H5.5V5.5H2.5Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.75 1C9.33579 1 9 1.33579 9 1.75V6.25C9 6.66421 9.33579 7 9.75 7H14.25C14.6642 7 15 6.66421 15 6.25V1.75C15 1.33579 14.6642 1 14.25 1H9.75ZM10.5 5.5V2.5H13.5V5.5H10.5Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1.75 9C1.33579 9 1 9.33579 1 9.75V14.25C1 14.6642 1.33579 15 1.75 15H6.25C6.66421 15 7 14.6642 7 14.25V9.75C7 9.33579 6.66421 9 6.25 9H1.75ZM2.5 13.5V10.5H5.5V13.5H2.5Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.75 9C9.33579 9 9 9.33579 9 9.75V14.25C9 14.6642 9.33579 15 9.75 15H14.25C14.6642 15 15 14.6642 15 14.25V9.75C15 9.33579 14.6642 9 14.25 9H9.75ZM10.5 13.5V10.5H13.5V13.5H10.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
