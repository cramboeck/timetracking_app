import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, Calendar, User, DollarSign, AlertCircle, Loader } from 'lucide-react';

interface ReportData {
  timeEntries: any[];
  customerName?: string;
  projectName?: string;
  startDate: string;
  endDate: string;
  totalHours: number;
  totalAmount?: number;
  hourlyRate?: number;
}

interface ApprovalData {
  id: string;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  senderEmail: string;
  reportData: ReportData;
  status: 'pending' | 'approved' | 'rejected';
  sentAt: string;
  expiresAt: string;
  alreadyReviewed?: boolean;
  reviewedAt?: string;
  comment?: string;
  expired?: boolean;
}

export const ReportApprovalReview = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [approval, setApproval] = useState<ApprovalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadApprovalData();
  }, [token]);

  const loadApprovalData = async () => {
    try {
      const response = await fetch(`/api/report-approvals/review/${token}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Fehler beim Laden');
      }

      setApproval(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (action: 'approve' | 'reject') => {
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/report-approvals/review/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          comment: comment.trim() || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Fehler beim Speichern');
      }

      setSuccess(true);
      // Reload to show success state
      setTimeout(() => {
        loadApprovalData();
      }, 1000);
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-300 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-accent-primary animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-dark-400">Lade Report-Details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-300 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-dark-100 rounded-lg shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Fehler</h2>
          <p className="text-gray-600 dark:text-dark-400 mb-6">{error}</p>
        </div>
      </div>
    );
  }

  if (!approval) {
    return null;
  }

  // Already reviewed
  if (approval.alreadyReviewed || success) {
    const statusIcon = approval.status === 'approved' ? CheckCircle : XCircle;
    const StatusIcon = statusIcon;
    const statusColor = approval.status === 'approved' ? 'text-green-500' : 'text-red-500';
    const statusText = approval.status === 'approved' ? 'Freigegeben' : 'Abgelehnt';

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-300 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white dark:bg-dark-100 rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <StatusIcon className={`w-16 h-16 ${statusColor} mx-auto mb-4`} />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {statusText}
            </h2>
            <p className="text-gray-600 dark:text-dark-400">
              Dieser Report wurde bereits geprüft
            </p>
            {approval.reviewedAt && (
              <p className="text-sm text-gray-500 dark:text-dark-500 mt-2">
                Geprüft am {new Date(approval.reviewedAt).toLocaleString('de-DE')}
              </p>
            )}
          </div>

          {approval.comment && (
            <div className="bg-gray-50 dark:bg-dark-200 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">Kommentar:</h3>
              <p className="text-gray-700 dark:text-dark-300">{approval.comment}</p>
            </div>
          )}

          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-dark-500">
              {approval.senderName} wurde benachrichtigt
            </p>
          </div>
        </div>
      </div>
    );
  }

  const reportData = approval.reportData;
  const expiresAt = new Date(approval.expiresAt);
  const isExpired = expiresAt < new Date();

  if (isExpired) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-300 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-dark-100 rounded-lg shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Link abgelaufen</h2>
          <p className="text-gray-600 dark:text-dark-400 mb-2">
            Dieser Freigabe-Link ist am {expiresAt.toLocaleString('de-DE')} abgelaufen.
          </p>
          <p className="text-sm text-gray-500 dark:text-dark-500">
            Bitte kontaktiere {approval.senderName} für einen neuen Link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-300 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-dark-100 rounded-lg shadow-lg p-8 mb-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Report-Freigabe
            </h1>
            <p className="text-gray-600 dark:text-dark-400">
              Von <strong>{approval.senderName}</strong> an <strong>{approval.recipientName}</strong>
            </p>
          </div>

          {/* Expiry Warning */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex items-center">
              <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-3" />
              <div>
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  <strong>Dieser Link läuft ab am:</strong>{' '}
                  {expiresAt.toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })} Uhr
                </p>
              </div>
            </div>
          </div>

          {/* Report Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start">
              <Calendar className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500 dark:text-dark-500">Zeitraum</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {new Date(reportData.startDate).toLocaleDateString('de-DE')} -{' '}
                  {new Date(reportData.endDate).toLocaleDateString('de-DE')}
                </p>
              </div>
            </div>

            {reportData.customerName && (
              <div className="flex items-start">
                <User className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-dark-500">Kunde</p>
                  <p className="font-medium text-gray-900 dark:text-white">{reportData.customerName}</p>
                </div>
              </div>
            )}

            {reportData.projectName && (
              <div className="flex items-start">
                <User className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-dark-500">Projekt</p>
                  <p className="font-medium text-gray-900 dark:text-white">{reportData.projectName}</p>
                </div>
              </div>
            )}

            <div className="flex items-start">
              <Clock className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500 dark:text-dark-500">Gesamtstunden</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {reportData.totalHours.toFixed(2)} Stunden
                </p>
              </div>
            </div>

            {reportData.totalAmount && (
              <div className="flex items-start">
                <DollarSign className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-dark-500">Gesamtbetrag</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {reportData.totalAmount.toFixed(2)} €
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Time Entries */}
        {reportData.timeEntries && reportData.timeEntries.length > 0 && (
          <div className="bg-white dark:bg-dark-100 rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Zeiteinträge</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 dark:border-dark-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-dark-500">Datum</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-dark-500">Beschreibung</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-dark-500">Stunden</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.timeEntries.map((entry, index) => (
                    <tr key={index} className="border-b border-gray-100 dark:border-dark-200 last:border-0">
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                        {new Date(entry.startTime || entry.date).toLocaleDateString('de-DE')}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-dark-300">
                        {entry.description || entry.activityName || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white text-right">
                        {((entry.duration || 0) / 3600).toFixed(2)}h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Comment Section */}
        <div className="bg-white dark:bg-dark-100 rounded-lg shadow-lg p-8 mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Kommentar (optional)</h2>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Füge einen Kommentar hinzu..."
            className="w-full px-4 py-3 border border-gray-300 dark:border-dark-200 rounded-lg focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-200 text-gray-900 dark:text-white resize-none"
            rows={4}
          />
        </div>

        {/* Action Buttons */}
        <div className="bg-white dark:bg-dark-100 rounded-lg shadow-lg p-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => handleSubmit('approve')}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              <CheckCircle className="w-5 h-5" />
              {submitting ? 'Wird gespeichert...' : 'Freigeben'}
            </button>
            <button
              onClick={() => handleSubmit('reject')}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              <XCircle className="w-5 h-5" />
              {submitting ? 'Wird gespeichert...' : 'Ablehnen'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500 dark:text-dark-500">
          <p>Powered by RamboFlow - Professionelle Zeiterfassung</p>
        </div>
      </div>
    </div>
  );
};
