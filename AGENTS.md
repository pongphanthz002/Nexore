# Nexore System Architecture

## Overview

Nexore is a distributed education management system using Firebase multi-instance architecture. The system is designed to support multiple schools, teachers, and students with data isolation at multiple levels.

## System Architecture

### Firebase Multi-Instance Pattern

The system uses three levels of Firebase instances:

1. **Master Registry** (Central Firestore)
   - Single Firebase instance for the entire system
   - Manages authentication and hub configuration
   - Stores user mappings and school configurations

2. **School Database** (Per School)
   - One Firebase instance per school
   - Stores basic teacher and student information
   - Managed by school administrators

3. **Teacher Database** (Per Teacher)
   - One Firebase instance per teacher
   - Stores detailed student data (grades, assignments, etc.)
   - Managed by individual teachers

### Data Flow

```
User Login → Master Registry → School Database → Teacher Database
                (Auth)           (Basic Info)       (Detailed Data)
```

## Data Storage Strategy

### Master Registry (Firestore)

**Collections:**
- `users`: Email → schoolId, uid, role mapping
- `hubs`: SchoolId → schoolFirebaseConfig mapping

**Purpose:**
- Central authentication
- Hub configuration management
- User routing to appropriate databases

**Example Data:**
```javascript
// users collection
{
  email: "teacher@example.com",
  schoolId: "school-123",
  uid: "firebase-uid",
  role: "teacher"
}

// hubs collection
{
  id: "school-123",
  name: "School Name",
  schoolId: "school-123",
  schoolFirebaseConfig: {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  }
}
```

### School Database (Per School)

**Collections:**
- `teachers`: Teacher basic info and Firebase config
- `students`: Student basic info and teacherNodes
- `admins`: School administrators

**Purpose:**
- Store basic user information
- Manage teacher/student whitelists
- Link students to their teachers via teacherNodes

**Example Data:**
```javascript
// teachers collection
{
  teacherId: "T001",
  name: "Teacher Name",
  email: "teacher@example.com",
  uid: "firebase-uid",
  role: "teacher",
  firebaseConfig: {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  },
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01"
}

// students collection
{
  studentId: "S001",
  name: "Student Name",
  email: "student@example.com",
  uid: "firebase-uid",
  role: "student",
  class: "M.1",
  number: "1",
  schoolId: "school-123",
  teacherNodes: ["T001", "T002"], // Teachers this student learns from
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01"
}
```

### Teacher Database (Per Teacher)

**Collections:**
- `grades`: Student grades/scores
- `assignments`: Student assignments
- `attendance`: Student attendance records
- `schedules`: Class schedules
- `materials`: Learning materials

**Purpose:**
- Store detailed student data
- Manage academic records
- Track student progress

**Important Notes:**
- Email and UID are NOT stored in Teacher Database
- studentId is the primary key for all data
- Collection names and data structures are TBD (to be defined)

## Authentication Flow

### 1. Google Sign-in
```
User clicks "Sign in with Google"
→ Firebase Auth handles authentication
→ Returns user object with email and uid
```

### 2. User Mapping Lookup
```
AuthContext checks Master Registry
→ Query users collection by email
→ Returns schoolId, uid, role
```

### 3. Hub Configuration Lookup
```
Query hubs collection by schoolId
→ Returns schoolFirebaseConfig
→ Used to access School Database
```

### 4. Identity Verification
```
Based on role:
- Admin: Verify in School Database admins collection
- Teacher: Verify in School Database teachers collection
- Student: Verify in School Database students collection
```

### 5. Dashboard Routing
```
Based on role:
- Admin: Redirect to /teacher/dashboard (default, can switch to /admin/dashboard)
- Teacher: Redirect to /teacher/dashboard
- Student: Redirect to /student/dashboard
```

## Data Isolation Patterns

### Student Data Isolation

**Principle:** Students can only see their own data based on studentId.

**Implementation:**
1. Student logs in → gets studentId from School Database
2. Student's teacherNodes array determines which Teacher databases to query
3. For each teacher in teacherNodes:
   - Get teacher's firebaseConfig from School Database
   - Query Teacher Database using studentId as filter
4. Merge and display data from all teachers

**Example:**
```javascript
// Student S001 learns from teachers T001 and T002
student.teacherNodes = ["T001", "T002"]

// Data fetching:
1. Get T001's firebaseConfig from School Database
2. Query T001's Teacher Database for studentId "S001"
3. Get T002's firebaseConfig from School Database
4. Query T002's Teacher Database for studentId "S001"
5. Merge results
```

### Teacher Data Isolation

**Principle:** Each teacher has their own Firebase instance, ensuring complete data isolation.

**Implementation:**
- Teacher setup requires entering their own Firebase config
- Teacher's firebaseConfig is stored in School Database
- Teacher dashboard uses teacher's own firebaseConfig
- No data sharing between teachers

**Example:**
```javascript
// Teacher T001 has their own Firebase instance
teacher.firebaseConfig = {
  apiKey: "T001-api-key",
  projectId: "T001-project",
  // ...
}

// Teacher T002 has a different Firebase instance
teacher.firebaseConfig = {
  apiKey: "T002-api-key",
  projectId: "T002-project",
  // ...
}
```

## Workflows

### Admin Setup

1. **School ID Input:** Enter school ID
2. **Firebase Config:** Enter school's Firebase config
3. **Registration:** Save to Master Registry (hubs collection)
4. **Whitelist Management:** Upload teacher/student lists

### Teacher Setup

1. **School ID Input:** Enter school ID
2. **ID Verification:** Enter teacher ID (must exist in School Database)
3. **Firebase Config:** Enter teacher's own Firebase config
4. **Registration:**
   - Save to Master Registry (users collection)
   - Save to School Database (teachers collection with firebaseConfig)
5. **Redirect:** Go to /teacher/dashboard

### Student Setup

1. **School ID Input:** Enter school ID
2. **ID Verification:** Enter student ID (must exist in School Database)
3. **Registration:**
   - Save to Master Registry (users collection)
   - Update School Database (students collection with email, uid)
4. **Redirect:** Go to /student/dashboard

### Data Fetching (Student)

1. **Get Student Info:** Fetch from School Database using schoolFirebaseConfig
2. **Get teacherNodes:** Extract teacherNodes array from student data
3. **For Each Teacher:**
   - Get teacher's firebaseConfig from School Database
   - Query Teacher Database using studentId
4. **Merge Data:** Combine data from all teachers
5. **Display:** Show only data for the logged-in student

### Whitelist Management

**Teacher Whitelist:**
- Upload Excel file with teacher list
- Preserves email, uid, role for existing teachers
- Updates name and other fields
- Does NOT overwrite firebaseConfig (set during teacher setup)

**Student Whitelist:**
- Upload Excel file with student list
- Preserves email, uid, role for existing students
- Updates name, class, number, teacherNodes
- Does NOT overwrite email/uid if already set

## Naming Conventions

### File Naming
- Pattern: `<System>.<Component>.<kind>.ts(x)`
- Example: `school-database.service.ts`, `AuthContext.tsx`

### Folder Naming
- Use PascalCase
- Example: `services`, `contexts`, `hooks`

### Component Naming
- Screens: `.screen.tsx` (UI only, no direct database calls)
- Services: `.service.ts` (business logic, database access)
- Components: `.tsx` (reusable UI components)

### Storage Keys
- All storage keys MUST be in `Storage.keys.ts`
- Use NEXORE_ prefix
- Example: `NEXORE_USER_IDENTITY`, `NEXORE_MASTER_REGISTRY_CONFIG`

## Important Notes

### Data Isolation
- **Email and UID are NOT stored in Teacher Database**
- **studentId is the primary key for all data fetching in Teacher Database**
- **teacherNodes determines which Teacher databases a student can access**

### Security
- Always verify that the logged-in user's ID matches the requested data ID
- Use Firebase Security Rules to enforce server-side filtering
- Never fetch all data and filter on client-side

### Firebase Multi-Instance
- Each Firebase instance is identified by its projectId
- Use `firebaseManager.getInstance(config, instanceId)` to get specific instance
- Always pass the correct firebaseConfig when accessing databases

### Data Preservation
- Whitelist updates preserve email, uid, role for existing users
- Teacher setup is the only way to set teacher's firebaseConfig
- Student setup updates email and uid in School Database

## Service Files

### firestore.service.ts
- Access Master Registry
- Manage user accounts (email → schoolId mapping)
- Manage hub configurations (schoolId → schoolFirebaseConfig)

### school-database.service.ts
- Access School Database
- Manage teacher/student whitelists
- Get teacher firebaseConfig
- Get student teacherNodes

### teacher-database.service.ts (TBD)
- Access Teacher Database
- Fetch student data by studentId
- Manage grades, assignments, attendance, etc.

### storage.service.ts
- Local storage management
- User identity persistence
- Master Registry config caching

## Future Considerations

### Teacher Database Collections
Collection names and data structures for Teacher Database are TBD and will be defined in future discussions:
- Grades/Scores
- Assignments
- Attendance
- Schedules
- Learning Materials

### Data Fetching Implementation
Phase 1 (Foundation): Create service structure and helper functions
Phase 2 (Implementation): Implement specific data fetching when collections are defined
