import React from 'react';

interface GoogleSubjectIconProps {
  size?: number;
  className?: string;
}

/**
 * Google-style icon for Basic Subject (วิชาพื้นฐาน)
 * Styled in the iconic Google Workspace / Material design aesthetic (Book & Learning)
 */
export function GoogleBasicSubjectIcon({ size = 20, className = '' }: GoogleSubjectIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
    >
      {/* Left page - Google Blue */}
      <path
        d="M3 5.5C3 4.67 3.67 4 4.5 4H11.2C11.64 4 12 4.36 12 4.8V19.2C12 19.64 11.64 20 11.2 20H4.5C3.67 20 3 19.33 3 18.5V5.5Z"
        fill="#4285F4"
      />
      {/* Right page - Google Green / Soft white inner */}
      <path
        d="M12.8 4H19.5C20.33 4 21 4.67 21 5.5V18.5C21 19.33 20.33 20 19.5 20H12.8C12.36 20 12 19.64 12 19.2V4.8C12 4.36 12.36 4 12.8 4Z"
        fill="#34A853"
      />
      {/* Center spine shadow & crease */}
      <path
        d="M11.5 4H12.5V20H11.5V4Z"
        fill="#1E8E3E"
        opacity="0.3"
      />
      {/* Page lines on left */}
      <rect x="5.5" y="7" width="4.5" height="1.5" rx="0.75" fill="white" fillOpacity="0.9" />
      <rect x="5.5" y="10.5" width="4.5" height="1.5" rx="0.75" fill="white" fillOpacity="0.9" />
      <rect x="5.5" y="14" width="3" height="1.5" rx="0.75" fill="white" fillOpacity="0.9" />
      {/* Page lines on right */}
      <rect x="14" y="7" width="4.5" height="1.5" rx="0.75" fill="white" fillOpacity="0.9" />
      <rect x="14" y="10.5" width="4.5" height="1.5" rx="0.75" fill="white" fillOpacity="0.9" />
      <rect x="14" y="14" width="3" height="1.5" rx="0.75" fill="white" fillOpacity="0.9" />
      {/* Google Yellow bookmark tag at top */}
      <path
        d="M10 2.5C10 2.22 10.22 2 10.5 2H13.5C13.78 2 14 2.22 14 2.5V6L12 4.8L10 6V2.5Z"
        fill="#FBBC05"
      />
    </svg>
  );
}

/**
 * Google-style icon for Elective Subject (วิชาเพิ่มเติม)
 * Styled in the iconic Google AI / Sparkle / Auto-Awesome Material aesthetic with 4 Google colors
 */
export function GoogleElectiveSubjectIcon({ size = 20, className = '' }: GoogleSubjectIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
    >
      {/* Main Star: Google 4-color gradient sparkle */}
      {/* Top right quadrant - Google Red */}
      <path
        d="M12 2C12 6.5 15.5 10 20 10C15.5 10 12 10 12 2Z"
        fill="#EA4335"
      />
      {/* Top left quadrant - Google Blue */}
      <path
        d="M12 2C12 6.5 8.5 10 4 10C8.5 10 12 10 12 2Z"
        fill="#4285F4"
      />
      {/* Bottom left quadrant - Google Green */}
      <path
        d="M12 18C12 13.5 8.5 10 4 10C8.5 10 12 10 12 18Z"
        fill="#34A853"
      />
      {/* Bottom right quadrant - Google Yellow */}
      <path
        d="M12 18C12 13.5 15.5 10 20 10C15.5 10 12 10 12 18Z"
        fill="#FBBC05"
      />

      {/* Small sparkle top-right - Google Yellow/Amber */}
      <path
        d="M19 14C19 16.2 20.3 17.5 22.5 17.5C20.3 17.5 19 18.8 19 21C19 18.8 17.7 17.5 15.5 17.5C17.7 17.5 19 16.2 19 14Z"
        fill="#FBBC05"
      />

      {/* Mini sparkle bottom-left - Google Blue */}
      <path
        d="M5.5 16C5.5 17.5 6.3 18.3 7.8 18.3C6.3 18.3 5.5 19.1 5.5 20.6C5.5 19.1 4.7 18.3 3.2 18.3C4.7 18.3 5.5 17.5 5.5 16Z"
        fill="#4285F4"
      />
    </svg>
  );
}

export default GoogleBasicSubjectIcon;
