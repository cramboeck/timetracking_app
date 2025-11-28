import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Search,
  Plus,
  Trash2,
  FileText,
  Receipt,
  Loader2,
  ChevronDown,
  ChevronUp,
  Check,
  AlertTriangle,
  GripVertical,
} from 'lucide-react';
import { sevdeskApi, PositionSearchResult, CreateQuoteInput } from '../services/api';

interface SevdeskContact {
  id: string;
  name: string;
  customerNumber?: string;
}

interface QuotePosition {
  id: string;
  name: string;
  text: string;
  quantity: number;
  price: number;
  isHeading?: boolean; // For section headings (quantity = 0)
}

interface QuoteEditorProps {
  onClose: () => void;
  onSuccess?: (quoteNumber: string) => void;
}

// Text templates with variable support
// Variables: {firma}, {anrede}, {vorname}, {nachname}, {ansprechpartner}
const SALUTATION_TEMPLATES = [
  { id: 'formal', label: 'Formell (Damen und Herren)', text: 'Sehr geehrte Damen und Herren,' },
  { id: 'formal_m', label: 'Formell (Herr)', text: 'Sehr geehrter Herr {nachname},' },
  { id: 'formal_f', label: 'Formell (Frau)', text: 'Sehr geehrte Frau {nachname},' },
  { id: 'informal', label: 'Persönlich', text: 'Hallo {vorname},' },
];

const HEAD_TEXT_TEMPLATES = [
  {
    id: 'inquiry',
    label: 'Anfrage-Antwort',
    text: 'vielen Dank für Ihre Anfrage. Anbei können wir Ihnen folgende Artikel und Leistungen anbieten:'
  },
  {
    id: 'proactive',
    label: 'Proaktives Angebot',
    text: 'basierend auf unserer bisherigen Zusammenarbeit möchten wir Ihnen folgende Optimierungen vorschlagen:'
  },
  {
    id: 'followup',
    label: 'Nachfass-Angebot',
    text: 'wie besprochen senden wir Ihnen hiermit unser Angebot für die gewünschten Leistungen:'
  },
  {
    id: 'recommendation',
    label: 'Empfehlung',
    text: 'nach eingehender Analyse Ihrer IT-Infrastruktur empfehlen wir Ihnen folgende Maßnahmen:'
  },
];

const FOOT_TEXT_TEMPLATES = [
  {
    id: 'standard',
    label: 'Standard',
    text: 'Alle hier genannten Preise sind unverbindlich und freibleibend. Preisänderungen und Irrtümer vorbehalten.\n\nSollten Sie Fragen zu unserem Angebot haben oder weitere Informationen benötigen, stehen wir Ihnen jederzeit gerne zur Verfügung.\n\nMit freundlichen Grüßen\n\n{ansprechpartner}'
  },
  {
    id: 'urgent',
    label: 'Mit Gültigkeitsdauer',
    text: 'Dieses Angebot ist 30 Tage gültig. Bei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\n\n{ansprechpartner}'
  },
  {
    id: 'discount',
    label: 'Mit Rabatt-Hinweis',
    text: 'Bei Beauftragung bis zum Ende des Monats gewähren wir Ihnen 5% Skonto auf den Gesamtbetrag.\n\nWir freuen uns auf Ihre Rückmeldung!\n\nMit freundlichen Grüßen\n\n{ansprechpartner}'
  },
  {
    id: 'simple',
    label: 'Kurz & Knapp',
    text: 'Wir freuen uns auf Ihre Rückmeldung.\n\nMit freundlichen Grüßen\n\n{ansprechpartner}'
  },
];

export const QuoteEditor = ({ onClose, onSuccess }: QuoteEditorProps) => {
  // Contact selection
  const [contacts, setContacts] = useState<SevdeskContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selectedContact, setSelectedContact] = useState<SevdeskContact | null>(null);

  // Quote details
  const [header, setHeader] = useState('');
  const [headText, setHeadText] = useState('');
  const [footText, setFootText] = useState('');
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [positions, setPositions] = useState<QuotePosition[]>([]);
  const [createAsDraft, setCreateAsDraft] = useState(true);

  // Template selections
  const [selectedSalutation, setSelectedSalutation] = useState('formal');
  const [selectedHeadTemplate, setSelectedHeadTemplate] = useState('inquiry');
  const [selectedFootTemplate, setSelectedFootTemplate] = useState('standard');

  // Helper function to replace template variables
  const replaceVariables = useCallback((text: string): string => {
    if (!selectedContact) return text;

    // Extract name parts from contact name
    const nameParts = selectedContact.name.split(' ');
    const vorname = nameParts.length > 1 ? nameParts[0] : '';
    const nachname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0];

    return text
      .replace(/{firma}/g, selectedContact.name)
      .replace(/{vorname}/g, vorname)
      .replace(/{nachname}/g, nachname)
      .replace(/{ansprechpartner}/g, 'Christoph Ramböck') // TODO: Get from user settings
      .replace(/{anrede}/g, 'Herr/Frau');
  }, [selectedContact]);

  // Apply templates when selection changes
  useEffect(() => {
    const salutation = SALUTATION_TEMPLATES.find(t => t.id === selectedSalutation);
    const headTemplate = HEAD_TEXT_TEMPLATES.find(t => t.id === selectedHeadTemplate);
    const footTemplate = FOOT_TEXT_TEMPLATES.find(t => t.id === selectedFootTemplate);

    if (salutation && headTemplate) {
      const fullHeadText = `${replaceVariables(salutation.text)}\n\n${replaceVariables(headTemplate.text)}`;
      setHeadText(fullHeadText);
    }

    if (footTemplate) {
      setFootText(replaceVariables(footTemplate.text));
    }
  }, [selectedSalutation, selectedHeadTemplate, selectedFootTemplate, selectedContact, replaceVariables]);

  // Position search
  const [positionSearch, setPositionSearch] = useState('');
  const [searchResults, setSearchResults] = useState<PositionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showPositionSearch, setShowPositionSearch] = useState(false);

  // Expanded positions for editing
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load contacts on mount
  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      setLoadingContacts(true);
      const response = await sevdeskApi.getCustomers();
      if (response.success) {
        setContacts(response.data);
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoadingContacts(false);
    }
  };

  // Debounced position search
  useEffect(() => {
    if (positionSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await sevdeskApi.searchPositions(positionSearch, { limit: 20 });
        if (response.success) {
          setSearchResults(response.data);
        }
      } catch (err) {
        console.error('Position search error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [positionSearch]);

  const addPosition = useCallback((pos?: PositionSearchResult) => {
    const newPosition: QuotePosition = {
      id: `pos-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: pos?.name || '',
      text: pos?.text || '',
      quantity: pos?.quantity || 1,
      price: pos?.price || 0,
    };
    setPositions(prev => [...prev, newPosition]);
    setExpandedPositions(prev => new Set(prev).add(newPosition.id));
    setShowPositionSearch(false);
    setPositionSearch('');
    setSearchResults([]);
  }, []);

  const addHeading = useCallback(() => {
    const newHeading: QuotePosition = {
      id: `pos-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: 'Neue Zwischenüberschrift',
      text: '',
      quantity: 0,
      price: 0,
      isHeading: true,
    };
    setPositions(prev => [...prev, newHeading]);
    setExpandedPositions(prev => new Set(prev).add(newHeading.id));
  }, []);

  const updatePosition = useCallback((id: string, updates: Partial<QuotePosition>) => {
    setPositions(prev =>
      prev.map(pos => (pos.id === id ? { ...pos, ...updates } : pos))
    );
  }, []);

  const removePosition = useCallback((id: string) => {
    setPositions(prev => prev.filter(pos => pos.id !== id));
    setExpandedPositions(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedPositions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const movePosition = useCallback((index: number, direction: 'up' | 'down') => {
    setPositions(prev => {
      const newPositions = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= newPositions.length) return prev;
      [newPositions[index], newPositions[newIndex]] = [newPositions[newIndex], newPositions[index]];
      return newPositions;
    });
  }, []);

  const calculateTotal = useCallback(() => {
    return positions
      .filter(pos => !pos.isHeading)
      .reduce((sum, pos) => sum + pos.quantity * pos.price, 0);
  }, [positions]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const handleSubmit = async () => {
    setError(null);

    // Validation
    if (!selectedContact) {
      setError('Bitte wähle einen Kunden aus');
      return;
    }
    if (!header.trim()) {
      setError('Bitte gib einen Betreff ein');
      return;
    }
    const validPositions = positions.filter(pos => !pos.isHeading);
    if (validPositions.length === 0) {
      setError('Bitte füge mindestens eine Position hinzu');
      return;
    }

    setSubmitting(true);

    try {
      // Prepare positions - include headings as quantity=0 positions
      const quotePositions = positions.map(pos => ({
        name: pos.name,
        text: pos.text || undefined,
        quantity: pos.isHeading ? 0 : pos.quantity,
        price: pos.isHeading ? 0 : pos.price,
      }));

      const input: CreateQuoteInput = {
        contactId: selectedContact.id,
        quoteDate,
        header,
        headText: headText || undefined,
        footText: footText || undefined,
        positions: quotePositions,
        status: createAsDraft ? 100 : 200,
      };

      const response = await sevdeskApi.createQuote(input);

      if (response.success) {
        setSuccess(`Angebot ${response.data.quoteNumber} wurde erstellt!`);
        if (onSuccess) {
          setTimeout(() => onSuccess(response.data.quoteNumber), 1500);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Erstellen des Angebots');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText size={20} />
            Neues Angebot erstellen
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Success Message */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400">
              <Check size={18} />
              <span>{success}</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Kunde *
            </label>
            {loadingContacts ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 size={16} className="animate-spin" />
                <span>Lade Kunden...</span>
              </div>
            ) : (
              <select
                value={selectedContact?.id || ''}
                onChange={(e) => {
                  const contact = contacts.find(c => c.id === e.target.value);
                  setSelectedContact(contact || null);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                <option value="">Kunde auswählen...</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name} {contact.customerNumber ? `(${contact.customerNumber})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Quote Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Angebotsdatum
            </label>
            <input
              type="date"
              value={quoteDate}
              onChange={(e) => setQuoteDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>

          {/* Header / Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Betreff *
            </label>
            <input
              type="text"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="z.B. Angebot für IT-Dienstleistungen"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>

          {/* Head Text with Templates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Einleitungstext
            </label>
            {/* Template Selectors */}
            <div className="flex flex-wrap gap-2 mb-2">
              <select
                value={selectedSalutation}
                onChange={(e) => setSelectedSalutation(e.target.value)}
                className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                {SALUTATION_TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <select
                value={selectedHeadTemplate}
                onChange={(e) => setSelectedHeadTemplate(e.target.value)}
                className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                {HEAD_TEXT_TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <textarea
              value={headText}
              onChange={(e) => setHeadText(e.target.value)}
              placeholder="Sehr geehrte Damen und Herren,&#10;&#10;vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
          </div>

          {/* Positions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Positionen *
              </label>
              <div className="flex gap-2">
                <button
                  onClick={addHeading}
                  className="text-xs px-2 py-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded"
                >
                  + Zwischenüberschrift
                </button>
                <button
                  onClick={() => addPosition()}
                  className="text-xs px-2 py-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded"
                >
                  + Leere Position
                </button>
                <button
                  onClick={() => setShowPositionSearch(!showPositionSearch)}
                  className="text-xs px-2 py-1 bg-accent-primary text-white rounded flex items-center gap-1"
                >
                  <Search size={12} />
                  Aus Vorlagen
                </button>
              </div>
            </div>

            {/* Position Search */}
            {showPositionSearch && (
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="relative mb-2">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={positionSearch}
                    onChange={(e) => setPositionSearch(e.target.value)}
                    placeholder="Suche in bisherigen Positionen..."
                    autoFocus
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                  {searching && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        onClick={() => addPosition(result)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm text-gray-900 dark:text-white">
                            {result.name}
                          </span>
                          <span className="text-sm text-gray-500">
                            {formatCurrency(result.price)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {result.sourceDocumentType === 'invoice' ? (
                            <Receipt size={12} />
                          ) : (
                            <FileText size={12} />
                          )}
                          <span>{result.sourceDocumentNumber}</span>
                          <span>•</span>
                          <span>{result.sourceContactName}</span>
                        </div>
                        {result.text && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                            {result.text}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {positionSearch.length >= 2 && searchResults.length === 0 && !searching && (
                  <p className="text-sm text-gray-500 text-center py-2">
                    Keine Positionen gefunden
                  </p>
                )}
              </div>
            )}

            {/* Position List */}
            <div className="space-y-2">
              {positions.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                  <FileText size={32} className="mx-auto mb-2 opacity-50" />
                  <p>Keine Positionen hinzugefügt</p>
                  <p className="text-sm">Nutze "Aus Vorlagen" um bestehende Positionen zu suchen</p>
                </div>
              ) : (
                positions.map((pos, index) => (
                  <div
                    key={pos.id}
                    className={`border rounded-lg overflow-hidden ${
                      pos.isHeading
                        ? 'border-gray-400 dark:border-gray-500 bg-gray-100 dark:bg-gray-700'
                        : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
                    }`}
                  >
                    {/* Position Header */}
                    <div
                      className="flex items-center gap-2 p-3 cursor-pointer"
                      onClick={() => toggleExpanded(pos.id)}
                    >
                      <GripVertical size={16} className="text-gray-400" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {pos.isHeading ? (
                            <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                              Überschrift
                            </span>
                          ) : null}
                          <span className={`font-medium truncate ${pos.isHeading ? 'text-gray-700 dark:text-gray-200' : 'text-gray-900 dark:text-white'}`}>
                            {pos.name || '(Ohne Name)'}
                          </span>
                        </div>
                        {!pos.isHeading && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {pos.quantity} x {formatCurrency(pos.price)} = {formatCurrency(pos.quantity * pos.price)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            movePosition(index, 'up');
                          }}
                          disabled={index === 0}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            movePosition(index, 'down');
                          }}
                          disabled={index === positions.length - 1}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removePosition(pos.id);
                          }}
                          className="p-1 text-red-400 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Position Edit Form */}
                    {expandedPositions.has(pos.id) && (
                      <div className="p-3 pt-0 border-t border-gray-200 dark:border-gray-600 space-y-3">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400">
                            {pos.isHeading ? 'Überschrift' : 'Bezeichnung'}
                          </label>
                          <input
                            type="text"
                            value={pos.name}
                            onChange={(e) => updatePosition(pos.id, { name: e.target.value })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                          />
                        </div>

                        {!pos.isHeading && (
                          <>
                            <div>
                              <label className="text-xs text-gray-500 dark:text-gray-400">
                                Beschreibung (optional)
                              </label>
                              <textarea
                                value={pos.text}
                                onChange={(e) => updatePosition(pos.id, { text: e.target.value })}
                                rows={2}
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400">
                                  Menge
                                </label>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={pos.quantity}
                                  onChange={(e) => updatePosition(pos.id, { quantity: parseFloat(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400">
                                  Einzelpreis (EUR)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={pos.price}
                                  onChange={(e) => updatePosition(pos.id, { price: parseFloat(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Total */}
            {positions.filter(p => !p.isHeading).length > 0 && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg flex justify-between items-center">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Gesamtsumme (Netto)
                </span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(calculateTotal())}
                </span>
              </div>
            )}
          </div>

          {/* Foot Text with Templates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Schlusstext
            </label>
            {/* Template Selector */}
            <div className="flex flex-wrap gap-2 mb-2">
              <select
                value={selectedFootTemplate}
                onChange={(e) => setSelectedFootTemplate(e.target.value)}
                className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                {FOOT_TEXT_TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <textarea
              value={footText}
              onChange={(e) => setFootText(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
          </div>

          {/* Draft Option */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="createAsDraft"
              checked={createAsDraft}
              onChange={(e) => setCreateAsDraft(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <label htmlFor="createAsDraft" className="text-sm text-gray-700 dark:text-gray-300">
              Als Entwurf speichern (kann später bearbeitet werden)
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !!success}
            className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {success ? 'Erstellt!' : createAsDraft ? 'Als Entwurf speichern' : 'Angebot erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuoteEditor;
