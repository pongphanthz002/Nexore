import React from 'react';

interface GoogleSheetsIconProps {
  size?: number;
  className?: string;
}

export default function GoogleSheetsIcon({ size = 24, className = '' }: GoogleSheetsIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
    >
      {/* Google Sheets Green Document */}
      <path
        d="M14.5 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V7.5L14.5 2Z"
        fill="#0F9D58"
      />
      {/* Folded Top-Right Corner */}
      <path
        d="M14 2V8H20L14 2Z"
        fill="#87CEAC"
      />
      {/* White Grid Container */}
      <rect x="7" y="11" width="10" height="7.5" rx="0.5" fill="white" />
      {/* Green Grid Lines */}
      <path
        d="M7 13.5H17M7 16H17M11.5 11V18.5"
        stroke="#0F9D58"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
