/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  Timestamp,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  getDocFromCache,
  getDocFromServer
} from 'firebase/firestore';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logOut 
} from './firebase';
import { 
  Chat, 
  Message, 
  Gem, 
  UserProfile 
} from './types';
import { 
  LogOut, 
  Plus, 
  MessageSquare, 
  Gem as GemIcon, 
  Send, 
  ArrowLeft, 
  Trash2,
  Sparkles,
  User as UserIcon,
  Bot,
  CreditCard,
  CheckCircle2,
  Zap,
  Crown,
  Search,
  Image as ImageIcon,
  Volume2,
  Cpu,
  Globe,
  Paperclip,
  Copy,
  Download,
  Mic,
  Palette,
  Settings,
  X,
  FileText,
  Edit2,
  Languages,
  ImagePlus,
  Wallpaper,
  History,
  FileDown,
  Pin,
  Bookmark,
  FolderOpen,
  Eye,
  Music,
  UserCheck,
  BarChart2,
  Hash,
  Clock,
  Type as TypeIcon,
  VolumeX,
  PartyPopper,
  Brain,
  Sliders,
  Maximize2,
  Minimize2,
  FileSearch,
  Check,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality, Type } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Wystąpił nieoczekiwany błąd.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error && parsed.error.includes("permissions")) {
          errorMessage = "Brak uprawnień do wykonania tej operacji. Spróbuj zalogować się ponownie.";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white/5 border border-white/10 p-8 rounded-3xl text-center space-y-4">
            <X className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-2xl font-bold">Ups! Coś poszło nie tak</h2>
            <p className="text-gray-400">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-all"
            >
              Odśwież stronę
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'hub' | 'chat' | 'gem-creator' | 'payment'>('hub');
  const [showPlusSettings, setShowPlusSettings] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setUserProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubProfile = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserProfile(docSnap.data() as UserProfile);
      } else {
        const initialProfile = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          isPlus: false
        };
        setDoc(userRef, initialProfile).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`));
        setUserProfile(initialProfile as UserProfile);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      setLoading(false);
    });

    return () => unsubProfile();
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success' && user) {
      window.history.replaceState({}, document.title, window.location.pathname);
      setView('hub');
      // Show success message
      alert('Dziękujemy za zakup wowAI Plus! Twoja subskrypcja zostanie aktywowana automatycznie po potwierdzeniu płatności (może to potrwać kilka minut).');
    } else if (params.get('payment') === 'cancel') {
      window.history.replaceState({}, document.title, window.location.pathname);
      setView('hub');
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return (
    <ErrorBoundary>
      <div className={cn(
        "min-h-screen bg-[#0a0a0a] text-white selection:bg-orange-500/30 transition-all duration-500",
        userProfile?.fontFamily === 'serif' ? 'font-serif' : userProfile?.fontFamily === 'mono' ? 'font-mono' : 'font-sans',
        userProfile?.focusMode && "p-4"
      )}>
        {userProfile?.zenMode && (
          <div className="fixed inset-0 pointer-events-none z-0 opacity-20">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 animate-pulse" />
          </div>
        )}
        <AnimatePresence mode="wait">
          {view === 'hub' && (
            <MainHub 
              user={user} 
              userProfile={userProfile}
              onOpenChat={(id) => { setActiveChatId(id); setView('chat'); }} 
              onOpenGemCreator={() => setView('gem-creator')}
              onOpenPayment={() => setView('payment')}
              showPlusSettings={showPlusSettings}
              setShowPlusSettings={setShowPlusSettings}
            />
          )}
          {view === 'chat' && activeChatId && (
            <ChatRoom 
              user={user} 
              userProfile={userProfile}
              chatId={activeChatId} 
              onBack={() => { setView('hub'); setActiveChatId(null); }} 
            />
          )}
          {view === 'gem-creator' && (
            <GemCreator 
              user={user} 
              userProfile={userProfile}
              onBack={() => setView('hub')} 
            />
          )}
          {view === 'payment' && (
            <PaymentView 
              user={user}
              onBack={() => setView('hub')}
            />
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

function LoginView() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center space-y-8"
      >
        <div className="space-y-4">
          <div className="w-20 h-20 bg-orange-500 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-orange-500/20">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Gemini Hub</h1>
          <p className="text-gray-400">Zaloguj się, aby zacząć rozmawiać z AI i tworzyć własne Gems.</p>
        </div>
        
        <button 
          onClick={signInWithGoogle}
          className="w-full py-4 px-6 bg-white text-black font-semibold rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-100 transition-all active:scale-95"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
          Zaloguj się przez Google
        </button>
      </motion.div>
    </div>
  );
}

function MainHub({ user, userProfile, onOpenChat, onOpenGemCreator, onOpenPayment, showPlusSettings, setShowPlusSettings }: { 
  user: User, 
  userProfile: UserProfile | null,
  onOpenChat: (id: string) => void, 
  onOpenGemCreator: () => void,
  onOpenPayment: () => void,
  showPlusSettings: boolean,
  setShowPlusSettings: (show: boolean) => void
}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [gems, setGems] = useState<Gem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState(userProfile?.bio || '');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    const chatsQuery = query(collection(db, 'chats'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribeChats = onSnapshot(chatsQuery, (snapshot) => {
      setChats(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Chat)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
    });

    const gemsQuery = query(collection(db, 'gems'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribeGems = onSnapshot(gemsQuery, (snapshot) => {
      setGems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Gem)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'gems');
    });

    return () => {
      unsubscribeChats();
      unsubscribeGems();
    };
  }, [user.uid]);

  const createChat = async () => {
    try {
      const docRef = await addDoc(collection(db, 'chats'), {
        userId: user.uid,
        title: 'Nowa rozmowa',
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp()
      });
      onOpenChat(docRef.id);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    }
  };

  const openGemChat = async (gem: Gem) => {
    // Check if a chat for this gem already exists
    const existingChat = chats.find(c => c.gemId === gem.id);
    if (existingChat) {
      onOpenChat(existingChat.id);
    } else {
      try {
        const docRef = await addDoc(collection(db, 'chats'), {
          userId: user.uid,
          title: gem.name,
          gemId: gem.id,
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp()
        });
        onOpenChat(docRef.id);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'chats');
      }
    }
  };

  const startEditingChat = (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  };

  const saveChatTitle = async (e: React.FormEvent, chatId: string) => {
    e.preventDefault();
    if (!editingTitle.trim()) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), { title: editingTitle });
      setEditingChatId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
    }
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Czy na pewno chcesz usunąć tę rozmowę?')) {
      try {
        await deleteDoc(doc(db, 'chats', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `chats/${id}`);
      }
    }
  };

  const updateTheme = async (theme: UserProfile['theme']) => {
    if (!userProfile?.isPlus) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { theme });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const saveBio = async () => {
    try {
      await updateDoc(doc(db, 'users', user.uid), { bio: bioInput });
      setIsEditingBio(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const updatePlusSetting = async (key: keyof UserProfile, value: any) => {
    if (!userProfile?.isPlus) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { [key]: value });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const categories = ['all', 'Praca', 'Nauka', 'Kreatywne', 'Inne'];

  const togglePinChat = async (e: React.MouseEvent, chatId: string, currentStatus: boolean) => {
    e.stopPropagation();
    if (!userProfile?.isPlus) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        isPinned: !currentStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
    }
  };

  const updateChatCategory = async (e: React.MouseEvent, chatId: string, category: string) => {
    e.stopPropagation();
    if (!userProfile?.isPlus) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        category
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
    }
  };

  const filteredChats = chats
    .filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(c => selectedCategory === 'all' || c.category === selectedCategory)
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.lastMessageAt.toMillis() - a.lastMessageAt.toMillis();
    });

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "max-w-6xl mx-auto p-6 md:p-12 space-y-12 min-h-screen transition-colors duration-500",
        userProfile?.theme === 'cyber' && "bg-blue-950/20",
        userProfile?.theme === 'sunset' && "bg-orange-950/20",
        userProfile?.theme === 'minimal' && "bg-white/5"
      )}
    >
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <img src={user.photoURL || ''} className="w-16 h-16 rounded-2xl border border-white/10 shadow-xl" alt={user.displayName || ''} />
            {userProfile?.isPlus && (
              <div className="absolute -top-2 -right-2 bg-orange-500 rounded-full p-1.5 border-2 border-[#0a0a0a] shadow-lg">
                <Crown className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{user.displayName}</h2>
              {userProfile?.isPlus && (
                <span className="text-[10px] bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded-full font-bold tracking-wider uppercase border border-orange-500/30">Plus</span>
              )}
            </div>
            {isEditingBio ? (
              <div className="flex items-center gap-2">
                <input 
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-orange-500"
                  placeholder="Twój bio..."
                  autoFocus
                />
                <button onClick={saveBio} className="text-orange-500 text-xs font-bold">Zapisz</button>
              </div>
            ) : (
              <p 
                onClick={() => userProfile?.isPlus && setIsEditingBio(true)}
                className={cn(
                  "text-sm text-gray-500 cursor-pointer hover:text-gray-400 transition-colors",
                  !userProfile?.bio && "italic"
                )}
              >
                {userProfile?.bio || (userProfile?.isPlus ? "Kliknij, aby dodać bio..." : "Witaj w swoim Hubie")}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {userProfile?.isPlus && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPlusSettings(!showPlusSettings)}
                className={cn(
                  "p-3 rounded-xl transition-all border",
                  showPlusSettings ? "bg-orange-500 border-orange-500 text-white" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                )}
                title="Ustawienia Plus"
              >
                <Sliders className="w-5 h-5" />
              </button>
              <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                {(['dark', 'cyber', 'sunset', 'minimal'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateTheme(t)}
                    className={cn(
                      "p-2 rounded-lg transition-all",
                      userProfile.theme === t ? "bg-orange-500 text-white" : "text-gray-500 hover:text-gray-300"
                    )}
                    title={`Motyw ${t}`}
                  >
                    <Palette className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {!userProfile?.isPlus && (
            <button 
              onClick={onOpenPayment}
              className="px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-all flex items-center gap-2 shadow-lg shadow-orange-500/20"
            >
              <Zap className="w-4 h-4" />
              wowAI Plus
            </button>
          )}
          <button 
            onClick={logOut}
            className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors border border-white/10"
          >
            <LogOut className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </header>

      {showPlusSettings && userProfile?.isPlus && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-8"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Crown className="w-5 h-5 text-orange-500" />
              Ustawienia wowAI Plus
            </h3>
            <button onClick={() => setShowPlusSettings(false)} className="p-2 hover:bg-white/10 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* AI Identity */}
            <div className="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/10">
              <h4 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-gray-400">
                <Bot className="w-4 h-4" /> Tożsamość AI
              </h4>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Nazwa AI</label>
                  <input 
                    value={userProfile.aiName || 'wowAI'}
                    onChange={(e) => updatePlusSetting('aiName', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Avatar AI (URL)</label>
                  <input 
                    value={userProfile.aiAvatar || ''}
                    onChange={(e) => updatePlusSetting('aiAvatar', e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            </div>

            {/* Visuals */}
            <div className="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/10">
              <h4 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-gray-400">
                <Palette className="w-4 h-4" /> Wygląd
              </h4>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Czcionka</label>
                  <div className="flex gap-2">
                    {['sans', 'serif', 'mono'].map(f => (
                      <button 
                        key={f}
                        onClick={() => updatePlusSetting('fontFamily', f)}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs font-bold border transition-all capitalize",
                          userProfile.fontFamily === f ? "bg-orange-500 border-orange-500 text-white" : "bg-white/5 border-white/10 text-gray-500"
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Tapeta Czatu</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="color"
                      value={userProfile.wallpaper || '#0a0a0a'}
                      onChange={(e) => updatePlusSetting('wallpaper', e.target.value)}
                      className="w-10 h-10 bg-transparent border-none cursor-pointer"
                    />
                    <span className="text-xs text-gray-400 font-mono">{userProfile.wallpaper || '#0a0a0a'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modes */}
            <div className="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/10">
              <h4 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-gray-400">
                <Zap className="w-4 h-4" /> Tryby Pracy
              </h4>
              <div className="space-y-3">
                <button 
                  onClick={() => updatePlusSetting('focusMode', !userProfile.focusMode)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                    userProfile.focusMode ? "bg-orange-500/10 border-orange-500/50 text-orange-500" : "bg-white/5 border-white/10 text-gray-400"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Maximize2 className="w-4 h-4" />
                    <div className="text-left">
                      <p className="text-xs font-bold">Focus Mode</p>
                      <p className="text-[10px] opacity-60">Czysty interfejs</p>
                    </div>
                  </div>
                  {userProfile.focusMode && <Check className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => updatePlusSetting('zenMode', !userProfile.zenMode)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                    userProfile.zenMode ? "bg-blue-500/10 border-blue-500/50 text-blue-500" : "bg-white/5 border-white/10 text-gray-400"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Brain className="w-4 h-4" />
                    <div className="text-left">
                      <p className="text-xs font-bold">Zen Mode</p>
                      <p className="text-[10px] opacity-60">Spokojne tło</p>
                    </div>
                  </div>
                  {userProfile.zenMode && <Check className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Experience */}
            <div className="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/10">
              <h4 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-gray-400">
                <Volume2 className="w-4 h-4" /> Doświadczenie
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center gap-3">
                    <Volume2 className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-bold">Dźwięki</span>
                  </div>
                  <button 
                    onClick={() => updatePlusSetting('soundEnabled', !userProfile.soundEnabled)}
                    className={cn(
                      "w-10 h-5 rounded-full transition-all relative",
                      userProfile.soundEnabled ? "bg-orange-500" : "bg-white/10"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                      userProfile.soundEnabled ? "left-6" : "left-1"
                    )} />
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center gap-3">
                    <PartyPopper className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-bold">Konfetti</span>
                  </div>
                  <button 
                    onClick={() => updatePlusSetting('confettiEnabled', !userProfile.confettiEnabled)}
                    className={cn(
                      "w-10 h-5 rounded-full transition-all relative",
                      userProfile.confettiEnabled ? "bg-orange-500" : "bg-white/10"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                      userProfile.confettiEnabled ? "left-6" : "left-1"
                    )} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="relative max-w-2xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <input 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Szukaj w rozmowach..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-orange-500 transition-all shadow-xl"
        />
        
        {userProfile?.isPlus && (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mt-4">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs uppercase font-bold whitespace-nowrap transition-all border",
                  selectedCategory === cat ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20" : "bg-white/5 border-white/10 text-gray-500 hover:bg-white/10"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-12">
        {/* Chats Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold flex items-center gap-3">
              <MessageSquare className="w-6 h-6 text-orange-500" />
              Rozmowy
            </h3>
            <button 
              onClick={createChat}
              className="p-2 bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredChats.length === 0 ? (
              <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center text-gray-500">
                {searchQuery ? "Nie znaleziono rozmów." : "Brak rozmów. Kliknij +, aby zacząć."}
              </div>
            ) : (
              filteredChats.map(chat => (
                <motion.div 
                  key={chat.id}
                  layoutId={chat.id}
                  onClick={() => onOpenChat(chat.id)}
                  className={cn(
                    "group relative p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-white/10 hover:border-white/20 transition-all",
                    chat.isPinned && "border-orange-500/30 bg-orange-500/5"
                  )}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                      chat.isPinned ? "bg-orange-500 text-white" : "bg-white/5 text-gray-400 group-hover:bg-orange-500/10 group-hover:text-orange-500"
                    )}>
                      {chat.isPinned ? <Pin className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      {editingChatId === chat.id ? (
                        <form onSubmit={(e) => saveChatTitle(e, chat.id)} className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <input 
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-orange-500 w-full"
                            autoFocus
                          />
                          <button type="submit" className="text-orange-500 text-xs font-bold">Zapisz</button>
                        </form>
                      ) : (
                        <div className="space-y-0.5">
                          <p className="font-bold truncate group-hover:text-orange-500 transition-colors">{chat.title}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                              {chat.lastMessageAt.toDate().toLocaleDateString()}
                            </p>
                            {chat.category && (
                              <span className="text-[10px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded uppercase font-bold border border-white/10">
                                {chat.category}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {userProfile?.isPlus && (
                      <>
                        <button 
                          onClick={(e) => togglePinChat(e, chat.id, !!chat.isPinned)}
                          className={cn("p-2 rounded-lg hover:bg-white/10 transition-colors", chat.isPinned ? "text-orange-500" : "text-gray-500")}
                          title="Przypnij"
                        >
                          <Pin className="w-4 h-4" />
                        </button>
                        <div className="relative group/cat">
                          <button 
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-500"
                            title="Kategoria"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </button>
                          <div className="absolute right-0 bottom-full mb-2 hidden group-hover/cat:flex flex-col bg-[#1a1a1a] border border-white/10 rounded-xl p-1 z-50 shadow-2xl">
                            {categories.filter(c => c !== 'all').map(cat => (
                              <button 
                                key={cat} 
                                onClick={(e) => updateChatCategory(e, chat.id, cat)} 
                                className="px-4 py-2 text-[10px] hover:bg-white/5 rounded-lg whitespace-nowrap uppercase font-bold text-gray-400 hover:text-white text-left"
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    <button 
                      onClick={(e) => startEditingChat(e, chat)}
                      className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </section>

        {/* Gems Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold flex items-center gap-3">
              <GemIcon className="w-6 h-6 text-purple-500" />
              Twoje Gems
            </h3>
            <button 
              onClick={onOpenGemCreator}
              className="p-2 bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors shadow-lg shadow-purple-500/20"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {gems.length === 0 ? (
              <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center text-gray-500">
                Brak Gems. Stwórz swój pierwszy!
              </div>
            ) : (
              gems.map(gem => (
                <div 
                  key={gem.id}
                  onClick={() => openGemChat(gem)}
                  className="p-5 bg-white/5 border border-white/5 rounded-2xl space-y-2 hover:border-purple-500/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-lg group-hover:text-purple-400 transition-colors">{gem.name}</h4>
                    <GemIcon className="w-4 h-4 text-purple-500" />
                  </div>
                  <p className="text-sm text-gray-400 line-clamp-2">{gem.description}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </motion.div>
  );
}

function PaymentView({ user, onBack }: { user: User, onBack: () => void }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePayment = async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const response = await fetch('/api/nowpayments/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.uid }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Nie udało się utworzyć płatności. Sprawdź konfigurację API NOWPayments.');
      }

      const { url } = await response.json();
      
      if (url) {
        // Redirect to NOWPayments in a new tab to avoid iframe issues
        window.open(url, '_blank');
        // Also show a message to the user
        alert('Zostałeś przekierowany do bramki płatniczej w nowej karcie. Po zakończeniu płatności wróć tutaj.');
      } else {
        throw new Error('Brak adresu URL płatności w odpowiedzi.');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      setError(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen flex items-center justify-center p-6"
    >
      <div className="max-w-md w-full bg-white/5 border border-white/10 p-8 rounded-3xl space-y-8 relative overflow-hidden">
        <div className="space-y-4">
          <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center">
            <Zap className="w-8 h-8 text-orange-500" />
          </div>
          <h3 className="text-3xl font-bold tracking-tight">wowAI Plus</h3>
          <p className="text-gray-400 text-lg">Odblokuj funkcje premium za pomocą krypto.</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-gray-300">
            <CheckCircle2 className="w-5 h-5 text-orange-500" />
            <span>Szybsze odpowiedzi AI</span>
          </div>
          <div className="flex items-center gap-3 text-gray-300">
            <CheckCircle2 className="w-5 h-5 text-orange-500" />
            <span>Nielimitowane Gems</span>
          </div>
          <div className="flex items-center gap-3 text-gray-300">
            <CheckCircle2 className="w-5 h-5 text-orange-500" />
            <span>Zaawansowane modele AI</span>
          </div>
        </div>

        <div className="pt-6 space-y-4">
          <div className="flex items-center justify-between text-2xl font-bold mb-4">
            <span>Razem</span>
            <span>5.00 €</span>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
              {error}
            </div>
          )}

          <button 
            onClick={handlePayment}
            disabled={isProcessing}
            className="w-full py-4 bg-orange-500 rounded-2xl font-bold text-lg hover:bg-orange-600 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-xl shadow-orange-500/20"
          >
            {isProcessing ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                Kup PLUS (Krypto)
              </>
            )}
          </button>

          <p className="text-xs text-center text-gray-500">
            Płatność obsługiwana przez NOWPayments. Twoje konto zostanie ulepszone automatycznie po potwierdzeniu transakcji w sieci.
          </p>

          <button 
            onClick={onBack}
            className="w-full py-2 text-gray-500 hover:text-white transition-colors text-sm"
          >
            Wróć do Hubu
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ChatRoom({ user, userProfile, chatId, onBack }: { user: User, userProfile: UserProfile | null, chatId: string, onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [gem, setGem] = useState<Gem | null>(null);
  const [messageTimestamps, setMessageTimestamps] = useState<number[]>([]);
  const [useSearch, setUseSearch] = useState(false);
  const [usePro, setUsePro] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isReading, setIsReading] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [chatTitle, setChatTitle] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [wallpaper, setWallpaper] = useState(userProfile?.wallpaper || '');
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlToAnalyze, setUrlToAnalyze] = useState('');
  const [isAnalyzingUrl, setIsAnalyzingUrl] = useState(false);
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [temp, setTemp] = useState(0.7);
  const [topP, setTopP] = useState(0.95);
  const [topK, setTopK] = useState(64);
  const scrollRef = useRef<HTMLDivElement>(null);

  const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    });
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('WebkitSpeechRecognition' in window || 'speechRecognition' in window)) {
      const SpeechRecognition = (window as any).WebkitSpeechRecognition || (window as any).speechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'pl-PL';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev + ' ' + transcript);
        setIsRecording(false);
      };

      recognitionRef.current.onerror = () => setIsRecording(false);
      recognitionRef.current.onend = () => setIsRecording(false);
    }
  }, []);

  const toggleRecording = () => {
    if (!userProfile?.isPlus) return;
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      setIsRecording(true);
      recognitionRef.current?.start();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Skopiowano do schowka!');
  };

  const exportChat = () => {
    if (!userProfile?.isPlus) return;
    const chatContent = messages.map(m => `${m.role === 'user' ? 'TY' : 'AI'}: ${m.content}`).join('\n\n');
    const blob = new Blob([chatContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${chatId}.txt`;
    a.click();
  };

  const saveChatTitle = async () => {
    if (!chatTitle.trim()) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), { title: chatTitle });
      setIsEditingTitle(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
    }
  };

  const summarizeChat = async () => {
    if (!userProfile?.isPlus) return;
    setIsSummarizing(true);
    try {
      const chatHistory = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Podsumuj tę rozmowę w zwięzły sposób. Wypunktuj kluczowe ustalenia.
        Historia:
        ${chatHistory}`,
      });
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'model',
        content: `📝 **Podsumowanie rozmowy:**\n\n${response.text}`,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsSummarizing(false);
    }
  };

  const translateMessage = async (messageId: string, content: string) => {
    if (!userProfile?.isPlus) return;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Przetłumacz tę wiadomość na polski. Jeśli jest już po polsku, przetłumacz na angielski. Zwróć TYLKO przetłumaczony tekst.
        Tekst: "${content}"`,
      });
      
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(msgRef, {
        content: `${content}\n\n--- 🌐 Tłumaczenie ---\n${response.text}`
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  const generateVariation = async (originalImage: string) => {
    if (!userProfile?.isPlus) return;
    setIsTyping(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: originalImage.split(',')[1], mimeType: "image/png" } },
            { text: "Wygeneruj kreatywną wariację tego obrazu. Zachowaj główny temat, ale zmień styl lub otoczenie." }
          ]
        }
      });

      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const rawImage = `data:image/png;base64,${part.inlineData.data}`;
          imageUrl = await compressImage(rawImage);
          break;
        }
      }

      if (imageUrl) {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          chatId,
          userId: user.uid,
          role: 'model',
          content: "Oto wariacja Twojego obrazu ✨",
          image: imageUrl,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsTyping(false);
    }
  };

  const updateWallpaper = async (color: string) => {
    if (!userProfile?.isPlus) return;
    setWallpaper(color);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        wallpaper: color
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const exportToMarkdown = () => {
    if (!userProfile?.isPlus) return;
    const content = messages.map(m => `### ${m.role === 'user' ? 'TY' : 'AI'}\n${m.content}`).join('\n\n---\n\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${chatId}.md`;
    a.click();
  };

  const analyzeUrl = async () => {
    if (!userProfile?.isPlus || !urlToAnalyze.trim()) return;
    setIsAnalyzingUrl(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Przeanalizuj treść pod tym adresem URL i streść najważniejsze informacje: ${urlToAnalyze}`,
        config: { tools: [{ urlContext: {} }] }
      });
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'model',
        content: `🌐 **Analiza strony:** ${urlToAnalyze}\n\n${response.text}`,
        createdAt: serverTimestamp(),
      });
      setShowUrlInput(false);
      setUrlToAnalyze('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsAnalyzingUrl(false);
    }
  };

  const performOcr = async (imageUrl: string) => {
    if (!userProfile?.isPlus) return;
    setIsTyping(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { inlineData: { data: imageUrl.split(',')[1], mimeType: "image/png" } },
            { text: "Wyodrębnij cały tekst z tego obrazu. Zwróć tylko tekst." }
          ]
        }
      });
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'model',
        content: `🔍 **Wyodrębniony tekst:**\n\n${response.text}`,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsTyping(false);
    }
  };

  const changeTone = async (messageId: string, content: string, tone: string) => {
    if (!userProfile?.isPlus) return;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Przepisz tę wiadomość w tonie: ${tone}. Zachowaj oryginalny sens.\n\nTekst: "${content}"`,
      });
      
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(msgRef, {
        content: `${content}\n\n--- ✨ Ton: ${tone} ---\n${response.text}`
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  const fixGrammar = async (messageId: string, content: string) => {
    if (!userProfile?.isPlus) return;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Popraw błędy gramatyczne, ortograficzne i interpunkcyjne w tym tekście. Zwróć tylko poprawioną wersję.\n\nTekst: "${content}"`,
      });
      
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(msgRef, {
        content: `${content}\n\n--- ✍️ Poprawiona wersja ---\n${response.text}`
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  const analyzeSentiment = async () => {
    if (!userProfile?.isPlus) return;
    try {
      const chatHistory = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Przeanalizuj sentyment tej rozmowy. Czy jest pozytywny, negatywny czy neutralny? Wypisz też 3 główne słowa kluczowe.\n\nHistoria:\n${chatHistory}`,
      });
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'model',
        content: `📊 **Analiza rozmowy:**\n\n${response.text}`,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    }
  };

  const togglePinMessage = async (messageId: string, currentStatus: boolean) => {
    if (!userProfile?.isPlus) return;
    try {
      await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
        isPinned: !currentStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  const toggleBookmarkMessage = async (messageId: string, currentStatus: boolean) => {
    if (!userProfile?.isPlus) return;
    try {
      await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
        isBookmarked: !currentStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  const explainCode = async (messageId: string, content: string) => {
    if (!userProfile?.isPlus) return;
    setIsTyping(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Wyjaśnij ten kod krok po kroku w prosty sposób. Skup się na logice.\n\nKod:\n${content}`,
      });
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'model',
        content: `💻 **Wyjaśnienie kodu:**\n\n${response.text}`,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsTyping(false);
    }
  };

  const optimizeCode = async (messageId: string, content: string) => {
    if (!userProfile?.isPlus) return;
    setIsTyping(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Zasugeruj optymalizację dla tego kodu. Popraw wydajność, czytelność i bezpieczeństwo.\n\nKod:\n${content}`,
      });
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'model',
        content: `🚀 **Optymalizacja kodu:**\n\n${response.text}`,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsTyping(false);
    }
  };

  const generateQuiz = async () => {
    if (!userProfile?.isPlus) return;
    setIsTyping(true);
    try {
      const chatHistory = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Na podstawie tej rozmowy wygeneruj krótki quiz (3 pytania wielokrotnego wyboru) sprawdzający wiedzę. Podaj poprawne odpowiedzi na końcu.\n\nHistoria:\n${chatHistory}`,
      });
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'model',
        content: `🧠 **Quiz wiedzy:**\n\n${response.text}`,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsTyping(false);
    }
  };

  const extractKeyTerms = async () => {
    if (!userProfile?.isPlus) return;
    setIsTyping(true);
    try {
      const chatHistory = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Wypisz najważniejsze pojęcia, terminy i definicje, które pojawiły się w tej rozmowie.\n\nHistoria:\n${chatHistory}`,
      });
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'model',
        content: `📚 **Kluczowe pojęcia:**\n\n${response.text}`,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsTyping(false);
    }
  };

  const createActionItems = async () => {
    if (!userProfile?.isPlus) return;
    setIsTyping(true);
    try {
      const chatHistory = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Wyodrębnij z tej rozmowy listę zadań do wykonania (Action Items / TODO list).\n\nHistoria:\n${chatHistory}`,
      });
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'model',
        content: `✅ **Lista zadań:**\n\n${response.text}`,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsTyping(false);
    }
  };

  const factCheck = async (content: string) => {
    if (!userProfile?.isPlus) return;
    setIsTyping(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Sprawdź fakty w tej wypowiedzi AI. Czy są one prawdziwe i aktualne? Użyj wyszukiwarki Google, aby potwierdzić informacje.\n\nTekst: "${content}"`,
        config: { tools: [{ googleSearch: {} }] }
      });
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'model',
        content: `🔍 **Fact-check:**\n\n${response.text}`,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsTyping(false);
    }
  };

  const generateImageFromMessage = async (content: string) => {
    if (!userProfile?.isPlus) return;
    setIsTyping(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `Stwórz obraz na podstawie tego tekstu: "${content}"` }] },
      });
      
      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const rawImage = `data:image/png;base64,${part.inlineData.data}`;
          imageUrl = await compressImage(rawImage);
          break;
        }
      }

      if (imageUrl) {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          chatId,
          userId: user.uid,
          role: 'model',
          content: "Oto obraz wygenerowany na podstawie treści wiadomości 🎨",
          image: imageUrl,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsTyping(false);
    }
  };

  const rewriteClarity = async (messageId: string, content: string) => {
    if (!userProfile?.isPlus) return;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Przepisz tę wiadomość tak, aby była jak najbardziej klarowna i zrozumiała. Usuń zbędne słowa.\n\nTekst: "${content}"`,
      });
      
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(msgRef, {
        content: `${content}\n\n--- 💡 Klarowniejsza wersja ---\n${response.text}`
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  const expandContent = async (messageId: string, content: string) => {
    if (!userProfile?.isPlus) return;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Rozwiń tę wiadomość. Dodaj więcej szczegółów, przykładów i wyjaśnień.\n\nTekst: "${content}"`,
      });
      
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(msgRef, {
        content: `${content}\n\n--- 📝 Rozwinięta wersja ---\n${response.text}`
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  const shortenContent = async (messageId: string, content: string) => {
    if (!userProfile?.isPlus) return;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Skróć tę wiadomość do absolutnego minimum, zachowując najważniejszy przekaz.\n\nTekst: "${content}"`,
      });
      
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(msgRef, {
        content: `${content}\n\n--- ✂️ Skrócona wersja ---\n${response.text}`
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  const extractLinks = async (messageId: string, content: string) => {
    if (!userProfile?.isPlus) return;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Wyodrębnij wszystkie linki (URL) z tego tekstu i wypisz je w czytelnej liście.\n\nTekst: "${content}"`,
      });
      
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(msgRef, {
        content: `${content}\n\n--- 🔗 Wyodrębnione linki ---\n${response.text}`
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  const wordCount = messages.reduce((acc, m) => acc + m.content.split(/\s+/).length, 0);
  const charCount = messages.reduce((acc, m) => acc + m.content.length, 0);
  const readingTime = Math.ceil(wordCount / 200);

  const generateSmartReplies = async (lastMessage: string) => {
    if (!userProfile?.isPlus) return;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Na podstawie tej odpowiedzi AI, zaproponuj 3 krótkie, trafne szybkie odpowiedzi dla użytkownika (po polsku). Zwróć TYLKO tablicę JSON ze stringami.
        AI: "${lastMessage}"`,
        config: { responseMimeType: "application/json" }
      });
      const replies = JSON.parse(response.text || '[]');
      setSmartReplies(replies.slice(0, 3));
    } catch (error) {
      console.error("Error generating smart replies:", error);
    }
  };

  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === 'model' && userProfile?.isPlus) {
      generateSmartReplies(messages[messages.length - 1].content);
    } else {
      setSmartReplies([]);
    }
  }, [messages, userProfile?.isPlus]);

  useEffect(() => {
    const fetchChatAndGem = async () => {
      try {
        const chatDoc = await getDoc(doc(db, 'chats', chatId));
        if (chatDoc.exists()) {
          const chatData = chatDoc.data() as Chat;
          setChatTitle(chatData.title);
          if (chatData.gemId) {
            const gemDoc = await getDoc(doc(db, 'gems', chatData.gemId));
            if (gemDoc.exists()) {
              setGem({ id: gemDoc.id, ...gemDoc.data() } as Gem);
            }
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `chats/${chatId}`);
      }
    };
    fetchChatAndGem();

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${chatId}/messages`);
    });
    return () => unsubscribe();
  }, [chatId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImage(reader.result as string);
        setSelectedImage(compressed);
      };
      reader.readAsDataURL(file);
    } else if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      if (!userProfile?.isPlus) {
        alert("Przesyłanie plików tekstowych jest dostępne tylko dla użytkowników Plus!");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setInput(prev => prev + `\n\n--- Zawartość pliku ${file.name} ---\n${content}\n--- Koniec pliku ---`);
      };
      reader.readAsText(file);
    }
  };

  const playTTS = async (text: string, messageId: string) => {
    if (isReading) return;
    setIsReading(messageId);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
        audio.onended = () => setIsReading(null);
        audio.play();
      } else {
        setIsReading(null);
      }
    } catch (error) {
      console.error('TTS error:', error);
      setIsReading(null);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || isTyping) return;

    // Rate limiting logic
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentMessages = messageTimestamps.filter(t => t > oneMinuteAgo);
    
    const limit = userProfile?.isPlus ? 10 : 5;
    
    if (recentMessages.length >= limit) {
      alert(`Osiągnięto limit wiadomości (${limit}/min). ${userProfile?.isPlus ? '' : 'Kup wowAI Plus, aby zwiększyć limit do 10/min!'}`);
      return;
    }

    const userMessage = input;
    const currentImage = selectedImage;
    setInput('');
    setSelectedImage(null);
    setIsTyping(true);
    setMessageTimestamps([...recentMessages, now]);

    try {
      // 1. Add user message to Firestore
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'user',
        content: userMessage || (currentImage ? "[Obraz]" : ""),
        image: currentImage,
        createdAt: serverTimestamp()
      });

      // Update chat title if it's the first message
      if (messages.length === 0) {
        await updateDoc(doc(db, 'chats', chatId), {
          title: (userMessage || "Nowa rozmowa").slice(0, 30)
        });
      }

      let botResponse = "";
      let responseImage = null;

      // Check for /draw command
      if (userMessage.startsWith('/draw ') && userProfile?.isPlus) {
        const prompt = userMessage.replace('/draw ', '');
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: prompt }] },
        });
        
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const rawImage = `data:image/png;base64,${part.inlineData.data}`;
            responseImage = await compressImage(rawImage);
            botResponse = `Oto wygenerowany obraz dla: "${prompt}"`;
          } else if (part.text) {
            botResponse = part.text;
          }
        }
      } else {
        // Regular Gemini Call
        const history = messages.map(m => ({
          role: m.role,
          parts: [{ text: m.content }]
        }));

        const systemInstruction = gem 
          ? `Jesteś wyspecjalizowanym Gemem o nazwie "${gem.name}". Twoje instrukcje: ${gem.description}`
          : "Jesteś pomocnym asystentem AI. Pamiętaj kontekst rozmowy.";

        const modelName = (usePro && userProfile?.isPlus) ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";
        
        const contents: any[] = [...history];
        const currentParts: any[] = [];
        if (currentImage) {
          currentParts.push({
            inlineData: {
              data: currentImage.split(',')[1],
              mimeType: 'image/png'
            }
          });
        }
        currentParts.push({ text: userMessage || "Co jest na tym obrazku?" });
        contents.push({ role: 'user', parts: currentParts });

        const response = await ai.models.generateContent({
          model: modelName,
          contents: contents,
          config: {
            systemInstruction,
            tools: (useSearch && userProfile?.isPlus) ? [{ googleSearch: {} }] : undefined,
          },
        });
        
        botResponse = response.text || "Przepraszam, nie mogłem wygenerować odpowiedzi.";
      }

      // 4. Add bot response to Firestore
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        userId: user.uid,
        role: 'model',
        content: botResponse,
        image: responseImage,
        createdAt: serverTimestamp()
      });

      // Update lastMessageAt
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessageAt: serverTimestamp()
      });

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="h-screen flex flex-col"
    >
      <header className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0a0a0a]/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input 
                  value={chatTitle}
                  onChange={(e) => setChatTitle(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-orange-500 w-full max-w-[200px]"
                  autoFocus
                  onBlur={saveChatTitle}
                  onKeyDown={(e) => e.key === 'Enter' && saveChatTitle()}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h3 
                  className="font-bold cursor-pointer hover:text-orange-500 transition-colors"
                  onClick={() => setIsEditingTitle(true)}
                >
                  {gem ? gem.name : (chatTitle || 'Rozmowa')}
                </h3>
                {!gem && (
                  <button 
                    onClick={() => setIsEditingTitle(true)}
                    className="p-1 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-orange-500 transition-all"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
            {gem && <p className="text-[10px] text-purple-400 uppercase font-bold tracking-widest">Gem Active</p>}
          </div>
        </div>

        {userProfile?.isPlus && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className={cn(
                  "p-2 rounded-xl transition-all",
                  showPlusMenu ? "bg-orange-500 text-white" : "bg-white/5 text-orange-500 hover:bg-white/10"
                )}
                title="Plus Power Menu"
              >
                <Zap className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {showPlusMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-72 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl p-2 z-50 grid grid-cols-2 gap-1 overflow-y-auto max-h-[400px]"
                  >
                    <button onClick={summarizeChat} className="flex flex-col items-center gap-2 p-3 hover:bg-white/5 rounded-xl transition-all text-[10px] uppercase font-bold text-gray-400 hover:text-white">
                      <History className="w-4 h-4 text-orange-500" /> Podsumuj
                    </button>
                    <button onClick={analyzeSentiment} className="flex flex-col items-center gap-2 p-3 hover:bg-white/5 rounded-xl transition-all text-[10px] uppercase font-bold text-gray-400 hover:text-white">
                      <BarChart2 className="w-4 h-4 text-blue-500" /> Analiza
                    </button>
                    <button onClick={() => setShowUrlInput(!showUrlInput)} className="flex flex-col items-center gap-2 p-3 hover:bg-white/5 rounded-xl transition-all text-[10px] uppercase font-bold text-gray-400 hover:text-white">
                      <Globe className="w-4 h-4 text-green-500" /> Analiza URL
                    </button>
                    <button onClick={generateQuiz} className="flex flex-col items-center gap-2 p-3 hover:bg-white/5 rounded-xl transition-all text-[10px] uppercase font-bold text-gray-400 hover:text-white">
                      <Brain className="w-4 h-4 text-purple-500" /> Quiz
                    </button>
                    <button onClick={extractKeyTerms} className="flex flex-col items-center gap-2 p-3 hover:bg-white/5 rounded-xl transition-all text-[10px] uppercase font-bold text-gray-400 hover:text-white">
                      <Hash className="w-4 h-4 text-yellow-500" /> Pojęcia
                    </button>
                    <button onClick={createActionItems} className="flex flex-col items-center gap-2 p-3 hover:bg-white/5 rounded-xl transition-all text-[10px] uppercase font-bold text-gray-400 hover:text-white">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Zadania
                    </button>
                    <button onClick={exportToMarkdown} className="flex flex-col items-center gap-2 p-3 hover:bg-white/5 rounded-xl transition-all text-[10px] uppercase font-bold text-gray-400 hover:text-white">
                      <FileDown className="w-4 h-4 text-purple-500" /> Markdown
                    </button>
                    <button onClick={() => setShowWallpaperPicker(!showWallpaperPicker)} className="flex flex-col items-center gap-2 p-3 hover:bg-white/5 rounded-xl transition-all text-[10px] uppercase font-bold text-gray-400 hover:text-white">
                      <Palette className="w-4 h-4 text-pink-500" /> Tapeta
                    </button>
                    <button onClick={() => setShowAdvancedParams(!showAdvancedParams)} className="flex flex-col items-center gap-2 p-3 hover:bg-white/5 rounded-xl transition-all text-[10px] uppercase font-bold text-gray-400 hover:text-white">
                      <Sliders className="w-4 h-4 text-yellow-500" /> Parametry
                    </button>
                    <div className="col-span-2 p-2 border-t border-white/5 mt-1">
                      <div className="flex justify-between text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                        <span>Słowa: {wordCount}</span>
                        <span>Czas: {readingTime}m</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={exportChat}
              className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-all text-gray-400"
              title="Eksportuj do .txt"
            >
              <Download className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setUseSearch(!useSearch)}
              className={cn(
                "p-2 rounded-xl transition-all flex items-center gap-2 text-xs font-bold",
                useSearch ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-white/5 text-gray-500 border border-transparent"
              )}
              title="Google Search Grounding"
            >
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">Search</span>
            </button>
            <button 
              onClick={() => setUsePro(!usePro)}
              className={cn(
                "p-2 rounded-xl transition-all flex items-center gap-2 text-xs font-bold",
                usePro ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-white/5 text-gray-500 border border-transparent"
              )}
              title="Advanced Pro Model"
            >
              <Cpu className="w-4 h-4" />
              <span className="hidden sm:inline">Pro</span>
            </button>
          </div>
        )}
      </header>

      {showUrlInput && (
        <div className="p-4 bg-[#1a1a1a] border-b border-white/10 flex gap-2">
          <input 
            value={urlToAnalyze}
            onChange={(e) => setUrlToAnalyze(e.target.value)}
            placeholder="Wklej URL do analizy..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-green-500"
          />
          <button 
            onClick={analyzeUrl}
            disabled={isAnalyzingUrl}
            className="px-4 py-2 bg-green-500 rounded-xl text-sm font-bold disabled:opacity-50"
          >
            {isAnalyzingUrl ? "Analizowanie..." : "Analizuj"}
          </button>
          <button onClick={() => setShowUrlInput(false)} className="p-2 hover:bg-white/5 rounded-xl">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showAdvancedParams && (
        <div className="p-4 bg-[#1a1a1a] border-b border-white/10 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-500">Temperature: {temp}</label>
              <input type="range" min="0" max="2" step="0.1" value={temp} onChange={(e) => setTemp(parseFloat(e.target.value))} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-500">Top P: {topP}</label>
              <input type="range" min="0" max="1" step="0.05" value={topP} onChange={(e) => setTopP(parseFloat(e.target.value))} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-500">Top K: {topK}</label>
              <input type="range" min="1" max="100" step="1" value={topK} onChange={(e) => setTopK(parseInt(e.target.value))} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500" />
            </div>
          </div>
        </div>
      )}

      {showWallpaperPicker && (
        <div className="p-4 bg-white/5 border-b border-white/10 flex gap-2 overflow-x-auto">
          {['', '#1a1a1a', '#2d1b4d', '#1b3d2d', '#3d1b1b', '#1b2d3d'].map(color => (
            <button
              key={color}
              onClick={() => updateWallpaper(color)}
              className={cn(
                "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                wallpaper === color ? "border-white" : "border-transparent"
              )}
              style={{ backgroundColor: color || 'transparent', backgroundImage: color ? 'none' : 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)', backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px' }}
            />
          ))}
          <input 
            type="color" 
            value={wallpaper.startsWith('#') ? wallpaper : '#000000'} 
            onChange={(e) => updateWallpaper(e.target.value)}
            className="w-8 h-8 rounded-full overflow-hidden border-none p-0 cursor-pointer"
          />
        </div>
      )}

      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth"
        style={{ backgroundColor: wallpaper || undefined }}
      >
        {messages.length === 0 && !isTyping && (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
            <Sparkles className="w-12 h-12 opacity-20" />
            <p>Zadaj pytanie Gemini...</p>
            {userProfile?.isPlus && <p className="text-xs text-orange-500/50">Użyj /draw [opis], aby wygenerować obraz</p>}
          </div>
        )}
        {messages.map((m) => (
          <motion.div 
            key={m.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn(
              "flex gap-4 max-w-3xl mx-auto group",
              m.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
              m.role === 'user' ? "bg-orange-500" : "bg-white/10"
            )}>
              {m.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className="space-y-2 max-w-[85%]">
              <div className={cn(
                "p-4 rounded-2xl text-sm leading-relaxed relative",
                m.role === 'user' ? "bg-orange-500/10 text-orange-100" : "bg-white/5 text-gray-200"
              )}>
                {m.image && (
                  <div className="space-y-2">
                    <img 
                      src={m.image} 
                      className="w-full max-w-sm rounded-xl mb-3 border border-white/10" 
                      alt="Uploaded/Generated" 
                      referrerPolicy="no-referrer"
                    />
                    {userProfile?.isPlus && m.role === 'model' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => generateVariation(m.image!)}
                          className="flex items-center gap-2 text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded-full transition-colors uppercase font-bold tracking-wider"
                        >
                          <ImagePlus className="w-3 h-3" />
                          Wariacja
                        </button>
                        <button
                          onClick={() => performOcr(m.image!)}
                          className="flex items-center gap-2 text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded-full transition-colors uppercase font-bold tracking-wider"
                        >
                          <FileSearch className="w-3 h-3" />
                          OCR
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className="markdown-body">
                  <ReactMarkdown>
                    {m.content}
                  </ReactMarkdown>
                </div>
                
                {m.role === 'model' && userProfile?.isPlus && (
                  <div className="absolute -right-10 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={() => playTTS(m.content, m.id)}
                      className={cn(
                        "p-2 rounded-lg hover:bg-white/5 transition-all",
                        isReading === m.id && "text-orange-500 opacity-100 animate-pulse"
                      )}
                      title="Czytaj na głos"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => translateMessage(m.id, m.content)}
                      className="p-2 rounded-lg hover:bg-white/5 transition-all text-gray-500 hover:text-white"
                      title="Tłumacz"
                    >
                      <Languages className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => fixGrammar(m.id, m.content)}
                      className="p-2 rounded-lg hover:bg-white/5 transition-all text-gray-500 hover:text-white"
                      title="Popraw gramatykę"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <div className="relative group/tone">
                      <button className="p-2 rounded-lg hover:bg-white/5 transition-all text-gray-500 hover:text-white">
                        <TypeIcon className="w-4 h-4" />
                      </button>
                      <div className="absolute left-full top-0 ml-2 hidden group-hover/tone:flex flex-col bg-[#1a1a1a] border border-white/10 rounded-xl p-1 z-50">
                        {['Formalny', 'Luzacki', 'Profesjonalny', 'Kreatywny'].map(tone => (
                          <button key={tone} onClick={() => changeTone(m.id, m.content, tone)} className="px-3 py-1 text-[10px] hover:bg-white/5 rounded-lg whitespace-nowrap uppercase font-bold text-gray-400 hover:text-white">
                            {tone}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="relative group/magic">
                      <button className="p-2 rounded-lg hover:bg-white/5 transition-all text-orange-500">
                        <Sparkles className="w-4 h-4" />
                      </button>
                      <div className="absolute left-full top-0 ml-2 hidden group-hover/magic:flex flex-col bg-[#1a1a1a] border border-white/10 rounded-xl p-1 z-50 min-w-[120px]">
                        <button onClick={() => rewriteClarity(m.id, m.content)} className="px-3 py-1.5 text-[10px] hover:bg-white/5 rounded-lg text-left uppercase font-bold text-gray-400 hover:text-white flex items-center gap-2">
                          <Eye className="w-3 h-3" /> Klarowność
                        </button>
                        <button onClick={() => expandContent(m.id, m.content)} className="px-3 py-1.5 text-[10px] hover:bg-white/5 rounded-lg text-left uppercase font-bold text-gray-400 hover:text-white flex items-center gap-2">
                          <Maximize2 className="w-3 h-3" /> Rozwiń
                        </button>
                        <button onClick={() => shortenContent(m.id, m.content)} className="px-3 py-1.5 text-[10px] hover:bg-white/5 rounded-lg text-left uppercase font-bold text-gray-400 hover:text-white flex items-center gap-2">
                          <Minimize2 className="w-3 h-3" /> Skróć
                        </button>
                        <button onClick={() => extractLinks(m.id, m.content)} className="px-3 py-1.5 text-[10px] hover:bg-white/5 rounded-lg text-left uppercase font-bold text-gray-400 hover:text-white flex items-center gap-2">
                          <Globe className="w-3 h-3" /> Linki
                        </button>
                        <button onClick={() => generateImageFromMessage(m.content)} className="px-3 py-1.5 text-[10px] hover:bg-white/5 rounded-lg text-left uppercase font-bold text-gray-400 hover:text-white flex items-center gap-2">
                          <ImageIcon className="w-3 h-3" /> Obraz
                        </button>
                        {m.content.includes('```') && (
                          <>
                            <button onClick={() => explainCode(m.id, m.content)} className="px-3 py-1.5 text-[10px] hover:bg-white/5 rounded-lg text-left uppercase font-bold text-gray-400 hover:text-white flex items-center gap-2">
                              <Cpu className="w-3 h-3" /> Wyjaśnij Kod
                            </button>
                            <button onClick={() => optimizeCode(m.id, m.content)} className="px-3 py-1.5 text-[10px] hover:bg-white/5 rounded-lg text-left uppercase font-bold text-gray-400 hover:text-white flex items-center gap-2">
                              <Zap className="w-3 h-3" /> Optymalizuj
                            </button>
                          </>
                        )}
                        {m.role === 'model' && (
                          <button onClick={() => factCheck(m.content)} className="px-3 py-1.5 text-[10px] hover:bg-white/5 rounded-lg text-left uppercase font-bold text-gray-400 hover:text-white flex items-center gap-2">
                            <UserCheck className="w-3 h-3" /> Fact-check
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className={cn(
                  "absolute top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all",
                  m.role === 'user' ? "-left-10" : "-right-10",
                  m.role === 'model' && userProfile?.isPlus ? "top-20" : "top-0"
                )}>
                  <button 
                    onClick={() => copyToClipboard(m.content)}
                    className="p-2 rounded-lg hover:bg-white/5 transition-all"
                    title="Kopiuj"
                  >
                    <Copy className="w-4 h-4 text-gray-500" />
                  </button>
                  {userProfile?.isPlus && (
                    <>
                      <button 
                        onClick={() => togglePinMessage(m.id, !!m.isPinned)}
                        className={cn("p-2 rounded-lg hover:bg-white/5 transition-all", m.isPinned ? "text-orange-500" : "text-gray-500")}
                        title="Przypnij"
                      >
                        <Pin className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => toggleBookmarkMessage(m.id, !!m.isBookmarked)}
                        className={cn("p-2 rounded-lg hover:bg-white/5 transition-all", m.isBookmarked ? "text-blue-500" : "text-gray-500")}
                        title="Zakładka"
                      >
                        <Bookmark className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-4 max-w-3xl mx-auto"
          >
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-4 rounded-2xl bg-white/5 flex gap-1">
              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </motion.div>
        )}
        {smartReplies.length > 0 && !isTyping && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2 justify-center max-w-3xl mx-auto pt-4"
          >
            {smartReplies.map((reply, i) => (
              <button
                key={i}
                onClick={() => {
                  setInput(reply);
                }}
                className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-full transition-all text-white/60 hover:text-white hover:border-orange-500/50"
              >
                {reply}
              </button>
            ))}
          </motion.div>
        )}
      </div>

      <form onSubmit={sendMessage} className="p-4 border-t border-white/10 bg-[#0a0a0a] space-y-4">
        {selectedImage && (
          <div className="max-w-3xl mx-auto relative inline-block">
            <img src={selectedImage} className="h-20 rounded-xl border border-white/20" alt="Preview" />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1"
            >
              <Plus className="w-3 h-3 rotate-45" />
            </button>
          </div>
        )}
        
        <div className="max-w-3xl mx-auto flex gap-3">
          {userProfile?.isPlus && (
            <>
              <button 
                type="button"
                onClick={toggleRecording}
                className={cn(
                  "p-3 rounded-xl transition-all",
                  isRecording ? "bg-red-500 text-white animate-pulse" : "bg-white/5 text-gray-400 hover:bg-white/10"
                )}
                title="Wprowadzanie głosowe"
              >
                <Mic className="w-5 h-5" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="image/*,.txt,.md" 
                className="hidden" 
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
              >
                <Paperclip className="w-5 h-5 text-gray-400" />
              </button>
            </>
          )}
          <input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={userProfile?.isPlus ? "Napisz coś lub użyj /draw..." : "Napisz coś..."}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
          />
          <button 
            type="submit"
            disabled={(!input.trim() && !selectedImage) || isTyping}
            className="p-3 bg-orange-500 rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-orange-500 transition-all active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </motion.div>
  );
}

function GemCreator({ user, userProfile, onBack }: { user: User, userProfile: UserProfile | null, onBack: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [icon, setIcon] = useState('Bot');
  const [temp, setTemp] = useState(0.7);

  const icons = ['Bot', 'Zap', 'Cpu', 'Globe', 'Palette', 'Search', 'Volume2', 'FileText'];

  const createGem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || loading) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'gems'), {
        userId: user.uid,
        name,
        description: desc,
        isAdvanced: isAdvanced && userProfile?.isPlus,
        icon: userProfile?.isPlus ? icon : 'Bot',
        temperature: userProfile?.isPlus ? temp : 0.7,
        createdAt: serverTimestamp()
      });
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'gems');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="min-h-screen flex items-center justify-center p-6"
    >
      <div className="max-w-md w-full bg-white/5 border border-white/10 p-8 rounded-3xl space-y-8">
        <div className="space-y-2">
          <h3 className="text-3xl font-bold flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-purple-500" />
            Stwórz Gem
          </h3>
          <p className="text-gray-500">Zdefiniuj własną personę AI lub specjalistyczny prompt.</p>
        </div>

        <form onSubmit={createGem} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Nazwa Gema</label>
            <input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Ekspert od Pythona"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Opis / Instrukcje</label>
            <textarea 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Jak AI powinno się zachowywać?"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 h-32 resize-none focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {userProfile?.isPlus && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Ikona Gema</label>
                <div className="flex flex-wrap gap-2">
                  {icons.map(i => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setIcon(i)}
                      className={cn(
                        "p-3 rounded-xl border transition-all",
                        icon === i ? "bg-purple-500 border-purple-400 text-white" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                      )}
                    >
                      {i === 'Bot' && <Bot className="w-4 h-4" />}
                      {i === 'Zap' && <Zap className="w-4 h-4" />}
                      {i === 'Cpu' && <Cpu className="w-4 h-4" />}
                      {i === 'Globe' && <Globe className="w-4 h-4" />}
                      {i === 'Palette' && <Palette className="w-4 h-4" />}
                      {i === 'Search' && <Search className="w-4 h-4" />}
                      {i === 'Volume2' && <Volume2 className="w-4 h-4" />}
                      {i === 'FileText' && <FileText className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-gray-400">Kreatywność (Temperature)</label>
                  <span className="text-xs font-mono text-purple-400">{temp}</span>
                </div>
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temp}
                  onChange={(e) => setTemp(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
            </div>
          )}

          <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="font-bold text-sm">Tryb Zaawansowany</p>
                <p className="text-xs text-gray-500">Głębsza analiza i lepsza pamięć.</p>
              </div>
            </div>
            <button 
              type="button"
              disabled={!userProfile?.isPlus}
              onClick={() => setIsAdvanced(!isAdvanced)}
              className={cn(
                "w-12 h-6 rounded-full transition-all relative",
                isAdvanced ? "bg-purple-500" : "bg-white/10",
                !userProfile?.isPlus && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                isAdvanced ? "left-7" : "left-1"
              )} />
            </button>
          </div>
          {!userProfile?.isPlus && (
            <p className="text-[10px] text-center text-purple-400 font-medium uppercase tracking-widest">Wymaga wowAI Plus</p>
          )}

          <div className="flex gap-3 pt-4">
            <button 
              type="button"
              onClick={onBack}
              className="flex-1 py-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
            >
              Anuluj
            </button>
            <button 
              type="submit"
              disabled={!name.trim() || loading}
              className="flex-1 py-3 bg-purple-500 rounded-xl font-bold hover:bg-purple-600 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-purple-500/20"
            >
              {loading ? 'Tworzenie...' : 'Stwórz'}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
