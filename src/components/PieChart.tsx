'use client';

import { motion } from 'framer-motion';

interface PieChartProps {
  label: string;
  total: number;
  signedUp: number;
  color: string;
  bgColor: string;
  unsignedColor: string;
  isDark: boolean;
}

const PieChart = ({ label, total, signedUp, color, bgColor, unsignedColor, isDark }: PieChartProps) => {
  const percentage = total > 0 ? (signedUp / total) * 100 : 0;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle (unsigned) */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill={unsignedColor}
          />
          {/* Pie slice (signed up) - using stroke to create pie effect */}
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={radius * 2}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: "easeOut" }}
            style={{
              strokeDasharray: circumference,
            }}
          />
        </svg>
        {/* Center text - signed up count */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-white">{signedUp}</span>
        </div>
      </div>
      <p className={`mt-3 text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-700'}`}>{label}</p>
      <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>ทั้งหมด: {total}</p>
    </div>
  );
};

export default PieChart;
