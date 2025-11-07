import { useState } from 'react';
import { Rocket, Check, Users, FolderOpen, Clock, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeModal = ({ isOpen, onClose }: WelcomeModalProps) => {
  const { currentUser } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      icon: Rocket,
      title: 'Willkommen bei TimeTrack!',
      description: `Hallo ${currentUser?.username || 'dort'}! Schön, dass du hier bist. Lass uns gemeinsam deine Zeiterfassung einrichten.`,
      content: (
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-dark-300">
            TimeTrack ist deine professionelle Lösung für Zeiterfassung und Abrechnung. In wenigen Schritten bist du startklar!
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-3xl mb-2">⏱️</div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">Zeiterfassung</div>
              <div className="text-xs text-gray-600 dark:text-dark-400 mt-1">
                Stopwatch & Manuell
              </div>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-3xl mb-2">📊</div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">Reports</div>
              <div className="text-xs text-gray-600 dark:text-dark-400 mt-1">
                PDF & Statistiken
              </div>
            </div>
            <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="text-3xl mb-2">💼</div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">Multi-Kunde</div>
              <div className="text-xs text-gray-600 dark:text-dark-400 mt-1">
                Beliebig viele Kunden
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      icon: Users,
      title: 'Schritt 1: Kunden anlegen',
      description: 'Lege deine Kunden an, für die du Zeiten erfassen möchtest.',
      content: (
        <div className="space-y-4">
          <div className="bg-accent-light dark:bg-accent-lighter/10 border border-accent-primary/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-accent-primary rounded-full flex items-center justify-center flex-shrink-0 text-white">
                1
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Navigation zu Einstellungen</h4>
                <p className="text-sm text-gray-700 dark:text-dark-300">
                  Gehe zu <strong>Einstellungen</strong> → <strong>Zeiterfassung</strong> → <strong>Kunden</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="bg-accent-light dark:bg-accent-lighter/10 border border-accent-primary/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-accent-primary rounded-full flex items-center justify-center flex-shrink-0 text-white">
                2
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Kunde hinzufügen</h4>
                <p className="text-sm text-gray-700 dark:text-dark-300">
                  Klicke auf <strong>"+ Neuer Kunde"</strong> und trage Name, Farbe und optional Kontaktdaten ein
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              💡 <strong>Tipp:</strong> Wähle eine eindeutige Farbe für jeden Kunden, um sie schnell zu unterscheiden
            </p>
          </div>
        </div>
      )
    },
    {
      icon: FolderOpen,
      title: 'Schritt 2: Projekte erstellen',
      description: 'Erstelle Projekte für deine Kunden mit Stundensätzen.',
      content: (
        <div className="space-y-4">
          <div className="bg-accent-light dark:bg-accent-lighter/10 border border-accent-primary/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-accent-primary rounded-full flex items-center justify-center flex-shrink-0 text-white">
                1
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Zu Projekte wechseln</h4>
                <p className="text-sm text-gray-700 dark:text-dark-300">
                  In <strong>Einstellungen</strong> → <strong>Zeiterfassung</strong> → <strong>Projekte</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="bg-accent-light dark:bg-accent-lighter/10 border border-accent-primary/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-accent-primary rounded-full flex items-center justify-center flex-shrink-0 text-white">
                2
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Projekt anlegen</h4>
                <p className="text-sm text-gray-700 dark:text-dark-300">
                  Wähle den Kunden, gib einen Projektnamen ein und lege den <strong>Stundensatz</strong> fest
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              💡 <strong>Tipp:</strong> Du kannst mehrere Projekte pro Kunde anlegen, z.B. "Entwicklung" und "Support"
            </p>
          </div>
        </div>
      )
    },
    {
      icon: Clock,
      title: 'Schritt 3: Zeiten erfassen',
      description: 'Jetzt kannst du deine ersten Zeiten erfassen!',
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="text-2xl mb-2">⏱️</div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Stopwatch</h4>
              <p className="text-sm text-gray-700 dark:text-dark-300">
                Perfekt für laufende Arbeiten. Einfach Start drücken und später stoppen.
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <div className="text-2xl mb-2">📝</div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Manuell</h4>
              <p className="text-sm text-gray-700 dark:text-dark-300">
                Ideal zum Nachtragen. Gib Start- und Endzeit ein.
              </p>
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                <Check size={20} className="text-white" />
              </div>
              <h4 className="font-semibold text-gray-900 dark:text-white">Du bist startklar!</h4>
            </div>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-dark-300">
              <li className="flex items-center gap-2">
                <Check size={16} className="text-green-600 flex-shrink-0" />
                <span>Zeiten per Stopwatch oder manuell erfassen</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={16} className="text-green-600 flex-shrink-0" />
                <span>Dashboard für Statistiken und Übersichten</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={16} className="text-green-600 flex-shrink-0" />
                <span>Reports als PDF exportieren</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={16} className="text-green-600 flex-shrink-0" />
                <span>Anpassbare Themes und Farben</span>
              </li>
            </ul>
          </div>

          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-900 dark:text-yellow-200">
              ⚙️ <strong>Zeitaufrundung:</strong> In den Einstellungen kannst du konfigurieren, wie Zeiten aufgerundet werden (z.B. auf 15 Minuten)
            </p>
          </div>
        </div>
      )
    }
  ];

  const currentStepData = steps[currentStep];
  const Icon = currentStepData.icon;
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      // Mark welcome as shown
      if (currentUser) {
        localStorage.setItem(`welcome_shown_${currentUser.id}`, 'true');
      }
      onClose();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleSkip = () => {
    // Mark welcome as shown
    if (currentUser) {
      localStorage.setItem(`welcome_shown_${currentUser.id}`, 'true');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-dark-100 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-accent-primary to-accent-primary/80 p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur">
              <Icon size={32} />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{currentStepData.title}</h2>
              <p className="text-white/90 text-sm mt-1">{currentStepData.description}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-6 flex gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded-full transition-all ${
                  index <= currentStep ? 'bg-white' : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {currentStepData.content}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-200 flex items-center justify-between gap-4">
          <button
            onClick={handleSkip}
            className="text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-dark-200 font-medium transition-colors"
          >
            Überspringen
          </button>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-dark-400">
              {currentStep + 1} / {steps.length}
            </span>
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 btn-accent font-semibold"
            >
              {isLastStep ? 'Los geht\'s!' : 'Weiter'}
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
