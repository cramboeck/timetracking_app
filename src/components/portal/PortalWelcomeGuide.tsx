import { useState } from 'react';
import {
  X, ChevronRight, ChevronLeft, Ticket, Bell, MessageSquare,
  PlusCircle, Search, User, Shield, Smartphone, CheckCircle2,
  FileText, Monitor, HelpCircle
} from 'lucide-react';

interface PortalWelcomeGuideProps {
  onClose: () => void;
  onNeverShowAgain?: () => void;
  companyName?: string;
}

const steps = [
  {
    id: 'welcome',
    icon: Ticket,
    title: 'Willkommen im Kundenportal',
    content: `Hier können Sie Ihre Support-Anfragen verwalten, den Status Ihrer Tickets verfolgen und direkt mit unserem Team kommunizieren.

Diese kurze Einführung zeigt Ihnen die wichtigsten Funktionen.`,
  },
  {
    id: 'tickets',
    icon: FileText,
    title: 'Tickets erstellen & verwalten',
    content: `**Neues Ticket erstellen:**
• Klicken Sie auf den "+ Neues Ticket" Button
• Beschreiben Sie Ihr Anliegen möglichst genau
• Wählen Sie die passende Priorität

**Tickets verfolgen:**
• Alle Ihre Tickets werden in der Übersicht angezeigt
• Der Status zeigt den aktuellen Bearbeitungsstand
• Klicken Sie auf ein Ticket für Details`,
  },
  {
    id: 'communication',
    icon: MessageSquare,
    title: 'Kommunikation',
    content: `**Antworten & Kommentare:**
• Öffnen Sie ein Ticket um die Kommunikation zu sehen
• Schreiben Sie Antworten direkt im Ticket
• Fügen Sie bei Bedarf Dateien/Screenshots hinzu

**Benachrichtigungen:**
• Sie erhalten E-Mails bei neuen Antworten
• Push-Benachrichtigungen können aktiviert werden`,
  },
  {
    id: 'notifications',
    icon: Bell,
    title: 'Benachrichtigungen einrichten',
    content: `**E-Mail-Benachrichtigungen:**
• Gehen Sie zu Ihrem Profil (Icon oben rechts)
• Wählen Sie, welche E-Mails Sie erhalten möchten

**Push-Benachrichtigungen (optional):**
• Erhalten Sie sofortige Benachrichtigungen auf Ihrem Gerät
• Aktivieren Sie Push im Profil-Bereich
• Funktioniert auf Desktop und Smartphone`,
  },
  {
    id: 'security',
    icon: Shield,
    title: 'Sicherheit',
    content: `**Passwort ändern:**
• Jederzeit im Profil-Bereich möglich
• Verwenden Sie ein sicheres Passwort

**Zwei-Faktor-Authentifizierung (2FA):**
• Zusätzlicher Schutz für Ihr Konto
• Aktivierung im Profil unter "Sicherheit"
• Nutzen Sie eine Authenticator-App (z.B. Google Authenticator)`,
  },
  {
    id: 'mobile',
    icon: Smartphone,
    title: 'Mobil nutzen',
    content: `**Als App installieren:**
• Öffnen Sie das Portal auf Ihrem Smartphone
• Tippen Sie auf "Zum Startbildschirm hinzufügen"
• Das Portal funktioniert dann wie eine App

**Vorteile:**
• Schneller Zugriff vom Homescreen
• Push-Benachrichtigungen
• Offline-Zugriff auf wichtige Infos`,
  },
  {
    id: 'help',
    icon: HelpCircle,
    title: 'Hilfe & Support',
    content: `**Wissensdatenbank:**
• Finden Sie Antworten auf häufige Fragen
• Anleitungen und Tipps
• Klicken Sie auf "Hilfe" in der Navigation

**Direkter Kontakt:**
• Bei dringenden Fragen erstellen Sie ein Ticket
• Wählen Sie hohe Priorität für dringende Anfragen

Bei Fragen sind wir gerne für Sie da!`,
  },
];

export const PortalWelcomeGuide = ({ onClose, onNeverShowAgain, companyName }: PortalWelcomeGuideProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const step = steps[currentStep];
  const Icon = step.icon;
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleClose = () => {
    if (dontShowAgain && onNeverShowAgain) {
      onNeverShowAgain();
    }
    onClose();
  };

  const handleNext = () => {
    if (isLastStep) {
      handleClose();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // Replace company name placeholder
  const welcomeTitle = companyName
    ? `Willkommen im ${companyName} Kundenportal`
    : step.title;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Icon size={22} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {currentStep === 0 ? welcomeTitle : step.title}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Schritt {currentStep + 1} von {steps.length}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 whitespace-pre-line">
            {step.content.split('\n').map((line, i) => {
              if (line.startsWith('**') && line.endsWith('**')) {
                return (
                  <p key={i} className="font-semibold text-gray-900 dark:text-white mt-4 mb-2">
                    {line.replace(/\*\*/g, '')}
                  </p>
                );
              }
              if (line.startsWith('• ')) {
                return (
                  <div key={i} className="flex items-start gap-2 ml-2 my-1">
                    <CheckCircle2 size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{line.substring(2)}</span>
                  </div>
                );
              }
              return <p key={i} className="my-2">{line}</p>;
            })}
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-2 pb-4">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentStep
                  ? 'bg-blue-600'
                  : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
            Nicht mehr anzeigen
          </label>

          <div className="flex gap-2">
            {!isFirstStep && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ChevronLeft size={18} />
                Zurück
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              {isLastStep ? 'Fertig' : 'Weiter'}
              {!isLastStep && <ChevronRight size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalWelcomeGuide;
