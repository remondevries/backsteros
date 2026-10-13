type ProjectUpdateKindIconProps = {
  className?: string;
  size?: number;
};

/** Category icon for Update posts. */
export function ProjectUpdateKindUpdateIcon({
  className,
  size = 16,
}: ProjectUpdateKindIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.069 3.977L10.538 1.154C10.844 1.05198 11.1644 0.999982 11.487 1H11.5C13.433 1 15 3.239 15 6C15 8.761 13.433 11 11.5 11H11.33C11.11 11 10.8927 10.9763 10.678 10.929L2.086 9.019C2.03007 9.00597 1.97905 8.97717 1.939 8.936C0.632002 7.575 0.643002 5.414 1.949 4.053C1.98234 4.01843 2.0235 3.99236 2.069 3.977ZM11.5 9.5C12.605 9.5 13.5 7.933 13.5 6C13.5 4.067 12.605 2.5 11.5 2.5C10.395 2.5 9.5 4.067 9.5 6C9.5 7.933 10.395 9.5 11.5 9.5Z"
        fill="currentColor"
      />
      <path
        d="M3 10.5L3.826 14.217C3.87536 14.4391 3.99897 14.6377 4.1764 14.78C4.35384 14.9224 4.57452 15 4.802 15H5C5.26522 15 5.51957 14.8946 5.70711 14.7071C5.89464 14.5196 6 14.2652 6 14V11L3 10.5ZM12.25 6C12.25 6.69 11.914 7.25 11.5 7.25C11.086 7.25 10.75 6.69 10.75 6C10.75 5.31 11.086 4.75 11.5 4.75C11.914 4.75 12.25 5.31 12.25 6Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Category icon for Incident posts. */
export function ProjectUpdateKindIncidentIcon({
  className,
  size = 16,
  color,
}: ProjectUpdateKindIconProps & { color?: string }) {
  const fill = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.194 1.22011C6.361 0.600109 5.212 1.38611 5.498 2.38211C5.788 3.39211 5.618 4.47911 5.031 5.35411L3.857 7.10511C3.2984 7.93839 3.0001 8.91892 3 9.92211V10.0271C3 12.7741 5.239 15.0001 8 15.0001C10.761 15.0001 13 12.7741 13 10.0271V7.11111C13 6.26711 12.011 5.80711 11.36 6.34611L10 7.47311V5.55211C9.99923 4.85647 9.83611 4.17062 9.52362 3.54912C9.21113 2.92761 8.75791 2.38762 8.2 1.97211L7.194 1.22011ZM8 14.0001C6.75 14.0001 5.5 13.5641 5.5 11.8181C5.5 10.4531 6.52 9.11011 7.362 8.41611C7.64 8.18611 8 8.40311 8 8.76411V10.5091C8.00004 10.5921 8.02075 10.6738 8.06024 10.7468C8.09974 10.8198 8.15679 10.8818 8.22625 10.9273C8.2957 10.9727 8.37538 11.0001 8.45808 11.0071C8.54079 11.014 8.62393 11.0003 8.7 10.9671L9.8 10.4871C10.13 10.3431 10.504 10.5851 10.483 10.9451C10.411 12.2051 10.028 14.0001 8 14.0001Z"
        fill={fill}
      />
    </svg>
  );
}

/** Category icon for Maintenance posts. */
export function ProjectUpdateKindMaintenanceIcon({
  className,
  size = 16,
}: ProjectUpdateKindIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M7.999 11.743L4.225 14.83C4.11515 14.9199 3.98204 14.9768 3.84114 14.994C3.70025 15.0113 3.55735 14.9882 3.42905 14.9275C3.30076 14.8667 3.19234 14.7708 3.11639 14.6509C3.04044 14.531 3.00008 14.3919 3 14.25L3.012 3.747C3.0128 3.01817 3.30288 2.31947 3.81852 1.8044C4.33416 1.28932 5.03317 1 5.762 1H10.247C10.6081 1 10.9657 1.07113 11.2994 1.20933C11.633 1.34753 11.9362 1.5501 12.1915 1.80546C12.4469 2.06082 12.6495 2.36398 12.7877 2.69762C12.9259 3.03127 12.997 3.38886 12.997 3.75V14.25C12.9969 14.3919 12.9566 14.531 12.8806 14.6509C12.8047 14.7708 12.6962 14.8667 12.5679 14.9275C12.4397 14.9882 12.2968 15.0113 12.1559 14.994C12.015 14.9768 11.8819 14.9199 11.772 14.83L7.999 11.743Z"
        fill="currentColor"
      />
    </svg>
  );
}
