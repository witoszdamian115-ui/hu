import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  isPlus?: boolean;
  theme?: 'dark' | 'cyber' | 'sunset' | 'minimal';
  bio?: string;
  wallpaper?: string;
  aiName?: string;
  aiAvatar?: string;
  fontFamily?: string;
  soundEnabled?: boolean;
  confettiEnabled?: boolean;
  focusMode?: boolean;
  zenMode?: boolean;
  codeTheme?: string;
}

export interface Chat {
  id: string;
  userId: string;
  title: string;
  gemId?: string;
  createdAt: Timestamp;
  lastMessageAt: Timestamp;
  category?: string;
  isPinned?: boolean;
}

export interface Message {
  id: string;
  chatId: string;
  userId: string;
  role: 'user' | 'model';
  content: string;
  image?: string | null;
  createdAt: Timestamp;
  isPinned?: boolean;
  isBookmarked?: boolean;
}

export interface Gem {
  id: string;
  userId: string;
  name: string;
  description: string;
  isAdvanced?: boolean;
  temperature?: number;
  topP?: number;
  topK?: number;
  createdAt: Timestamp;
}
