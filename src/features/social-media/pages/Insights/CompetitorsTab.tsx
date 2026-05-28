import { useState, useEffect } from 'react';
import {
  Plus,
  Users,
  Trash2,
  ExternalLink,
  BarChart3,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  X,
  Globe,
} from 'lucide-react';
import { socialMediaApi } from '../../../../services/api';
import type { Competitor, CompetitorAnalysis } from '../../types';
import { useConfirm } from '../../../../contexts/UIContext';

export default function CompetitorsTab() {
  const confirm = useConfirm();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, CompetitorAnalysis>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  // Add competitor form
  const [name, setName] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCompetitors();
  }, []);

  const loadCompetitors = async () => {
    try {
      const data = await socialMediaApi.getCompetitors();
      setCompetitors(data || []);
    } catch (error) {
      console.error('Failed to load competitors:', error);
    }
  };

  const resetForm = () => {
    setShowAddModal(false);
    setName('');
    setLinkedinUrl('');
    setTwitterUrl('');
    setWebsiteUrl('');
    setNotes('');
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const newCompetitor = await socialMediaApi.addCompetitor({
        name,
        profiles: {
          linkedin: linkedinUrl || undefined,
          twitter: twitterUrl || undefined,
          website: websiteUrl || undefined,
        },
        notes: notes || undefined,
      });
      setCompetitors([...competitors, newCompetitor]);
      resetForm();
    } catch (error) {
      console.error('Failed to add competitor:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Wettbewerber löschen?',
      message: 'Möchtest du diesen Wettbewerber wirklich löschen?',
      confirmText: 'Löschen',
      variant: 'danger',
    });
    if (!ok) return;
    setDeleting(id);
    try {
      await socialMediaApi.deleteCompetitor(id);
      setCompetitors(competitors.filter((c) => c.id !== id));
      delete analysis[id];
      setAnalysis({ ...analysis });
    } catch (error) {
      console.error('Failed to delete competitor:', error);
    } finally {
      setDeleting(null);
    }
  };

  const analyzeCompetitor = async (competitor: Competitor) => {
    setAnalyzing(competitor.id);
    try {
      const result = await socialMediaApi.analyzeCompetitor(competitor.id);
      setAnalysis({ ...analysis, [competitor.id]: result });
    } catch (error) {
      console.error('Failed to analyze competitor:', error);
    } finally {
      setAnalyzing(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">
            Wettbewerber-Analyse
          </h2>
          <p className="text-gray-600 dark:text-dark-400">
            Beobachte und analysiere deine Wettbewerber.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
        >
          <Plus size={18} />
          Wettbewerber hinzufügen
        </button>
      </div>

      {/* Competitors List */}
      {competitors.length === 0 ? (
        <div className="bg-white dark:bg-dark-100 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-dark-border text-center">
          <Users size={48} className="mx-auto mb-4 text-gray-300 dark:text-dark-400" />
          <p className="text-gray-500 dark:text-dark-400 mb-4">
            Noch keine Wettbewerber hinzugefügt.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-pink-600 hover:text-pink-700 font-medium"
          >
            Ersten Wettbewerber hinzufügen
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {competitors.map((competitor) => (
            <div
              key={competitor.id}
              className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden"
            >
              {/* Competitor Header */}
              <div className="p-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                    {competitor.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    {competitor.profiles.linkedin && (
                      <a
                        href={competitor.profiles.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent-primary hover:underline flex items-center gap-1"
                      >
                        LinkedIn
                        <ExternalLink size={12} />
                      </a>
                    )}
                    {competitor.profiles.twitter && (
                      <a
                        href={competitor.profiles.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-sky-500 hover:underline flex items-center gap-1"
                      >
                        Twitter
                        <ExternalLink size={12} />
                      </a>
                    )}
                    {competitor.profiles.website && (
                      <a
                        href={competitor.profiles.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-600 dark:text-dark-400 hover:underline flex items-center gap-1"
                      >
                        <Globe size={12} />
                        Website
                      </a>
                    )}
                  </div>
                  {competitor.notes && (
                    <p className="text-sm text-gray-500 dark:text-dark-400 mt-2">
                      {competitor.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => analyzeCompetitor(competitor)}
                    disabled={analyzing === competitor.id}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 rounded-lg hover:bg-pink-200 dark:hover:bg-pink-900/50 disabled:opacity-50"
                  >
                    {analyzing === competitor.id ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-pink-600" />
                        Analysiere...
                      </>
                    ) : (
                      <>
                        <BarChart3 size={14} />
                        Analysieren
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(competitor.id)}
                    disabled={deleting === competitor.id}
                    className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Analysis Results */}
              {analysis[competitor.id] && (
                <div className="border-t border-gray-200 dark:border-dark-border p-4 bg-gray-50 dark:bg-dark-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Strengths */}
                    <div>
                      <h4 className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-1 mb-2">
                        <CheckCircle size={14} />
                        Stärken
                      </h4>
                      <ul className="space-y-1">
                        {analysis[competitor.id].strengths.map((s, i) => (
                          <li key={i} className="text-sm text-gray-600 dark:text-dark-400 flex items-start gap-1">
                            <span className="text-green-600">•</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Weaknesses */}
                    <div>
                      <h4 className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-1 mb-2">
                        <AlertCircle size={14} />
                        Schwächen
                      </h4>
                      <ul className="space-y-1">
                        {analysis[competitor.id].weaknesses.map((w, i) => (
                          <li key={i} className="text-sm text-gray-600 dark:text-dark-400 flex items-start gap-1">
                            <span className="text-red-600">•</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Content Themes */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                        Content-Themen
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {analysis[competitor.id].contentThemes.map((theme, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-gray-200 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded text-xs"
                          >
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Stats */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                        Kennzahlen
                      </h4>
                      <div className="space-y-1 text-sm text-gray-600 dark:text-dark-400">
                        <p>
                          <span className="font-medium">Posting-Frequenz:</span>{' '}
                          {analysis[competitor.id].postingFrequency}
                        </p>
                        <p>
                          <span className="font-medium">Engagement-Rate:</span>{' '}
                          {analysis[competitor.id].engagementRate}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  {analysis[competitor.id].recommendations.length > 0 && (
                    <div className="mt-4 p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
                      <h4 className="text-sm font-medium text-pink-800 dark:text-pink-200 flex items-center gap-1 mb-2">
                        <TrendingUp size={14} />
                        Empfehlungen für dich
                      </h4>
                      <ul className="space-y-1">
                        {analysis[competitor.id].recommendations.map((rec, i) => (
                          <li key={i} className="text-sm text-pink-700 dark:text-pink-300 flex items-start gap-1">
                            <span>•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Competitor Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={resetForm}
        >
          <div
            className="bg-white dark:bg-dark-100 rounded-xl shadow-xl max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                Wettbewerber hinzufügen
              </h2>
              <button
                onClick={resetForm}
                className="text-gray-500 hover:text-gray-700 dark:text-dark-400 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Firmenname"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  LinkedIn Profil-URL
                </label>
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/company/..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Twitter Profil-URL
                </label>
                <input
                  type="url"
                  value={twitterUrl}
                  onChange={(e) => setTwitterUrl(e.target.value)}
                  placeholder="https://twitter.com/..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Notizen
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optionale Notizen..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-gray-600 dark:text-dark-400 hover:text-gray-800 dark:hover:text-white"
              >
                Abbrechen
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || !name.trim()}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Speichere...' : 'Hinzufügen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
