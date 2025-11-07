import { Shield, Lock, Eye, Database, Mail, FileText, ChevronRight } from 'lucide-react';

interface PrivacyPolicyProps {
  onClose: () => void;
}

export function PrivacyPolicy({ onClose }: PrivacyPolicyProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Datenschutzerklärung
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="prose prose-gray dark:prose-invert max-w-none">
            {/* Introduction */}
            <section className="mb-8">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                <strong>Stand:</strong> {new Date().toLocaleDateString('de-DE')}
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                Diese Datenschutzerklärung klärt Sie über die Art, den Umfang und Zweck der Verarbeitung
                von personenbezogenen Daten innerhalb unserer TimeTrack-Anwendung auf. Wir nehmen den
                Schutz Ihrer persönlichen Daten sehr ernst und behandeln Ihre personenbezogenen Daten
                vertraulich und entsprechend der gesetzlichen Datenschutzvorschriften sowie dieser
                Datenschutzerklärung.
              </p>
            </section>

            {/* Verantwortlicher */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
                  1. Verantwortlicher
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
                Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) und anderer
                nationaler Datenschutzgesetze ist:
              </p>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg mt-3">
                <p className="text-gray-700 dark:text-gray-200 m-0">
                  [Ihr Name/Firmenname]<br />
                  [Ihre Adresse]<br />
                  [PLZ Stadt]<br />
                  E-Mail: [Ihre E-Mail]<br />
                  Telefon: [Ihre Telefonnummer]
                </p>
              </div>
            </section>

            {/* Erhobene Daten */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
                  2. Welche Daten werden erhoben?
                </h3>
              </div>

              <h4 className="text-lg font-medium text-gray-900 dark:text-white mt-4 mb-2">
                2.1 Account-Daten
              </h4>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
                <li>Benutzername</li>
                <li>E-Mail-Adresse</li>
                <li>Passwort (verschlüsselt gespeichert mit bcrypt)</li>
                <li>Account-Typ (Freelancer/Unternehmen)</li>
                <li>Organisationsname (optional)</li>
                <li>Erstellungsdatum und letzte Anmeldung</li>
              </ul>

              <h4 className="text-lg font-medium text-gray-900 dark:text-white mt-4 mb-2">
                2.2 Nutzungsdaten
              </h4>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
                <li>Zeiterfassungseinträge (Start, Ende, Dauer, Beschreibung)</li>
                <li>Kunden und Projekte</li>
                <li>Tätigkeiten und Stundensätze</li>
                <li>Benutzereinstellungen (Theme, Sprache, Zeitrundung)</li>
                <li>Rechnungen und Berichte</li>
              </ul>

              <h4 className="text-lg font-medium text-gray-900 dark:text-white mt-4 mb-2">
                2.3 Technische Daten
              </h4>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
                <li>IP-Adresse</li>
                <li>Browser-Typ und Version</li>
                <li>Betriebssystem</li>
                <li>Zugriffszeitpunkte</li>
              </ul>
            </section>

            {/* Zweck der Verarbeitung */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
                  3. Zweck der Datenverarbeitung
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-3">
                Wir verarbeiten Ihre personenbezogenen Daten zu folgenden Zwecken:
              </p>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-2">
                <li><strong>Bereitstellung der Anwendung:</strong> Verwaltung Ihres Accounts und Ermöglichung der Zeiterfassung</li>
                <li><strong>Authentifizierung:</strong> Sicherstellung, dass nur Sie auf Ihre Daten zugreifen können</li>
                <li><strong>Benachrichtigungen:</strong> Versand von Erinnerungen und wichtigen Updates (mit Ihrer Einwilligung)</li>
                <li><strong>Support:</strong> Beantwortung Ihrer Anfragen und Lösung technischer Probleme</li>
                <li><strong>Sicherheit:</strong> Schutz vor Missbrauch und unbefugtem Zugriff</li>
                <li><strong>Compliance:</strong> Erfüllung rechtlicher Verpflichtungen</li>
              </ul>
            </section>

            {/* Rechtsgrundlage */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
                  4. Rechtsgrundlage
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
                Die Verarbeitung Ihrer Daten erfolgt auf Grundlage:
              </p>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-2 mt-2">
                <li><strong>Art. 6 Abs. 1 lit. b DSGVO</strong> – Vertragserfüllung</li>
                <li><strong>Art. 6 Abs. 1 lit. a DSGVO</strong> – Einwilligung (z.B. für Benachrichtigungen)</li>
                <li><strong>Art. 6 Abs. 1 lit. f DSGVO</strong> – Berechtigte Interessen (z.B. Sicherheit)</li>
              </ul>
            </section>

            {/* Datenspeicherung */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
                  5. Datenspeicherung und Sicherheit
                </h3>
              </div>

              <h4 className="text-lg font-medium text-gray-900 dark:text-white mt-4 mb-2">
                5.1 Speicherort
              </h4>
              <p className="text-gray-600 dark:text-gray-300">
                Ihre Daten werden in einer lokalen SQLite-Datenbank gespeichert. Bei der Nutzung
                im Browser werden einige Daten auch im localStorage Ihres Browsers gespeichert.
              </p>

              <h4 className="text-lg font-medium text-gray-900 dark:text-white mt-4 mb-2">
                5.2 Sicherheitsmaßnahmen
              </h4>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
                <li>Passwörter werden mit bcrypt gehasht und niemals im Klartext gespeichert</li>
                <li>JWT-Token für sichere Authentifizierung</li>
                <li>HTTPS-Verschlüsselung für alle Datenübertragungen</li>
                <li>Rate Limiting zum Schutz vor Brute-Force-Angriffen</li>
                <li>Input-Validierung gegen SQL-Injection und XSS</li>
                <li>Security Headers (Helmet.js, CSP, HSTS)</li>
                <li>Audit Logs für alle sicherheitsrelevanten Aktionen</li>
              </ul>

              <h4 className="text-lg font-medium text-gray-900 dark:text-white mt-4 mb-2">
                5.3 Speicherdauer
              </h4>
              <p className="text-gray-600 dark:text-gray-300">
                Wir speichern Ihre Daten nur so lange, wie es für die Zweckerfüllung erforderlich ist.
                Account-Daten werden gespeichert, bis Sie Ihren Account löschen. Audit Logs werden nach
                365 Tagen automatisch gelöscht.
              </p>
            </section>

            {/* Ihre Rechte */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
                  6. Ihre Rechte (DSGVO)
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-3">
                Sie haben folgende Rechte bezüglich Ihrer personenbezogenen Daten:
              </p>

              <div className="space-y-3">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4" />
                    Recht auf Auskunft (Art. 15 DSGVO)
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Sie können jederzeit Auskunft über die von uns gespeicherten Daten erhalten.
                    Nutzen Sie dazu die Export-Funktion in den Einstellungen.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4" />
                    Recht auf Berichtigung (Art. 16 DSGVO)
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Sie können fehlerhafte Daten jederzeit in Ihrem Account berichtigen.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4" />
                    Recht auf Löschung (Art. 17 DSGVO)
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Sie können Ihren Account und alle damit verbundenen Daten jederzeit in den
                    Einstellungen löschen. Diese Aktion ist unwiderruflich.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4" />
                    Recht auf Datenübertragbarkeit (Art. 20 DSGVO)
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Sie können Ihre Daten in einem strukturierten, maschinenlesbaren Format (JSON, CSV)
                    exportieren und an einen anderen Anbieter übertragen.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4" />
                    Recht auf Widerspruch (Art. 21 DSGVO)
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Sie können der Verarbeitung Ihrer Daten widersprechen. Kontaktieren Sie uns dazu.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4" />
                    Recht auf Beschwerde (Art. 77 DSGVO)
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
                  </p>
                </div>
              </div>
            </section>

            {/* E-Mail-Benachrichtigungen */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
                  7. E-Mail-Benachrichtigungen
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
                Wir versenden E-Mail-Benachrichtigungen zu folgenden Anlässen:
              </p>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1 mt-2">
                <li>Willkommens-E-Mail bei Registrierung</li>
                <li>Monatserinnerungen (3 Tage vor Monatsende)</li>
                <li>Tägliche Erinnerungen (wenn keine Zeiterfassung)</li>
                <li>Wöchentliche Zusammenfassungen (jeden Freitag)</li>
              </ul>
              <p className="text-gray-600 dark:text-gray-300 mt-2">
                Sie können E-Mail-Benachrichtigungen jederzeit in den Einstellungen deaktivieren.
                Alternativ können Sie auch den Abmelde-Link in jeder E-Mail nutzen.
              </p>
            </section>

            {/* Cookies */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
                  8. Cookies und lokaler Speicher
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
                Diese Anwendung verwendet Cookies und localStorage, um:
              </p>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1 mt-2">
                <li>Sie eingeloggt zu halten (JWT-Token)</li>
                <li>Ihre Einstellungen zu speichern</li>
                <li>Die Funktionalität der Anwendung zu gewährleisten</li>
              </ul>
              <p className="text-gray-600 dark:text-gray-300 mt-2">
                Sie können Ihre Cookie-Einstellungen jederzeit im Cookie-Banner anpassen.
              </p>
            </section>

            {/* Änderungen */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
                  9. Änderungen der Datenschutzerklärung
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
                Wir behalten uns vor, diese Datenschutzerklärung anzupassen, um sie an geänderte
                Rechtslagen oder Änderungen unserer Dienste anzupassen. Bei wesentlichen Änderungen
                werden wir Sie per E-Mail informieren.
              </p>
            </section>

            {/* Kontakt */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
                  10. Kontakt
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
                Bei Fragen zum Datenschutz oder zur Ausübung Ihrer Rechte können Sie uns kontaktieren:
              </p>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg mt-3">
                <p className="text-gray-700 dark:text-gray-200 m-0">
                  E-Mail: [Ihre Datenschutz-E-Mail]<br />
                  Telefon: [Ihre Telefonnummer]<br />
                  Adresse: [Ihre Adresse]
                </p>
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
