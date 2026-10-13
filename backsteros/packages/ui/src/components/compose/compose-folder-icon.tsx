export type ComposeFolderIconProps = {
  className?: string;
};

export function ComposeFolderIcon({
  className = "size-[14px] shrink-0 text-foreground/70",
}: ComposeFolderIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.32069 2C6.80038 2 7.25905 2.19691 7.58944 2.54469L8.89806 3.92219C8.94526 3.97187 9.01078 4 9.07931 4H12.25C13.7688 4 15 5.23009 15 6.74887V11.25C15 12.7688 13.7688 14 12.2501 14H3.75C2.23122 14 1 12.7688 1 11.25V4.75C1 3.23122 2.23122 2 3.75 2H6.32069ZM12.25 5.5C12.9404 5.5 13.5 6.05851 13.5 6.74887L13.5001 11.25C13.5001 11.9404 12.9405 12.5 12.2501 12.5H3.75C3.05964 12.5 2.5 11.9404 2.5 11.25V4.75C2.5 4.05964 3.05964 3.5 3.75 3.5H6.32069C6.38922 3.5 6.45474 3.52813 6.50194 3.57781L7.81056 4.95531C8.14095 5.30309 8.59962 5.5 9.07931 5.5H12.25Z"
      />
    </svg>
  );
}
