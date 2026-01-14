import { useState, useCallback, useMemo, useEffect } from 'react';
import { socialMediaApi } from '../../../services/api';
import type { SocialMediaPost } from '../types';

interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  posts: SocialMediaPost[];
}

export function useCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [posts, setPosts] = useState<SocialMediaPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load posts for current month
  const loadCalendarPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const calendarPosts = await socialMediaApi.getCalendar(currentMonth + 1, currentYear);
      setPosts(calendarPosts);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Kalender-Posts');
      console.error('Failed to load calendar posts:', err);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear]);

  // Load posts when month/year changes
  useEffect(() => {
    loadCalendarPosts();
  }, [loadCalendarPosts]);

  // Navigate to previous month
  const previousMonth = useCallback(() => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  }, [currentMonth]);

  // Navigate to next month
  const nextMonth = useCallback(() => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  }, [currentMonth]);

  // Go to today
  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  }, []);

  // Generate calendar days
  const calendarDays = useMemo((): CalendarDay[] => {
    const days: CalendarDay[] = [];
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get the day of week for the first day (0 = Sunday)
    // Adjust for Monday start (0 = Monday)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    // Add days from previous month
    const prevMonth = new Date(currentYear, currentMonth, 0);
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(prevMonth);
      date.setDate(prevMonth.getDate() - i);
      days.push({
        date,
        dayOfMonth: date.getDate(),
        isCurrentMonth: false,
        isToday: false,
        posts: [],
      });
    }

    // Add days from current month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateStr = date.toISOString().split('T')[0];
      const dayPosts = posts.filter(post => {
        if (!post.scheduledAt) return false;
        return post.scheduledAt.startsWith(dateStr);
      });

      days.push({
        date,
        dayOfMonth: day,
        isCurrentMonth: true,
        isToday: date.getTime() === today.getTime(),
        posts: dayPosts,
      });
    }

    // Add days from next month to complete the grid (6 rows x 7 days = 42)
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(currentYear, currentMonth + 1, i);
      days.push({
        date,
        dayOfMonth: i,
        isCurrentMonth: false,
        isToday: false,
        posts: [],
      });
    }

    return days;
  }, [currentYear, currentMonth, posts]);

  // Format month/year for display
  const monthYearLabel = useMemo(() => {
    const monthNames = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
    ];
    return `${monthNames[currentMonth]} ${currentYear}`;
  }, [currentMonth, currentYear]);

  // Weekday labels
  const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  return {
    currentMonth,
    currentYear,
    calendarDays,
    monthYearLabel,
    weekDays,
    loading,
    error,
    previousMonth,
    nextMonth,
    goToToday,
    refreshCalendar: loadCalendarPosts,
  };
}
