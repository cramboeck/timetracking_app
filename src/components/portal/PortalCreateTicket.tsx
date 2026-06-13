import { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Paperclip, MessageCircle } from 'lucide-react';
import { customerPortalApi, PortalTicket, PortalDevice } from '../../services/api';

interface PortalCreateTicketProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (ticket: PortalTicket) => void;
}

// Uploaded file with preview
interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  name: string;
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
  images?: UploadedFile[];
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

// Dynamic message generator based on context
function getContextualMessage(stepId: string, collectedData: Record<string, string>): string {
  const messages: Record<string, () => string> = {
    start: () => 'Hallo! 👋 Schön, dass Sie da sind. Wie kann ich Ihnen heute helfen?',

    // Problem flow - empathetic responses
    problem_type: () => 'Oh je, das ist natürlich ärgerlich! 😟 Um was für ein Problem handelt es sich?',

    software_name: () => 'Verstehe, ein Software-Problem. 💻 Welches Programm macht denn Schwierigkeiten?',

    error_message: () => {
      const sw = collectedData.software;
      return sw
        ? `Alles klar, ${sw} zickt also rum. 🤔 Erscheint dabei eine Fehlermeldung?`
        : 'Verstanden. Erscheint dabei eine Fehlermeldung?';
    },

    error_message_text: () => 'Das hilft uns sehr! Können Sie die Fehlermeldung hier einfügen oder abtippen? 📝\n\n💡 Tipp: Ein Screenshot ist auch super hilfreich!',

    hardware_device: () => 'Hardware-Problem – das schauen wir uns an! 🔧 Welches Gerät ist betroffen?',

    device_selection: () => '🖥️ Möchten Sie ein Gerät aus Ihrer Liste auswählen? Das hilft uns bei der Fehlersuche.',

    network_details: () => 'Netzwerk-Probleme sind frustrierend, ich verstehe! 😤 Was genau funktioniert nicht?',

    email_problem: () => 'E-Mail Probleme können den Arbeitstag ganz schön durcheinander bringen! 📧 Was genau ist los?',

    printer_problem: () => 'Ah, der Drucker... ein Klassiker! 🖨️ Was macht er denn (nicht)?',

    problem_description: () => {
      const type = collectedData.problemType;
      const device = collectedData.device;
      const sw = collectedData.software;

      if (sw) return `Gut, ich habe schon einiges notiert. 📝 Beschreiben Sie bitte noch kurz, was genau bei ${sw} passiert:`;
      if (device) return `Alles klar, das ${device} macht Probleme. Beschreiben Sie bitte kurz, was genau passiert:`;

      const typeLabels: Record<string, string> = {
        network: 'zum Netzwerk-Problem',
        email: 'zum E-Mail Problem',
        printer: 'zum Drucker',
      };
      return `Okay! Erzählen Sie mir bitte noch etwas mehr ${typeLabels[type] || 'dazu'}:`;
    },

    // Request flow - helpful tone
    request_type: () => 'Alles klar, Sie brauchen etwas Neues! 🛒 Was genau benötigen Sie?',

    new_hardware_type: () => 'Neue Hardware – immer spannend! 💻 Was für ein Gerät soll es sein?',

    new_software_name: () => 'Software-Anfrage, verstanden! 📦 Welche Software benötigen Sie?',

    new_access_type: () => 'Zugang oder Account – da helfen wir gerne! 🔑 Was genau wird benötigt?',

    new_user_details: () => 'Ein neuer Kollege/eine neue Kollegin kommt – willkommen! 🎉 Wie heißt die Person?',

    new_user_department: () => {
      const name = collectedData.newUserName;
      return name
        ? `Super, ${name} also. In welcher Abteilung wird ${name.includes(' ') ? name.split(' ')[0] : 'er/sie'} arbeiten?`
        : 'In welcher Abteilung wird die Person arbeiten?';
    },

    new_user_start: () => {
      const name = collectedData.newUserName;
      const firstName = name?.includes(' ') ? name.split(' ')[0] : name;
      return firstName
        ? `Prima! Wann startet ${firstName} denn? 📅`
        : 'Wann ist der Starttermin? 📅';
    },

    new_user_permissions: () => {
      const name = collectedData.newUserName;
      const dept = collectedData.department;
      const firstName = name?.includes(' ') ? name.split(' ')[0] : name;

      if (firstName && dept) {
        return `Super! ${firstName} in der ${dept}. 📋 Welche Programme und Zugänge werden benötigt?\n\n💡 Tipp: Wenn es einen Kollegen mit ähnlicher Rolle gibt, können Sie den als Vorlage nennen.`;
      }
      return 'Welche Programme und Zugänge werden benötigt? 📋\n\n💡 Tipp: Gibt es einen Kollegen als Vorlage?';
    },

    accessory_type: () => 'Zubehör – gute Ausstattung ist wichtig! 🎧 Was genau brauchen Sie?',

    request_reason: () => {
      const hw = collectedData.hardwareType;
      const sw = collectedData.softwareName;
      const acc = collectedData.accessoryType;

      if (hw) return `Ein ${hw} also. 📋 Kurz zur Dokumentation: Warum wird das benötigt?`;
      if (sw) return `${sw} – notiert! 📋 Kurz für die Freigabe: Wofür wird die Software benötigt?`;
      if (acc) return `${acc} – verstanden! Kurze Begründung für die Anfrage?`;

      return 'Kurz für unsere Dokumentation: Warum wird das benötigt? 📋';
    },

    // Change flow - professional tone
    change_type: () => 'Änderungswunsch – da sind Sie bei mir richtig! ✏️ Was soll geändert werden?',

    user_change_type: () => 'Benutzer-Änderung, verstanden. Was genau soll angepasst werden?',

    affected_user: () => {
      const changeType = collectedData.userChangeType;
      const changeLabels: Record<string, string> = {
        permissions: 'die Berechtigungen anpassen',
        deactivate: 'den Account deaktivieren',
        name: 'den Namen ändern',
        department: 'die Abteilung wechseln',
      };
      const action = changeLabels[changeType] || 'ändern';
      return `Wir sollen also ${action}. Bei welchem Benutzer? 👤`;
    },

    password_account: () => 'Passwort-Reset – kein Problem! 🔑 Für welchen Account?',

    change_description: () => {
      const user = collectedData.affectedUser;
      return user
        ? `Alles klar, es geht um ${user}. Was genau soll geändert werden?`
        : 'Was genau soll geändert werden?';
    },

    // Question flow
    question_details: () => 'Fragen sind immer willkommen! 🤓 Was möchten Sie wissen?',

    // Urgency - contextual
    urgency: () => {
      const category = collectedData.category;
      if (category === 'problem') {
        return 'Verstanden! 📊 Noch eine wichtige Frage: Wie stark beeinträchtigt das Problem Ihre Arbeit?';
      }
      return 'Fast geschafft! 📊 Wie dringend ist Ihr Anliegen?';
    },

    // Contact preference - friendly
    contact_preference: () => {
      const priority = collectedData.priority;
      if (priority === 'critical') {
        return 'Ich sehe, es ist dringend! 🚨 Wie erreichen wir Sie am schnellsten?';
      }
      if (priority === 'high') {
        return 'Wir kümmern uns schnell darum! 📞 Wie sollen wir Sie kontaktieren?';
      }
      return 'Letzte Frage: Wie können wir Sie am besten erreichen? 📬';
    },

    // Summary - with recap
    summary: () => {
      const category = collectedData.category;
      const priority = collectedData.priority;

      const categoryLabels: Record<string, string> = {
        problem: 'Ihr Support-Ticket',
        request: 'Ihre Anfrage',
        change: 'Ihren Änderungswunsch',
        question: 'Ihre Frage',
      };

      const priorityEmojis: Record<string, string> = {
        low: '🟢',
        normal: '🟡',
        high: '🟠',
        critical: '🔴',
      };

      return `Perfekt, ich habe alles! ✅\n\n${priorityEmojis[priority] || '📋'} ${categoryLabels[category] || 'Ihr Ticket'} ist fertig zur Erstellung.\n\nSoll ich es jetzt absenden?`;
    },
  };

  return messages[stepId]?.() || `Schritt: ${stepId}`;
}

// Define the conversation flow
const conversationFlow: Record<string, ConversationStep> = {
  start: {
    id: 'start',
    message: '', // Will be filled dynamically
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
    message: '',
    options: [
      { id: 'software', label: '💻 Software funktioniert nicht', value: 'software' },
      { id: 'hardware', label: '🖥️ Computer/Gerät defekt', value: 'hardware' },
      { id: 'network', label: '🌐 Internet/Netzwerk', value: 'network' },
      { id: 'email', label: '📧 E-Mail Problem', value: 'email' },
      { id: 'printer', label: '🖨️ Drucker', value: 'printer' },
      { id: 'other', label: '💬 Etwas anderes', value: 'other' },
    ],
    // nextStep is handled dynamically to check for device selection
    nextStep: (answer) => {
      // device_selection will be injected if devices exist
      if (answer === 'software') return 'device_selection_or_software';
      if (answer === 'hardware') return 'device_selection_or_hardware';
      if (answer === 'network') return 'network_details';
      if (answer === 'email') return 'email_problem';
      if (answer === 'printer') return 'printer_problem';
      return 'problem_description';
    },
    collectAs: 'problemType',
  },

  // Dynamic device selection step - options are injected at runtime
  device_selection: {
    id: 'device_selection',
    message: '',
    // Options will be dynamically populated with customer devices
    options: [
      { id: 'skip', label: '⏭️ Überspringen', value: 'skip' },
    ],
    nextStep: (_answer) => {
      // Will be overridden in handleOptionClick based on problemType
      return 'problem_description';
    },
    collectAs: 'selectedDevice',
  },

  software_name: {
    id: 'software_name',
    message: '',
    inputType: 'text',
    inputPlaceholder: 'z.B. Word, Excel, SAP, Browser...',
    nextStep: () => 'error_message',
    collectAs: 'software',
  },

  error_message: {
    id: 'error_message',
    message: '',
    options: [
      { id: 'yes', label: '✅ Ja, ich sehe eine Meldung', value: 'yes' },
      { id: 'no', label: '❌ Nein, keine Meldung', value: 'no' },
      { id: 'screenshot', label: '📷 Ich lade einen Screenshot hoch', value: 'no' },
    ],
    nextStep: (answer) => answer === 'yes' ? 'error_message_text' : 'problem_description',
    collectAs: 'hasError',
  },

  error_message_text: {
    id: 'error_message_text',
    message: '',
    inputType: 'text',
    inputPlaceholder: 'Fehlermeldung hier einfügen...',
    nextStep: () => 'problem_description',
    collectAs: 'errorMessage',
  },

  hardware_device: {
    id: 'hardware_device',
    message: '',
    options: [
      { id: 'laptop', label: '💻 Laptop', value: 'Laptop' },
      { id: 'desktop', label: '🖥️ Desktop-PC', value: 'Desktop-PC' },
      { id: 'monitor', label: '🖵 Monitor/Bildschirm', value: 'Monitor' },
      { id: 'keyboard', label: '⌨️ Tastatur oder Maus', value: 'Tastatur/Maus' },
      { id: 'headset', label: '🎧 Headset/Audio', value: 'Headset' },
      { id: 'other', label: '🔧 Anderes Gerät', value: 'Anderes Gerät' },
    ],
    nextStep: () => 'problem_description',
    collectAs: 'device',
  },

  network_details: {
    id: 'network_details',
    message: '',
    options: [
      { id: 'no_internet', label: '🚫 Gar kein Internet', value: 'Kein Internet' },
      { id: 'slow', label: '🐌 Sehr langsam', value: 'Sehr langsam' },
      { id: 'vpn', label: '🔒 VPN geht nicht', value: 'VPN Problem' },
      { id: 'wifi', label: '📶 WLAN instabil', value: 'WLAN Problem' },
      { id: 'share', label: '📁 Netzlaufwerk weg', value: 'Netzlaufwerk nicht erreichbar' },
    ],
    nextStep: () => 'problem_description',
    collectAs: 'networkIssue',
  },

  email_problem: {
    id: 'email_problem',
    message: '',
    options: [
      { id: 'no_send', label: '📤 Senden geht nicht', value: 'Kann nicht senden' },
      { id: 'no_receive', label: '📥 Empfange nichts', value: 'Empfange keine E-Mails' },
      { id: 'login', label: '🔐 Login klappt nicht', value: 'Login funktioniert nicht' },
      { id: 'slow', label: '🐌 Extrem langsam', value: 'Sehr langsam' },
      { id: 'other', label: '💬 Anderes Problem', value: 'Sonstiges' },
    ],
    nextStep: () => 'problem_description',
    collectAs: 'emailIssue',
  },

  printer_problem: {
    id: 'printer_problem',
    message: '',
    options: [
      { id: 'offline', label: '🔴 Zeigt "offline"', value: 'Drucker offline' },
      { id: 'paper', label: '📄 Papierstau', value: 'Papierstau' },
      { id: 'quality', label: '🖼️ Druckt schlecht', value: 'Schlechte Druckqualität' },
      { id: 'not_found', label: '❓ Finde ihn nicht', value: 'Drucker nicht gefunden' },
    ],
    nextStep: () => 'problem_description',
    collectAs: 'printerIssue',
  },

  problem_description: {
    id: 'problem_description',
    message: '',
    inputType: 'textarea',
    inputPlaceholder: 'Was passiert genau? Wann fing es an? Haben Sie schon etwas probiert?',
    nextStep: () => 'urgency',
    collectAs: 'description',
  },

  // Request flow
  request_type: {
    id: 'request_type',
    message: '',
    options: [
      { id: 'hardware', label: '💻 Neues Gerät', value: 'hardware' },
      { id: 'software', label: '📦 Neue Software', value: 'software' },
      { id: 'access', label: '🔑 Zugang/Account', value: 'access' },
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
    message: '',
    options: [
      { id: 'laptop', label: '💻 Laptop', value: 'Laptop' },
      { id: 'desktop', label: '🖥️ Desktop-PC', value: 'Desktop-PC' },
      { id: 'monitor', label: '🖵 Monitor', value: 'Monitor' },
      { id: 'phone', label: '📱 Smartphone', value: 'Smartphone' },
      { id: 'tablet', label: '📱 Tablet', value: 'Tablet' },
    ],
    nextStep: () => 'request_reason',
    collectAs: 'hardwareType',
  },

  new_software_name: {
    id: 'new_software_name',
    message: '',
    inputType: 'text',
    inputPlaceholder: 'Name der Software oder was sie können soll...',
    nextStep: () => 'request_reason',
    collectAs: 'softwareName',
  },

  new_access_type: {
    id: 'new_access_type',
    message: '',
    options: [
      { id: 'user', label: '👤 Neuer Mitarbeiter', value: 'user' },
      { id: 'email', label: '📧 Neue E-Mail-Adresse', value: 'email' },
      { id: 'vpn', label: '🔒 VPN-Zugang', value: 'vpn' },
      { id: 'system', label: '💼 System-Zugang', value: 'system' },
      { id: 'folder', label: '📁 Ordner-Zugriff', value: 'folder' },
    ],
    nextStep: (answer) => answer === 'user' ? 'new_user_details' : 'request_reason',
    collectAs: 'accessType',
  },

  new_user_details: {
    id: 'new_user_details',
    message: '',
    inputType: 'text',
    inputPlaceholder: 'Vor- und Nachname...',
    nextStep: () => 'new_user_department',
    collectAs: 'newUserName',
  },

  new_user_department: {
    id: 'new_user_department',
    message: '',
    inputType: 'text',
    inputPlaceholder: 'z.B. Vertrieb, Buchhaltung, Produktion...',
    nextStep: () => 'new_user_start',
    collectAs: 'department',
  },

  new_user_start: {
    id: 'new_user_start',
    message: '',
    inputType: 'text',
    inputPlaceholder: 'Datum oder "nächste Woche", "ab sofort"...',
    nextStep: () => 'new_user_permissions',
    collectAs: 'startDate',
  },

  new_user_permissions: {
    id: 'new_user_permissions',
    message: '',
    inputType: 'textarea',
    inputPlaceholder: 'Welche Programme/Zugänge werden benötigt? Gibt es einen Kollegen als Vorlage?',
    nextStep: () => 'urgency',
    collectAs: 'permissions',
  },

  accessory_type: {
    id: 'accessory_type',
    message: '',
    options: [
      { id: 'keyboard', label: '⌨️ Tastatur', value: 'Tastatur' },
      { id: 'mouse', label: '🖱️ Maus', value: 'Maus' },
      { id: 'headset', label: '🎧 Headset', value: 'Headset' },
      { id: 'webcam', label: '📷 Webcam', value: 'Webcam' },
      { id: 'docking', label: '🔌 Docking Station', value: 'Docking Station' },
      { id: 'cable', label: '🔌 Kabel/Adapter', value: 'Kabel/Adapter' },
    ],
    nextStep: () => 'request_reason',
    collectAs: 'accessoryType',
  },

  request_reason: {
    id: 'request_reason',
    message: '',
    inputType: 'textarea',
    inputPlaceholder: 'Wofür wird es benötigt? Ersatz oder Neuanschaffung?',
    nextStep: () => 'urgency',
    collectAs: 'reason',
  },

  // Change flow
  change_type: {
    id: 'change_type',
    message: '',
    options: [
      { id: 'user', label: '👤 Benutzer/Rechte', value: 'user' },
      { id: 'password', label: '🔑 Passwort vergessen', value: 'password' },
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
    message: '',
    options: [
      { id: 'permissions', label: '🔐 Mehr/andere Rechte', value: 'permissions' },
      { id: 'deactivate', label: '🚫 Account deaktivieren', value: 'deactivate' },
      { id: 'name', label: '✏️ Name korrigieren', value: 'name' },
      { id: 'department', label: '🏢 Abteilung wechseln', value: 'department' },
    ],
    nextStep: () => 'affected_user',
    collectAs: 'userChangeType',
  },

  affected_user: {
    id: 'affected_user',
    message: '',
    inputType: 'text',
    inputPlaceholder: 'Name oder E-Mail des Benutzers...',
    nextStep: () => 'change_description',
    collectAs: 'affectedUser',
  },

  password_account: {
    id: 'password_account',
    message: '',
    inputType: 'text',
    inputPlaceholder: 'Ihre E-Mail-Adresse oder Benutzername...',
    nextStep: () => 'urgency',
    collectAs: 'passwordAccount',
  },

  change_description: {
    id: 'change_description',
    message: '',
    inputType: 'textarea',
    inputPlaceholder: 'Was genau soll geändert werden?',
    nextStep: () => 'urgency',
    collectAs: 'description',
  },

  // Question flow
  question_details: {
    id: 'question_details',
    message: '',
    inputType: 'textarea',
    inputPlaceholder: 'Stellen Sie Ihre Frage – wir helfen gerne!',
    nextStep: () => 'urgency',
    collectAs: 'question',
  },

  // Common ending
  urgency: {
    id: 'urgency',
    message: '',
    options: [
      { id: 'low', label: '🟢 Kann 1-2 Tage warten', value: 'low' },
      { id: 'normal', label: '🟡 Heute oder morgen', value: 'normal' },
      { id: 'high', label: '🟠 Möglichst heute!', value: 'high' },
      { id: 'critical', label: '🔴 Ich kann nicht arbeiten!', value: 'critical' },
    ],
    nextStep: () => 'contact_preference',
    collectAs: 'priority',
  },

  contact_preference: {
    id: 'contact_preference',
    message: '',
    options: [
      { id: 'email', label: '📧 Per E-Mail', value: 'email' },
      { id: 'phone', label: '📞 Ruft mich an', value: 'phone' },
      { id: 'any', label: '👍 Mir egal', value: 'any' },
    ],
    nextStep: () => 'summary',
    collectAs: 'contactPreference',
  },

  summary: {
    id: 'summary',
    message: '',
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

  // Add selected device at the top if present
  if (data.selectedDevice && data.selectedDevice !== 'skip') {
    sections.push(`**Betroffenes Gerät:** ${data.selectedDevice}`);
  }

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

// Max file constraints
const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const PortalCreateTicket = ({ isOpen, onClose, onCreated }: PortalCreateTicketProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentStep, setCurrentStep] = useState<string>('start');
  const [inputValue, setInputValue] = useState('');
  const [collectedData, setCollectedData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [devices, setDevices] = useState<PortalDevice[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load customer devices on mount
  useEffect(() => {
    if (isOpen) {
      loadDevices();
    }
  }, [isOpen]);

  const loadDevices = async () => {
    try {
      const res = await customerPortalApi.getDevices();
      setDevices(res.data || []);
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
  };

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

  const addBotMessage = (step: ConversationStep, dataOverride?: Record<string, string>) => {
    // Use the contextual message generator for dynamic, empathetic responses
    const contextData = dataOverride || collectedData;
    const dynamicMessage = getContextualMessage(step.id, contextData);

    const newMessage: Message = {
      id: `bot-${Date.now()}`,
      type: 'bot',
      content: dynamicMessage,
      options: step.options,
      inputType: step.inputType,
      inputPlaceholder: step.inputPlaceholder,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const addUserMessage = (content: string, images?: UploadedFile[]) => {
    const newMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content,
      timestamp: new Date(),
      images,
    };
    setMessages(prev => [...prev, newMessage]);
  };

  // Check if file type is allowed
  const isFileTypeAllowed = (file: File): boolean => {
    if (file.type.startsWith('image/')) return true;
    if (file.type === 'application/pdf') return true;
    if (file.type.includes('word') || file.type.includes('document')) return true;
    if (file.type.includes('excel') || file.type.includes('spreadsheet')) return true;
    if (file.type === 'text/plain' || file.type === 'text/csv') return true;
    return false;
  };

  // Get file icon based on type
  const getFileIcon = (file: File): string => {
    if (file.type.startsWith('image/')) return '🖼️';
    if (file.type === 'application/pdf') return '📄';
    if (file.type.includes('word') || file.type.includes('document')) return '📝';
    if (file.type.includes('excel') || file.type.includes('spreadsheet')) return '📊';
    return '📎';
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: UploadedFile[] = [];
    const remainingSlots = MAX_FILES - uploadedFiles.length;
    let skippedCount = 0;
    let tooLargeCount = 0;
    let wrongTypeCount = 0;

    Array.from(files).slice(0, remainingSlots).forEach(file => {
      // Check file type
      if (!isFileTypeAllowed(file)) {
        wrongTypeCount++;
        return;
      }

      // Max 10MB per file
      if (file.size > MAX_FILE_SIZE) {
        tooLargeCount++;
        return;
      }

      const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // Only create preview for images
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';

      newFiles.push({
        id,
        file,
        preview,
        name: file.name,
      });
    });

    // Count skipped due to limit
    if (Array.from(files).length > remainingSlots) {
      skippedCount = Array.from(files).length - remainingSlots;
    }

    if (newFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...newFiles]);

      // Add a user message showing the uploaded files
      const fileIcon = newFiles.length === 1 ? getFileIcon(newFiles[0].file) : '📎';
      const fileMessage: Message = {
        id: `user-files-${Date.now()}`,
        type: 'user',
        content: newFiles.length === 1
          ? `${fileIcon} ${newFiles[0].name}`
          : `📎 ${newFiles.length} Dateien hochgeladen`,
        timestamp: new Date(),
        images: newFiles.filter(f => f.preview), // Only show image previews
      };
      setMessages(prev => [...prev, fileMessage]);

      // Bot acknowledges
      setTimeout(() => {
        let ackContent = newFiles.length === 1
          ? '👍 Danke für die Datei! Das hilft uns bei der Analyse.'
          : `👍 Danke für die ${newFiles.length} Dateien! Das hilft uns bei der Analyse.`;

        // Add warnings if files were skipped
        const warnings: string[] = [];
        if (skippedCount > 0) warnings.push(`${skippedCount} übersprungen (max. ${MAX_FILES} Dateien)`);
        if (tooLargeCount > 0) warnings.push(`${tooLargeCount} zu groß (max. 10 MB)`);
        if (wrongTypeCount > 0) warnings.push(`${wrongTypeCount} nicht unterstützt`);

        if (warnings.length > 0) {
          ackContent += `\n\n⚠️ ${warnings.join(', ')}`;
        }

        const ackMessage: Message = {
          id: `bot-ack-${Date.now()}`,
          type: 'bot',
          content: ackContent,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, ackMessage]);
      }, 500);
    } else if (tooLargeCount > 0 || wrongTypeCount > 0 || skippedCount > 0) {
      // Show error if no files were added
      const errors: string[] = [];
      if (uploadedFiles.length >= MAX_FILES) errors.push(`Maximum ${MAX_FILES} Dateien erreicht`);
      if (tooLargeCount > 0) errors.push('Datei(en) zu groß (max. 10 MB)');
      if (wrongTypeCount > 0) errors.push('Dateityp nicht unterstützt');

      const errorMessage: Message = {
        id: `bot-error-${Date.now()}`,
        type: 'bot',
        content: `⚠️ ${errors.join('. ')}\n\nErlaubt: Bilder, PDF, Word, Excel, Textdateien`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove uploaded file
  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => {
      const file = prev.find(f => f.id === fileId);
      if (file) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== fileId);
    });
  };

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      uploadedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    };
  }, []);

  // Determine actual next step, handling device selection routing
  const resolveNextStep = (stepId: string, updatedData: Record<string, string>): string | null => {
    // Handle device selection routing
    if (stepId === 'device_selection_or_software') {
      return devices.length > 0 ? 'device_selection' : 'software_name';
    }
    if (stepId === 'device_selection_or_hardware') {
      return devices.length > 0 ? 'device_selection' : 'hardware_device';
    }

    // Handle post-device-selection routing
    if (stepId === 'problem_description' && currentStep === 'device_selection') {
      const problemType = updatedData.problemType;
      if (problemType === 'software') return 'software_name';
      if (problemType === 'hardware') return 'hardware_device';
    }

    return stepId;
  };

  // Get device options for device_selection step
  const getDeviceOptions = (): Option[] => {
    const options: Option[] = devices.slice(0, 6).map(device => ({
      id: device.id,
      label: `🖥️ ${device.displayName || device.systemName}`,
      value: device.displayName || device.systemName,
    }));

    // Always add skip option
    options.push({ id: 'skip', label: '⏭️ Überspringen', value: 'skip' });

    return options;
  };

  const handleOptionClick = async (option: Option) => {
    const step = conversationFlow[currentStep];

    // Add user message
    addUserMessage(option.label);

    // Handle special actions
    if (currentStep === 'summary') {
      if (option.value === 'create') {
        await createTicket();
      } else if (option.value === 'restart') {
        resetConversation();
      }
      return;
    }

    // Calculate updated data
    let updatedData = step.collectAs && option.value !== 'skip'
      ? { ...collectedData, [step.collectAs]: option.value }
      : collectedData;

    // Special handling for device_selection - route to correct next step
    let rawNextStepId: string | null = null;
    if (currentStep === 'device_selection') {
      const problemType = updatedData.problemType;
      if (problemType === 'software') rawNextStepId = 'software_name';
      else if (problemType === 'hardware') rawNextStepId = 'hardware_device';
      else rawNextStepId = 'problem_description';
    } else {
      rawNextStepId = step.nextStep?.(option.value) || null;
    }

    // Resolve dynamic routing
    const nextStepId = rawNextStepId ? resolveNextStep(rawNextStepId, updatedData) : null;

    if (nextStepId && conversationFlow[nextStepId]) {
      setCurrentStep(nextStepId);
      setCollectedData(updatedData);
      setTimeout(() => {
        // For device_selection, inject dynamic options
        if (nextStepId === 'device_selection') {
          const deviceStep = { ...conversationFlow.device_selection, options: getDeviceOptions() };
          addBotMessage(deviceStep, updatedData);
        } else {
          addBotMessage(conversationFlow[nextStepId], updatedData);
        }
      }, 500);
    }
  };

  const handleInputSubmit = () => {
    if (!inputValue.trim()) return;

    const step = conversationFlow[currentStep];
    const trimmedValue = inputValue.trim();

    // Add user message
    addUserMessage(trimmedValue);

    // Calculate updated data for contextual message
    const updatedData = step.collectAs
      ? { ...collectedData, [step.collectAs]: trimmedValue }
      : collectedData;

    setCollectedData(updatedData);
    setInputValue('');

    // Get next step
    const nextStepId = step.nextStep?.(trimmedValue);
    if (nextStepId && conversationFlow[nextStepId]) {
      setCurrentStep(nextStepId);
      setTimeout(() => {
        addBotMessage(conversationFlow[nextStepId], updatedData);
      }, 500);
    }
  };

  const createTicket = async () => {
    setLoading(true);

    try {
      const { title, description, priority } = generateTicketContent(collectedData);

      const ticket = await customerPortalApi.createTicket({
        title,
        description,
        priority: priority as 'low' | 'normal' | 'high' | 'critical',
      });

      // Upload attachments if any
      if (uploadedFiles.length > 0) {
        try {
          const formData = new FormData();
          uploadedFiles.forEach(f => {
            formData.append('files', f.file);
          });
          await customerPortalApi.uploadAttachments(ticket.id, formData);
        } catch (uploadErr) {
          console.error('Failed to upload attachments:', uploadErr);
          // Continue anyway, ticket was created
        }
      }

      // Show success message
      const attachmentNote = uploadedFiles.length > 0
        ? `\n\n📎 ${uploadedFiles.length} Anhang/Anhänge wurden hochgeladen.`
        : '';

      const successMessage: Message = {
        id: `bot-success-${Date.now()}`,
        type: 'bot',
        content: `✅ Super! Ihr Ticket wurde erfolgreich erstellt.\n\n**Ticket-Nummer:** ${ticket.ticketNumber || ticket.id}${attachmentNote}\n\nWir melden uns schnellstmöglich bei Ihnen!`,
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
    // Cleanup file previews
    uploadedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    setUploadedFiles([]);
    setMessages([]);
    setCurrentStep('start');
    setCollectedData({});
    setInputValue('');
    setTimeout(() => {
      addBotMessage(conversationFlow.start);
    }, 300);
  };

  const handleClose = () => {
    // Cleanup file previews
    uploadedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    setUploadedFiles([]);
    setMessages([]);
    setCurrentStep('start');
    setCollectedData({});
    setInputValue('');
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
      <div className="relative bg-white dark:bg-dark-100 rounded-2xl shadow-2xl w-full max-w-lg h-[600px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-accent-primary to-accent-dark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <MessageCircle size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white">Support-Assistent</h2>
              <p className="text-xs text-accent-primary">Wir helfen Ihnen gerne!</p>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-dark-50">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  message.type === 'user'
                    ? 'bg-accent-primary text-white rounded-br-md'
                    : 'bg-white dark:bg-dark-100 text-gray-900 dark:text-white shadow-sm rounded-bl-md border border-gray-100 dark:border-dark-border'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                {/* Show attached images */}
                {message.images && message.images.length > 0 && (
                  <div className={`mt-2 grid gap-2 ${message.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {message.images.map(img => (
                      <div key={img.id} className="relative group">
                        <img
                          src={img.preview}
                          alt={img.name}
                          className="rounded-lg max-h-32 w-full object-cover cursor-pointer hover:opacity-90"
                          onClick={() => window.open(img.preview, '_blank')}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-dark-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-gray-100 dark:border-dark-border">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-accent-primary" />
                  <span className="text-sm text-gray-500 dark:text-dark-400">Ticket wird erstellt...</span>
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
                  className="px-4 py-2 bg-white dark:bg-dark-100 hover:bg-accent-light dark:hover:bg-dark-200 border border-gray-200 dark:border-dark-border rounded-full text-sm font-medium text-gray-700 dark:text-dark-500 transition-colors shadow-sm hover:shadow-md hover:border-accent-primary/40 dark:hover:border-accent-primary"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Uploaded files preview bar */}
        {uploadedFiles.length > 0 && !loading && (
          <div className="px-4 py-2 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-100/50">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-dark-400 flex-shrink-0">
                📎 {uploadedFiles.length}/{MAX_FILES}
              </span>
              <div className="flex gap-1 overflow-x-auto">
                {uploadedFiles.map(f => (
                  <div key={f.id} className="relative group flex-shrink-0">
                    {f.preview ? (
                      <img
                        src={f.preview}
                        alt={f.name}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div
                        className="h-10 w-10 rounded bg-gray-200 dark:bg-dark-200 flex items-center justify-center text-xs"
                        title={f.name}
                      >
                        {getFileIcon(f.file)}
                      </div>
                    )}
                    <button
                      onClick={() => removeFile(f.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        {showInput && (
          <div className="p-4 border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100">
            <div className="flex gap-2">
              {/* Attachment button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadedFiles.length >= MAX_FILES}
                className="p-2.5 text-gray-500 hover:text-accent-primary hover:bg-accent-light dark:hover:bg-dark-200 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={uploadedFiles.length >= MAX_FILES ? `Maximum ${MAX_FILES} Dateien` : 'Datei anhängen'}
              >
                <Paperclip size={18} />
              </button>

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
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-dark-border rounded-xl bg-gray-50 dark:bg-dark-200 text-gray-900 dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent-primary"
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
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-dark-border rounded-full bg-gray-50 dark:bg-dark-200 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
              )}
              <button
                onClick={handleInputSubmit}
                disabled={!inputValue.trim()}
                className="p-2.5 bg-accent-primary hover:bg-accent-primary disabled:bg-gray-300 dark:disabled:bg-dark-300 text-white rounded-full transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Options with attachment button */}
        {showOptions && !showInput && uploadedFiles.length < MAX_FILES && (
          <div className="p-4 border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-accent-primary hover:bg-accent-light dark:hover:bg-dark-200 rounded-lg transition-colors"
            >
              <Paperclip size={16} />
              <span>Datei anhängen ({uploadedFiles.length}/{MAX_FILES})</span>
            </button>
          </div>
        )}

        {/* Restart button when no input/options */}
        {!showInput && !showOptions && !loading && messages.length > 0 && (
          <div className="p-4 border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100">
            <button
              onClick={resetConversation}
              className="w-full py-2.5 text-sm font-medium text-accent-primary dark:text-accent-primary hover:bg-accent-light dark:hover:bg-dark-200 rounded-lg transition-colors"
            >
              🔄 Neue Anfrage starten
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
