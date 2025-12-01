import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Calendar, Clock, CheckCircle, XCircle, AlertTriangle,
  Shield, Server, RefreshCw, Wrench
} from 'lucide-react';
import { maintenanceApi, MaintenanceApprovalDetails, MaintenanceType } from '../services/api';

const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  patch: 'Patch/Update',
  reboot: 'Neustart',
  security_update: 'Sicherheitsupdate',
  firmware: 'Firmware-Update',
  general: 'Allgemeine Wartung'
};

const MAINTENANCE_TYPE_ICONS: Record<MaintenanceType, React.ReactNode> = {
  patch: <Wrench className="w-8 h-8" />,
  reboot: <RefreshCw className="w-8 h-8" />,
  security_update: <Shield className="w-8 h-8" />,
  firmware: <Server className="w-8 h-8" />,
  general: <Wrench className="w-8 h-8" />
};

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function MaintenanceApproval() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [details, setDetails] = useState<MaintenanceApprovalDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<'approved' | 'rejected' | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approverName, setApproverName] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Ungültiger Link');
      setLoading(false);
      return;
    }

    maintenanceApi.getApprovalDetails(token)
      .then(data => {
        setDetails(data);
      })
      .catch(err => {
        setError(err.message || 'Fehler beim Laden der Details');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleApprove = async () => {
    if (!token) return;
    setSubmitting(true);
    setError('');

    try {
      const result = await maintenanceApi.submitApproval(token, {
        action: 'approve',
        approverName: approverName || undefined
      });
      setSuccess('approved');
    } catch (err: any) {
      setError(err.message || 'Fehler bei der Genehmigung');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!token) return;
    setSubmitting(true);
    setError('');

    try {
      const result = await maintenanceApi.submitApproval(token, {
        action: 'reject',
        reason: rejectionReason || undefined,
        approverName: approverName || undefined
      });
      setSuccess('rejected');
    } catch (err: any) {
      setError(err.message || 'Fehler bei der Ablehnung');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <RefreshCw className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
          <p className="text-gray-600 mt-4">Wird geladen...</p>
        </div>
      </div>
    );
  }

  if (error && !details) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Fehler</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500">
            Der Link ist möglicherweise abgelaufen oder ungültig.
            Bitte kontaktieren Sie Ihren IT-Dienstleister.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={`min-h-screen ${success === 'approved' ? 'bg-gradient-to-br from-green-50 to-emerald-100' : 'bg-gradient-to-br from-red-50 to-orange-100'} flex items-center justify-center p-4`}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className={`w-20 h-20 ${success === 'approved' ? 'bg-green-100' : 'bg-red-100'} rounded-full flex items-center justify-center mx-auto mb-6`}>
            {success === 'approved' ? (
              <CheckCircle className="w-10 h-10 text-green-600" />
            ) : (
              <XCircle className="w-10 h-10 text-red-600" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {success === 'approved' ? 'Vielen Dank!' : 'Wartung abgelehnt'}
          </h1>
          <p className="text-gray-600 mb-6">
            {success === 'approved'
              ? 'Die Wartung wurde erfolgreich genehmigt. Wir werden die Arbeiten wie geplant durchführen.'
              : 'Die Wartung wurde abgelehnt. Wir werden uns mit Ihnen in Verbindung setzen, um einen alternativen Termin zu finden.'}
          </p>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">
              <strong>{details?.title}</strong>
              <br />
              Geplant für {details?.scheduledStart && formatDateTime(details.scheduledStart)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (details?.alreadyResponded) {
    const isApproved = details.status === 'approved';
    return (
      <div className={`min-h-screen ${isApproved ? 'bg-gradient-to-br from-green-50 to-emerald-100' : 'bg-gradient-to-br from-red-50 to-orange-100'} flex items-center justify-center p-4`}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className={`w-20 h-20 ${isApproved ? 'bg-green-100' : 'bg-red-100'} rounded-full flex items-center justify-center mx-auto mb-6`}>
            {isApproved ? (
              <CheckCircle className="w-10 h-10 text-green-600" />
            ) : (
              <XCircle className="w-10 h-10 text-red-600" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Bereits beantwortet
          </h1>
          <p className="text-gray-600 mb-6">
            Diese Wartungsanfrage wurde bereits {isApproved ? 'genehmigt' : 'abgelehnt'}.
          </p>
          {details.respondedAt && (
            <p className="text-sm text-gray-500">
              Beantwortet am {formatDateTime(details.respondedAt)}
            </p>
          )}
          {details.rejectionReason && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg text-left">
              <p className="text-sm text-red-700">
                <strong>Ablehnungsgrund:</strong><br />
                {details.rejectionReason}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!details) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              {MAINTENANCE_TYPE_ICONS[details.maintenanceType]}
            </div>
            <div>
              <p className="text-amber-100 text-sm">Wartungsankündigung von</p>
              <h2 className="text-xl font-bold">{details.companyName}</h2>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div>
            <p className="text-gray-500 text-sm mb-1">Sehr geehrte/r {details.customerName},</p>
            <h1 className="text-2xl font-bold text-gray-900">{details.title}</h1>
            <p className="text-gray-600 mt-1">
              {MAINTENANCE_TYPE_LABELS[details.maintenanceType]}
              {details.affectedSystems && ` • ${details.affectedSystems}`}
            </p>
          </div>

          {/* Time Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-xl">
              <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
                <Calendar className="w-4 h-4" />
                Geplanter Beginn
              </div>
              <p className="font-semibold text-gray-900">
                {formatDateTime(details.scheduledStart)}
              </p>
            </div>
            {details.scheduledEnd && (
              <div className="p-4 bg-blue-50 rounded-xl">
                <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
                  <Clock className="w-4 h-4" />
                  Geplantes Ende
                </div>
                <p className="font-semibold text-gray-900">
                  {formatDateTime(details.scheduledEnd)}
                </p>
              </div>
            )}
          </div>

          {details.approvalDeadline && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2 text-amber-600 text-sm mb-1">
                <AlertTriangle className="w-4 h-4" />
                Bitte antworten Sie bis
              </div>
              <p className="font-semibold text-amber-800">
                {formatDateTime(details.approvalDeadline)}
              </p>
            </div>
          )}

          {details.description && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Beschreibung</h3>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-gray-700 whitespace-pre-wrap">{details.description}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
              {error}
            </div>
          )}

          {/* Approval Form */}
          {details.requireApproval && (
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Ihre Entscheidung</h3>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ihr Name (optional)
                </label>
                <input
                  type="text"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  placeholder="Vor- und Nachname"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {!showRejectForm ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleApprove}
                    disabled={submitting}
                    className="flex-1 px-6 py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-5 h-5" />
                    )}
                    Wartung genehmigen
                  </button>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    disabled={submitting}
                    className="flex-1 px-6 py-3 border-2 border-red-200 text-red-600 font-medium rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <XCircle className="w-5 h-5" />
                    Ablehnen
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Grund für die Ablehnung (optional)
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="z.B. Der Termin passt nicht, da..."
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowRejectForm(false)}
                      disabled={submitting}
                      className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      Zurück
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={submitting}
                      className="flex-1 px-6 py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {submitting ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <XCircle className="w-5 h-5" />
                      )}
                      Ablehnung bestätigen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!details.requireApproval && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center">
              <p className="text-blue-800">
                Dies ist eine reine Information. Es ist keine Freigabe erforderlich.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 text-center">
          <p className="text-sm text-gray-500">
            Bei Fragen wenden Sie sich bitte an {details.companyName}
          </p>
        </div>
      </div>
    </div>
  );
}
