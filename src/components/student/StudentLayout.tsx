import React, { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import ClassroomQuiz, { ClassroomSessionData } from './ClassroomQuiz';

const StudentLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile, currentUser } = useAuth();
  const [activeQuizSession, setActiveQuizSession] = useState<{ classId: string; session: ClassroomSessionData } | null>(null);
  // dismissedIdsはrefで管理。非同期ロード後もonSnapshotコールバックから参照できる。
  const dismissedRef = useRef<Set<string>>(new Set());

  // Firestoreから閲覧済みセッションIDをロード
  useEffect(() => {
    if (!currentUser) return;
    getDocs(collection(db, 'users', currentUser.uid, 'dismissedSessions')).then((snap) => {
      snap.docs.forEach((d) => dismissedRef.current.add(d.id));
    }).catch(() => {});
  }, [currentUser]);

  // アクティブセッションをリアルタイム監視
  useEffect(() => {
    if (!userProfile?.classIds?.length) return;

    const unsubscribes: (() => void)[] = [];
    for (const cid of userProfile.classIds) {
      const q = query(collection(db, 'classes', cid, 'sessions'), where('status', '==', 'active'));
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const sessionDoc = snap.docs[0];
          if (!dismissedRef.current.has(sessionDoc.id)) {
            const data = sessionDoc.data() as Omit<ClassroomSessionData, 'id'>;
            setActiveQuizSession({ classId: cid, session: { id: sessionDoc.id, ...data } });
          }
        }
        // セッション終了時はここでアンマウントしない。
        // クイズコンポーネント自身がリザルト画面を表示し、ユーザーが閉じるまで維持する。
      });
      unsubscribes.push(unsub);
    }
    return () => unsubscribes.forEach((u) => u());
  }, [userProfile]);

  const handleCloseQuiz = () => {
    if (activeQuizSession && currentUser) {
      const sessionId = activeQuizSession.session.id;
      dismissedRef.current.add(sessionId);
      // Firestoreに保存（デバイスをまたいで有効）
      setDoc(
        doc(db, 'users', currentUser.uid, 'dismissedSessions', sessionId),
        { dismissedAt: new Date() }
      ).catch(() => {});
    }
    setActiveQuizSession(null);
  };

  return (
    <>
      {activeQuizSession && (
        <ClassroomQuiz
          classId={activeQuizSession.classId}
          session={activeQuizSession.session}
          onClose={handleCloseQuiz}
        />
      )}
      {children}
    </>
  );
};

export default StudentLayout;
