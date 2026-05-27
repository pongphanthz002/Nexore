'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { firebaseManager } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Edit, Save, X, Settings, Files, Eye, EyeOff, AlertTriangle, Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const { userAccount, setUserAccount } = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showConfigPopup, setShowConfigPopup] = useState(false);
  const [showConfigValues, setShowConfigValues] = useState(false);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [showConfigConfirm, setShowConfigConfirm] = useState(false);
  const [configConfirmText, setConfigConfirmText] = useState('');
  const [configValidating, setConfigValidating] = useState(false);
  const [configError, setConfigError] = useState('');
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [showLinkConfirm, setShowLinkConfirm] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [formData, setFormData] = useState({ name: '' });
  const [configFormData, setConfigFormData] = useState({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  });

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (userAccount) {
      setFormData({ name: userAccount.name || '' });
      const cfg = userAccount.schoolFirebaseConfig || {};
      setConfigFormData({
        apiKey: cfg.apiKey || '',
        authDomain: cfg.authDomain || '',
        projectId: cfg.projectId || '',
        storageBucket: cfg.storageBucket || '',
        messagingSenderId: cfg.messagingSenderId || '',
        appId: cfg.appId || '',
      });
    }
  }, [userAccount]);

  useEffect(() => {
    async function loadTeachers() {
      if (userAccount?.role === 'admin' && userAccount?.schoolFirebaseConfig) {
        try {
          const allTeachers = await schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig);
          setTeachers(allTeachers);
        } catch (error) {
          console.error('Error loading teachers:', error);
        }
      }
    }
    loadTeachers();
  }, [userAccount]);

  const handleSave = () => {
    if (userAccount) {
      setUserAccount({ ...userAccount, name: formData.name });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({ name: userAccount?.name || '' });
    setSelectedTeacherId('');
    setIsEditing(false);
  };

  const handleCopySchoolId = () => {
    if (userAccount?.schoolId) {
      navigator.clipboard.writeText(userAccount.schoolId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const maskValue = (val: string) => {
    if (!val) return '••••••';
    if (val.length <= 4) return '••••••';
    return val.substring(0, 4) + '••••••••';
  };

  // Available teachers: not linked (no uid) OR linked to current user
  const availableTeachers = teachers.filter(t => !t.uid || t.uid === userAccount?.id);

  const handleLinkTeacher = () => {
    if (!selectedTeacherId) return;
    setShowLinkConfirm(true);
  };

  const confirmLinkTeacher = async () => {
    if (!userAccount || !selectedTeacherId) return;
    setLinkLoading(true);
    try {
      const oldTeacherId = userAccount.userId;

      // Unlink old teacher if exists and different
      if (oldTeacherId && oldTeacherId !== selectedTeacherId && userAccount.schoolFirebaseConfig) {
        try {
          const schoolInstance = firebaseManager.getInstance(
            userAccount.schoolFirebaseConfig,
            `school-${userAccount.schoolFirebaseConfig.projectId}`
          );
          const oldTeacherRef = doc(schoolInstance.db, 'teachers', oldTeacherId);
          await updateDoc(oldTeacherRef, { uid: '', email: '' });
        } catch (err) {
          console.error('Error unlinking old teacher:', err);
        }
      }

      setUserAccount({ ...userAccount, userId: selectedTeacherId });
    } finally {
      setLinkLoading(false);
      setShowLinkConfirm(false);
      setSelectedTeacherId('');
    }
  };

  // Firebase Config validation: try to connect and read
  const validateFirebaseConfig = async (config: typeof configFormData): Promise<boolean> => {
    // Check no empty fields
    const emptyFields = Object.entries(config).filter(([, v]) => !v.trim());
    if (emptyFields.length > 0) {
      setConfigError('ทุกช่องต้องมีค่า ห้ามปล่อยว่าง');
      return false;
    }
    try {
      const testInstanceName = `config-validate-${Date.now()}`;
      const instance = firebaseManager.getInstance(config, testInstanceName);
      // Try to read a collection to verify connectivity
      await getDocs(collection(instance.db, 'teachers'));
      // Cleanup test instance
      firebaseManager.removeInstance(testInstanceName);
      return true;
    } catch (err) {
      console.error('Config validation failed:', err);
      setConfigError('ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้ กรุณาตรวจสอบ Config');
      return false;
    }
  };

  const handleSaveConfig = () => {
    setConfigError('');
    setShowConfigConfirm(true);
  };

  const confirmSaveConfig = async () => {
    if (configConfirmText !== 'ยืนยัน') return;
    setConfigValidating(true);
    setConfigError('');

    const isValid = await validateFirebaseConfig(configFormData);
    if (!isValid) {
      setConfigValidating(false);
      return;
    }

    if (userAccount) {
      setUserAccount({ ...userAccount, schoolFirebaseConfig: { ...configFormData } });
    }
    setShowConfigConfirm(false);
    setConfigConfirmText('');
    setIsEditingConfig(false);
    setShowConfigPopup(false);
    setConfigValidating(false);
  };

  const resetConfigForm = () => {
    const cfg = userAccount?.schoolFirebaseConfig || {};
    setConfigFormData({
      apiKey: cfg.apiKey || '',
      authDomain: cfg.authDomain || '',
      projectId: cfg.projectId || '',
      storageBucket: cfg.storageBucket || '',
      messagingSenderId: cfg.messagingSenderId || '',
      appId: cfg.appId || '',
    });
    setIsEditingConfig(false);
    setConfigError('');
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
        >
          <div className="flex items-center justify-between mb-6">
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              ข้อมูลส่วนตัว
            </h1>
            {!isEditing && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsEditing(true)}
                className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
              >
                <Edit size={20} />
              </motion.button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>ชื่อ</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full mt-1 p-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                />
              ) : (
                <p className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>{userAccount?.name || '-'}</p>
              )}
            </div>

            <div>
              <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>อีเมล</label>
              <p className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>{userAccount?.email || '-'}</p>
            </div>

            <div>
              <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                เลขประจำตัวครู (Teacher ID)
              </label>
              {isEditing && userAccount?.role === 'admin' ? (
                <div className="mt-1">
                  <select
                    value={selectedTeacherId || userAccount?.userId || ''}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className={`w-full p-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  >
                    <option value="">-- เลือกเลขประจำตัวครู --</option>
                    {availableTeachers.map((teacher) => (
                      <option key={teacher.teacherId} value={teacher.teacherId}>
                        {teacher.name} ({teacher.teacherId})
                      </option>
                    ))}
                  </select>
                  {selectedTeacherId && selectedTeacherId !== userAccount?.userId && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleLinkTeacher}
                      className="w-full mt-2 p-2 rounded-lg bg-blue-500 text-white text-sm"
                    >
                      ยืนยันการผูกข้อมูล
                    </motion.button>
                  )}
                </div>
              ) : (
                <p className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>{userAccount?.userId || '-'}</p>
              )}
            </div>
          </div>

          {/* Edit Actions */}
          <AnimatePresence>
            {isEditing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="flex gap-3 mt-6"
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  className="flex-1 p-3 rounded-xl bg-blue-500 text-white flex items-center justify-center gap-2"
                >
                  <Save size={20} />
                  บันทึก
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCancel}
                  className={`flex-1 p-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'} flex items-center justify-center gap-2`}
                >
                  <X size={20} />
                  ยกเลิก
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* School ID Snippet */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
          className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
        >
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-4`}>School ID</h2>
          {userAccount?.schoolId && (
            <div className="relative p-4 rounded-2xl bg-gray-100 dark:bg-gray-700 font-mono text-sm">
              <div className="flex items-center justify-between">
                <p className="text-gray-800 dark:text-white">
                  <span className="text-purple-600 dark:text-purple-400">School ID: </span>
                  <span className="text-blue-600 dark:text-blue-400">{userAccount.schoolId}</span>
                </p>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleCopySchoolId}
                  className="p-2 bg-gray-300 dark:bg-gray-600 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-all"
                >
                  <Files size={20} className={isDark ? 'text-white' : 'text-gray-900'} />
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Firebase Config Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.2 }}
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setShowConfigPopup(true); setShowConfigValues(false); setIsEditingConfig(false); resetConfigForm(); }}
            className={`w-full p-4 rounded-2xl flex items-center justify-center gap-2 ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-700'} shadow-lg`}
          >
            <Settings size={20} />
            <span className="font-medium">Firebase Config</span>
          </motion.button>
        </motion.div>

        {/* Copied Toast */}
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-2xl shadow-lg z-50"
          >
            คัดลอกแล้ว!
          </motion.div>
        )}

        {/* Link Teacher Confirmation Dialog */}
        {showLinkConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`rounded-2xl p-6 max-w-md w-full ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            >
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>
                ยืนยันการผูกข้อมูล
              </h3>
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                คุณต้องการผูกบัญชีเข้ากับเลขประจำตัวครู <strong>{selectedTeacherId}</strong> ใช่ไหม?
              </p>
              {userAccount?.userId && userAccount.userId !== selectedTeacherId && (
                <p className={`mt-2 text-sm ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                  ⚠️ การผูกบัญชีใหม่จะยกเลิกการผูกกับเลข {userAccount.userId} โดยอัตโนมัติ
                </p>
              )}
              <div className="flex gap-3 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowLinkConfirm(false)}
                  disabled={linkLoading}
                  className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                >
                  ยกเลิก
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={confirmLinkTeacher}
                  disabled={linkLoading}
                  className="flex-1 bg-blue-500 text-white py-3 rounded-xl flex items-center justify-center gap-2"
                >
                  {linkLoading && <Loader2 size={16} className="animate-spin" />}
                  ยืนยัน
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Firebase Config Popup */}
        <AnimatePresence>
          {showConfigPopup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
              onClick={() => { if (!isEditingConfig) { setShowConfigPopup(false); } }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={`rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Firebase Config
                  </h2>
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setShowConfigValues(!showConfigValues)}
                      className={`p-2 rounded-lg ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                    >
                      {showConfigValues ? <EyeOff size={16} /> : <Eye size={16} />}
                    </motion.button>
                    {!isEditingConfig && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => { setIsEditingConfig(true); setConfigError(''); }}
                        className={`p-2 rounded-lg ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                      >
                        <Edit size={16} />
                      </motion.button>
                    )}
                    {!isEditingConfig && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setShowConfigPopup(false)}
                        className={`p-2 rounded-lg ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                      >
                        <X size={16} />
                      </motion.button>
                    )}
                  </div>
                </div>

                {isEditingConfig && (
                  <div className="flex items-center gap-2 mb-4 text-red-500">
                    <AlertTriangle size={20} />
                    <span className="text-sm font-medium">การแก้ไข Firebase Config อาจทำให้ระบบไม่สามารถเข้าถึงข้อมูลได้</span>
                  </div>
                )}

                <div className={`p-4 rounded-xl border-2 ${isEditingConfig ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : isDark ? 'border-gray-600 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="space-y-3">
                    {Object.entries(configFormData).map(([key, value]) => (
                      <div key={key}>
                        <label className={`text-xs font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{key}</label>
                        {isEditingConfig ? (
                          <input
                            type={showConfigValues ? 'text' : 'password'}
                            value={value}
                            onChange={(e) => { setConfigFormData({ ...configFormData, [key]: e.target.value }); setConfigError(''); }}
                            className={`w-full mt-1 p-2 rounded-lg border text-sm font-mono ${isDark ? 'bg-gray-800 border-red-700 text-white' : 'bg-white border-red-300 text-gray-900'}`}
                          />
                        ) : (
                          <p className={`text-sm font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {showConfigValues ? value : maskValue(value)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {isEditingConfig && (
                  <div className="flex gap-3 mt-4">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleSaveConfig}
                      className="flex-1 p-2 rounded-lg bg-red-500 text-white text-sm flex items-center justify-center gap-2"
                    >
                      <Save size={16} />
                      บันทึก Config
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => resetConfigForm()}
                      className={`flex-1 p-2 rounded-lg text-sm flex items-center justify-center gap-2 ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                    >
                      <X size={16} />
                      ยกเลิก
                    </motion.button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Firebase Config Save Confirmation Dialog */}
        {showConfigConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`rounded-2xl p-6 max-w-md w-full ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            >
              <div className="flex items-center gap-2 mb-4 text-red-500">
                <AlertTriangle size={24} />
                <h3 className="text-xl font-bold">ยืนยันการแก้ไข Firebase Config</h3>
              </div>
              <p className={`mb-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                การแก้ไขนี้อาจทำให้ระบบไม่สามารถเข้าถึงข้อมูลได้ กรุณาพิมพ์ <strong>"ยืนยัน"</strong> เพื่อดำเนินการ
              </p>
              <input
                type="text"
                value={configConfirmText}
                onChange={(e) => setConfigConfirmText(e.target.value)}
                placeholder='พิมพ์ "ยืนยัน"'
                className={`w-full p-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
              />
              {configError && (
                <p className="text-red-500 text-sm mt-2">{configError}</p>
              )}
              <div className="flex gap-3 mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setShowConfigConfirm(false); setConfigConfirmText(''); setConfigError(''); }}
                  disabled={configValidating}
                  className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                >
                  ยกเลิก
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={confirmSaveConfig}
                  disabled={configConfirmText !== 'ยืนยัน' || configValidating}
                  className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 ${
                    configConfirmText === 'ยืนยัน' && !configValidating
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {configValidating && <Loader2 size={16} className="animate-spin" />}
                  {configValidating ? 'กำลังตรวจสอบ...' : 'บันทึก'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
