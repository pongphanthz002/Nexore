'use client';

import { motion, AnimatePresence, animate } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { studentDatabaseService, StudentSubjectInfo, StudentGradeInfo, StudentAttendanceInfo } from '@/services/student-database.service';
import { schoolDatabaseService } from '@/services/school-database.service';
import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import { 
  BookOpen, Clock, RefreshCw, Sparkles, Home, 
  ChevronDown, ChevronLeft, ChevronRight, Layers, Target, GraduationCap, AlertCircle, 
  Trophy, Flame, Award, ShieldCheck, ShieldAlert, ShieldX,
  BarChart3, Activity, Info, X, Sun, Moon
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  ChartOptions
} from 'chart.js';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler
);

const STATUS_COLORS: Record<string, string> = {
  present: '#166534', 
  sick: '#86efac', 
  leave: '#f97ab6', 
  absent: '#ef4444', 
  late: '#ffff00', 
  skip: '#ef820d', 
  activity: '#38bdf8'
};

// --- CountUp Component ---
const CountUp = ({ value, duration = 1.0 }: { value: string | number, duration?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const num = parseFloat(value.toString()) || 0;
    const controls = animate(0, num, {
      duration: duration,
      ease: "easeOut",
      onUpdate(value) {
        setCount(value);
      }
    });
    return () => controls.stop();
  }, [value, duration]);

  return <span>{count % 1 === 0 ? count : count.toFixed(1)}</span>;
};

// --- Detail Modal ---
const DetailModal = ({ item, onClose, isDark }: { item: any, onClose: () => void, isDark: boolean }) => (
  <AnimatePresence>
    {item && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-md" />
        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className={`relative w-full max-w-sm ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-100'} rounded-[2.5rem] shadow-2xl border p-8 overflow-hidden`}>
          <div className="flex justify-between items-start mb-6">
            <div className={`w-14 h-14 ${isDark ? 'bg-indigo-500/20' : 'bg-indigo-50'} rounded-2xl flex items-center justify-center`}><Info className="w-8 h-8 text-indigo-500" /></div>
            <button onClick={onClose} className={`p-2 rounded-full ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}><X className="w-6 h-6" /></button>
          </div>
          <h3 className="text-2xl font-bold mb-2 leading-tight">{item.label}</h3>
          <p className={`text-sm font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'} uppercase mb-6`}>{item.chapter}</p>
          <div className={`p-6 rounded-2xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'} border ${isDark ? 'border-slate-700' : 'border-slate-200'} mb-6`}>
            <p className={`text-lg font-medium leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{item.description || 'ไม่มีข้อมูลรายละเอียดเพิ่มเติม'}</p>
          </div>
          {item.deadline && (
            <div className={`flex items-center gap-2 mb-6 px-1`}>
              <Clock className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <p className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>กำหนดส่ง: {item.deadline}</p>
            </div>
          )}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Score</p>
              <p className={`text-3xl font-black ${item.score === "" ? 'text-red-600' : 'text-indigo-500'}`}>{item.score === "" ? '0' : item.score}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Max</p>
              <p className="text-2xl font-bold text-slate-500">{item.max}</p>
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

export default function StudentSubjectsPage() {
  const { userAccount } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subjects, setSubjects] = useState<StudentSubjectInfo[]>([]);
  const [grades, setGrades] = useState<StudentGradeInfo[]>([]);
  const [attendance, setAttendance] = useState<StudentAttendanceInfo[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<StudentSubjectInfo | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<StudentGradeInfo | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<StudentAttendanceInfo | null>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [detailModalItem, setDetailModalItem] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grades' | 'attendance'>('grades');

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'));

    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const toggleChapter = (chapter: string) => {
    setExpandedChapters(prev => ({ ...prev, [chapter]: !prev[chapter] }));
  };

  const fetchData = async (force = false) => {
    if (!force) setLoading(true);
    else setRefreshing(true);
    
    try {
      if (!userAccount?.schoolFirebaseConfig) {
        setError('ไม่พบข้อมูลโรงเรียน');
        return;
      }

      // Get student data from school database
      let studentData = await schoolDatabaseService.getStudentData(
        userAccount.schoolFirebaseConfig,
        userAccount?.userId || ''
      );

      if (!studentData && userAccount?.email) {
        studentData = await schoolDatabaseService.getStudentDataByEmail(
          userAccount.schoolFirebaseConfig,
          userAccount.email
        );
      }

      if (!studentData) {
        setError('ไม่พบข้อมูลนักเรียน');
        return;
      }

      setStudentInfo(studentData);

      // Fetch subjects first (needed by grades/attendance as dependency)
      const subjectsData = await studentDatabaseService.getStudentSubjects(
        userAccount.schoolFirebaseConfig,
        studentData
      );
      setSubjects(subjectsData);

      // Fetch grades and attendance in PARALLEL for speed
      const [gradesData, attendanceData] = await Promise.all([
        studentDatabaseService.getStudentGrades(userAccount.schoolFirebaseConfig, studentData),
        studentDatabaseService.getStudentAttendance(userAccount.schoolFirebaseConfig, studentData),
      ]);

      setGrades(gradesData);
      setAttendance(attendanceData);

      if (subjectsData.length === 1) {
        setSelectedSubject(subjectsData[0]);
        const matchingGrade = gradesData.find(g => g.subjectId === subjectsData[0].subjectId);
        const matchingAttendance = attendanceData.find(a => a.subjectId === subjectsData[0].subjectId);
        setSelectedGrade(matchingGrade || null);
        setSelectedAttendance(matchingAttendance || null);
        setViewMode('grades');
      }

      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('การเชื่อมต่อขัดข้อง');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (userAccount?.userId) {
      fetchData();
    }
  }, [userAccount]);

  const handleSubjectSelect = (subject: StudentSubjectInfo) => {
    setSelectedSubject(subject);
    const matchingGrade = grades.find(g => g.subjectId === subject.subjectId);
    const matchingAttendance = attendance.find(a => a.subjectId === subject.subjectId);
    setSelectedGrade(matchingGrade || null);
    setSelectedAttendance(matchingAttendance || null);
    setViewMode('grades');
  };

  const getRiskInfo = (percStr: string) => {
    const p = parseFloat(percStr);
    if (p >= 90) return { label: "Excellent", color: "text-emerald-500", bg: "bg-emerald-500/10", icon: Award, desc: "สถานะดีเยี่ยม! เข้าเรียนสม่ำเสมอเป็นแบบอย่างที่ดี" };
    if (p >= 80) return { label: "Eligible", color: "text-green-500", bg: "bg-green-500/10", icon: ShieldCheck, desc: "เข้าเกณฑ์! มีสิทธิ์เข้าสอบแน่นอน รักษามาตรฐานไว้นะ" };
    if (p >= 60) return { label: "Risk", color: "text-amber-500", bg: "bg-amber-500/10", icon: ShieldAlert, desc: "เริ่มมีความเสี่ยง! กรุณาเข้าเรียนให้สม่ำเสมอขึ้นเพื่อรักษาเกณฑ์" };
    return { label: "Danger", color: "text-rose-500", bg: "bg-rose-500/10", icon: ShieldX, desc: "วิกฤต! ขาดเรียนเกินเกณฑ์ เสี่ยงหมดสิทธิ์สอบสูงมาก" };
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-[#0F172A]' : 'bg-[#F8FAFC]'} font-sans`}>
        <StudentHeader isDark={isDarkMode} toggleTheme={toggleTheme} />
        <div className="flex flex-col items-center justify-center min-h-screen gap-8">
          {/* Orbiting rings */}
          <div className="relative w-36 h-36">
            {[0,1,2].map((i) => (
              <motion.div
                key={i}
                className={`absolute inset-0 rounded-full border-2 ${
                  i === 0 ? 'border-red-500/60' : i === 1 ? 'border-rose-400/40' : 'border-red-300/30'
                }`}
                style={{ margin: i * 12 }}
                animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
                transition={{ duration: 2.5 + i, repeat: Infinity, ease: 'linear' }}
              />
            ))}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <BookOpen className="w-10 h-10 text-red-500" />
            </motion.div>
          </div>
          <div className="text-center space-y-3">
            <motion.p
              className={`text-sm font-black uppercase tracking-[0.3em] ${ isDarkMode ? 'text-red-400' : 'text-red-600'}`}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              กำลังโหลดข้อมูล
            </motion.p>
            <div className="flex gap-2 justify-center">
              {[0,1,2,3].map(i => (
                <motion.div
                  key={i}
                  className="w-1.5 h-6 rounded-full bg-red-500"
                  animate={{ scaleY: [0.4, 1, 0.4], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </div>
        </div>
        <StudentFooter isDark={isDarkMode} />
      </div>
    );
  }

  const darkClass = isDarkMode ? "dark bg-[#0F172A] text-slate-100" : "bg-[#F8FAFC] text-slate-900";
  const mainCardGradient = isDarkMode
    ? 'bg-gradient-to-br from-red-950 via-slate-900 to-red-950 border border-red-900/30'
    : 'bg-gradient-to-br from-red-600 via-rose-600 to-red-700';

  return (
    <div className={`min-h-screen ${darkClass} font-sans transition-colors duration-300 overflow-x-hidden`}>
      <style>{`
        @keyframes water-flow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .animate-water { background-size: 200% 200%; animation: water-flow 8s ease infinite; }
        @keyframes marquee { 0% { transform: translateX(10%); } 100% { transform: translateX(-100%); } }
        .animate-marquee { animation: marquee 20s linear infinite; display: inline-flex; }
        .pause-marquee:hover .animate-marquee { animation-play-state: paused; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <StudentHeader isDark={isDarkMode} toggleTheme={toggleTheme} />
      
      <DetailModal item={detailModalItem} onClose={() => setDetailModalItem(null)} isDark={isDarkMode} />

      <main className={`w-full max-w-7xl mx-auto px-6 space-y-6 pt-28 pb-24`}>
        {!selectedSubject ? (
          <div className="space-y-6">
            {error && (
              <div className={`${isDarkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200'} border rounded-2xl p-6`}>
                <p className="text-red-600 font-bold">{error}</p>
              </div>
            )}

            <div className="pt-2 px-2">
              <h3 className={`font-bold text-lg mb-6 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                เลือกวิชาเพื่อดูข้อมูล
              </h3>
            </div>

            <div className="flex flex-col gap-3">
              {subjects.map((subject, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, type: 'spring', stiffness: 260, damping: 20 }}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSubjectSelect(subject)}
                  className={`${
                    isDarkMode
                      ? 'bg-[#1E293B] border-[#334155] hover:border-red-500/60 hover:bg-red-950/20'
                      : 'bg-white border-slate-100 hover:border-red-300 hover:shadow-red-500/5'
                  } rounded-2xl p-4 shadow-sm border flex items-center justify-between cursor-pointer transition-all hover:shadow-md group`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-14 h-14 ${isDarkMode ? 'bg-red-950/40 text-red-400 group-hover:bg-red-900/50' : 'bg-red-50 text-red-500 group-hover:bg-red-100'} rounded-2xl flex items-center justify-center shrink-0 transition-colors`}>
                      <BookOpen className="w-7 h-7" />
                    </div>
                    <div className="min-w-0">
                      <h4 className={`font-bold text-lg md:text-xl leading-snug truncate ${isDarkMode ? 'text-slate-100' : 'text-slate-800'} group-hover:text-red-500 transition-colors`}>
                        {subject.subjectName}
                      </h4>
                    </div>
                  </div>
                  <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-slate-800 text-slate-400 group-hover:text-red-400' : 'bg-slate-50 text-slate-400 group-hover:text-red-500'} transition-colors shrink-0 ml-3`}>
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </motion.div>
              ))}
            </div>

            {subjects.length === 0 && !error && (
              <div className={`${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'} border rounded-[2rem] p-10 text-center`}>
                <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className={`text-lg font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>ไม่มีวิชาเรียน</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Back Button */}
            <button
              onClick={() => setSelectedSubject(null)}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
                isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ChevronLeft size={20} />
              ย้อนกลับ
            </button>

            {/* Subject Header */}
            <div className={`animate-water ${mainCardGradient} rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden`}>
              <div className="relative z-10">
                <p className="text-[10px] font-bold mb-2 opacity-80 uppercase tracking-widest text-red-100">SUBJECT INFORMATION</p>
                <h2 className="text-3xl font-bold mb-4 leading-tight">{selectedSubject.subjectName}</h2>
                <div className="w-full overflow-x-auto no-scrollbar pause-marquee relative">
                  <div className="animate-marquee gap-3 whitespace-nowrap min-w-min flex pr-8">
                    <span className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-bold border border-white/10 shrink-0">ห้อง {selectedSubject.classroom}</span>
                    <span className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-bold border border-white/10 shrink-0">ครู {selectedSubject.teacherName}</span>
                    {selectedSubject.schedules && selectedSubject.schedules.length > 0 ? (
                      selectedSubject.schedules.map((schedule, idx) => (
                        <span key={idx} className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-bold border border-white/10 shrink-0">{schedule.day} {schedule.time}</span>
                      ))
                    ) : (
                      <>
                        <span className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-bold border border-white/10 shrink-0">{selectedSubject.day}</span>
                        <span className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-bold border border-white/10 shrink-0">{selectedSubject.time}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <Sparkles className="absolute top-6 right-6 w-16 h-16 text-white/10" />
            </div>

            <div className="space-y-3">
              {/* View Mode Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('grades')}
                  className={`flex-1 p-3 rounded-2xl font-bold transition-all flex justify-center items-center ${
                    viewMode === 'grades'
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                      : (isDarkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }`}
                >
                  <Trophy className="w-6 h-6" />
                </button>
                <button
                  onClick={() => setViewMode('attendance')}
                  className={`flex-1 p-3 rounded-2xl font-bold transition-all flex justify-center items-center ${
                    viewMode === 'attendance'
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                      : (isDarkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }`}
                >
                  <Clock className="w-6 h-6" />
                </button>
              </div>

              {/* Grades View */}
              {viewMode === 'grades' && selectedGrade && (
              <div className="space-y-6">
                <div className={`animate-water ${mainCardGradient} rounded-[3.5rem] p-10 text-white relative overflow-hidden shadow-[0_30px_60px_-10px_rgba(0,0,0,0.4)] border border-white/5`}>
                  <div className="relative z-10 flex flex-col items-center text-center py-2">
                    <p className={`${isDarkMode ? 'text-slate-400' : 'text-indigo-300/80'} font-bold text-xs uppercase mb-6`}>Performance Summary</p>
                    <div className="relative mb-6">
                      <div className={`absolute inset-0 ${isDarkMode ? 'bg-slate-500' : 'bg-indigo-500'} blur-[80px] opacity-20`}></div>
                      <h2 className="text-[10rem] font-bold leading-none tracking-tighter text-white drop-shadow-[0_20px_20px_rgba(0,0,0,0.5)]">{selectedGrade.grade || '-'}</h2>
                    </div>
                    <div className="inline-flex items-center gap-2 bg-white/10 px-5 py-2 rounded-full backdrop-blur-md">
                      <p className="text-slate-200 font-bold text-xs uppercase leading-none">CURRENT GRADE</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/10 relative z-10">
                    <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 text-center">
                      <p className={`text-xs font-bold ${isDarkMode ? 'text-slate-400' : 'text-indigo-300'} mb-2 opacity-70 uppercase`}>Total Score</p>
                      <p className="text-3xl font-black"><CountUp value={selectedGrade.totalScore} /></p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 text-center">
                      <p className={`text-xs font-bold text-rose-400 mb-2 opacity-70 uppercase`}>Unsent</p>
                      <p className={`text-3xl font-black text-rose-500 drop-shadow-sm`}><CountUp value={selectedGrade.unsent} duration={0.8} /></p>
                    </div>
                  </div>
                </div>

                <div className={`${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'} border rounded-[2rem] p-6 shadow-sm`}>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'คะแนนเก็บ', val: selectedGrade.collectedScore, icon: Layers, text: 'text-blue-500' },
                      { label: 'กลางภาค', val: selectedGrade.midtermScore, icon: Target, text: 'text-indigo-500' },
                      { label: 'ปลายภาค', val: selectedGrade.finalScore, icon: GraduationCap, text: 'text-violet-500' }
                    ].map((item, i) => (
                      <div key={i} className="text-center">
                        <p className={`text-3xl font-black ${item.text}`}><CountUp value={item.val} duration={1} /></p>
                        <p className={`text-[10px] font-bold ${item.text} uppercase mt-2 opacity-70 leading-tight`}>{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <div className="px-3 flex items-center gap-3">
                    <Layers className="w-5 h-5 text-slate-400" />
                    <h3 className={`text-lg font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>รายละเอียดคะแนน</h3>
                  </div>
                  {selectedGrade.details.map((item, i) => (
                    <div
                      key={i}
                      onClick={() => setDetailModalItem(item)}
                      className={`p-6 rounded-2xl border flex items-center justify-between shadow-sm transition-all active:scale-[0.98] cursor-pointer hover:border-indigo-500/30 ${
                        item.score === "" 
                          ? (isDarkMode ? 'bg-rose-500/5 border-rose-500/20' : 'bg-rose-50/50 border-rose-100') 
                          : (isDarkMode ? 'bg-[#1E293B] border-slate-700' : 'bg-white border-slate-100')
                      }`}
                    >
                      <div className="flex-1 pr-4 min-w-0">
                        <p className={`font-bold text-xl leading-tight truncate ${item.score === "" ? 'text-red-600' : (isDarkMode ? 'text-slate-200' : 'text-slate-700')}`}>{item.label}</p>
                        {item.score === "" && item.description && (
                          <p className="text-sm font-bold leading-relaxed italic text-red-500/80 mt-1">{item.description}</p>
                        )}
                        {item.deadline && (
                          <p className={`text-xs font-semibold mt-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>กำหนดส่ง: {item.deadline}</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        <span className={`font-black text-2xl tracking-tighter ${item.score === "" ? 'text-red-600' : 'text-indigo-500'}`}>
                          {item.score === "" ? '0' : <CountUp value={item.score} duration={0.8} />}
                        </span>
                        {item.max && <span className="text-sm font-bold text-slate-400 uppercase">/ {item.max}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attendance View */}
            {viewMode === 'attendance' && selectedAttendance && (
              <div className="space-y-6">
                <div className={`${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'} border rounded-[3.5rem] p-10 shadow-sm space-y-8`}>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-rose-500/10 rounded-2xl">
                      <BarChart3 className="w-7 h-7 text-rose-500" />
                    </div>
                    <h4 className="font-bold text-2xl">สถิติวันที่ขาดบ่อย</h4>
                  </div>
                  <div className="h-48 w-full">
                    <Bar
                      data={{
                        labels: ["จ.", "อ.", "พ.", "พฤ.", "ศ."],
                        datasets: [{
                          label: 'ขาดเรียน',
                          data: ["Mon", "Tue", "Wed", "Thu", "Fri"].map(day => {
                            const val = selectedAttendance?.absentByDay?.[day];
                            return typeof val === 'object' ? val.total : (val || 0);
                          }),
                          backgroundColor: (context: any) => {
                            const chart = context.chart;
                            const { ctx, chartArea } = chart;
                            const barColors = ['#f87171', '#fb923c', '#fbbf24', '#4ade80', '#60a5fa'];
                            const idx = context.dataIndex;
                            const color = barColors[idx % barColors.length];
                            if (!chartArea) return color;
                            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                            gradient.addColorStop(0, color + '22');
                            gradient.addColorStop(1, color);
                            return gradient;
                          },
                          borderRadius: 12,
                          barThickness: 24
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                            titleColor: isDarkMode ? '#f1f5f9' : '#1e293b',
                            bodyColor: isDarkMode ? '#94a3b8' : '#64748b',
                            borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                            borderWidth: 1,
                            padding: 12,
                            cornerRadius: 16
                          }
                        },
                        scales: {
                          x: { grid: { display: false }, ticks: { color: isDarkMode ? '#64748b' : '#94a3b8', font: { weight: 'bold' } } },
                          y: { display: false }
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'} border p-8 rounded-[3rem] shadow-sm flex flex-col items-center justify-center gap-4`}>
                    <div className="w-14 h-14 bg-orange-500/10 rounded-full flex items-center justify-center">
                      <Flame className="w-8 h-8 text-orange-500" />
                    </div>
                    <p className="text-4xl font-black">{selectedAttendance?.maxStreak || 0}</p>
                    <p className="text-[12px] font-bold text-slate-400 uppercase text-center tracking-widest">Max Streak</p>
                  </motion.div>
                  {(() => {
                    const risk = getRiskInfo(selectedAttendance.percentage);
                    return (
                      <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'} border p-8 rounded-[3rem] shadow-sm flex flex-col items-center justify-center gap-4`}>
                        <div className={`w-14 h-14 ${risk.bg} rounded-full flex items-center justify-center`}>
                          <risk.icon className={`w-8 h-8 ${risk.color}`} />
                        </div>
                        <p className={`text-xl font-black ${risk.color}`}>{risk.label}</p>
                      </motion.div>
                    );
                  })()}
                </div>

                <div className="space-y-6">
                  <div className="px-2 flex items-center gap-4">
                    <Clock className="w-6 h-6 text-slate-400" />
                    <h3 className={`text-2xl font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>ประวัติย้อนหลัง</h3>
                  </div>
                  <div className="space-y-4">
                    {Array.from({ length: Math.ceil((selectedAttendance?.history?.length || 0) / 5) }).map((_, rowIdx) => (
                      <motion.div key={rowIdx} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: rowIdx * 0.1 }} className={`${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'} border rounded-[2rem] p-6 shadow-sm flex items-center justify-around gap-2`}>
                        {(selectedAttendance?.history || []).slice(rowIdx * 5, (rowIdx * 5) + 5).map((item, i) => (
                          <div key={i} className="flex flex-col items-center gap-2">
                            <span className="text-[9px] font-bold text-slate-400">{item.date}</span>
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shadow-md" style={{ backgroundColor: getStatusColor(item.status) }}>
                              {getStatusDisplay(item.status)}
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!selectedGrade && viewMode === 'grades' && (
              <div className={`${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'} border rounded-[2rem] p-10 text-center`}>
                <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className={`text-lg font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>ไม่มีข้อมูลคะแนน</p>
              </div>
            )}

              {/* Empty Attendance */}
              {!selectedAttendance && viewMode === 'attendance' && (
                <div className={`${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'} border rounded-[2rem] p-10 text-center`}>
                  <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className={`text-lg font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>ไม่มีข้อมูลเวลาเรียน</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      
      <StudentFooter isDark={isDarkMode} />
    </div>
  );
}

function getStatusDisplay(s: string) {
  if (s.includes('ม')) return 'ม';
  if (s.includes('ข')) return 'ข';
  if (s.includes('ส')) return 'ส';
  if (s.includes('น') || s.includes('หนี')) return 'น';
  if (s.includes('ลป')) return 'ลป';
  if (s.includes('ลก')) return 'ลก';
  if (s.includes('กก')) return 'กก';
  return '?';
}

function getStatusColor(s: string) {
  const d = getStatusDisplay(s);
  if (d === 'ม') return STATUS_COLORS.present;
  if (d === 'ข') return STATUS_COLORS.absent;
  if (d === 'ส') return STATUS_COLORS.late;
  if (d === 'น') return STATUS_COLORS.skip;
  if (d === 'ลป') return STATUS_COLORS.sick;
  if (d === 'ลก') return STATUS_COLORS.leave;
  if (d === 'กก') return STATUS_COLORS.activity;
  return '#94a3b8';
}
