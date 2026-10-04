import Image from "next/image";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
  priority?: boolean;
};

export function BrandLogo({
  compact = false,
  className,
  priority = false,
}: BrandLogoProps) {
  if (compact) {
    return (
      <svg
        className={className}
        viewBox="24 12 190 205"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M40 199V72C40 43 59 27 87 27H98C130 27 150 46 150 76C150 106 130 125 98 125H69L99 194L129 140L159 194"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="15"
        />
        <path
          d="M159 194L197 125"
          stroke="#829B55"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="15"
        />
      </svg>
    );
  }

  return (
    <Image
      className={className}
      src="/brand/pathwayve-logo.svg"
      alt="pathwayve"
      width={900}
      height={260}
      priority={priority}
    />
  );
}
