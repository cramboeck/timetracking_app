import { useState, useCallback } from 'react';
import { socialMediaApi } from '../../../services/api';
import type { Platform, Tone, BatchResult } from '../types';

interface GenerationState {
  generating: boolean;
  error: string | null;
}

interface AIGeneratorOptions {
  topic: string;
  platform: Platform;
  tone: Tone;
  includeHashtags: boolean;
  includeEmoji: boolean;
}

interface BatchGeneratorOptions {
  topics: string[];
  platform: Platform;
  tone: Tone;
  includeHashtags: boolean;
  includeEmoji: boolean;
  autoSchedule: boolean;
  startDate?: string;
  postsPerDay: number;
}

export function useContentGeneration() {
  const [state, setState] = useState<GenerationState>({
    generating: false,
    error: null,
  });

  // Generate single post content
  const generatePost = useCallback(async (options: AIGeneratorOptions): Promise<{ content: string; hashtags: string[] } | null> => {
    setState({ generating: true, error: null });
    try {
      const result = await socialMediaApi.generateContent({
        topic: options.topic,
        platform: options.platform,
        tone: options.tone,
        includeHashtags: options.includeHashtags,
        includeEmoji: options.includeEmoji,
      });
      setState({ generating: false, error: null });
      return {
        content: result.content,
        hashtags: result.hashtags || [],
      };
    } catch (err: any) {
      setState({ generating: false, error: err.message || 'Generierung fehlgeschlagen' });
      return null;
    }
  }, []);

  // Generate batch posts
  const generateBatch = useCallback(async (options: BatchGeneratorOptions): Promise<BatchResult[] | null> => {
    setState({ generating: true, error: null });
    try {
      const result = await socialMediaApi.generateBatch({
        topics: options.topics,
        platform: options.platform,
        tone: options.tone,
        includeHashtags: options.includeHashtags,
        includeEmoji: options.includeEmoji,
        autoSchedule: options.autoSchedule,
        startDate: options.startDate,
        postsPerDay: options.postsPerDay,
      });
      setState({ generating: false, error: null });
      return result.posts;
    } catch (err: any) {
      setState({ generating: false, error: err.message || 'Batch-Generierung fehlgeschlagen' });
      return null;
    }
  }, []);

  // Generate content ideas
  const generateIdeas = useCallback(async (category: string, count: number = 10): Promise<string[] | null> => {
    setState({ generating: true, error: null });
    try {
      const result = await socialMediaApi.generateIdeas({ category, count });
      setState({ generating: false, error: null });
      return result.ideas;
    } catch (err: any) {
      setState({ generating: false, error: err.message || 'Ideen-Generierung fehlgeschlagen' });
      return null;
    }
  }, []);

  // Research hashtags
  const researchHashtags = useCallback(async (topic: string, platform?: Platform, count?: number): Promise<Array<{ tag: string; reach: string; description: string }> | null> => {
    setState({ generating: true, error: null });
    try {
      const result = await socialMediaApi.researchHashtags(topic, platform, count);
      setState({ generating: false, error: null });
      return result.hashtags;
    } catch (err: any) {
      setState({ generating: false, error: err.message || 'Hashtag-Recherche fehlgeschlagen' });
      return null;
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    generating: state.generating,
    error: state.error,
    generatePost,
    generateBatch,
    generateIdeas,
    researchHashtags,
    clearError,
  };
}
