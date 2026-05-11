export function SpecCenterLogo({
  size = 32,
  className
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Prism / lens body — a faceted hexagonal shape */}
      <path
        d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Inner facet — creates depth / lens refraction feel */}
      <path
        d="M16 8L24 12.5V21.5L16 26L8 21.5V12.5L16 8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity="0.5"
      />
      {/* Spec document lines inside the prism */}
      <line x1="12" y1="14" x2="20" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="12" y1="17" x2="18" y2="17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="12" y1="20" x2="16" y2="20" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
