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

3. Firebase

   No `.env` file is needed. The app connects to three kinds of Firebase projects:

   | Project | Who creates it | How the app gets its config |
   |---------|----------------|-----------------------------|
   | **Master Registry** (`nexore-hub`) | System developer | Hardcoded in `src/config/master-registry.config.ts` |
   | **School Database** | School admin | Entered in `/setup/admin`, stored in the Master Registry `hubs` collection |
   | **Teacher Database** (optional) | Each teacher | Entered in `/setup/teacher` or the teacher profile ("Firebase Config"), stored on the teacher record in the School Database |

   For School and Teacher projects, create a Firebase project with a **Firestore Database** and a **Web app**, then paste its config into the setup page. See [FIREBASE_SETUP.md](FIREBASE_SETUP.md). Teachers without their own project store their data in the School Database.

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
├── app/              # Next.js App Router pages (admin/, teacher/, student/, setup/)
├── components/       # Shared UI components
├── config/           # Master Registry config, localStorage keys
├── contexts/         # AuthContext (sign-in + account resolution)
├── hooks/
├── lib/              # firebaseManager (multi-project), Firestore helpers (cache/retry)
├── services/         # Data access per tier: firestore (master), school-database,
│                     # teacher-database, student-database
└── types/
```

See [AGENTS.md](AGENTS.md) for the data model and [CLAUDE.md](CLAUDE.md) for architecture notes.

## PWA Support

This app is configured as a Progressive Web App. To test PWA features:

1. Build the production version
2. Serve the app using HTTPS (required for PWA)
3. Install the app on your device

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
