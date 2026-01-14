import { Linkedin, Twitter, Facebook, Instagram } from 'lucide-react';
import type { Platform } from '../types';

// Platform icons for display
export const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin size={16} />,
  twitter: <Twitter size={16} />,
  facebook: <Facebook size={16} />,
  instagram: <Instagram size={16} />,
};

// Platform brand colors
export const PLATFORM_COLORS: Record<string, string> = {
  linkedin: 'bg-blue-600',
  twitter: 'bg-sky-500',
  facebook: 'bg-blue-500',
  instagram: 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500',
};

// Character limits per platform
export const PLATFORM_LIMITS: Record<Platform, number> = {
  linkedin: 3000,
  twitter: 280,
  facebook: 63206,
  instagram: 2200,
  all: 280, // Use lowest limit for cross-platform posts
};

// Platform display names
export const PLATFORM_NAMES: Record<string, string> = {
  linkedin: 'LinkedIn',
  twitter: 'Twitter/X',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

// Available platforms for selection
export const AVAILABLE_PLATFORMS: Platform[] = ['linkedin', 'twitter', 'facebook', 'instagram'];

// Get platform icon component
export const getPlatformIcon = (platform: string, size: number = 16) => {
  switch (platform) {
    case 'linkedin':
      return <Linkedin size={size} />;
    case 'twitter':
      return <Twitter size={size} />;
    case 'facebook':
      return <Facebook size={size} />;
    case 'instagram':
      return <Instagram size={size} />;
    default:
      return null;
  }
};
