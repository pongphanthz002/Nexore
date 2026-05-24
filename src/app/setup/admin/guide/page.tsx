'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';

export default function FirebaseSetupGuide() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [language, setLanguage] = useState<'th' | 'en'>('th');
  const [copied, setCopied] = useState(false);
  const fromTeacher = searchParams.get('from') === 'teacher';
  const stepParam = searchParams.get('step');

  const content = {
    th: {
      title: 'คู่มือการเชื่อมต่อ Firebase',
      step1: {
        title: 'ขั้นที่ 1: สร้างโปรเจกต์',
        items: [
          'ไปที่ <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">Firebase Console</a>',
          'คลิก Create a project และตั้งชื่อ Project',
          'คลิก Continue ไปเรื่อย ๆ',
          'เลือก "Default Account for Firebase"',
          'คลิก "Create Project"'
        ]
      },
      step2: {
        title: 'ขั้นที่ 2: สร้าง Firestore Database',
        items: [
          'ในหน้า Firebase Console ไปที่ "Database and Storage"',
          'คลิก "Firestore"',
          'คลิก "Create database"',
          'เลือก "Standard Edition"',
          'เลือก Zone "asia-southest3 (Bangkok)"',
          'เลือก "Start in Production mode"',
          'คลิก "Create"'
        ]
      },
      step3: {
        title: 'ขั้นที่ 3: ตั้งค่า Firestore Rules',
        items: [
          'ในหน้า Firestore ไปที่ Rules',
          'วางสคริปต์นี้แทน'
        ],
        code: `<span class="text-purple-400">rules_version</span> = <span class="text-yellow-400">'2'</span>;
<span class="text-purple-400">service</span> <span class="text-blue-400">cloud.firestore</span> {
  <span class="text-purple-400">match</span> <span class="text-green-400">/databases/{database}/documents</span> {
    <span class="text-pink-400">// Allow all access temporarily for debugging</span>
    <span class="text-purple-400">match</span> <span class="text-green-400">/{document=**}</span> {
      <span class="text-purple-400">allow</span> <span class="text-orange-400">read</span>, <span class="text-orange-400">write</span>: <span class="text-purple-400">if</span> <span class="text-yellow-400">true</span>;
    }
  }
}`
      },
      step4: {
        title: 'ขั้นที่ 4: รับ Firebase Configuration',
        items: [
          'ไปที่ Project Settings (ไอคอนฟันเฟือง) → General',
          'เลื่อนลงไปที่ส่วน "Your apps"',
          'คลิก "Add app" → "Web" (ไอคอน </>)',
          'ตั้งชื่อ แล้วคลิก "Register app"',
          'คัดลอก Firebase Config และนำไปใช้'
        ],
        code: `<span class="text-pink-400">// Import the functions you need from the SDKs you need</span>
<span class="text-purple-400">import</span> { <span class="text-blue-400">initializeApp</span> } <span class="text-purple-400">from</span> <span class="text-green-400">"firebase/app"</span>;
<span class="text-purple-400">import</span> { <span class="text-blue-400">getAnalytics</span> } <span class="text-purple-400">from</span> <span class="text-green-400">"firebase/analytics"</span>;
<span class="text-pink-400">// TODO: Add SDKs for Firebase products that you want to use</span>
<span class="text-pink-400">// https://firebase.google.com/docs/web/setup#available-libraries</span>

<span class="text-pink-400">// Your web app's Firebase configuration</span>
<span class="text-pink-400">// For Firebase JS SDK v7.20.0 and later, measurementId is optional</span>
<span class="text-purple-400">const</span> <span class="text-blue-400">firebaseConfig</span> = {
  <span class="text-orange-400">apiKey</span>: <span class="text-green-400">"API KEY ของคุณ"</span>,
  <span class="text-orange-400">authDomain</span>: <span class="text-green-400">"Auth Domain ของคุณ"</span>,
  <span class="text-orange-400">projectId</span>: <span class="text-green-400">"Project ID ของคุณ"</span>,
  <span class="text-orange-400">storageBucket</span>: <span class="text-green-400">"Storage Bucket ของคุณ"</span>,
  <span class="text-orange-400">messagingSenderId</span>: <span class="text-green-400">"Messaging Sender ID ของคุณ"</span>,
  <span class="text-orange-400">appId</span>: <span class="text-green-400">"App ID ของคุณ"</span>,
  <span class="text-orange-400">measurementId</span>: <span class="text-green-400">"Measurement ID ของคุณ"</span>
};

<span class="text-pink-400">// Initialize Firebase</span>
<span class="text-purple-400">const</span> <span class="text-blue-400">app</span> = <span class="text-blue-400">initializeApp</span>(<span class="text-blue-400">firebaseConfig</span>);
<span class="text-purple-400">const</span> <span class="text-blue-400">analytics</span> = <span class="text-blue-400">getAnalytics</span>(<span class="text-blue-400">app</span>);`
      },
      notes: {
        title: 'หมายเหตุ',
        items: [
          'เก็บ API keys ของคุณให้ปลอดภัย และอย่า commit ไปยัง repository สาธารณะ',
          'ตรวจสอบให้แน่ใจว่า Firestore rules ได้รับการตั้งค่าอย่างถูกต้องก่อนใช้งานแอป',
          'ทดสอบ Firebase configuration ของคุณก่อน deploy ไปยัง production'
        ]
      }
    },
    en: {
      title: 'Firebase Setup Guide',
      step1: {
        title: 'Step 1: Create Project',
        items: [
          'Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">Firebase Console</a>',
          'Click "Create a project" and name your project',
          'Click "Continue" to proceed',
          'Select "Default Account for Firebase"',
          'Click "Create Project"'
        ]
      },
      step2: {
        title: 'Step 2: Create Firestore Database',
        items: [
          'In Firebase Console, go to "Database and Storage"',
          'Click "Firestore"',
          'Click "Create database"',
          'Select "Standard Edition"',
          'Select Zone "asia-southest3 (Bangkok)"',
          'Select "Start in Production mode"',
          'Click "Create"'
        ]
      },
      step3: {
        title: 'Step 3: Set Firestore Rules',
        items: [
          'In Firestore page, go to Rules',
          'Paste this script instead'
        ],
        code: `<span class="text-purple-400">rules_version</span> = <span class="text-yellow-400">'2'</span>;
<span class="text-purple-400">service</span> <span class="text-blue-400">cloud.firestore</span> {
  <span class="text-purple-400">match</span> <span class="text-green-400">/databases/{database}/documents</span> {
    <span class="text-pink-400">// Allow all access temporarily for debugging</span>
    <span class="text-purple-400">match</span> <span class="text-green-400">/{document=**}</span> {
      <span class="text-purple-400">allow</span> <span class="text-orange-400">read</span>, <span class="text-orange-400">write</span>: <span class="text-purple-400">if</span> <span class="text-yellow-400">true</span>;
    }
  }
}`
      },
      step4: {
        title: 'Step 4: Get Firebase Configuration',
        items: [
          'Go to Project Settings (gear icon) → General',
          'Scroll down to "Your apps" section',
          'Click "Add app" → "Web" (</> icon)',
          'Name your app and click "Register app"',
          'Copy Firebase Config and use it'
        ],
        code: `<span class="text-pink-400">// Import the functions you need from the SDKs you need</span>
<span class="text-purple-400">import</span> { <span class="text-blue-400">initializeApp</span> } <span class="text-purple-400">from</span> <span class="text-green-400">"firebase/app"</span>;
<span class="text-purple-400">import</span> { <span class="text-blue-400">getAnalytics</span> } <span class="text-purple-400">from</span> <span class="text-green-400">"firebase/analytics"</span>;
<span class="text-pink-400">// TODO: Add SDKs for Firebase products that you want to use</span>
<span class="text-pink-400">// https://firebase.google.com/docs/web/setup#available-libraries</span>

<span class="text-pink-400">// Your web app's Firebase configuration</span>
<span class="text-pink-400">// For Firebase JS SDK v7.20.0 and later, measurementId is optional</span>
<span class="text-purple-400">const</span> <span class="text-blue-400">firebaseConfig</span> = {
  <span class="text-orange-400">apiKey</span>: <span class="text-green-400">"Your API KEY"</span>,
  <span class="text-orange-400">authDomain</span>: <span class="text-green-400">"Your Auth Domain"</span>,
  <span class="text-orange-400">projectId</span>: <span class="text-green-400">"Your Project ID"</span>,
  <span class="text-orange-400">storageBucket</span>: <span class="text-green-400">"Your Storage Bucket"</span>,
  <span class="text-orange-400">messagingSenderId</span>: <span class="text-green-400">"Your Messaging Sender ID"</span>,
  <span class="text-orange-400">appId</span>: <span class="text-green-400">"Your App ID"</span>,
  <span class="text-orange-400">measurementId</span>: <span class="text-green-400">"Your Measurement ID"</span>
};

<span class="text-pink-400">// Initialize Firebase</span>
<span class="text-purple-400">const</span> <span class="text-blue-400">app</span> = <span class="text-blue-400">initializeApp</span>(<span class="text-blue-400">firebaseConfig</span>);
<span class="text-purple-400">const</span> <span class="text-blue-400">analytics</span> = <span class="text-blue-400">getAnalytics</span>(<span class="text-blue-400">app</span>);`
      },
      notes: {
        title: 'Important Notes',
        items: [
          'Keep your API keys secure and don\'t commit them to public repositories',
          'Make sure Firestore rules are properly configured before using the app',
          'Test your Firebase configuration before deploying to production'
        ]
      }
    }
  };

  const t = content[language];

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl"
      >
        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-2 text-gray-500 hover:text-black transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          BACK
        </motion.button>

        {/* Content */}
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h1 className="text-3xl font-bold text-black mb-8">{t.title}</h1>

          <div className="space-y-8 text-gray-700">
            <div>
              <h2 className="text-xl font-bold text-black mb-4">{t.step1.title}</h2>
              <ol className="list-decimal list-inside space-y-2">
                {t.step1.items.map((item, index) => (
                  <li key={index} dangerouslySetInnerHTML={{ __html: item }} />
                ))}
              </ol>
            </div>

            <div>
              <h2 className="text-xl font-bold text-black mb-4">{t.step2.title}</h2>
              <ol className="list-decimal list-inside space-y-2">
                {t.step2.items.map((item, index) => (
                  <li key={index} dangerouslySetInnerHTML={{ __html: item }} />
                ))}
              </ol>
            </div>

            <div>
              <h2 className="text-xl font-bold text-black mb-4">{t.step3.title}</h2>
              <ol className="list-decimal list-inside space-y-2 mb-4">
                {t.step3.items.map((item, index) => (
                  <li key={index} dangerouslySetInnerHTML={{ __html: item }} />
                ))}
              </ol>
              <div className="relative">
                <button
                  onClick={() => handleCopy(t.step3.code.replace(/<[^>]*>/g, ''))}
                  className="absolute top-2 right-2 p-2 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                  title="Copy to clipboard"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <pre className="bg-gray-900 p-4 rounded-lg text-sm overflow-x-auto">
                  <code dangerouslySetInnerHTML={{ __html: t.step3.code }} />
                </pre>
              </div>
              {copied && (
                <div className="mt-2 text-sm text-green-600">
                  คัดลอกไปยังคลิปบอร์ดแล้ว
                </div>
              )}
            </div>

            <div>
              <h2 className="text-xl font-bold text-black mb-4">{t.step4.title}</h2>
              <ol className="list-decimal list-inside space-y-2 mb-4">
                {t.step4.items.map((item, index) => (
                  <li key={index} dangerouslySetInnerHTML={{ __html: item }} />
                ))}
              </ol>
              <pre className="bg-gray-900 p-4 rounded-lg text-sm overflow-x-auto">
                <code dangerouslySetInnerHTML={{ __html: t.step4.code }} />
              </pre>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-lg font-bold text-black mb-3">{t.notes.title}</h2>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {t.notes.items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Language Selector - Floating */}
      <button
        onClick={() => setLanguage(language === 'th' ? 'en' : 'th')}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-colors bg-gray-200 text-gray-700 hover:bg-black hover:text-white border border-gray-300 shadow-lg font-bold text-sm"
        title={language === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
      >
        {language === 'th' ? 'TH' : 'EN'}
      </button>
    </div>
  );
}
