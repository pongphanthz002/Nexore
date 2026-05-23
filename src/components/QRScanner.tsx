'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
  autoStart?: boolean;
}

export default function QRScanner({ onScan, onError, autoStart = true }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string>('');
  const [isHttps, setIsHttps] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  useEffect(() => {
    // Check if running in HTTPS (required for camera access)
    setIsHttps(window.location.protocol === 'https:' || window.location.hostname === 'localhost');
  }, []);

  useEffect(() => {
    return () => {
      if (scannerRef.current && isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [isScanning]);

  // Auto-start camera on mount
  useEffect(() => {
    if (autoStart && isHttps && !showManualInput) {
      startScanning();
    }
  }, [autoStart, isHttps, showManualInput]);

  const startScanning = async () => {
    try {
      setError('');
      setIsInitializing(true);
      
      // Check HTTPS requirement
      if (!isHttps) {
        throw new Error('Camera access requires HTTPS. Please use a secure connection.');
      }

      // Clear previous scanner if exists
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
          scannerRef.current = null;
        } catch (e) {
          // Ignore if already stopped
          console.log('Previous scanner stopped');
        }
      }

      // Small delay to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await scanner.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          console.log('QR scanned:', decodedText);
          onScan(decodedText);
          stopScanning();
        },
        (errorMessage) => {
          // Ignore scan errors, they're normal during scanning
          console.log('Scan error (normal):', errorMessage);
        }
      );

      setIsScanning(true);
      setIsInitializing(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start camera';
      console.error('Scanner error:', err);
      setError(errorMsg);
      setIsInitializing(false);
      setIsScanning(false);
      onError?.(errorMsg);
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        setIsScanning(false);
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
    }
  };

  return (
    <div className="flex flex-col items-center">
      {!showManualInput ? (
        <>
          <div id="qr-reader" className="w-full max-w-md bg-gray-900 rounded-lg overflow-hidden" style={{ minHeight: '300px' }}>
            {!isScanning && !isInitializing && (
              <div className="flex items-center justify-center h-[300px] text-gray-400">
                <div className="text-center">
                  <div className="text-4xl mb-2">📷</div>
                  <p>กำลังเปิดกล้อง...</p>
                  {!isHttps && (
                    <p className="text-red-400 text-sm mt-2">
                      ⚠️ ต้องใช้ HTTPS เพื่อเข้าถึงกล้อง
                    </p>
                  )}
                </div>
              </div>
            )}
            {isInitializing && (
              <div className="flex items-center justify-center h-[300px] text-gray-400">
                <div className="text-center">
                  <div className="animate-spin text-4xl mb-2">⏳</div>
                  <p>กำลังเปิดกล้อง...</p>
                </div>
              </div>
            )}
          </div>
          
          {error && (
            <div className="mt-4 p-4 bg-red-900 border border-red-500 rounded-lg text-white">
              <p className="font-bold mb-1">เกิดข้อผิดพลาด:</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {isScanning && (
            <button
              onClick={stopScanning}
              className="mt-4 px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors"
            >
              หยุดสแกน
            </button>
          )}

          <button
            onClick={() => setShowManualInput(true)}
            className="mt-4 text-gray-400 text-sm underline hover:text-white transition-colors"
          >
            หรือกรอก School ID ด้วยตนเอง
          </button>
        </>
      ) : (
        <div className="w-full max-w-md bg-gray-900 rounded-lg p-6">
          <h3 className="text-white font-bold mb-4">กรอก School ID</h3>
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="ใส่ School ID หรือ QR Code"
            className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors mb-4"
          />
          <div className="flex gap-4">
            <button
              onClick={handleManualSubmit}
              disabled={!manualInput.trim()}
              className="flex-1 px-6 py-3 bg-neon-glow text-black font-bold rounded-lg hover:bg-neon-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ยืนยัน
            </button>
            <button
              onClick={() => setShowManualInput(false)}
              className="flex-1 px-6 py-3 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition-colors"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
