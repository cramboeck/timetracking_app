import { useState, useEffect, useRef } from 'react';
import { X, Send, ArrowLeft, CheckCircle, AlertTriangle, Loader2, Paperclip, MessageCircle } from 'lucide-react';
import { customerPortalApi, PortalTicket } from '../../services/api';

interface PortalCreateTicketProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (ticket: PortalTicket) => void;
}

// Message types for the conversation
interface Message {
  id: string;
  type: 'bot' | 'user';
  content: string;
  options?: Option[];
  inputType?: 'text' | 'textarea';
  inputPlaceholder?: string;
  timestamp: Date;
}

interface Option {
  id: string;
  label: string;
  icon?: string;
  value: string;
}

// Conversation flow definition
interface ConversationStep {
  id: string;
  message: string;
  options?: Option[];
  inputType?: 'text' | 'textarea';
  inputPlaceholder?: string;
  nextStep?: (answer: string) => string | null;
  collectAs?: string; // Which field to save the answer to
}

// Define the conversation flow
const conversationFlow: Record<string, ConversationStep> = {
  start: {
    id: 'start',
    message: 'Hallo! 👋 Was können wir heute für Sie tun?',
    options: [
      { id: 'problem', label: '🔧 Ich habe ein Problem', value: 'problem' },
      { id: 'request', label: '📦 Ich brauche etwas Neues', value: 'request' },
      { id: 'change', label: '✏️ Ich möchte etwas ändern', value: 'change' },
      { id: 'question', label: '❓ Ich habe eine Frage', value: 'question' },
    ],
    nextStep: (answer) => {
      if (answer === 'problem') return 'problem_type';
      if (answer === 'request') return 'request_type';
      if (answer === 'change') return 'change_type';
      return 'question_details';
    },
    collectAs: 'category',
  },

  // Problem flow
  problem_type: {
    id: 'problem_type',
    message: 'Was für ein Problem haben Sie?',
    options: [
      { id: 'software', label: '💻 Software funktioniert nicht', value: 'software' },
      { id: 'hardware', label: '🖥️ Computer/Gerät defekt', value: 'hardware' },
      { id: 'network', label: '🌐 Kein Internet/Netzwerk', value: 'network' },
      { id: 'email', label: '📧 E-Mail Problem', value: 'email' },
      { id: 'printer', label: '🖨️ Drucker Problem', value: 'printer' },
      { id: 'other', label: '📝 Sonstiges', value: 'other' },
    ],
    nextStep: (answer) => {
      if (answer === 'software') return 'software_name';
      if (answer === 'hardware') return 'hardware_device';
      if (answer === 'network') return 'network_details';
      if (answer === 'email') return 'email_problem';
      if (answer === 'printer') return 'printer_problem';
      return 'problem_description';
    },
    collectAs: 'problemType',
  },

  software_name: {
    id: 'software_name',
    message: 'Welche Software ist betroffen?',
    inputType: 'text',
    inputPlaceholder: 'z.B. Microsoft Word, SAP, Browser...',
    nextStep: () => 'error_message',
    collectAs: 'software',
  },

  error_message: {
    id: 'error_message',
    message: 'Gibt es eine Fehlermeldung?',
    options: [
      { id: 'yes', label: '✅ Ja', value: 'yes' },
      { id: 'no', label: '❌ Nein', value: 'no' },
    ],
    nextStep: (answer) => answer === 'yes' ? 'error_message_text' : 'problem_description',
    collectAs: 'hasError',
  },

  error_message_text: {
    id: 'error_message_text',
    message: 'Wie lautet die Fehlermeldung?',
    inputType: 'text',
    inputPlaceholder: 'Kopieren Sie die Meldung hier rein...',
    nextStep: () => 'problem_description',
    collectAs: 'errorMessage',
  },

  hardware_device: {
    id: 'hardware_device',
    message: 'Welches Gerät ist betroffen?',
    options: [
      { id: 'laptop', label: '💻 Laptop', value: 'laptop' },
      { id: 'desktop', label: '🖥️ Desktop-PC', value: 'desktop' },
      { id: 'monitor', label: '🖵 Monitor', value: 'monitor' },
      { id: 'keyboard', label: '⌨️ Tastatur/Maus', value: 'keyboard' },
      { id: 'headset', label: '🎧 Headset', value: 'headset' },
      { id: 'other', label: '📝 Anderes', value: 'other' },
    ],
    nextStep: () => 'problem_description',
    collectAs: 'device',
  },

  network_details: {
    id: 'network_details',
    message: 'Was funktioniert nicht?',
    options: [
      { id: 'no_internet', label: '🌐 Gar kein Internet', value: 'no_internet' },
      { id: 'slow', label: '🐌 Sehr langsam', value: 'slow' },
      { id: 'vpn', label: '🔒 VPN funktioniert nicht', value: 'vpn' },
      { id: 'wifi', label: '📶 WLAN Probleme', value: 'wifi' },
      { id: 'share', label: '📁 Netzlaufwerk nicht erreichbar', value: 'share' },
    ],
    nextStep: () => 'problem_description',
    collectAs: 'networkIssue',
  },

  email_problem: {
    id: 'email_problem',
    message: 'Was ist das E-Mail Problem?',
    options: [
      { id: 'no_send', label: '📤 Kann nicht senden', value: 'no_send' },
      { id: 'no_receive', label: '📥 Empfange keine E-Mails', value: 'no_receive' },
      { id: 'login', label: '🔐 Kann mich nicht anmelden', value: 'login' },
      { id: 'slow', label: '🐌 Sehr langsam', value: 'slow' },
      { id: 'other', label: '📝 Sonstiges', value: 'other' },
    ],
    nextStep: () => 'problem_description',
    collectAs: 'emailIssue',
  },

  printer_problem: {
    id: 'printer_problem',
    message: 'Was ist das Drucker-Problem?',
    options: [
      { id: 'offline', label: '🔴 Drucker offline', value: 'offline' },
      { id: 'paper', label: '📄 Papierstau', value: 'paper' },
      { id: 'quality', label: '🖼️ Schlechte Druckqualität', value: 'quality' },
      { id: 'not_found', label: '❓ Drucker wird nicht gefunden', value: 'not_found' },
    ],
    nextStep: () => 'problem_description',
    collectAs: 'printerIssue',
  },

  problem_description: {
    id: 'problem_description',
    message: 'Können Sie das Problem kurz beschreiben?',
    inputType: 'textarea',
    inputPlaceholder: 'Was genau passiert? Wann ist es aufgetreten?',
    nextStep: () => 'urgency',
    collectAs: 'description',
  },

  // Request flow (neue Anforderungen)
  request_type: {
    id: 'request_type',
    message: 'Was benötigen Sie?',
    options: [
      { id: 'hardware', label: '💻 Neues Gerät', value: 'hardware' },
      { id: 'software', label: '📦 Neue Software', value: 'software' },
      { id: 'access', label: '🔑 Neuer Zugang/Account', value: 'access' },
      { id: 'accessory', label: '🎧 Zubehör', value: 'accessory' },
    ],
    nextStep: (answer) => {
      if (answer === 'hardware') return 'new_hardware_type';
      if (answer === 'software') return 'new_software_name';
      if (answer === 'access') return 'new_access_type';
      return 'accessory_type';
    },
    collectAs: 'requestType',
  },

  new_hardware_type: {
    id: 'new_hardware_type',
    message: 'Welches Gerät benötigen Sie?',
    options: [
      { id: 'laptop', label: '💻 Laptop', value: 'laptop' },
      { id: 'desktop', label: '🖥️ Desktop-PC', value: 'desktop' },
      { id: 'monitor', label: '🖵 Monitor', value: 'monitor' },
      { id: 'phone', label: '📱 Smartphone', value: 'phone' },
      { id: 'tablet', label: '📱 Tablet', value: 'tablet' },
    ],
    nextStep: () => 'request_reason',
    collectAs: 'hardwareType',
  },

  new_software_name: {
    id: 'new_software_name',
    message: 'Welche Software benötigen Sie?',
    inputType: 'text',
    inputPlaceholder: 'Name der Software...',
    nextStep: () => 'request_reason',
    collectAs: 'softwareName',
  },

  new_access_type: {
    id: 'new_access_type',
    message: 'Welchen Zugang benötigen Sie?',
    options: [
      { id: 'user', label: '👤 Neuer Benutzer anlegen', value: 'user' },
      { id: 'email', label: '📧 E-Mail Account', value: 'email' },
      { id: 'vpn', label: '🔒 VPN Zugang', value: 'vpn' },
      { id: 'system', label: '💼 Zugang zu System/Software', value: 'system' },
      { id: 'folder', label: '📁 Zugriff auf Ordner/Laufwerk', value: 'folder' },
    ],
    nextStep: (answer) => answer === 'user' ? 'new_user_details' : 'request_reason',
    collectAs: 'accessType',
  },

  new_user_details: {
    id: 'new_user_details',
    message: 'Für wen wird der Benutzer angelegt?',
    inputType: 'text',
    inputPlaceholder: 'Name des neuen Mitarbeiters...',
    nextStep: () => 'new_user_department',
    collectAs: 'newUserName',
  },

  new_user_department: {
    id: 'new_user_department',
    message: 'In welcher Abteilung arbeitet die Person?',
    inputType: 'text',
    inputPlaceholder: 'z.B. Vertrieb, Buchhaltung, IT...',
    nextStep: () => 'new_user_start',
    collectAs: 'department',
  },

  new_user_start: {
    id: 'new_user_start',
    message: 'Wann ist der Starttermin?',
    inputType: 'text',
    inputPlaceholder: 'z.B. 01.04.2026 oder "nächste Woche"',
    nextStep: () => 'request_reason',
    collectAs: 'startDate',
  },

  accessory_type: {
    id: 'accessory_type',
    message: 'Welches Zubehör benötigen Sie?',
    options: [
      { id: 'keyboard', label: '⌨️ Tastatur', value: 'keyboard' },
      { id: 'mouse', label: '🖱️ Maus', value: 'mouse' },
      { id: 'headset', label: '🎧 Headset', value: 'headset' },
      { id: 'webcam', label: '📷 Webcam', value: 'webcam' },
      { id: 'docking', label: '🔌 Docking Station', value: 'docking' },
      { id: 'cable', label: '🔌 Kabel/Adapter', value: 'cable' },
    ],
    nextStep: () => 'request_reason',
    collectAs: 'accessoryType',
  },

  request_reason: {
    id: 'request_reason',
    message: 'Warum wird das benötigt?',
    inputType: 'textarea',
    inputPlaceholder: 'Kurze Begründung...',
    nextStep: () => 'urgency',
    collectAs: 'reason',
  },

  // Change flow
  change_type: {
    id: 'change_type',
    message: 'Was möchten Sie ändern?',
    options: [
      { id: 'user', label: '👤 Benutzer/Berechtigungen', value: 'user' },
      { id: 'password', label: '🔑 Passwort zurücksetzen', value: 'password' },
      { id: 'email', label: '📧 E-Mail Einstellungen', value: 'email' },
      { id: 'system', label: '⚙️ System-Einstellungen', value: 'system' },
    ],
    nextStep: (answer) => {
      if (answer === 'user') return 'user_change_type';
      if (answer === 'password') return 'password_account';
      return 'change_description';
    },
    collectAs: 'changeType',
  },

  user_change_type: {
    id: 'user_change_type',
    message: 'Was soll geändert werden?',
    options: [
      { id: 'permissions', label: '🔐 Berechtigungen anpassen', value: 'permissions' },
      { id: 'deactivate', label: '🚫 Benutzer deaktivieren', value: 'deactivate' },
      { id: 'name', label: '✏️ Name ändern', value: 'name' },
      { id: 'department', label: '🏢 Abteilung wechseln', value: 'department' },
    ],
    nextStep: () => 'affected_user',
    collectAs: 'userChangeType',
  },

  affected_user: {
    id: 'affected_user',
    message: 'Welcher Benutzer ist betroffen?',
    inputType: 'text',
    inputPlaceholder: 'Name oder E-Mail-Adresse...',
    nextStep: () => 'change_description',
    collectAs: 'affectedUser',
  },

  password_account: {
    id: 'password_account',
    message: 'Für welchen Account soll das Passwort zurückgesetzt werden?',
    inputType: 'text',
    inputPlaceholder: 'E-Mail-Adresse oder Benutzername...',
    nextStep: () => 'urgency',
    collectAs: 'passwordAccount',
  },

  change_description: {
    id: 'change_description',
    message: 'Was genau soll geändert werden?',
    inputType: 'textarea',
    inputPlaceholder: 'Beschreiben Sie die gewünschte Änderung...',
    nextStep: () => 'urgency',
    collectAs: 'description',
  },

  // Question flow
  question_details: {
    id: 'question_details',
    message: 'Was möchten Sie wissen?',
    inputType: 'textarea',
    inputPlaceholder: 'Stellen Sie Ihre Frage...',
    nextStep: () => 'urgency',
    collectAs: 'question',
  },

  // Common ending
  urgency: {
    id: 'urgency',
    message: 'Wie dringend ist Ihr Anliegen?',
    options: [
      { id: 'low', label: '🟢 Kann warten (1-2 Tage)', value: 'low' },
      { id: 'normal', label: '🟡 Normal (heute/morgen)', value: 'normal' },
      { id: 'high', label: '🟠 Dringend (heute noch)', value: 'high' },
      { id: 'critical', label: '🔴 Blockiert meine Arbeit!', value: 'critical' },
    ],
    nextStep: () => 'contact_preference',
    collectAs: 'priority',
  },

  contact_preference: {
    id: 'contact_preference',
    message: 'Wie können wir Sie am besten erreichen?',
    options: [
      { id: 'email', label: '📧 Per E-Mail', value: 'email' },
      { id: 'phone', label: '📞 Telefonisch', value: 'phone' },
      { id: 'any', label: '✅ Egal', value: 'any' },
    ],
    nextStep: () => 'summary',
    collectAs: 'contactPreference',
  },

  summary: {
    id: 'summary',
    message: 'Perfekt! Ich habe alle Informationen. Soll ich das Ticket jetzt erstellen?',
    options: [
      { id: 'create', label: '✅ Ja, Ticket erstellen', value: 'create' },
      { id: 'restart', label: '🔄 Nochmal von vorne', value: 'restart' },
    ],
    nextStep: () => null,
    collectAs: 'action',
  },
};

// Generate ticket title and description from collected data
function generateTicketContent(data: Record<string, string>): { title: string; description: string; priority: string } {
  let title = '';
  let description = '';
  const priority = data.priority || 'normal';

  // Generate title based on category
  if (data.category === 'problem') {
    const problemLabels: Record<string, string> = {
      software: 'Software-Problem',
      hardware: 'Hardware-Defekt',
      network: 'Netzwerk-Problem',
      email: 'E-Mail Problem',
      printer: 'Drucker-Problem',
      other: 'Problem',
    };
    title = problemLabels[data.problemType] || 'Support-Anfrage';

    if (data.software) title += `: ${data.software}`;
    if (data.device) title += `: ${data.device}`;
  } else if (data.category === 'request') {
    const requestLabels: Record<string, string> = {
      hardware: 'Hardware-Anfrage',
      software: 'Software-Anfrage',
      access: 'Zugangs-Anfrage',
      accessory: 'Zubehör-Anfrage',
    };
    title = requestLabels[data.requestType] || 'Neue Anfrage';

    if (data.hardwareType) title += `: ${data.hardwareType}`;
    if (data.softwareName) title += `: ${data.softwareName}`;
    if (data.accessType === 'user') title = `Neuer Benutzer: ${data.newUserName || ''}`;
    if (data.accessoryType) title += `: ${data.accessoryType}`;
  } else if (data.category === 'change') {
    const changeLabels: Record<string, string> = {
      user: 'Benutzeränderung',
      password: 'Passwort-Reset',
      email: 'E-Mail Änderung',
      system: 'System-Änderung',
    };
    title = changeLabels[data.changeType] || 'Änderungsanfrage';

    if (data.affectedUser) title += `: ${data.affectedUser}`;
    if (data.passwordAccount) title += ` für ${data.passwordAccount}`;
  } else if (data.category === 'question') {
    title = 'Frage';
  }

  // Generate description
  const sections: string[] = [];

  if (data.description) sections.push(`**Beschreibung:**\n${data.description}`);
  if (data.question) sections.push(`**Frage:**\n${data.question}`);
  if (data.reason) sections.push(`**Begründung:**\n${data.reason}`);

  if (data.errorMessage) sections.push(`**Fehlermeldung:**\n${data.errorMessage}`);
  if (data.networkIssue) sections.push(`**Netzwerk-Problem:** ${data.networkIssue}`);
  if (data.emailIssue) sections.push(`**E-Mail Problem:** ${data.emailIssue}`);
  if (data.printerIssue) sections.push(`**Drucker-Problem:** ${data.printerIssue}`);

  if (data.newUserName) sections.push(`**Neuer Benutzer:** ${data.newUserName}`);
  if (data.department) sections.push(`**Abteilung:** ${data.department}`);
  if (data.startDate) sections.push(`**Startdatum:** ${data.startDate}`);

  if (data.affectedUser) sections.push(`**Betroffener Benutzer:** ${data.affectedUser}`);
  if (data.userChangeType) sections.push(`**Art der Änderung:** ${data.userChangeType}`);

  const contactLabels: Record<string, string> = {
    email: 'Per E-Mail',
    phone: 'Telefonisch',
    any: 'Egal',
  };
  if (data.contactPreference) sections.push(`**Bevorzugter Kontakt:** ${contactLabels[data.contactPreference] || data.contactPreference}`);

  description = sections.join('\n\n');

  return { title, description, priority };
}

export const PortalCreateTicket = ({ isOpen, onClose, onCreated }: PortalCreateTicketProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentStep, setCurrentStep] = useState<string>('start');
  const [inputValue, setInputValue] = useState('');
  const [collectedData, setCollectedData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when step changes
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentStep]);

  // Initialize conversation
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      addBotMessage(conversationFlow.start);
    }
  }, [isOpen]);

  const addBotMessage = (step: ConversationStep) => {
    const newMessage: Message = {
      id: `bot-${Date.now()}`,
      type: 'bot',
      content: step.message,
      options: step.options,
      inputType: step.inputType,
      inputPlaceholder: step.inputPlaceholder,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const addUserMessage = (content: string) => {
    const newMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleOptionClick = async (option: Option) => {
    const step = conversationFlow[currentStep];

    // Add user message
    addUserMessage(option.label);

    // Collect data
    if (step.collectAs) {
      setCollectedData(prev => ({ ...prev, [step.collectAs!]: option.value }));
    }

    // Handle special actions
    if (currentStep === 'summary') {
      if (option.value === 'create') {
        await createTicket();
      } else if (option.value === 'restart') {
        resetConversation();
      }
      return;
    }

    // Get next step
    const nextStepId = step.nextStep?.(option.value);
    if (nextStepId && conversationFlow[nextStepId]) {
      setCurrentStep(nextStepId);
      setTimeout(() => {
        addBotMessage(conversationFlow[nextStepId]);
      }, 500);
    }
  };

  const handleInputSubmit = () => {
    if (!inputValue.trim()) return;

    const step = conversationFlow[currentStep];

    // Add user message
    addUserMessage(inputValue);

    // Collect data
    if (step.collectAs) {
      setCollectedData(prev => ({ ...prev, [step.collectAs!]: inputValue }));
    }

    setInputValue('');

    // Get next step
    const nextStepId = step.nextStep?.(inputValue);
    if (nextStepId && conversationFlow[nextStepId]) {
      setCurrentStep(nextStepId);
      setTimeout(() => {
        addBotMessage(conversationFlow[nextStepId]);
      }, 500);
    }
  };

  const createTicket = async () => {
    setLoading(true);
    setError(null);

    try {
      const { title, description, priority } = generateTicketContent(collectedData);

      const ticket = await customerPortalApi.createTicket({
        title,
        description,
        priority: priority as 'low' | 'normal' | 'high' | 'critical',
      });

      // Show success message
      const successMessage: Message = {
        id: `bot-success-${Date.now()}`,
        type: 'bot',
        content: `✅ Super! Ihr Ticket wurde erfolgreich erstellt.\n\n**Ticket-Nummer:** ${ticket.ticketNumber || ticket.id}\n\nWir melden uns schnellstmöglich bei Ihnen!`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, successMessage]);

      // Close dialog after delay
      setTimeout(() => {
        onCreated(ticket);
        handleClose();
      }, 2000);
    } catch (err) {
      console.error('Failed to create ticket:', err);
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen des Tickets');

      const errorMessage: Message = {
        id: `bot-error-${Date.now()}`,
        type: 'bot',
        content: '❌ Ups, da ist etwas schiefgelaufen. Bitte versuchen Sie es nochmal.',
        options: [
          { id: 'retry', label: '🔄 Nochmal versuchen', value: 'retry' },
        ],
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const resetConversation = () => {
    setMessages([]);
    setCurrentStep('start');
    setCollectedData({});
    setInputValue('');
    setError(null);
    setTimeout(() => {
      addBotMessage(conversationFlow.start);
    }, 300);
  };

  const handleClose = () => {
    setMessages([]);
    setCurrentStep('start');
    setCollectedData({});
    setInputValue('');
    setError(null);
    onClose();
  };

  const currentStepData = conversationFlow[currentStep];
  const showInput = currentStepData?.inputType && !loading;
  const lastMessage = messages[messages.length - 1];
  const showOptions = lastMessage?.type === 'bot' && lastMessage?.options && !loading;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg h-[600px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <MessageCircle size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white">Support-Assistent</h2>
              <p className="text-xs text-blue-100">Wir helfen Ihnen gerne!</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm rounded-bl-md border border-gray-100 dark:border-gray-700'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-blue-600" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">Ticket wird erstellt...</span>
                </div>
              </div>
            </div>
          )}

          {/* Options */}
          {showOptions && (
            <div className="flex flex-wrap gap-2 justify-start">
              {lastMessage.options!.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleOptionClick(option)}
                  className="px-4 py-2 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-500"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {showInput && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex gap-2">
              {currentStepData.inputType === 'textarea' ? (
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleInputSubmit();
                    }
                  }}
                  placeholder={currentStepData.inputPlaceholder}
                  rows={3}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleInputSubmit();
                    }
                  }}
                  placeholder={currentStepData.inputPlaceholder}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
              <button
                onClick={handleInputSubmit}
                disabled={!inputValue.trim()}
                className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-full transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Restart button when no input/options */}
        {!showInput && !showOptions && !loading && messages.length > 0 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <button
              onClick={resetConversation}
              className="w-full py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              🔄 Neue Anfrage starten
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
