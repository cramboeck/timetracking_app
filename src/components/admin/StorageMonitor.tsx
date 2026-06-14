import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../../services/api';
import { HardDrive, Database, FileText, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import Button from '../Button';
import { useToast, useConfirm } from '../../contexts/UIContext';

interface StorageCategory {
  category: string;
  path: string;
  fileCount: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  oldestFile?: string;
  newestFile?: string;
}

interface TableStats {
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  rowCount: number;
}

interface StorageData {
  fileStorage: {
    categories: StorageCategory[];
    total: {
      fileCount: number;
      totalSizeBytes: number;
      totalSizeFormatted: string;
    };
  };
  database: {
    totalSizeBytes: number;
    totalSizeFormatted: string;
    tables: TableStats[];
  };
  invoiceDocuments: {
    count: number;
    totalSizeBytes: number;
    totalSizeFormatted: string;
  };
}

const StorageMonitor: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<StorageData>({
    queryKey: ['admin', 'storage'],
    queryFn: async () => {
      const response = await authFetch('/api/admin/storage');
      if (!response.ok) throw new Error('Failed to load storage data');
      return response.json();
    },
    staleTime: 60000,
  });

  const cleanupMutation = useMutation({
    mutationFn: async (maxAgeHours: number) => {
      const response = await authFetch(`/api/admin/storage/cleanup?maxAgeHours=${maxAgeHours}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Cleanup failed');
      return response.json();
    },
    onSuccess: (result) => {
      toast(`${result.deletedCount} Dateien gelöscht (${result.deletedBytesFormatted})`, 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'storage'] });
    },
    onError: () => {
      toast('Fehler beim Bereinigen', 'error');
    },
  });

  const handleCleanup = async () => {
    const ok = await confirm({
      title: 'Temporäre Dateien löschen',
      message: 'Alle temporären Dateien älter als 24 Stunden werden gelöscht. Fortfahren?',
      confirmText: 'Löschen',
      variant: 'danger',
    });
    if (ok) {
      cleanupMutation.mutate(24);
    }
  };

  const getCategoryIcon = (category: string) => {
    if (category.includes('Beleg') || category.includes('Rechnung')) return <FileText className="w-5 h-5 text-accent-primary" />;
    if (category.includes('Ticket')) return <FileText className="w-5 h-5 text-blue-400" />;
    if (category.includes('Backup')) return <Database className="w-5 h-5 text-green-400" />;
    if (category.includes('Temp')) return <Trash2 className="w-5 h-5 text-yellow-400" />;
    return <HardDrive className="w-5 h-5 text-dark-400" />;
  };

  const getProgressColor = (percentage: number) => {
    if (percentage > 80) return 'bg-red-500';
    if (percentage > 60) return 'bg-yellow-500';
    return 'bg-accent-primary';
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center text-dark-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
        Lade Speicherstatistiken...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-red-400">
        <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
        Fehler beim Laden der Speicherstatistiken
      </div>
    );
  }

  const totalStorageGB = (data.fileStorage.total.totalSizeBytes + data.database.totalSizeBytes) / (1024 * 1024 * 1024);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-accent-primary" />
          Speicherübersicht
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Aktualisieren
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCleanup}
            disabled={cleanupMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Temp bereinigen
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-dark-100 rounded-lg p-4 border border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-primary/10 rounded-lg">
              <HardDrive className="w-6 h-6 text-accent-primary" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Dateispeicher</p>
              <p className="text-xl font-bold text-white">{data.fileStorage.total.totalSizeFormatted}</p>
              <p className="text-xs text-dark-500">{data.fileStorage.total.fileCount.toLocaleString('de-DE')} Dateien</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-100 rounded-lg p-4 border border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Database className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Datenbank</p>
              <p className="text-xl font-bold text-white">{data.database.totalSizeFormatted}</p>
              <p className="text-xs text-dark-500">{data.database.tables.length} Tabellen</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-100 rounded-lg p-4 border border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <FileText className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Beleg-Dokumente</p>
              <p className="text-xl font-bold text-white">{data.invoiceDocuments.totalSizeFormatted}</p>
              <p className="text-xs text-dark-500">{data.invoiceDocuments.count.toLocaleString('de-DE')} Dokumente</p>
            </div>
          </div>
        </div>
      </div>

      {/* File Storage by Category */}
      <div className="bg-dark-100 rounded-lg border border-dark-border">
        <div className="p-4 border-b border-dark-border">
          <h3 className="font-medium text-white">Dateispeicher nach Kategorie</h3>
        </div>
        <div className="divide-y divide-dark-border">
          {data.fileStorage.categories.map((category) => {
            const percentage = data.fileStorage.total.totalSizeBytes > 0
              ? (category.totalSizeBytes / data.fileStorage.total.totalSizeBytes) * 100
              : 0;

            return (
              <div key={category.category} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(category.category)}
                    <span className="text-white font-medium">{category.category}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-white font-medium">{category.totalSizeFormatted}</span>
                    <span className="text-dark-400 text-sm ml-2">({category.fileCount} Dateien)</span>
                  </div>
                </div>
                <div className="w-full bg-dark-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${getProgressColor(percentage)}`}
                    style={{ width: `${Math.max(percentage, 1)}%` }}
                  />
                </div>
                {category.oldestFile && (
                  <p className="text-xs text-dark-500 mt-1">
                    Älteste: {new Date(category.oldestFile).toLocaleDateString('de-DE')} —
                    Neueste: {category.newestFile ? new Date(category.newestFile).toLocaleDateString('de-DE') : '-'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Database Tables */}
      <div className="bg-dark-100 rounded-lg border border-dark-border">
        <div className="p-4 border-b border-dark-border">
          <h3 className="font-medium text-white">Größte Datenbank-Tabellen</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-dark-400 text-sm border-b border-dark-border">
                <th className="p-3">Tabelle</th>
                <th className="p-3 text-right">Größe</th>
                <th className="p-3 text-right">Zeilen</th>
              </tr>
            </thead>
            <tbody>
              {data.database.tables.slice(0, 10).map((table) => (
                <tr key={table.name} className="border-b border-dark-border/50">
                  <td className="p-3 text-white font-mono text-sm">{table.name}</td>
                  <td className="p-3 text-right text-dark-400">{table.sizeFormatted}</td>
                  <td className="p-3 text-right text-dark-400">{table.rowCount.toLocaleString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Storage Warning */}
      {totalStorageGB > 5 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 font-medium">Speicherplatz-Warnung</p>
            <p className="text-dark-400 text-sm">
              Der Gesamtspeicher beträgt {totalStorageGB.toFixed(1)} GB. Erwäge das Löschen alter Backups oder temporärer Dateien.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorageMonitor;
