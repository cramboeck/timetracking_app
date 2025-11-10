// Predefined activity templates for quick setup
export interface ActivityTemplate {
  name: string;
  description: string;
  isBillable: boolean;
  pricingType: 'hourly' | 'flat';
  category: string;
}

export const ACTIVITY_TEMPLATES: ActivityTemplate[] = [
  // Development & Engineering
  {
    name: 'Entwicklung',
    description: 'Software-Entwicklung und Programmierung',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Entwicklung'
  },
  {
    name: 'Code Review',
    description: 'Überprüfung und Qualitätssicherung von Code',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Entwicklung'
  },
  {
    name: 'Testing',
    description: 'Qualitätssicherung und Softwaretests',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Entwicklung'
  },
  {
    name: 'Bug-Fixing',
    description: 'Behebung von Softwarefehlern',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Entwicklung'
  },
  {
    name: 'Deployment',
    description: 'Bereitstellung und Veröffentlichung',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Entwicklung'
  },

  // Project Management
  {
    name: 'Projektplanung',
    description: 'Planung und Organisation von Projekten',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Projektmanagement'
  },
  {
    name: 'Meeting',
    description: 'Besprechungen und Abstimmungen',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Projektmanagement'
  },
  {
    name: 'Statusreport',
    description: 'Erstellung von Projektberichten',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Projektmanagement'
  },

  // Consulting & Analysis
  {
    name: 'Beratung',
    description: 'Fachliche Beratung und Consulting',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Beratung'
  },
  {
    name: 'Konzeption',
    description: 'Konzeptentwicklung und Design',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Beratung'
  },
  {
    name: 'Anforderungsanalyse',
    description: 'Analyse von Anforderungen und Spezifikationen',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Beratung'
  },

  // Documentation
  {
    name: 'Dokumentation',
    description: 'Technische Dokumentation und Handbücher',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Dokumentation'
  },
  {
    name: 'Wissensdatenbank',
    description: 'Pflege von Wiki und Wissensdatenbank',
    isBillable: false,
    pricingType: 'hourly',
    category: 'Dokumentation'
  },

  // Support & Maintenance
  {
    name: 'Support',
    description: 'Technischer Support und Helpdesk',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Support'
  },
  {
    name: 'Wartung',
    description: 'System- und Softwarewartung',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Support'
  },
  {
    name: 'Schulung',
    description: 'Schulung und Training von Mitarbeitern',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Support'
  },

  // Administration
  {
    name: 'Administration',
    description: 'Verwaltungsaufgaben und Administration',
    isBillable: false,
    pricingType: 'hourly',
    category: 'Administration'
  },
  {
    name: 'Reisezeit',
    description: 'Fahrt- und Reisezeiten',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Administration'
  },
  {
    name: 'Internes Meeting',
    description: 'Interne Besprechungen und Abstimmungen',
    isBillable: false,
    pricingType: 'hourly',
    category: 'Administration'
  },

  // Design & Creative
  {
    name: 'Design',
    description: 'Grafik- und UI/UX-Design',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Design'
  },
  {
    name: 'Prototyping',
    description: 'Erstellung von Prototypen und Mockups',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Design'
  },

  // Research
  {
    name: 'Recherche',
    description: 'Recherche und Analyse',
    isBillable: true,
    pricingType: 'hourly',
    category: 'Recherche'
  },
  {
    name: 'Weiterbildung',
    description: 'Fortbildung und Selbststudium',
    isBillable: false,
    pricingType: 'hourly',
    category: 'Recherche'
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
