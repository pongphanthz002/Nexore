# Nexore - Learning Management System

ระบบจัดการการเรียนรู้แบบกระจายศูนย์ (Decentralized Learning Management System) สำหรับนักเรียน ครู และผู้ดูแลระบบ

## Features

- **นักเรียน**: เข้าถึงแหล่งเรียนรู้ ตรวจสอบคะแนน และดูเวลาเรียน
- **ครู**: บันทึกคะแนน เช็คชื่อ และอัพสื่อการเรียนรู้
- **ผู้ดูแลระบบ**: จัดการผู้ใช้ ห้องเรียน และรายงานระบบ

## Tech Stack

- **Next.js 14** - React Framework
- **TypeScript** - Type Safety
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Firebase** - Authentication & Firestore Database
- **PWA** - Progressive Web App support

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd Nexore
```

2. Install dependencies
```bash
npm install
```

3. Set up Firebase

   a. Go to [Firebase Console](https://console.firebase.google.com/)
   
   b. Create a new project
   
   c. Enable Authentication:
      - Go to Authentication > Sign-in method
      - Enable Email/Password
   
   d. Enable Firestore:
      - Go to Firestore Database
      - Create database
   
   e. Get Firebase configuration:
      - Go to Project Settings > General
      - Scroll to "Your apps" section
      - Copy the configuration values

4. Create `.env.local` file in the root directory:
```bash
cp .env.example .env.local
```

5. Update `.env.local` with your Firebase configuration:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── admin/        # Admin dashboard
│   ├── student/      # Student dashboard
│   ├── teacher/      # Teacher dashboard
│   ├── layout.tsx    # Root layout
│   ├── page.tsx      # Home page
│   └── globals.css   # Global styles
├── contexts/         # React contexts
│   └── AuthContext.tsx  # Authentication context
└── lib/              # Utility libraries
    └── firebase.ts   # Firebase configuration
```

## PWA Support

This app is configured as a Progressive Web App. To test PWA features:

1. Build the production version
2. Serve the app using HTTPS (required for PWA)
3. Install the app on your device

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase App ID |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
