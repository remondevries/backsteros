/** Coder / BacksterDEV workspace glyph (hexagon mark). */
export function WorkspaceCoderIcon({
  className,
  size = 16,
}: {
  readonly className?: string;
  readonly size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 466.73 532.09"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
    </svg>
  );
}

/** Servers workspace glyph (cloud mark). */
export function WorkspaceServersIcon({
  className,
  size = 16,
}: {
  readonly className?: string;
  readonly size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <path d="M12.103 4.552c2 .614 3.66 2.175 4.493 4.836 2.05.177 3.997 1.285 5.063 2.803.59.842.932 1.844.82 2.9-.113 1.066-.677 2.087-1.713 2.975-1.116.957-2.676 1.184-3.894 1.184H8.026a6.14 6.14 0 0 1-4.72-2.211c-2-2.263-2.424-4.666-1.773-6.796.64-2.09 2.28-3.812 4.216-4.86 1.935-1.046 4.267-1.472 6.354-.831" />
    </svg>
  );
}

/** Git / pull-requests workspace glyph (GitHub mark). */
export function WorkspaceGitIcon({
  className,
  size = 16,
}: {
  readonly className?: string;
  readonly size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M512 0C229.12 0 0 229.12 0 512c0 226.56 146.56 417.92 350.08 485.76 25.6 4.48 35.2-10.88 35.2-24.32 0-12.16-.64-52.48-.64-95.36-128.64 23.68-161.92-31.36-172.16-60.16-5.76-14.72-30.72-60.16-52.48-72.32-17.92-9.6-43.52-33.28-.64-33.92 40.32-.64 69.12 37.12 78.72 52.48 46.08 77.44 119.68 55.68 149.12 42.24 4.48-33.28 17.92-55.68 32.64-68.48-113.92-12.8-232.96-56.96-232.96-252.8 0-55.68 19.84-101.76 52.48-137.6-5.12-12.8-23.04-65.28 5.12-135.68 0 0 42.88-13.44 140.8 52.48 40.96-11.52 84.48-17.28 128-17.28s87.04 5.76 128 17.28c97.92-66.56 140.8-52.48 140.8-52.48 28.16 70.4 10.24 122.88 5.12 135.68 32.64 35.84 52.48 81.28 52.48 137.6 0 196.48-119.68 240-233.6 252.8 18.56 16 34.56 46.72 34.56 94.72 0 68.48-.64 123.52-.64 140.8 0 13.44 9.6 29.44 35.2 24.32C877.44 929.92 1024 737.92 1024 512 1024 229.12 794.88 0 512 0"
      />
    </svg>
  );
}
