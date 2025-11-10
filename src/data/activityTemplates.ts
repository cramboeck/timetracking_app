// Predefined activity templates for quick setup
export interface ActivityTemplate {
  name: string;
  description: string;
  isBillable: boolean;
  pricingType: 'hourly' | 'flat';
  category: string;
}

export const ACTIVITY_TEMPLATES: ActivityTemplate[] = [
  // Büroarbeit
  {
    name: 'Telefonat',
    description: 'Telefonate mit Kunden und Geschäftspartnern',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Büroarbeit'
  },
  {
    name: 'E-Mail Korrespondenz',
    description: 'Bearbeitung von E-Mails und Anfragen',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Büroarbeit'
  },
  {
    name: 'Schriftverkehr',
    description: 'Briefe, Angebote und Verträge erstellen',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Büroarbeit'
  },
  {
    name: 'Ablage & Archivierung',
    description: 'Dokumentenablage und Archivierung',
    isBillable: false,
    pricingType: 'hourly',
    category: 'Büroarbeit'
  },

  // Kundenbetreuung
  {
    name: 'Kundengespräch',
    description: 'Persönliche Gespräche und Beratung',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Kundenbetreuung'
  },
  {
    name: 'Angebotserstellung',
    description: 'Erstellung und Kalkulation von Angeboten',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Kundenbetreuung'
  },
  {
    name: 'Kundentermin',
    description: 'Termin beim Kunden vor Ort',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Kundenbetreuung'
  },
  {
    name: 'Nachbearbeitung',
    description: 'Nachbereitung von Kundenkontakten',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Kundenbetreuung'
  },

  // Projektarbeit
  {
    name: 'Projektplanung',
    description: 'Planung und Vorbereitung von Projekten',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Projektarbeit'
  },
  {
    name: 'Projektdurchführung',
    description: 'Umsetzung und Bearbeitung von Projekten',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Projektarbeit'
  },
  {
    name: 'Qualitätsprüfung',
    description: 'Prüfung und Kontrolle der Arbeitsergebnisse',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Projektarbeit'
  },
  {
    name: 'Projektdokumentation',
    description: 'Dokumentation von Projektabläufen',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Projektarbeit'
  },

  // Besprechungen
  {
    name: 'Besprechung',
    description: 'Meetings und Abstimmungen',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Besprechungen'
  },
  {
    name: 'Videokonferenz',
    description: 'Online-Meetings und Video-Calls',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Besprechungen'
  },
  {
    name: 'Teambesprechung',
    description: 'Interne Team-Meetings',
    isBillable: false,
    pricingType: 'hourly',
    category: 'Besprechungen'
  },

  // Verwaltung
  {
    name: 'Buchhaltung',
    description: 'Rechnungsstellung und Buchhaltung',
    isBillable: false,
    pricingType: 'hourly',
    category: 'Verwaltung'
  },
  {
    name: 'Administration',
    description: 'Allgemeine Verwaltungsaufgaben',
    isBillable: false,
    pricingType: 'hourly',
    category: 'Verwaltung'
  },
  {
    name: 'Recherche',
    description: 'Informationsbeschaffung und Recherche',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Verwaltung'
  },

  // Außendienst
  {
    name: 'Fahrtzeit',
    description: 'Fahrt zum Kunden oder zur Baustelle',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Außendienst'
  },
  {
    name: 'Vor-Ort-Termin',
    description: 'Arbeiten beim Kunden vor Ort',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Außendienst'
  },

  // Kreatives & Konzeption
  {
    name: 'Konzeption',
    description: 'Konzeptentwicklung und Ideenfindung',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Kreatives'
  },
  {
    name: 'Design',
    description: 'Gestaltung und Design-Arbeiten',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Kreatives'
  },
  {
    name: 'Präsentation',
    description: 'Erstellung von Präsentationen',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Kreatives'
  },

  // Schulung & Beratung
  {
    name: 'Beratung',
    description: 'Fachliche Beratung und Consulting',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Beratung'
  },
  {
    name: 'Schulung',
    description: 'Training und Einarbeitung',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Beratung'
  },
  {
    name: 'Support',
    description: 'Kundenbetreuung und Hilfestellung',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Beratung'
  }
];

// Group templates by category
export const getTemplatesByCategory = (): Record<string, ActivityTemplate[]> => {
  return ACTIVITY_TEMPLATES.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, ActivityTemplate[]>);
};

// Get all unique categories
export const getCategories = (): string[] => {
  return Array.from(new Set(ACTIVITY_TEMPLATES.map(t => t.category)));
};
