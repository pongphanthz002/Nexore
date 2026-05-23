# Firebase Setup Guide

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name (e.g., "nexore")
4. Follow the setup wizard

## Step 2: Enable Authentication

1. In Firebase Console, go to "Build" → "Authentication"
2. Click "Get Started"
3. Enable "Google" sign-in method
4. Add your domain to authorized domains (localhost for development)

## Step 3: Get Configuration

1. In Firebase Console, go to Project Settings (gear icon)
2. Scroll down to "Your apps" section
3. Click the web icon (</>)
4. Register app (name it "Nexore")
5. Copy the firebaseConfig object

## Step 4: Create .env.local File

Create a file named `.env.local` in the project root with the following content:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id_here
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here
```

Replace the values with your actual Firebase configuration.

## Step 5: Restart Development Server

After creating `.env.local`, restart the dev server:

```bash
npm run dev
```

## Note

The `.env.local` file is already in `.gitignore` to protect your credentials. Never commit this file to version control.
