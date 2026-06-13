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
  Sparkles,
  Bot,
} from 'lucide-react';
import { sevdeskApi, PositionSearchResult, CreateQuoteInput, aiApi } from '../services/api';
import { Button, IconButton } from './ui/Button';
import { useAuth } from '../contexts/AuthContext';

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
  purchasePrice?: number; // Einkaufspreis for margin calculation
  isHeading?: boolean; // For section headings (quantity = 0)
}

interface QuoteEditorProps {
  onClose: () => void;
  onSuccess?: (quoteNumber: string) => void;
  quoteId?: string; // If provided, edit existing quote instead of creating new one
  preselectedContactId?: string; // sevDesk contact ID to pre-select
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

export const QuoteEditor = ({ onClose, onSuccess, quoteId, preselectedContactId }: QuoteEditorProps) => {
  const isEditing = !!quoteId;
  const { currentUser } = useAuth();

  // Contact selection
  const [contacts, setContacts] = useState<SevdeskContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selectedContact, setSelectedContact] = useState<SevdeskContact | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(isEditing);

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
      .replace(/{ansprechpartner}/g, currentUser?.displayName || currentUser?.username || 'Ihr Ansprechpartner')
      .replace(/{anrede}/g, 'Herr/Frau');
  }, [selectedContact, currentUser]);

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

  // AI Assistant
  const [aiConfigured, setAiConfigured] = useState(false);
  const [generatingHeadText, setGeneratingHeadText] = useState(false);
  const [generatingFootText, setGeneratingFootText] = useState(false);
  const [researchingPrice, setResearchingPrice] = useState<string | null>(null); // position id being researched
  const [priceResearchResult, setPriceResearchResult] = useState<{positionId: string; result: string} | null>(null);
  const [generatingDescription, setGeneratingDescription] = useState<string | null>(null); // position id being generated

  // Margin settings
  const [showMarginSettings, setShowMarginSettings] = useState(false);
  const [defaultMargin, setDefaultMargin] = useState(30); // 30% default margin

  // Load contacts on mount and check AI config
  useEffect(() => {
    loadContacts();
    checkAiConfig();
    if (quoteId) {
      loadExistingQuote(quoteId);
    }
  }, [quoteId]);

  // Load existing quote for editing
  const loadExistingQuote = async (id: string) => {
    setLoadingQuote(true);
    try {
      const response = await sevdeskApi.getQuote(id);
      if (response.success && response.data) {
        const quote = response.data;
        setHeader(quote.header);
        setHeadText(quote.headText || '');
        setFootText(quote.footText || '');
        // Convert positions
        setPositions(quote.positions.map((p, index) => ({
          id: `existing-${index}`,
          name: p.name,
          text: p.text || '',
          quantity: p.quantity,
          price: p.price,
          isHeading: p.quantity === 0 && p.price === 0,
        })));
        // Find and set contact
        const contact = contacts.find(c => c.id === quote.contact.id);
        if (contact) {
          setSelectedContact(contact);
        } else {
          // Contact might not be loaded yet, wait and try again
          setTimeout(async () => {
            const loadedContacts = await sevdeskApi.getContacts();
            if (loadedContacts.success) {
              const foundContact = loadedContacts.data.contacts.find(c => c.id === quote.contact.id);
              if (foundContact) {
                setSelectedContact(foundContact);
              }
            }
          }, 500);
        }
      }
    } catch (err: any) {
      console.error('Failed to load quote:', err);
      setError(err.message || 'Fehler beim Laden des Angebots');
    } finally {
      setLoadingQuote(false);
    }
  };

  const checkAiConfig = async () => {
    try {
      const response = await aiApi.getConfig();
      setAiConfigured(response.data?.enabled && response.data?.hasApiKey);
    } catch (err) {
      console.error('Failed to check AI config:', err);
      setAiConfigured(false);
    }
  };

  // AI Text Generation
  const generateAiHeadText = async () => {
    if (!aiConfigured) return;
    setGeneratingHeadText(true);
    try {
      const response = await aiApi.generateQuoteText('head', {
        customerName: selectedContact?.name,
        header,
        positions: positions.filter(p => !p.isHeading).map(p => ({ name: p.name, price: p.price })),
      });
      if (response.success && response.data.text) {
        // Combine with selected salutation
        const salutation = SALUTATION_TEMPLATES.find(t => t.id === selectedSalutation);
        if (salutation) {
          setHeadText(`${replaceVariables(salutation.text)}\n\n${response.data.text}`);
        } else {
          setHeadText(response.data.text);
        }
      }
    } catch (err: any) {
      console.error('Failed to generate head text:', err);
      setError(err.message || 'Fehler beim Generieren des Textes');
    } finally {
      setGeneratingHeadText(false);
    }
  };

  const generateAiFootText = async () => {
    if (!aiConfigured) return;
    setGeneratingFootText(true);
    try {
      const response = await aiApi.generateQuoteText('foot', {
        customerName: selectedContact?.name,
        header,
        positions: positions.filter(p => !p.isHeading).map(p => ({ name: p.name, price: p.price * p.quantity })),
      });
      if (response.success && response.data.text) {
        setFootText(response.data.text);
      }
    } catch (err: any) {
      console.error('Failed to generate foot text:', err);
      setError(err.message || 'Fehler beim Generieren des Textes');
    } finally {
      setGeneratingFootText(false);
    }
  };

  // AI Price Research
  const researchPrice = async (positionId: string, productName: string) => {
    if (!aiConfigured || !productName) return;
    setResearchingPrice(positionId);
    setPriceResearchResult(null);
    try {
      const response = await aiApi.researchPrice(productName);
      if (response.success && response.data) {
        setPriceResearchResult({
          positionId,
          result: response.data.result,
        });
        // If we got a suggested price, offer to apply it
        if (response.data.suggestedPrice) {
          updatePosition(positionId, { price: response.data.suggestedPrice });
        }
      }
    } catch (err: any) {
      console.error('Failed to research price:', err);
      setError(err.message || 'Fehler bei der Preisrecherche');
    } finally {
      setResearchingPrice(null);
    }
  };

  // AI Position Description Generation
  const generateDescription = async (positionId: string, positionName: string) => {
    if (!aiConfigured || !positionName) return;
    setGeneratingDescription(positionId);
    try {
      const response = await aiApi.generatePositionDescription(positionName, {
        customerName: selectedContact?.name,
        quoteHeader: header,
        otherPositions: positions.filter(p => p.id !== positionId && !p.isHeading).map(p => p.name),
      });
      if (response.success && response.data?.description) {
        updatePosition(positionId, { text: response.data.description });
      }
    } catch (err: any) {
      console.error('Failed to generate description:', err);
      setError(err.message || 'Fehler beim Generieren der Beschreibung');
    } finally {
      setGeneratingDescription(null);
    }
  };

  // Calculate margin for a position
  const calculateMargin = (sellPrice: number, purchasePrice: number): number => {
    if (sellPrice <= 0) return 0;
    return ((sellPrice - purchasePrice) / sellPrice) * 100;
  };

  // Calculate sell price from purchase price and margin
  const calculateSellPrice = (purchasePrice: number, margin: number): number => {
    if (margin >= 100) return purchasePrice;
    return purchasePrice / (1 - margin / 100);
  };

  const loadContacts = async () => {
    try {
      setLoadingContacts(true);
      const response = await sevdeskApi.getCustomers();
      if (response.success) {
        setContacts(response.data);
        // Pre-select contact if preselectedContactId is provided
        if (preselectedContactId && !selectedContact) {
          const contact = response.data.find(c => c.id === preselectedContactId);
          if (contact) {
            setSelectedContact(contact);
          }
        }
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

      let response;
      if (isEditing && quoteId) {
        response = await sevdeskApi.updateQuote(quoteId, input);
      } else {
        response = await sevdeskApi.createQuote(input);
      }

      if (response.success) {
        setSuccess(isEditing
          ? `Angebot ${response.data.quoteNumber} wurde aktualisiert!`
          : `Angebot ${response.data.quoteNumber} wurde erstellt!`
        );
        if (onSuccess) {
          setTimeout(() => onSuccess(response.data.quoteNumber), 1500);
        }
      }
    } catch (err: any) {
      setError(err.message || (isEditing ? 'Fehler beim Aktualisieren des Angebots' : 'Fehler beim Erstellen des Angebots'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-100 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText size={20} />
            {isEditing ? 'Angebot bearbeiten' : 'Neues Angebot erstellen'}
          </h3>
          <IconButton
            onClick={onClose}
            icon={<X size={20} />}
            variant="default"
            tooltip="Schließen"
          />
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
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Angebotsdatum
            </label>
            <input
              type="date"
              value={quoteDate}
              onChange={(e) => setQuoteDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
            />
          </div>

          {/* Header / Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Betreff *
            </label>
            <input
              type="text"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="z.B. Angebot für IT-Dienstleistungen"
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
            />
          </div>

          {/* Head Text with Templates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Einleitungstext
            </label>
            {/* Template Selectors */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <select
                value={selectedSalutation}
                onChange={(e) => setSelectedSalutation(e.target.value)}
                className="text-xs px-2 py-1 border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-100 text-gray-700 dark:text-dark-500"
              >
                {SALUTATION_TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <select
                value={selectedHeadTemplate}
                onChange={(e) => setSelectedHeadTemplate(e.target.value)}
                className="text-xs px-2 py-1 border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-100 text-gray-700 dark:text-dark-500"
              >
                {HEAD_TEXT_TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              {aiConfigured && (
                <Button
                  onClick={generateAiHeadText}
                  disabled={generatingHeadText}
                  variant="secondary"
                  size="sm"
                  icon={generatingHeadText ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  className="text-xs bg-accent-lighter hover:bg-accent-lighter text-accent-dark dark:bg-accent-primary/20 dark:hover:bg-accent-primary/30 dark:text-accent-primary"
                >
                  KI-Text
                </Button>
              )}
            </div>
            <textarea
              value={headText}
              onChange={(e) => setHeadText(e.target.value)}
              placeholder="Sehr geehrte Damen und Herren,&#10;&#10;vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
            />
          </div>

          {/* Positions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-dark-500">
                Positionen *
              </label>
              <div className="flex gap-2">
                <Button
                onClick={addHeading}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                + Zwischenüberschrift
              </Button>
              <Button
                onClick={() => addPosition()}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                + Leere Position
              </Button>
              <Button
                onClick={() => setShowPositionSearch(!showPositionSearch)}
                variant="primary"
                size="sm"
                icon={<Search size={12} />}
                className="text-xs"
              >
                Aus Vorlagen
              </Button>
              </div>
            </div>

            {/* Position Search */}
            {showPositionSearch && (
              <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-50 rounded-lg border border-gray-200 dark:border-dark-border">
                <div className="relative mb-2">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={positionSearch}
                    onChange={(e) => setPositionSearch(e.target.value)}
                    placeholder="Suche in bisherigen Positionen..."
                    autoFocus
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
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
                        className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm text-gray-900 dark:text-white">
                            {result.name}
                          </span>
                          <span className="text-sm text-gray-500">
                            {formatCurrency(result.price)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-dark-400 mt-1">
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
                          <p className="text-xs text-gray-500 dark:text-dark-400 mt-1 line-clamp-2">
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
                <div className="text-center py-8 text-gray-500 dark:text-dark-400 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg">
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
                        ? 'border-gray-400 dark:border-dark-border bg-gray-100 dark:bg-dark-200'
                        : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100'
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
                            <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-dark-300 text-gray-600 dark:text-dark-500 rounded">
                              Überschrift
                            </span>
                          ) : null}
                          <span className={`font-medium truncate ${pos.isHeading ? 'text-gray-700 dark:text-dark-500' : 'text-gray-900 dark:text-white'}`}>
                            {pos.name || '(Ohne Name)'}
                          </span>
                        </div>
                        {!pos.isHeading && (
                          <div className="text-sm text-gray-500 dark:text-dark-400">
                            {pos.quantity} x {formatCurrency(pos.price)} = {formatCurrency(pos.quantity * pos.price)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            movePosition(index, 'up');
                          }}
                          disabled={index === 0}
                          icon={<ChevronUp size={16} />}
                          variant="default"
                          size="sm"
                          tooltip="Nach oben"
                        />
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            movePosition(index, 'down');
                          }}
                          disabled={index === positions.length - 1}
                          icon={<ChevronDown size={16} />}
                          variant="default"
                          size="sm"
                          tooltip="Nach unten"
                        />
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            removePosition(pos.id);
                          }}
                          icon={<Trash2 size={16} />}
                          variant="danger"
                          size="sm"
                          tooltip="Löschen"
                        />
                      </div>
                    </div>

                    {/* Position Edit Form */}
                    {expandedPositions.has(pos.id) && (
                      <div className="p-3 pt-0 border-t border-gray-200 dark:border-dark-border space-y-3">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-dark-400">
                            {pos.isHeading ? 'Überschrift' : 'Bezeichnung'}
                          </label>
                          <input
                            type="text"
                            value={pos.name}
                            onChange={(e) => updatePosition(pos.id, { name: e.target.value })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                          />
                        </div>

                        {!pos.isHeading && (
                          <>
                            <div>
                              <div className="flex items-center justify-between flex-wrap gap-1">
                                <label className="text-xs text-gray-500 dark:text-dark-400">
                                  Beschreibung (optional)
                                </label>
                                <div className="flex items-center gap-2">
                                  {aiConfigured && pos.name && (
                                    <>
                                      <Button
                                        onClick={() => generateDescription(pos.id, pos.name)}
                                        disabled={generatingDescription === pos.id}
                                        variant="secondary"
                                        size="sm"
                                        icon={generatingDescription === pos.id ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                                        className="text-xs px-2 py-0.5 bg-accent-lighter hover:bg-accent-lighter text-accent-dark dark:bg-accent-primary/20 dark:hover:bg-accent-primary/30 dark:text-accent-primary"
                                      >
                                        Beschreibung
                                      </Button>
                                      <Button
                                        onClick={() => researchPrice(pos.id, pos.name)}
                                        disabled={researchingPrice === pos.id}
                                        variant="secondary"
                                        size="sm"
                                        icon={researchingPrice === pos.id ? <Loader2 size={10} className="animate-spin" /> : <Bot size={10} />}
                                        className="text-xs px-2 py-0.5 bg-accent-lighter hover:bg-accent-lighter text-accent-dark dark:bg-accent-primary/20 dark:hover:bg-accent-primary/30 dark:text-accent-primary"
                                      >
                                        Preis
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                              <textarea
                                value={pos.text}
                                onChange={(e) => updatePosition(pos.id, { text: e.target.value })}
                                rows={2}
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                              />
                              {/* Price Research Result */}
                              {priceResearchResult?.positionId === pos.id && (
                                <div className="mt-2 p-2 bg-accent-light dark:bg-accent-primary/20 border border-accent-primary/30 dark:border-accent-primary/40 rounded text-xs text-accent-dark dark:text-accent-primary whitespace-pre-wrap">
                                  {priceResearchResult.result}
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-4 gap-3">
                              <div>
                                <label className="text-xs text-gray-500 dark:text-dark-400">
                                  Menge
                                </label>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={pos.quantity}
                                  onChange={(e) => updatePosition(pos.id, { quantity: parseFloat(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-dark-400">
                                  EK-Preis (EUR)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={pos.purchasePrice || ''}
                                  onChange={(e) => {
                                    const purchasePrice = parseFloat(e.target.value) || 0;
                                    updatePosition(pos.id, { purchasePrice });
                                    // Auto-calculate sell price with default margin if no price set
                                    if (purchasePrice > 0 && (!pos.price || pos.price === 0)) {
                                      updatePosition(pos.id, { price: calculateSellPrice(purchasePrice, defaultMargin) });
                                    }
                                  }}
                                  placeholder="EK"
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-dark-400">
                                  VK-Preis (EUR)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={pos.price}
                                  onChange={(e) => updatePosition(pos.id, { price: parseFloat(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-dark-400">
                                  Marge
                                </label>
                                <div className={`px-2 py-1 text-sm rounded text-center font-medium ${
                                  pos.purchasePrice && pos.price
                                    ? calculateMargin(pos.price, pos.purchasePrice) >= 25
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                      : calculateMargin(pos.price, pos.purchasePrice) >= 15
                                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                    : 'bg-gray-100 text-gray-500 dark:bg-dark-100 dark:text-dark-400'
                                }`}>
                                  {pos.purchasePrice && pos.price
                                    ? `${calculateMargin(pos.price, pos.purchasePrice).toFixed(1)}%`
                                    : '-'}
                                </div>
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

            {/* Total with Margin Summary */}
            {positions.filter(p => !p.isHeading).length > 0 && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-dark-50 rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700 dark:text-dark-500">
                    Gesamtsumme (Netto)
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatCurrency(calculateTotal())}
                  </span>
                </div>
                {/* Margin Summary - only show if at least one position has purchase price */}
                {positions.some(p => !p.isHeading && p.purchasePrice && p.purchasePrice > 0) && (
                  <>
                    <div className="border-t border-gray-200 dark:border-dark-border pt-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 dark:text-dark-400">Gesamt EK</span>
                        <span className="text-gray-700 dark:text-dark-500">
                          {formatCurrency(
                            positions
                              .filter(p => !p.isHeading && p.purchasePrice)
                              .reduce((sum, p) => sum + (p.purchasePrice || 0) * p.quantity, 0)
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 dark:text-dark-400">Rohertrag</span>
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          {formatCurrency(
                            positions
                              .filter(p => !p.isHeading)
                              .reduce((sum, p) => sum + (p.price - (p.purchasePrice || 0)) * p.quantity, 0)
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 dark:text-dark-400">Ø Marge</span>
                        <span className={`font-medium ${
                          (() => {
                            const totalSell = positions.filter(p => !p.isHeading).reduce((sum, p) => sum + p.price * p.quantity, 0);
                            const totalPurchase = positions.filter(p => !p.isHeading && p.purchasePrice).reduce((sum, p) => sum + (p.purchasePrice || 0) * p.quantity, 0);
                            const margin = totalSell > 0 ? ((totalSell - totalPurchase) / totalSell) * 100 : 0;
                            return margin >= 25 ? 'text-green-600 dark:text-green-400' : margin >= 15 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400';
                          })()
                        }`}>
                          {(() => {
                            const totalSell = positions.filter(p => !p.isHeading).reduce((sum, p) => sum + p.price * p.quantity, 0);
                            const totalPurchase = positions.filter(p => !p.isHeading && p.purchasePrice).reduce((sum, p) => sum + (p.purchasePrice || 0) * p.quantity, 0);
                            const margin = totalSell > 0 ? ((totalSell - totalPurchase) / totalSell) * 100 : 0;
                            return `${margin.toFixed(1)}%`;
                          })()}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Foot Text with Templates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Schlusstext
            </label>
            {/* Template Selector */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <select
                value={selectedFootTemplate}
                onChange={(e) => setSelectedFootTemplate(e.target.value)}
                className="text-xs px-2 py-1 border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-100 text-gray-700 dark:text-dark-500"
              >
                {FOOT_TEXT_TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              {aiConfigured && (
                <Button
                  onClick={generateAiFootText}
                  disabled={generatingFootText}
                  variant="secondary"
                  size="sm"
                  icon={generatingFootText ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  className="text-xs bg-accent-lighter hover:bg-accent-lighter text-accent-dark dark:bg-accent-primary/20 dark:hover:bg-accent-primary/30 dark:text-accent-primary"
                >
                  KI-Text
                </Button>
              )}
            </div>
            <textarea
              value={footText}
              onChange={(e) => setFootText(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
            />
          </div>

          {/* Draft Option */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="createAsDraft"
              checked={createAsDraft}
              onChange={(e) => setCreateAsDraft(e.target.checked)}
              className="rounded border-gray-300 dark:border-dark-border"
            />
            <label htmlFor="createAsDraft" className="text-sm text-gray-700 dark:text-dark-500">
              Als Entwurf speichern (kann später bearbeitet werden)
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-dark-border flex justify-end gap-3">
          <Button
            onClick={onClose}
            variant="outline"
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !!success}
            variant="primary"
            loading={submitting}
          >
            {success ? 'Erstellt!' : createAsDraft ? 'Als Entwurf speichern' : 'Angebot erstellen'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuoteEditor;
