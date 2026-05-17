import { Building, Upload, X, Save } from 'lucide-react';

interface CompanySettingsProps {
  companyName: string;
  companyAddress: string;
  companyCity: string;
  companyZipCode: string;
  companyCountry: string;
  companyEmail: string;
  companyPhone: string;
  companyWebsite: string;
  companyTaxId: string;
  companyCustomerNumber: string;
  companyLogo: string | null;
  onCompanyNameChange: (value: string) => void;
  onCompanyAddressChange: (value: string) => void;
  onCompanyCityChange: (value: string) => void;
  onCompanyZipCodeChange: (value: string) => void;
  onCompanyCountryChange: (value: string) => void;
  onCompanyEmailChange: (value: string) => void;
  onCompanyPhoneChange: (value: string) => void;
  onCompanyWebsiteChange: (value: string) => void;
  onCompanyTaxIdChange: (value: string) => void;
  onCompanyCustomerNumberChange: (value: string) => void;
  onLogoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveLogo: () => void;
  onSave: () => void;
}

export const CompanySettings = ({
  companyName,
  companyAddress,
  companyCity,
  companyZipCode,
  companyCountry,
  companyEmail,
  companyPhone,
  companyWebsite,
  companyTaxId,
  companyCustomerNumber,
  companyLogo,
  onCompanyNameChange,
  onCompanyAddressChange,
  onCompanyCityChange,
  onCompanyZipCodeChange,
  onCompanyCountryChange,
  onCompanyEmailChange,
  onCompanyPhoneChange,
  onCompanyWebsiteChange,
  onCompanyTaxIdChange,
  onCompanyCustomerNumberChange,
  onLogoUpload,
  onRemoveLogo,
  onSave,
}: CompanySettingsProps) => {
  const isSaveDisabled =
    !String(companyName || '').trim() ||
    !String(companyAddress || '').trim() ||
    !String(companyCity || '').trim() ||
    !String(companyZipCode || '').trim() ||
    !String(companyCountry || '').trim() ||
    !String(companyEmail || '').trim();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-accent-light dark:bg-accent-lighter/10 rounded-xl">
            <Building size={28} className="text-accent-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Firma & Branding</h2>
            <p className="text-sm text-gray-500 dark:text-dark-400">
              Diese Informationen erscheinen in deinen PDF-Reports und Dokumenten
            </p>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Branding */}
        <div className="space-y-6">
          {/* Logo Upload Card */}
          <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Upload size={20} className="text-accent-primary" />
              Firmenlogo
            </h3>

            {companyLogo ? (
              <div className="space-y-4">
                <div className="relative inline-block">
                  <img
                    src={companyLogo}
                    alt="Company Logo"
                    className="h-32 w-auto object-contain border-2 border-gray-200 dark:border-dark-200 rounded-xl p-4 bg-gray-50 dark:bg-dark-50"
                  />
                  <button
                    onClick={onRemoveLogo}
                    className="absolute -top-2 -right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all shadow-md hover:shadow-lg"
                    title="Logo entfernen"
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-dark-400">
                  Das Logo wird automatisch skaliert (max. 30mm x 20mm) ohne Verzerrung
                </p>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="logo-upload"
                  className="flex flex-col items-center gap-3 px-6 py-8 border-3 border-dashed border-gray-300 dark:border-dark-200 rounded-xl cursor-pointer hover:border-accent-primary hover:bg-accent-light/30 dark:hover:bg-accent-lighter/5 transition-all"
                >
                  <div className="p-4 bg-gray-100 dark:bg-dark-50 rounded-full">
                    <Upload size={28} className="text-gray-500" />
                  </div>
                  <div className="text-center">
                    <span className="text-base font-semibold text-gray-900 dark:text-white block mb-1">
                      Logo hochladen
                    </span>
                    <span className="text-sm text-gray-500 dark:text-dark-400">
                      PNG, JPG oder SVG - Max. 2MB
                    </span>
                  </div>
                </label>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={onLogoUpload}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Company Name */}
          <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Grundinformationen</h3>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-dark-500 mb-2">
                Firmenname <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={companyName || ''}
                onChange={(e) => onCompanyNameChange(e.target.value)}
                placeholder="z.B. Musterfirma GmbH"
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
              />
              <p className="text-xs text-gray-500 dark:text-dark-400 mt-2">
                Dieser Name erscheint auf allen PDF-Dokumenten
              </p>
            </div>
          </div>
        </div>

        {/* Right Column - Address & Contact */}
        <div className="space-y-6">
          {/* Address Card */}
          <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Adresse</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-dark-500 mb-2">
                  Strasse & Hausnummer <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={companyAddress || ''}
                  onChange={(e) => onCompanyAddressChange(e.target.value)}
                  placeholder="z.B. Musterstrasse 123"
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-dark-500 mb-2">
                    PLZ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={companyZipCode || ''}
                    onChange={(e) => onCompanyZipCodeChange(e.target.value)}
                    placeholder="12345"
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-dark-500 mb-2">
                    Stadt <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={companyCity || ''}
                    onChange={(e) => onCompanyCityChange(e.target.value)}
                    placeholder="Berlin"
                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-dark-500 mb-2">
                  Land <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={companyCountry || ''}
                  onChange={(e) => onCompanyCountryChange(e.target.value)}
                  placeholder="Deutschland"
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                />
              </div>
            </div>
          </div>

          {/* Contact Card */}
          <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Kontaktdaten</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-dark-500 mb-2">
                  E-Mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={companyEmail || ''}
                  onChange={(e) => onCompanyEmailChange(e.target.value)}
                  placeholder="kontakt@musterfirma.de"
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-dark-500 mb-2">
                  Telefon
                </label>
                <input
                  type="tel"
                  value={companyPhone || ''}
                  onChange={(e) => onCompanyPhoneChange(e.target.value)}
                  placeholder="+49 30 12345678"
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-dark-500 mb-2">
                  Website
                </label>
                <input
                  type="url"
                  value={companyWebsite || ''}
                  onChange={(e) => onCompanyWebsiteChange(e.target.value)}
                  placeholder="https://musterfirma.de"
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tax ID & Customer Number - Full Width */}
      <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Steuer- & Buchhaltungsinformationen</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-dark-500 mb-2">
              Kundennummer
            </label>
            <input
              type="text"
              value={companyCustomerNumber || ''}
              onChange={(e) => onCompanyCustomerNumberChange(e.target.value)}
              placeholder="z.B. K-12345"
              className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
            />
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-2">
              Optional: Deine Kundennummer (z.B. bei sevDesk)
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-dark-500 mb-2">
              Steuernummer / USt-IdNr.
            </label>
            <input
              type="text"
              value={companyTaxId || ''}
              onChange={(e) => onCompanyTaxIdChange(e.target.value)}
              placeholder="z.B. DE123456789"
              className="w-full px-4 py-3 border-2 border-gray-300 dark:border-dark-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white dark:bg-dark-50 text-gray-900 dark:text-white transition-all"
            />
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-2">
              Optional: Fur Rechnungen und offizielle Dokumente
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="bg-gradient-to-r from-accent-light to-accent-lighter/50 dark:from-accent-lighter/10 dark:to-accent-lighter/5 rounded-xl border border-accent-primary/30 p-6 shadow-md">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              Anderungen speichern
            </p>
            <p className="text-xs text-gray-600 dark:text-dark-400">
              <span className="text-red-500">*</span> Pflichtfelder mussen ausgefullt sein
            </p>
          </div>
          <button
            onClick={onSave}
            disabled={isSaveDisabled}
            className="flex items-center gap-2 px-6 py-3 bg-accent-primary hover:bg-accent-darker text-white rounded-lg font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
          >
            <Save size={20} />
            Firmendaten speichern
          </button>
        </div>
      </div>
    </div>
  );
};
