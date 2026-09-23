import { firebaseManager } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, query, where, Firestore } from 'firebase/firestore';
import { schoolDatabaseService, StudentData, SubjectData, TeacherFirebaseConfig } from './school-database.service';
import { teacherDatabaseService, AttendanceData, StudentScore, Assignment, GradeConfig } from './teacher-database.service';

export interface StudentSubjectInfo {
  subjectId: string;
  subjectName: string;
  classroom: string;
  teacherId: string;
  teacherName: string;
  day: string;
  time: string;
  duration?: string;
  schedules?: Array<{ day: string; time: string }>;
}

export interface StudentGradeInfo {
  subjectId: string;
  subjectName: string;
  classroom: string;
  collectedScore: number;
  midtermScore: number;
  finalScore: number;
  totalScore: number;
  grade: string;
  unsent: number;
  details: any[];
}

export interface StudentAttendanceInfo {
  subjectId: string;
  subjectName: string;
  classroom: string;
  totalHours: string;
  attended: string;
  absent: string;
  late: string;
  percentage: string;
  history: any[];
  counts: any;
  maxStreak: number;
  absentByDay: Record<string, any>;
}

class StudentDatabaseService {
  /**
   * Get student's schedule from School Database (Admin Data)
   * Filters subjects by student's class
   */
  async getStudentSchedule(schoolFirebaseConfig: any, studentData: StudentData): Promise<SubjectData[]> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const querySnapshot = await getDocs(collection(database, 'subjects'));
    const allSubjects = querySnapshot.docs.map(doc => doc.data() as SubjectData);
    
    console.log('All subjects from school DB:', allSubjects);
    console.log('Student class:', studentData.class);
    
    // Filter subjects by student's class (exact match)
    const classSubjects = allSubjects.filter(
      subject => subject.classroom === studentData.class
    );
    
    console.log('Subjects for student class:', classSubjects);
    
    // Return all subjects for the student's class (temporarily remove teacher filter)
    return classSubjects;
  }

  /**
   * Helper: Get school database instance
   */
  private getSchoolDB(schoolFirebaseConfig: any): Firestore {
    const instance = firebaseManager.getInstance(schoolFirebaseConfig, `school-${schoolFirebaseConfig.projectId}`);
    return instance.db;
  }

  /**
   * Get student's subjects from School Database (Admin Data)
   * Filters subjects by student's class
   * Returns unique subjects (one card per subject, not per period)
   */
  async getStudentSubjects(
    schoolFirebaseConfig: any,
    studentData: StudentData
  ): Promise<StudentSubjectInfo[]> {
    const subjects: StudentSubjectInfo[] = [];

    // Get all subjects from school database
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const querySnapshot = await getDocs(collection(database, 'subjects'));
    const allSubjects = querySnapshot.docs.map(doc => doc.data() as SubjectData);
    
    console.log('All subjects from school DB:', allSubjects);
    console.log('Student class:', studentData.class);
    
    // Filter subjects by student's class (exact match)
    const classSubjects = allSubjects.filter(
      subject => subject.classroom === studentData.class
    );
    
    console.log('Subjects for student class:', classSubjects);
    
    // Get all teachers to add teacher names
    const teachers = await schoolDatabaseService.getAllTeachersOptimized(schoolFirebaseConfig);
    
    // Group by subjectName and teacherId to get unique subjects with multiple schedules
    const uniqueSubjectsMap = new Map<string, { subject: SubjectData; schedules: Array<{ day: string; time: string }> }>();
    for (const subject of classSubjects) {
      const key = `${subject.subjectName}-${subject.teacherId}`;
      if (!uniqueSubjectsMap.has(key)) {
        uniqueSubjectsMap.set(key, { subject, schedules: [{ day: subject.day, time: subject.time }] });
      } else {
        uniqueSubjectsMap.get(key)!.schedules.push({ day: subject.day, time: subject.time });
      }
    }

    // Add teacher names to unique subjects
    const uniqueSubjects = Array.from(uniqueSubjectsMap.values());
    for (const { subject, schedules } of uniqueSubjects) {
      const teacher = teachers.find(t => t.teacherId === subject.teacherId);
      subjects.push({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        classroom: subject.classroom,
        teacherId: subject.teacherId,
        teacherName: teacher?.name || '-',
        day: subject.day,
        time: subject.time,
        duration: subject.duration,
        schedules: schedules,
      });
    }

    console.log('Unique subjects:', subjects);
    return subjects;
  }

  /**
   * Get student's grades from teacher databases
   * Fetches grades from each teacher's database based on teacherNodes
   * Uses studentId from Admin Data (studentData.studentId)
   */
  async getStudentGrades(
    schoolFirebaseConfig: any,
    studentData: StudentData
  ): Promise<StudentGradeInfo[]> {
    const grades: StudentGradeInfo[] = [];

    console.log('getStudentGrades - studentData.teacherNodes:', studentData.teacherNodes);

    // Get subjects to find teacherIds
    const subjects = await this.getStudentSubjects(schoolFirebaseConfig, studentData);
    const teacherIds = Array.from(new Set(subjects.map(s => s.teacherId)));

    console.log('getStudentGrades - teacherIds from subjects:', teacherIds);

    // Get all teachers from school database
    const teachers = await schoolDatabaseService.getAllTeachersOptimized(schoolFirebaseConfig);

    console.log('getStudentGrades - all teachers:', teachers.map(t => ({ id: t.teacherId, name: t.name, hasConfig: !!t.firebaseConfig })));

    // Filter teachers who teach the student (based on subjects)
    const studentTeachers = teachers.filter(
      teacher => teacherIds.includes(teacher.teacherId)
    );

    console.log('Student teachers for grades:', studentTeachers.map(t => t.teacherId));

    // For each teacher, get student's grades from their database
    for (const teacher of studentTeachers) {
      try {
        console.log(`Processing teacher ${teacher.teacherId} for grades`);
        // If teacher has no firebaseConfig, use schoolFirebaseConfig
        const firebaseConfig = teacher.firebaseConfig || schoolFirebaseConfig;
        if (!firebaseConfig) {
          console.log(`Teacher ${teacher.teacherId} has no firebaseConfig and schoolFirebaseConfig is not available, skipping`);
          continue;
        }

        const teacherDB = this.getTeacherDB(firebaseConfig);
        console.log(`Teacher DB created for ${teacher.teacherId}`);

        // Query all scores for this student from this teacher's DB
        // Teacher saves scores with ID: {subjectId}_{classroom}_{studentId}
        // Must query by 'studentId' field instead of document ID
        const scoresQuery = query(
          collection(teacherDB, 'studentScores'),
          where('studentId', '==', studentData.studentId)
        );
        console.log(`Querying scores for studentId: ${studentData.studentId}`);
        const scoresSnap = await getDocs(scoresQuery);
        console.log(`Found ${scoresSnap.size} score record(s) for student`);

        for (const scoreDoc of scoresSnap.docs) {
          const scoreData = scoreDoc.data() as StudentScore;
          console.log(`Score data found for subject: ${scoreData.subjectId}`);
          
          // Get assignments for this specific subject
          const assignmentsQuery = query(
            collection(teacherDB, 'assignments'),
            where('isVisible', '==', true),
            where('subjectId', '==', scoreData.subjectId)
          );
          const assignmentsSnap = await getDocs(assignmentsQuery);
          const assignments = assignmentsSnap.docs.map(d => d.data() as Assignment);
          
          // Get grade config
          const gradeConfigRef = doc(teacherDB, 'gradeConfigs', scoreData.subjectId);
          const gradeConfigSnap = await getDoc(gradeConfigRef);
          const gradeConfig = gradeConfigSnap.exists() ? gradeConfigSnap.data() as GradeConfig : null;
          
          // Calculate total score and grade
          const totalScore = this.calculateTotalScore(scoreData, gradeConfig);
          const grade = this.calculateGrade(totalScore, gradeConfig);
          
          // Count unsent assignments
          const unsentCount = assignments.filter(
            assignment => !scoreData.assignmentScores[assignment.id]
          ).length;

          // Look up subject name from subjects list
          const subjectInfo = subjects.find(s => s.subjectId === scoreData.subjectId);

          grades.push({
            subjectId: scoreData.subjectId,
            subjectName: subjectInfo?.subjectName || '',
            classroom: scoreData.classroom,
            collectedScore: this.calculateCollectedScore(scoreData, assignments),
            midtermScore: scoreData.midtermScore || 0,
            finalScore: scoreData.finalScore || 0,
            totalScore,
            grade,
            unsent: unsentCount,
            details: this.buildGradeDetails(scoreData, assignments),
          });
        }
      } catch (error) {
        console.error(`Error fetching grades from teacher ${teacher.teacherId}:`, error);
      }
    }

    console.log('Grades fetched:', grades);
    return grades;
  }

  /**
   * Get student's attendance from teacher databases
   * Fetches attendance from each teacher's database based on teacherNodes
   * Uses studentId from Admin Data (studentData.studentId)
   */
  async getStudentAttendance(
    schoolFirebaseConfig: any,
    studentData: StudentData
  ): Promise<StudentAttendanceInfo[]> {
    const attendance: StudentAttendanceInfo[] = [];

    console.log('getStudentAttendance - studentData.teacherNodes:', studentData.teacherNodes);

    // Get subjects to find teacherIds
    const subjects = await this.getStudentSubjects(schoolFirebaseConfig, studentData);
    const teacherIds = Array.from(new Set(subjects.map(s => s.teacherId)));

    console.log('getStudentAttendance - teacherIds from subjects:', teacherIds);

    // Get all teachers from school database
    const teachers = await schoolDatabaseService.getAllTeachersOptimized(schoolFirebaseConfig);

    console.log('getStudentAttendance - all teachers:', teachers.map(t => ({ id: t.teacherId, name: t.name, hasConfig: !!t.firebaseConfig })));

    // Filter teachers who teach the student (based on subjects)
    const studentTeachers = teachers.filter(
      teacher => teacherIds.includes(teacher.teacherId)
    );

    console.log('Student teachers for attendance:', studentTeachers.map(t => t.teacherId));

    // For each teacher, get student's attendance from their database
    for (const teacher of studentTeachers) {
      try {
        console.log(`Processing teacher ${teacher.teacherId} for attendance`);
        // If teacher has no firebaseConfig, use schoolFirebaseConfig
        const firebaseConfig = teacher.firebaseConfig || schoolFirebaseConfig;
        if (!firebaseConfig) {
          console.log(`Teacher ${teacher.teacherId} has no firebaseConfig and schoolFirebaseConfig is not available, skipping`);
          continue;
        }

        const teacherDB = this.getTeacherDB(firebaseConfig);
        console.log(`Teacher DB created for ${teacher.teacherId}`);

        // Get all subjects this teacher teaches to the student's class
        const teacherSubjects = subjects.filter(s => s.teacherId === teacher.teacherId);
        console.log(`Teacher ${teacher.teacherId} has ${teacherSubjects.length} subject(s) for student`);

        for (const subject of teacherSubjects) {
          // Query all attendance docs for this subject
          // Teacher saves attendance with ID: {subjectId}_{classroom}_{date}
          // Each doc has records[] containing all students — must filter by studentId
          const attendanceQuery = query(
            collection(teacherDB, 'attendance'),
            where('subjectId', '==', subject.subjectId)
          );
          const attendanceSnap = await getDocs(attendanceQuery);
          console.log(`Found ${attendanceSnap.size} attendance session(s) for subject ${subject.subjectId}`);

          // Build student-specific attendance records per session
          const studentAttendanceDocs: AttendanceData[] = [];
          for (const attendanceDoc of attendanceSnap.docs) {
            const attendanceData = attendanceDoc.data() as AttendanceData;
            const studentRecord = attendanceData.records?.find(
              r => r.studentId === studentData.studentId
            );
            if (studentRecord) {
              studentAttendanceDocs.push({
                ...attendanceData,
                records: [studentRecord],
              });
            }
          }

          if (studentAttendanceDocs.length > 0) {
            console.log(`Student has ${studentAttendanceDocs.length} session(s) for subject ${subject.subjectId}`);
            const summary = this.calculateAttendanceSummary(studentAttendanceDocs);
            attendance.push({
              subjectId: subject.subjectId,
              subjectName: subject.subjectName,
              classroom: subject.classroom,
              totalHours: summary.totalHours.toString(),
              attended: summary.attended.toString(),
              absent: summary.absent.toString(),
              late: summary.late.toString(),
              percentage: summary.percentage,
              history: summary.history,
              counts: summary.counts,
              maxStreak: summary.maxStreak,
              absentByDay: summary.absentByDay,
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching attendance from teacher ${teacher.teacherId}:`, error);
      }
    }

    console.log('Attendance fetched:', attendance);
    return attendance;
  }

  /**
   * Helper: Get teacher database instance
   */
  private getTeacherDB(teacherFirebaseConfig: any): Firestore {
    const instance = firebaseManager.getInstance(teacherFirebaseConfig, `teacher-${teacherFirebaseConfig.projectId}`);
    return instance.db;
  }

  /**
   * Helper: Calculate total score based on grade config
   */
  private calculateTotalScore(scoreData: StudentScore, gradeConfig: GradeConfig | null): number {
    if (!gradeConfig) {
      // Default proportions if no config
      return (scoreData.midtermScore || 0) + (scoreData.finalScore || 0) + 
             Object.values(scoreData.assignmentScores).reduce((sum, score) => sum + score, 0);
    }

    const collectedScore = Object.values(scoreData.assignmentScores).reduce((sum, score) => sum + score, 0);
    const weightedCollected = (collectedScore / 100) * gradeConfig.proportions.collected;
    const weightedMidterm = ((scoreData.midtermScore || 0) / 100) * gradeConfig.proportions.midterm;
    const weightedFinal = ((scoreData.finalScore || 0) / 100) * gradeConfig.proportions.final;

    return weightedCollected + weightedMidterm + weightedFinal;
  }

  /**
   * Helper: Calculate collected score from assignments
   */
  private calculateCollectedScore(scoreData: StudentScore, assignments: Assignment[]): number {
    return Object.values(scoreData.assignmentScores).reduce((sum, score) => sum + score, 0);
  }

  /**
   * Helper: Calculate grade based on total score
   */
  private calculateGrade(totalScore: number, gradeConfig: GradeConfig | null): string {
    if (!gradeConfig || !gradeConfig.thresholds) {
      // Default grading scale
      if (totalScore >= 80) return '4';
      if (totalScore >= 75) return '3.5';
      if (totalScore >= 70) return '3';
      if (totalScore >= 65) return '2.5';
      if (totalScore >= 60) return '2';
      if (totalScore >= 55) return '1.5';
      if (totalScore >= 50) return '1';
      return '0';
    }

    // Use custom thresholds
    const sortedThresholds = [...gradeConfig.thresholds].sort((a, b) => b.minScore - a.minScore);
    for (const threshold of sortedThresholds) {
      if (totalScore >= threshold.minScore) {
        return threshold.grade;
      }
    }
    return '0';
  }

  /**
   * Helper: Build grade details array
   */
  private buildGradeDetails(scoreData: StudentScore, assignments: Assignment[]): any[] {
    return assignments.map(assignment => ({
      chapter: 'บทเรียน',
      label: assignment.title,
      score: scoreData.assignmentScores[assignment.id]?.toString() || '',
      max: assignment.maxScore.toString(),
      description: assignment.description,
      deadline: assignment.deadline || null,
    }));
  }

  /**
   * Helper: Group attendance records by subject
   */
  private groupAttendanceBySubject(records: AttendanceData[]): Record<string, AttendanceData[]> {
    return records.reduce((acc, record) => {
      if (!acc[record.subjectId]) {
        acc[record.subjectId] = [];
      }
      acc[record.subjectId].push(record);
      return acc;
    }, {} as Record<string, AttendanceData[]>);
  }

  /**
   * Helper: Calculate attendance summary
   */
  private calculateAttendanceSummary(records: AttendanceData[]): any {
    let totalHours = 0;
    let attended = 0;
    let absent = 0;
    let late = 0;
    const history: any[] = [];
    const counts = {
      present: 0,
      absent: 0,
      late: 0,
      sick: 0,
      leave: 0,
      activity: 0,
      skip: 0,
    };
    const absentByDay: Record<string, any> = {
      Mon: { total: 0, details: { ข: 0, ลป: 0, ลก: 0, หนี: 0 } },
      Tue: { total: 0, details: { ข: 0, ลป: 0, ลก: 0, หนี: 0 } },
      Wed: { total: 0, details: { ข: 0, ลป: 0, ลก: 0, หนี: 0 } },
      Thu: { total: 0, details: { ข: 0, ลป: 0, ลก: 0, หนี: 0 } },
      Fri: { total: 0, details: { ข: 0, ลป: 0, ลก: 0, หนี: 0 } },
    };

    for (const record of records) {
      totalHours += record.hours;
      
      for (const studentRecord of record.records) {
        if (studentRecord.status === 'มา') {
          attended++;
          counts.present++;
        } else if (studentRecord.status === 'ขาด') {
          absent++;
          counts.absent++;
        } else if (studentRecord.status === 'สาย') {
          late++;
          counts.late++;
        } else if (studentRecord.status === 'ลาป่วย') {
          counts.sick++;
        } else if (studentRecord.status === 'ลากิจ') {
          counts.leave++;
        } else if (studentRecord.status === 'กิจกรรม') {
          counts.activity++;
        } else if (studentRecord.status === 'หนี') {
          counts.skip++;
        }

        history.push({
          date: record.date,
          status: studentRecord.status,
        });

        // Track absent by day
        if (['ขาด', 'ลาป่วย', 'ลากิจ', 'หนี'].includes(studentRecord.status)) {
          const dayMap: Record<string, string> = {
            'จันทร์': 'Mon',
            'อังคาร': 'Tue',
            'พุธ': 'Wed',
            'พฤหัสบดี': 'Thu',
            'ศุกร์': 'Fri',
          };
          const day = dayMap[record.date.split(' ')[0]] || 'Mon';
          if (absentByDay[day]) {
            absentByDay[day].total++;
            if (studentRecord.status === 'ขาด') absentByDay[day].details.ข++;
            if (studentRecord.status === 'ลาป่วย') absentByDay[day].details.ลป++;
            if (studentRecord.status === 'ลากิจ') absentByDay[day].details.ลก++;
            if (studentRecord.status === 'หนี') absentByDay[day].details.หนี++;
          }
        }
      }
    }

    const percentage = totalHours > 0 ? ((attended + late) / totalHours * 100).toFixed(1) + '%' : '0%';

    return {
      totalHours,
      attended,
      absent,
      late,
      percentage,
      history,
      counts,
      maxStreak: 0, // TODO: Calculate max streak
      absentByDay,
    };
  }
  /**
   * Get student's pending (unsent) assignments from all teacher databases
   * Returns assignments that the student hasn't submitted yet, sorted by deadline
   */
  async getStudentPendingAssignments(
    schoolFirebaseConfig: any,
    studentData: StudentData
  ): Promise<{
    subjectId: string;
    subjectName: string;
    assignmentTitle: string;
    deadline: string;
    maxScore: number;
    teacherName: string;
  }[]> {
    const pending: {
      subjectId: string;
      subjectName: string;
      assignmentTitle: string;
      deadline: string;
      maxScore: number;
      teacherName: string;
    }[] = [];

    try {
      const subjects = await this.getStudentSubjects(schoolFirebaseConfig, studentData);
      const teacherIds = Array.from(new Set(subjects.map(s => s.teacherId)));
      const teachers = await schoolDatabaseService.getAllTeachersOptimized(schoolFirebaseConfig);
      const studentTeachers = teachers.filter(t => teacherIds.includes(t.teacherId));

      for (const teacher of studentTeachers) {
        try {
          const firebaseConfig = teacher.firebaseConfig || schoolFirebaseConfig;
          if (!firebaseConfig) continue;

          const teacherDB = this.getTeacherDB(firebaseConfig);
          const teacherSubjects = subjects.filter(s => s.teacherId === teacher.teacherId);

          for (const subject of teacherSubjects) {
            // Get assignments for this subject
            const assignmentsQuery = query(
              collection(teacherDB, 'assignments'),
              where('isVisible', '==', true),
              where('subjectId', '==', subject.subjectId)
            );
            const assignmentsSnap = await getDocs(assignmentsQuery);
            const assignments = assignmentsSnap.docs.map(d => d.data() as import('./teacher-database.service').Assignment);

            // Get student's scores for this subject
            const scoresQuery = query(
              collection(teacherDB, 'studentScores'),
              where('studentId', '==', studentData.studentId),
              where('subjectId', '==', subject.subjectId)
            );
            const scoresSnap = await getDocs(scoresQuery);
            const scoreData = scoresSnap.docs.length > 0 ? scoresSnap.docs[0].data() as import('./teacher-database.service').StudentScore : null;

            for (const assignment of assignments) {
              const hasScore = scoreData?.assignmentScores?.[assignment.id];
              if (!hasScore && hasScore !== 0) {
                pending.push({
                  subjectId: subject.subjectId,
                  subjectName: subject.subjectName,
                  assignmentTitle: assignment.title,
                  deadline: assignment.deadline || '',
                  maxScore: assignment.maxScore,
                  teacherName: subject.teacherName,
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching pending assignments from teacher ${teacher.teacherId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error fetching pending assignments:', error);
    }

    // Sort by deadline (closest first), items without deadline go to the end
    pending.sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

    return pending;
  }
}

export const studentDatabaseService = new StudentDatabaseService();
