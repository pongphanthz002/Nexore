# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # Next.js dev server on :3000 (PWA/service worker disabled in dev)
npm run build   # Production build (generates the PWA service worker into public/)
npm start       # Serve the production build
npm run lint    # next lint (extends next/core-web-vitals)
```

There is no test framework configured (no jest/vitest, no test files). Verify changes with `npm run lint`, `npx tsc --noEmit`, and by exercising the UI. `public/sw.js` and other `public/` workbox files are build output from `@ducanh2912/next-pwa`; don't hand-edit them.

No `.env` is needed (`.env.example` is a leftover): school and teacher configs come from Firestore at runtime. Production builds strip `console.log` (`compiler.removeConsole` in `next.config.mjs`); use `console.error`/`warn` for anything that must survive. The Master Registry config is hardcoded in `src/config/master-registry.config.ts` (do not modify it casually — it points at the shared `nexore-hub` project).

Stack: Next.js 14 App Router, React 18, TypeScript (strict), Tailwind, Framer Motion, Firebase v10 client SDK, `exceljs`/`xlsx` for whitelist import/grade export. Path alias `@/*` → `src/*`. UI copy is primarily Thai.

## Architecture

Nexore is a **client-only, multi-tenant, multi-Firebase-project** app. There is no backend/API layer: every page talks to Firestore directly from the browser. Data is split across three tiers of separate Firebase projects, and the app connects to the right one at runtime using configs it reads from the tier above. `AGENTS.md` has the full data model and workflows — read it before changing data flow.

1. **Master Registry** (`nexore-hub`, hardcoded): `users/{uid}` → `{email, schoolId, role, userId}` and `hubs/{schoolId}` → `schoolFirebaseConfig`. Legacy `users/{email}` docs are still read and migrated to `users/{uid}` on login (`firestoreService.getUserMapping`); admin-created accounts without a UID are written email-keyed until the owner logs in. Accessed via `firestore.service.ts`. Also the only Firebase Auth instance (Google sign-in).
2. **School DB** (one project per school): `teachers`, `students`, `admins`, `subjects`. Accessed via `school-database.service.ts`. Each teacher doc also stores that teacher's own `firebaseConfig`.
3. **Teacher DB** (one project per teacher): `attendance` (one doc per session, all students' records), `attendanceSummaries/{subjectId}` (every session × student status, kept in sync by `saveAttendance` and rebuilt by `ensureAttendanceSummary` whenever the teacher loads a subject's sessions), `gradeConfigs`, `assignments`, `assignmentGroups`, `studentScores`, keyed by `studentId`/`subjectId`. Accessed via `teacher-database.service.ts`. Every method takes the teacher's `firebaseConfig` as its first argument.

Student reads fan out: `student-database.service.ts` loads the student's subjects (`getSubjectsForStudent`: classroom query + `studentIds array-contains`), resolves the teachers of those subjects (`subjects.teacherId`, not `teacherNodes`), then queries each Teacher DB by `studentId` and merges results. Attendance comes from the subject's summary doc (1 read); it falls back to scanning sessions only if no summary exists yet. Only teachers with a `uid` (registered) are queried and shown on the student subjects page (`isActiveTeacher`); the timetable shows every teacher's subjects. A registered teacher without their own `firebaseConfig` stores data in the School DB (the `firebaseConfig || schoolFirebaseConfig` fallback is intentional).

### Key mechanisms

- **`src/lib/firebase.ts` — `firebaseManager`**: caches `{app, auth, db}` per instance. Use `firebaseManager.getSchoolDb(config)` / `getTeacherDb(config)` — never `getFirestore()` or hand-built instance names. Both name instances `db-${projectId}`, so a teacher on the school DB shares one app. Teacher instances are capped (LRU, 15) and released with `deleteApp`; `clearAllInstances()` (sign out) keeps only the master. The module-level `db`/`auth` exports are the **Master Registry**, not a school DB.
- **`src/contexts/AuthContext.tsx`**: resolves uid → master mapping → hub (`getHubCached`, localStorage 24h) → `schoolDatabaseService.findMember` (doc read by `mapping.userId`, then uid query, then email query). Exposes `authStatus` (`ready` / `not-registered` / `not-in-whitelist` / `offline-error` / `error`); `LoginSignup` and `useIdentityCheck` route from it and must not re-query Firestore. The account is cached stale-while-revalidate (`NEXORE_USER_ACCOUNT`, shown immediately up to 7 days, re-checked in the background after 30 min; network failures keep the cached account). `setUserAccount` writes the cache; call `invalidateCache()` after changing a user's role/mapping. Set `setSignupValidation(true)` before a signup-time sign-out.
- **Read budget**: `src/lib/firestore-helpers.ts` provides `TtlCache`, `dedupe`, `withRetry`, `allowAction` (button cooldown). School rosters/subjects are cached 5 min in `schoolDatabaseService` and invalidated by its own writes — pass `forceRefresh` only for explicit user refreshes. Per-student subject context is cached 5 min and the subjects overview 2 min in `studentDatabaseService`. `getAll*` (whole collections) is for admin roster screens and the teacher profile's elective picker only. Teacher screens use `getSubjectsForTeacher` + `getStudentsForSubjects`; student screens use `getStudentForAccount`, `getSubjectsForStudent`, `getTeachersByIds`.
- **Role routing**: `/admin/dashboard`, `/teacher/dashboard`, `/student/dashboard` (admins default to the teacher dashboard and can switch via `/role-switcher`). `/setup/{admin,teacher,student}` are the registration flows that write to Master Registry and School DB; admin setup registers the school hub; teacher setup sets a teacher's first `firebaseConfig` (later changes go through the profile popup below).
- **Changing a teacher's DB** happens only in the teacher profile "Firebase Config" popup: `teacherDatabaseService.validateConfigShape` (format, appId/senderId/authDomain consistency, not nexore-hub or the school project) → `verifyConnection` (write/read/delete a doc in `_nexore_connection_check` on a throwaway app) → typed confirmation → `schoolDatabaseService.updateTeacherFirebaseConfig`. Save is disabled unless the form still matches the validated config. Existing data is not migrated.
- **Whitelist uploads** (Excel) write with `merge: true` and only whitelist-owned fields (`name`, `class`, `number`, …). They must never write `email`/`uid`/`role`/`firebaseConfig` on existing docs, and `teacherNodes` only when the row provides it. `saveStudentWhitelist` returns `unknownTeacherIds` for the admin warning.

### Conventions (from AGENTS.md)

- Files: `<name>.service.ts` for DB access/business logic; `.screen.tsx` for UI-only screens with no DB calls; folders PascalCase. In practice the repo uses kebab-case `*.service.ts` and `page.tsx` files that call services directly — follow the surrounding file.
- Storage keys live in `src/config/storage.keys.ts` (`STORAGE_KEYS`); add new keys there.
- Email/UID are never stored in Teacher DBs; `studentId` is the primary key there.
- Never fetch a whole collection and filter client-side for student-scoped data.

## Things to know before touching security or data

- `firestore-rules/` contains reference rules, but `master-registry.rules` and `school-database.rules` are `allow read, write: if true` ("temporarily for debugging"), and `teacher-database.rules` only covers `subjects` and `media`. Role/ownership is enforced only in client code. Don't assume server-side protection when reasoning about access, and don't loosen anything further.
- Service methods take a typed `FirebaseConfig` (`src/types/firebase.types.ts`), but nothing distinguishes school from teacher configs at the type level — passing the wrong tier's config silently reads the wrong project. `userAccount.schoolFirebaseConfig` is always the **school** config; a teacher's own DB comes from their teacher record.
- Teacher `firebaseConfig` is hidden in the admin UI but still stored on the teacher doc (students need it). Rate limiting is client-side only; Security Rules / App Check / auth on school and teacher projects are still to do.

## Known gaps (not yet fixed)

- Security Rules (see above) — deferred until teachers can update rules in their own projects.
- Deleting a student (`studentDatabaseService.deleteStudentCompletely`) removes their scores and attendance-summary entries in every Teacher DB found via their subjects, but their rows inside past `attendance` session docs remain (the recorded class roster).
- `react-hooks/exhaustive-deps` lint warnings across pages (load functions defined inline and omitted from effect deps).

## UI

`SKILLS.md` is a "Liquid Glass" UI guide (glassmorphism via backdrop-blur, spring animations with Framer Motion). Recent commits moved the student UI to a red/white minimal style with one subject per row, so check the surrounding screens before applying it. The app is a PWA used on phones (iOS Safari edge-swipe-back is suppressed globally in `AuthContext`), so keep layouts mobile-first.
