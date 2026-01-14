import { useState, useCallback } from 'react';
import { socialMediaApi } from '../../../services/api';
import { useSocialMedia } from '../context';
import type { SocialMediaPost, Platform } from '../types';

interface PostEditorState {
  isOpen: boolean;
  editingPost: SocialMediaPost | null;
  content: string;
  title: string;
  hashtags: string[];
  platforms: Platform[];
  scheduledAt: string;
  customerId: string;
  saving: boolean;
  error: string | null;
}

const initialState: PostEditorState = {
  isOpen: false,
  editingPost: null,
  content: '',
  title: '',
  hashtags: [],
  platforms: ['linkedin'],
  scheduledAt: '',
  customerId: '',
  saving: false,
  error: null,
};

export function usePostEditor() {
  const { addPost, updatePost, refreshPosts } = useSocialMedia();
  const [state, setState] = useState<PostEditorState>(initialState);

  // Open editor for new post
  const openNewPost = useCallback(() => {
    setState({
      ...initialState,
      isOpen: true,
    });
  }, []);

  // Open editor for existing post
  const openEditPost = useCallback((post: SocialMediaPost) => {
    setState({
      isOpen: true,
      editingPost: post,
      content: post.content,
      title: post.title || '',
      hashtags: post.hashtags || [],
      platforms: post.platforms as Platform[],
      scheduledAt: post.scheduledAt || '',
      customerId: post.customerId || '',
      saving: false,
      error: null,
    });
  }, []);

  // Close editor
  const closeEditor = useCallback(() => {
    setState(initialState);
  }, []);

  // Update individual fields
  const setContent = useCallback((content: string) => {
    setState(prev => ({ ...prev, content }));
  }, []);

  const setTitle = useCallback((title: string) => {
    setState(prev => ({ ...prev, title }));
  }, []);

  const setHashtags = useCallback((hashtags: string[]) => {
    setState(prev => ({ ...prev, hashtags }));
  }, []);

  const setPlatforms = useCallback((platforms: Platform[]) => {
    setState(prev => ({ ...prev, platforms }));
  }, []);

  const setScheduledAt = useCallback((scheduledAt: string) => {
    setState(prev => ({ ...prev, scheduledAt }));
  }, []);

  const setCustomerId = useCallback((customerId: string) => {
    setState(prev => ({ ...prev, customerId }));
  }, []);

  const togglePlatform = useCallback((platform: Platform) => {
    setState(prev => {
      const platforms = prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform];
      return { ...prev, platforms };
    });
  }, []);

  const addHashtag = useCallback((tag: string) => {
    const cleanTag = tag.startsWith('#') ? tag : `#${tag}`;
    setState(prev => {
      if (prev.hashtags.includes(cleanTag)) return prev;
      return { ...prev, hashtags: [...prev.hashtags, cleanTag] };
    });
  }, []);

  const removeHashtag = useCallback((tag: string) => {
    setState(prev => ({
      ...prev,
      hashtags: prev.hashtags.filter(t => t !== tag),
    }));
  }, []);

  // Save post
  const savePost = useCallback(async () => {
    if (!state.content.trim()) {
      setState(prev => ({ ...prev, error: 'Inhalt ist erforderlich' }));
      return false;
    }

    if (state.platforms.length === 0) {
      setState(prev => ({ ...prev, error: 'Mindestens eine Plattform auswählen' }));
      return false;
    }

    setState(prev => ({ ...prev, saving: true, error: null }));

    try {
      const postData = {
        content: state.content,
        title: state.title || undefined,
        hashtags: state.hashtags,
        platforms: state.platforms,
        scheduledAt: state.scheduledAt || undefined,
        customerId: state.customerId || undefined,
      };

      if (state.editingPost) {
        // Update existing post
        const updated = await socialMediaApi.updatePost(state.editingPost.id, postData);
        updatePost(updated);
      } else {
        // Create new post
        const created = await socialMediaApi.createPost(postData);
        addPost(created);
      }

      closeEditor();
      return true;
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        saving: false,
        error: err.message || 'Fehler beim Speichern',
      }));
      return false;
    }
  }, [state, addPost, updatePost, closeEditor]);

  // Apply AI-generated content
  const applyGeneratedContent = useCallback((content: string, hashtags?: string[]) => {
    setState(prev => ({
      ...prev,
      content,
      hashtags: hashtags || prev.hashtags,
    }));
  }, []);

  return {
    // State
    ...state,

    // Actions
    openNewPost,
    openEditPost,
    closeEditor,
    setContent,
    setTitle,
    setHashtags,
    setPlatforms,
    setScheduledAt,
    setCustomerId,
    togglePlatform,
    addHashtag,
    removeHashtag,
    savePost,
    applyGeneratedContent,
  };
}
