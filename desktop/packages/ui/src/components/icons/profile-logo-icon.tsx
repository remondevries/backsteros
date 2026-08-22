type ProfileLogoIconProps = {
  className?: string;
  height?: number;
};

export function ProfileLogoIcon({ className, height = 16 }: ProfileLogoIconProps) {
  const width = Math.round((height * 35) / 29);

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 35 29"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17.5 0L35 29H18.6667V13.92H16.3333V29H1.04308e-06L17.5 0Z"
        fill="#F8FAFC"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M35 0V19.72L23.3333 0H35Z"
        fill="#F8FAFC"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 0V19.72L11.6667 0H0Z"
        fill="#F8FAFC"
      />
    </svg>
  );
}
