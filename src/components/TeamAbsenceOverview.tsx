import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-react';
import { entriesApi, TeamMember } from '../services/api';
import { Card } from './ui/Card';
import { Button, IconButton } from './ui/Button';

const ABSENCE_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  vacation: { bg: 'bg-green-400', border: 'border-green-500', label: 'Urlaub' },
  sick: { bg: 'bg-red-400', border: 'border-red-500', label: 'Krankheit' },
  special_leave: { bg: 'bg-amber-400', border: 'border-amber-500', label: 'Sonderurlaub' },
};

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

interface AbsenceBlock {
  memberId: string;
  startDate: Date;
  endDate: Date;
  category: string;
  hours: number;
}

export const TeamAbsenceOverview = () => {
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());

  // Fetch team entries for the entire year
  const startDate = new Date(viewYear, 0, 1).toISOString();
  const endDate = new Date(viewYear, 11, 31, 23, 59, 59).toISOString();

  const { data, isLoading, error } = useQuery({
    queryKey: ['entries', 'team', { startDate, endDate, entryScope: 'absence' }],
    queryFn: () => entriesApi.getTeam({ startDate, endDate, entryScope: 'absence', limit: 1000 }),
    staleTime: 60000,
  });

  const members = data?.data?.members || [];
  const entries = data?.data?.entries || [];

  // Group absences by member and calculate blocks
  const absencesByMember = useMemo(() => {
    const map: Record<string, { member: TeamMember; blocks: AbsenceBlock[]; totalDays: number }> = {};

    // Initialize all members
    members.forEach(member => {
      map[member.id] = { member, blocks: [], totalDays: 0 };
    });

    // Group entries into absence blocks
    entries.forEach(entry => {
      const memberId = entry.userId;
      if (!map[memberId]) {
        const member = members.find(m => m.id === memberId);
        map[memberId] = {
          member: member || { id: memberId, username: 'Unbekannt', displayName: null, email: '', role: '' },
          blocks: [],
          totalDays: 0,
        };
      }

      const startDate = new Date(entry.startTime);
      const endDate = entry.endTime ? new Date(entry.endTime) : startDate;
      const hours = (entry.duration || 0) / 3600;

      map[memberId].blocks.push({
        memberId,
        startDate,
        endDate,
        category: entry.internalCategory || 'vacation',
        hours,
      });
      map[memberId].totalDays += hours / 8;
    });

    return Object.values(map).filter(m => m.blocks.length > 0 || members.some(mem => mem.id === m.member.id));
  }, [entries, members]);

  // Calculate position and width for a block on the timeline
  const getBlockStyle = (block: AbsenceBlock) => {
    const yearStart = new Date(viewYear, 0, 1);
    const yearEnd = new Date(viewYear, 11, 31);
    const totalDays = (yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24) + 1;

    const blockStart = Math.max(block.startDate.getTime(), yearStart.getTime());
    const blockEnd = Math.min(block.endDate.getTime(), yearEnd.getTime());

    const startOffset = (blockStart - yearStart.getTime()) / (1000 * 60 * 60 * 24);
    const duration = Math.max(1, (blockEnd - blockStart) / (1000 * 60 * 60 * 24) + 1);

    const left = (startOffset / totalDays) * 100;
    const width = (duration / totalDays) * 100;

    return { left: `${left}%`, width: `${Math.max(width, 0.5)}%` };
  };

  // Get month markers for the timeline header
  const monthMarkers = useMemo(() => {
    const yearStart = new Date(viewYear, 0, 1);
    const yearEnd = new Date(viewYear, 11, 31);
    const totalDays = (yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24) + 1;

    return MONTHS.map((label, monthIndex) => {
      const monthStart = new Date(viewYear, monthIndex, 1);
      const offset = (monthStart.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24);
      return { label, left: (offset / totalDays) * 100 };
    });
  }, [viewYear]);

  // Today marker position
  const todayPosition = useMemo(() => {
    const today = new Date();
    if (today.getFullYear() !== viewYear) return null;

    const yearStart = new Date(viewYear, 0, 1);
    const yearEnd = new Date(viewYear, 11, 31);
    const totalDays = (yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
    const offset = (today.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24);

    return (offset / totalDays) * 100;
  }, [viewYear]);

  const getMemberName = (member: TeamMember) => {
    return member.displayName || member.username;
  };

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-500">Fehler beim Laden. Möglicherweise fehlen Berechtigungen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-accent-lighter dark:bg-accent-primary/30 rounded-xl">
              <Users className="w-6 h-6 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Team-Abwesenheitsübersicht</h2>
              <p className="text-sm text-gray-500 dark:text-dark-400">
                Jahresübersicht aller Teammitglieder
              </p>
            </div>
          </div>

          {/* Year navigation */}
          <div className="flex items-center gap-2">
            <IconButton
              icon={<ChevronLeft size={20} />}
              onClick={() => setViewYear(prev => prev - 1)}
              variant="default"
              size="sm"
            />
            <span className="text-lg font-semibold text-gray-900 dark:text-white min-w-[80px] text-center">
              {viewYear}
            </span>
            <IconButton
              icon={<ChevronRight size={20} />}
              onClick={() => setViewYear(prev => prev + 1)}
              variant="default"
              size="sm"
            />
            <Button variant="secondary" size="sm" onClick={() => setViewYear(new Date().getFullYear())}>
              Heute
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-dark-border">
          {Object.entries(ABSENCE_COLORS).map(([key, { bg, label }]) => (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${bg}`} />
              <span className="text-sm text-gray-600 dark:text-dark-400">{label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Timeline */}
      <Card className="p-4 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-accent-primary" />
            <p className="mt-2 text-gray-500 dark:text-dark-400">Lade Daten...</p>
          </div>
        ) : absencesByMember.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-dark-400">
            <Calendar size={48} className="mx-auto mb-3 opacity-50" />
            <p>Keine Teammitglieder gefunden</p>
          </div>
        ) : (
          <div className="min-w-[800px]">
            {/* Month headers */}
            <div className="flex mb-2">
              <div className="w-48 shrink-0" /> {/* Spacer for member names */}
              <div className="flex-1 relative h-6">
                {monthMarkers.map(({ label, left }) => (
                  <span
                    key={label}
                    className="absolute text-xs font-medium text-gray-500 dark:text-dark-400"
                    style={{ left: `${left}%` }}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="w-24 shrink-0 text-right text-xs font-medium text-gray-500 dark:text-dark-400">
                Tage
              </div>
            </div>

            {/* Member rows */}
            <div className="space-y-1">
              {absencesByMember.map(({ member, blocks, totalDays }) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-dark-border last:border-0"
                >
                  {/* Member name */}
                  <div className="w-48 shrink-0 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-dark-200 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600 dark:text-dark-400">
                        {getMemberName(member).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {getMemberName(member)}
                    </span>
                  </div>

                  {/* Timeline bar */}
                  <div className="flex-1 relative h-8 bg-gray-100 dark:bg-dark-200 rounded">
                    {/* Today marker */}
                    {todayPosition !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-accent-primary z-10"
                        style={{ left: `${todayPosition}%` }}
                      />
                    )}

                    {/* Absence blocks */}
                    {blocks.map((block, index) => {
                      const style = getBlockStyle(block);
                      const color = ABSENCE_COLORS[block.category] || ABSENCE_COLORS.vacation;
                      return (
                        <div
                          key={index}
                          className={`absolute top-1 bottom-1 ${color.bg} rounded-sm opacity-90 hover:opacity-100 cursor-pointer transition-opacity`}
                          style={style}
                          title={`${color.label}: ${block.startDate.toLocaleDateString('de-DE')}${
                            block.startDate.getTime() !== block.endDate.getTime()
                              ? ` - ${block.endDate.toLocaleDateString('de-DE')}`
                              : ''
                          } (${(block.hours / 8).toFixed(1)} Tage)`}
                        />
                      );
                    })}
                  </div>

                  {/* Total days */}
                  <div className="w-24 shrink-0 text-right">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {totalDays.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Summary stats */}
      {!isLoading && absencesByMember.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            Jahresübersicht {viewYear}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(ABSENCE_COLORS).map(([category, { bg, label }]) => {
              const totalDays = absencesByMember.reduce((sum, m) => {
                return sum + m.blocks
                  .filter(b => b.category === category)
                  .reduce((s, b) => s + b.hours / 8, 0);
              }, 0);

              return (
                <div key={category} className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded ${bg}`} />
                  <div>
                    <p className="text-sm text-gray-600 dark:text-dark-400">{label}</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {totalDays.toFixed(1)} Tage
                    </p>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded bg-gray-400" />
              <div>
                <p className="text-sm text-gray-600 dark:text-dark-400">Gesamt</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {absencesByMember.reduce((sum, m) => sum + m.totalDays, 0).toFixed(1)} Tage
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
