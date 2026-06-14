import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  /** メンテナンス情報。maintenance=true で非管理者は閉鎖画面を表示 */
  maintenance: boolean;
  /** メンテナンスドキュメントの初回読み取りが完了したか */
  maintenanceChecked: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, role: 'student' | 'admin', furigana?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceChecked, setMaintenanceChecked] = useState(false);

  // メンテナンスフラグはアプリ全体で1回だけ購読する（旧実装では ProtectedRoute ごとに購読していた）
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'maintenance'),
      (snapshot) => {
        setMaintenance(snapshot.exists() && snapshot.data()?.enabled === true);
        setMaintenanceChecked(true);
      },
      () => { setMaintenanceChecked(true); }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const profileDoc = await getDoc(doc(db, 'users', user.uid));
        if (profileDoc.exists()) {
          setUserProfile(profileDoc.data() as UserProfile);
        }
        // プロフィールが存在しない場合はsignUp側で作成するため何もしない
        // (signUp完了前にonAuthStateChangedが発火してstudentで上書きする競合を防ぐ)
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged がプロフィールを読み込むので追加処理不要
  };

  const signUp = async (email: string, password: string, displayName: string, role: 'student' | 'admin', furigana?: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName });
    const profile: UserProfile = {
      uid: result.user.uid,
      email,
      displayName,
      ...(furigana ? { furigana } : {}),
      role,
      classIds: [],
      createdAt: new Date(),
    };
    await setDoc(doc(db, 'users', result.user.uid), profile);
    setUserProfile(profile);
  };

  const refreshProfile = async () => {
    if (currentUser) {
      const profileDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (profileDoc.exists()) {
        setUserProfile(profileDoc.data() as UserProfile);
      }
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserProfile(null);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      userProfile,
      loading,
      maintenance,
      maintenanceChecked,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
