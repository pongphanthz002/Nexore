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

## Step 4: Enable Firestore

1. In Firebase Console, go to "Build" → "Firestore Database"
2. Click "Create database"

## Step 5: Enter the Config in Nexore

- **School Database**: the school admin pastes the config in `/setup/admin`.
- **Teacher Database**: a teacher pastes the config in `/setup/teacher`, or later in the teacher profile → "Firebase Config".
  Nexore checks the config before saving it: the format is validated, then a test document is written, read back and deleted. Firestore Rules must allow this read/write.

No `.env.local` is needed; configs are stored in Firestore and loaded at runtime.

> Changing a teacher's database does not move existing grades or attendance to the new project.
