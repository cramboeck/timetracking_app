/**
 * Theme Selection Engine
 *
 * Strategic theme selection BEFORE content generation.
 * Determines the optimal theme based on platform, goal, journey stage, and audience.
 */

// ============================================================================
// TYPES
// ============================================================================

export type Platform = 'linkedin' | 'instagram';
export type BusinessGoal = 'lead' | 'branding' | 'engagement' | 'traffic';
export type JourneyStage = 'awareness' | 'consideration' | 'decision';
export type ThemeCategory = 'PAIN_POINTS' | 'RISKS' | 'COST_ROI' | 'AUTHORITY' | 'EFFICIENCY' | 'HUMAN_REALITY';
export type AudienceType = 'ceo' | 'it_dm' | 'sme_owner' | 'generic';

// Hook and CTA Formula Types
export type HookFormula = 'zahlen' | 'fragen' | 'kontrast' | 'story' | 'pattern_interrupt';
export type CTAFormula = 'ressourcen' | 'engagement' | 'gespraech';

export interface ThemeSelectionInput {
  platform: Platform;
  goal: BusinessGoal;
  journeyStage?: JourneyStage; // Default: 'awareness'
  targetAudience: string;
  previousThemes?: ThemeCategory[];
  topicHint?: string;
}

export interface SelectedTheme {
  category: ThemeCategory;
  subtopic: string;
  angle: string;
}

export interface ThemeReasoning {
  platformReason: string;
  goalReason: string;
  journeyReason: string;
  audienceReason: string;
  summary: string;
}

export interface ThemeAlternative {
  category: ThemeCategory;
  score: number;
  whyNot: string;
}

export interface HookFormulaDefinition {
  id: HookFormula;
  nameDE: string;
  pattern: string;
  example: string;
  whenToUse: string;
}

export interface CTAFormulaDefinition {
  id: CTAFormula;
  nameDE: string;
  pattern: string;
  example: string;
  whenToUse: string;
}

export interface ContentDirectives {
  hookStyle: string;
  ctaStyle: string;
  avoidTopics: string[];
  emphasize: string[];
  toneGuidance: string;
  // NEW: Specific formula recommendations
  recommendedHookFormulas: HookFormula[];
  recommendedCTAFormulas: CTAFormula[];
  hookFormulaDetails: HookFormulaDefinition[];
  ctaFormulaDetails: CTAFormulaDefinition[];
}

export interface ThemeSelectionOutput {
  selectedTheme: SelectedTheme;
  priorityScore: number;
  reasoning: ThemeReasoning;
  alternatives: ThemeAlternative[];
  contentDirectives: ContentDirectives;
}

// ============================================================================
// THEME CATEGORIES DEFINITION
// ============================================================================

export const THEME_CATEGORIES: Record<ThemeCategory, {
  id: ThemeCategory;
  nameDE: string;
  emotion: string;
  mechanism: string;
  subtopics: string[];
  psychologicalTrigger: string;
}> = {
  PAIN_POINTS: {
    id: 'PAIN_POINTS',
    nameDE: 'Schmerzpunkte',
    emotion: 'frustration',
    mechanism: 'recognition_of_current_suffering',
    subtopics: [
      'daily_firefighting',
      'overloaded_internal_it',
      'inefficient_processes',
      'unreliable_systems',
      'shadow_it',
      'knowledge_silos'
    ],
    psychologicalTrigger: 'Validates existing frustration, creates "I am not alone" feeling'
  },

  RISKS: {
    id: 'RISKS',
    nameDE: 'Risiken',
    emotion: 'fear',
    mechanism: 'consequence_visualization',
    subtopics: [
      'security_breach',
      'data_loss',
      'compliance_violation',
      'business_interruption',
      'reputation_damage',
      'personal_liability'
    ],
    psychologicalTrigger: 'Fear of loss > desire for gain (loss aversion)'
  },

  COST_ROI: {
    id: 'COST_ROI',
    nameDE: 'Kosten & ROI',
    emotion: 'rationality',
    mechanism: 'logical_justification',
    subtopics: [
      'hidden_costs',
      'reactive_vs_preventive',
      'license_waste',
      'productivity_loss',
      'opportunity_cost',
      'tco_visibility'
    ],
    psychologicalTrigger: 'Provides rational ammunition for emotional decision'
  },

  AUTHORITY: {
    id: 'AUTHORITY',
    nameDE: 'Expertise & Autorität',
    emotion: 'trust',
    mechanism: 'expertise_demonstration',
    subtopics: [
      'best_practices',
      'myth_busting',
      'industry_insights',
      'technical_education',
      'trend_analysis',
      'opinion_pieces'
    ],
    psychologicalTrigger: 'Reduces uncertainty through perceived competence'
  },

  EFFICIENCY: {
    id: 'EFFICIENCY',
    nameDE: 'Effizienz & Kontrolle',
    emotion: 'hope',
    mechanism: 'vision_of_better_future',
    subtopics: [
      'automation',
      'standardization',
      'proactive_monitoring',
      'predictable_it',
      'scalability',
      'self_service'
    ],
    psychologicalTrigger: 'Creates desire for transformation, positive vision'
  },

  HUMAN_REALITY: {
    id: 'HUMAN_REALITY',
    nameDE: 'Menschliche Realität',
    emotion: 'recognition',
    mechanism: 'storytelling_identification',
    subtopics: [
      'ceo_dilemma',
      'decision_pressure',
      'team_dynamics',
      'real_incidents',
      'transformation_journey',
      'honest_mistakes'
    ],
    psychologicalTrigger: 'Creates emotional connection through shared experience'
  }
};

// ============================================================================
// HOOK FORMULAS DEFINITION
// ============================================================================

export const HOOK_FORMULAS: Record<HookFormula, HookFormulaDefinition> = {
  zahlen: {
    id: 'zahlen',
    nameDE: 'Zahlen-Hook',
    pattern: '[Überraschende Zahl] + [Konsequenz]',
    example: '87% der KMU haben keinen IT-Notfallplan. Bei einem Ausfall kostet jede Stunde 10.000€.',
    whenToUse: 'Faktenbasierte Themen, Risiken, Kosten, ROI'
  },
  fragen: {
    id: 'fragen',
    nameDE: 'Fragen-Hook',
    pattern: '[Provozierende Frage die Schmerz adressiert]',
    example: 'Hand aufs Herz: Wie lange würde Ihr Unternehmen ohne IT überleben?',
    whenToUse: 'Schmerzpunkte, Selbstreflexion, Awareness'
  },
  kontrast: {
    id: 'kontrast',
    nameDE: 'Kontrast-Hook',
    pattern: '[Erwartung] vs. [Realität]',
    example: 'Alle reden von KI-Revolution. Die Realität? 90% scheitern an fehlenden Basics.',
    whenToUse: 'Mythen aufbrechen, Expertise zeigen, Differenzierung'
  },
  story: {
    id: 'story',
    nameDE: 'Story-Hook',
    pattern: '[Konkretes Ereignis/Moment]',
    example: 'Montag, 6:47 Uhr. Der Anruf kam vom Geschäftsführer: "Nichts geht mehr."',
    whenToUse: 'Emotionale Themen, Menschliche Realität, Case Studies'
  },
  pattern_interrupt: {
    id: 'pattern_interrupt',
    nameDE: 'Pattern-Interrupt',
    pattern: '[Unerwartete Aussage]',
    example: 'Vergessen Sie alles, was Sie über Backups wissen.',
    whenToUse: 'Aufmerksamkeit maximieren, Kontroverse Meinungen, Autorität'
  }
};

// ============================================================================
// CTA FORMULAS DEFINITION
// ============================================================================

export const CTA_FORMULAS: Record<CTAFormula, CTAFormulaDefinition> = {
  ressourcen: {
    id: 'ressourcen',
    nameDE: 'Ressourcen-CTA',
    pattern: '[Konkretes Asset] + [Zeitaufwand] + [Ergebnis]',
    example: '📥 IT-Notfallplan-Template downloaden (5 Min. Aufwand, Stunden gespart im Ernstfall)',
    whenToUse: 'Lead-Generierung, Traffic, Awareness'
  },
  engagement: {
    id: 'engagement',
    nameDE: 'Engagement-CTA',
    pattern: '[Einfache Frage die zum Kommentieren einlädt]',
    example: 'Was ist Ihre größte IT-Sorge? 💬 Schreiben Sie es in die Kommentare.',
    whenToUse: 'Engagement, Branding, Community-Building'
  },
  gespraech: {
    id: 'gespraech',
    nameDE: 'Gespräch-CTA',
    pattern: '[Niedrigschwelliges Angebot]',
    example: 'DM "CHECK" und ich schicke Ihnen unsere kostenlose Erstanalyse.',
    whenToUse: 'Lead-Generierung, Decision-Phase, Direct Response'
  }
};

// ============================================================================
// THEME → HOOK FORMULA MAPPING
// ============================================================================

export const THEME_HOOK_MAPPING: Record<ThemeCategory, { primary: HookFormula[]; secondary: HookFormula[]; reasoning: string }> = {
  PAIN_POINTS: {
    primary: ['fragen', 'story'],
    secondary: ['zahlen'],
    reasoning: 'Schmerzpunkte brauchen Empathie (Fragen) oder Wiedererkennung (Story). Zahlen als Verstärker.'
  },
  RISKS: {
    primary: ['zahlen', 'pattern_interrupt'],
    secondary: ['story'],
    reasoning: 'Risiken mit Fakten untermauern (Zahlen) oder Aufmerksamkeit erzwingen (Pattern-Interrupt).'
  },
  COST_ROI: {
    primary: ['zahlen', 'kontrast'],
    secondary: ['fragen'],
    reasoning: 'Kosten/ROI sind zahlenbasiert. Kontrast zeigt Vorher/Nachher oder versteckte Kosten.'
  },
  AUTHORITY: {
    primary: ['kontrast', 'pattern_interrupt'],
    secondary: ['zahlen'],
    reasoning: 'Expertise durch Mythen-Widerlegung (Kontrast) oder unerwartete Perspektiven zeigen.'
  },
  EFFICIENCY: {
    primary: ['kontrast', 'zahlen'],
    secondary: ['story'],
    reasoning: 'Effizienz zeigt Transformation (Kontrast: vorher/nachher) oder messbare Verbesserungen.'
  },
  HUMAN_REALITY: {
    primary: ['story'],
    secondary: ['fragen', 'kontrast'],
    reasoning: 'Menschliche Realität lebt von Storytelling und emotionaler Identifikation.'
  }
};

// ============================================================================
// GOAL → CTA FORMULA MAPPING
// ============================================================================

export const GOAL_CTA_MAPPING: Record<BusinessGoal, { primary: CTAFormula[]; secondary: CTAFormula[]; reasoning: string }> = {
  lead: {
    primary: ['gespraech', 'ressourcen'],
    secondary: ['engagement'],
    reasoning: 'Lead-Generierung braucht konkreten nächsten Schritt: Gespräch oder Download.'
  },
  branding: {
    primary: ['engagement'],
    secondary: ['ressourcen'],
    reasoning: 'Branding fokussiert auf Sichtbarkeit und Interaktion, nicht auf direkte Conversion.'
  },
  engagement: {
    primary: ['engagement'],
    secondary: ['gespraech'],
    reasoning: 'Engagement-Ziel = Kommentare und Diskussion fördern.'
  },
  traffic: {
    primary: ['ressourcen'],
    secondary: ['engagement'],
    reasoning: 'Traffic braucht klaren Link-Anreiz mit konkretem Nutzen.'
  }
};

// ============================================================================
// SUBTOPIC TRANSLATIONS (for prompt generation)
// ============================================================================

export const SUBTOPIC_LABELS: Record<string, { de: string; description: string }> = {
  // Pain Points
  daily_firefighting: { de: 'Tägliches Feuerlöschen', description: 'Jeden Tag neue IT-Probleme lösen statt strategisch zu arbeiten' },
  overloaded_internal_it: { de: 'Überlastete IT-Abteilung', description: 'Der interne Admin kommt nicht mehr hinterher' },
  inefficient_processes: { de: 'Ineffiziente Prozesse', description: 'Dinge dauern länger als sie müssten' },
  unreliable_systems: { de: 'Unzuverlässige Systeme', description: 'Ständige Ausfälle und Störungen' },
  shadow_it: { de: 'Schatten-IT', description: 'Mitarbeiter nutzen nicht genehmigte Tools' },
  knowledge_silos: { de: 'Wissenssilos', description: 'Kritisches Wissen nur in einzelnen Köpfen' },

  // Risks
  security_breach: { de: 'Sicherheitsvorfall', description: 'Hackerangriff, Ransomware, Datenleck' },
  data_loss: { de: 'Datenverlust', description: 'Wichtige Daten unwiederbringlich verloren' },
  compliance_violation: { de: 'Compliance-Verstoß', description: 'DSGVO-Bußgeld, Audit-Probleme' },
  business_interruption: { de: 'Betriebsunterbrechung', description: 'Geschäft steht still wegen IT' },
  reputation_damage: { de: 'Reputationsschaden', description: 'Kunden verlieren Vertrauen' },
  personal_liability: { de: 'Persönliche Haftung', description: 'Geschäftsführerhaftung bei IT-Versäumnissen' },

  // Cost & ROI
  hidden_costs: { de: 'Versteckte IT-Kosten', description: 'Was IT wirklich kostet wenn man alles zusammenrechnet' },
  reactive_vs_preventive: { de: 'Reaktiv vs. Präventiv', description: 'Feuerwehr-Kosten vs. Vorsorge-Investment' },
  license_waste: { de: 'Lizenzverschwendung', description: 'Bezahlte aber ungenutzte Software' },
  productivity_loss: { de: 'Produktivitätsverlust', description: 'Stunden pro Woche durch IT-Probleme verloren' },
  opportunity_cost: { de: 'Opportunitätskosten', description: 'Was Sie mit der Zeit/Geld stattdessen tun könnten' },
  tco_visibility: { de: 'TCO-Transparenz', description: 'Gesamtkosten sichtbar und planbar machen' },

  // Authority
  best_practices: { de: 'Best Practices', description: 'So machen es die Profis' },
  myth_busting: { de: 'Mythen entlarven', description: 'Verbreitete Irrtümer aufklären (z.B. Backup ≠ Sicherheit)' },
  industry_insights: { de: 'Brancheneinblicke', description: 'Was wir bei unseren Kunden sehen' },
  technical_education: { de: 'Technische Aufklärung', description: 'Wie Dinge wirklich funktionieren' },
  trend_analysis: { de: 'Trendanalyse', description: 'Wohin IT sich entwickelt' },
  opinion_pieces: { de: 'Meinungsbeiträge', description: 'Klare Position zu kontroversen Themen' },

  // Efficiency
  automation: { de: 'Automatisierung', description: 'Automatisch statt manuell' },
  standardization: { de: 'Standardisierung', description: 'Einheitliche Prozesse und Tools' },
  proactive_monitoring: { de: 'Proaktives Monitoring', description: 'Probleme erkennen bevor sie entstehen' },
  predictable_it: { de: 'Planbare IT', description: 'IT die einfach funktioniert, keine Überraschungen' },
  scalability: { de: 'Skalierbarkeit', description: 'Wachsen ohne IT-Chaos' },
  self_service: { de: 'Self-Service', description: 'Mitarbeiter können sich selbst helfen' },

  // Human Reality
  ceo_dilemma: { de: 'CEO-Dilemma', description: 'Als Geschäftsführer zwischen allen Stühlen' },
  decision_pressure: { de: 'Entscheidungsdruck', description: 'IT-Entscheidungen ohne IT-Expertise treffen müssen' },
  team_dynamics: { de: 'Team-Dynamik', description: 'IT-Abteilung vs. Geschäftsleitung' },
  real_incidents: { de: 'Echte Vorfälle', description: 'Was bei einem Kunden wirklich passiert ist' },
  transformation_journey: { de: 'Transformationsreise', description: 'Vom Chaos zur Kontrolle - eine Geschichte' },
  honest_mistakes: { de: 'Ehrliche Fehler', description: 'Was wir daraus gelernt haben' }
};

// ============================================================================
// PRIORITY MATRIX
// ============================================================================

interface MatrixEntry {
  priorities: ThemeCategory[];
  reasoning: string;
  avoid: ThemeCategory[];
  avoidReasoning: string;
}

type PriorityMatrix = {
  [P in Platform]: {
    [G in BusinessGoal]: {
      [J in JourneyStage]: MatrixEntry;
    };
  };
};

export const THEME_PRIORITY_MATRIX: PriorityMatrix = {
  // ═══════════════════════════════════════════════════════════════════════════
  // LINKEDIN
  // ═══════════════════════════════════════════════════════════════════════════
  linkedin: {
    lead: {
      awareness: {
        priorities: ['PAIN_POINTS', 'HUMAN_REALITY', 'RISKS', 'AUTHORITY'],
        reasoning: 'Prospects wissen nicht dass sie Hilfe brauchen. Pain Points zeigen Frustration auf, Human Reality erzeugt Wiedererkennung.',
        avoid: ['COST_ROI'],
        avoidReasoning: 'Zu rational für jemanden der das Problem noch nicht erkannt hat'
      },
      consideration: {
        priorities: ['COST_ROI', 'AUTHORITY', 'EFFICIENCY', 'RISKS'],
        reasoning: 'Prospect kennt das Problem und evaluiert Optionen. ROI liefert rationale Rechtfertigung, Authority differenziert.',
        avoid: ['HUMAN_REALITY'],
        avoidReasoning: 'Zu weich wenn harte Fakten gefragt sind'
      },
      decision: {
        priorities: ['RISKS', 'COST_ROI', 'PAIN_POINTS', 'AUTHORITY'],
        reasoning: 'Prospect ist bereit zu handeln. Risiken erzeugen Dringlichkeit, Kosten des Nicht-Handelns werden klar.',
        avoid: ['EFFICIENCY'],
        avoidReasoning: 'Zu visionär, braucht Dringlichkeit nicht Hoffnung'
      }
    },
    branding: {
      awareness: {
        priorities: ['AUTHORITY', 'HUMAN_REALITY', 'EFFICIENCY', 'PAIN_POINTS'],
        reasoning: 'Reputation bei neuer Zielgruppe aufbauen. Authority etabliert Expertise, Human Reality zeigt menschliche Seite.',
        avoid: ['RISKS'],
        avoidReasoning: 'Angst-basierter Content schadet der Markenwahrnehmung'
      },
      consideration: {
        priorities: ['AUTHORITY', 'EFFICIENCY', 'HUMAN_REALITY', 'COST_ROI'],
        reasoning: 'Beziehung mit interessierter Zielgruppe vertiefen. Authority mit Tiefe, Efficiency zeigt Innovation.',
        avoid: ['RISKS'],
        avoidReasoning: 'Markenaufbau sollte positiv sein'
      },
      decision: {
        priorities: ['AUTHORITY', 'HUMAN_REALITY', 'EFFICIENCY', 'COST_ROI'],
        reasoning: 'Markenbekanntheit in Präferenz umwandeln. Authority für finales Vertrauen, Human Reality für emotionale Verbindung.',
        avoid: ['PAIN_POINTS'],
        avoidReasoning: 'Bei Entscheidung auf sich selbst fokussieren, nicht auf deren Probleme'
      }
    },
    engagement: {
      awareness: {
        priorities: ['HUMAN_REALITY', 'AUTHORITY', 'PAIN_POINTS', 'EFFICIENCY'],
        reasoning: 'Kommentare, Shares, Diskussionen antreiben. Stories lösen emotionale Reaktionen aus, kontroverse Meinungen Debatten.',
        avoid: ['COST_ROI'],
        avoidReasoning: 'Zahlen treiben kein Engagement, Emotionen schon'
      },
      consideration: {
        priorities: ['AUTHORITY', 'HUMAN_REALITY', 'PAIN_POINTS', 'EFFICIENCY'],
        reasoning: 'Bereits bekannte Zielgruppe engagieren. Meinungsbeiträge treiben professionelle Debatte.',
        avoid: ['RISKS'],
        avoidReasoning: 'Angst-Content wird eher überscrollt'
      },
      decision: {
        priorities: ['HUMAN_REALITY', 'AUTHORITY', 'EFFICIENCY', 'COST_ROI'],
        reasoning: 'Warme Zielgruppe zur Entscheidung nurturing. Success Stories erzeugen Aspiration.',
        avoid: ['RISKS'],
        avoidReasoning: 'Entscheidungs-Engagement sollte positiv sein'
      }
    },
    traffic: {
      awareness: {
        priorities: ['PAIN_POINTS', 'AUTHORITY', 'HUMAN_REALITY', 'RISKS'],
        reasoning: 'Klicks von kalter Zielgruppe. "Ist das du? Mehr lesen..." Pattern, Curiosity Gap.',
        avoid: ['EFFICIENCY'],
        avoidReasoning: 'Zu lösungsfokussiert für kalten Traffic'
      },
      consideration: {
        priorities: ['AUTHORITY', 'COST_ROI', 'EFFICIENCY', 'PAIN_POINTS'],
        reasoning: 'Klicks von warmer Zielgruppe. Deep Dives, Checklisten, How-To Guides.',
        avoid: ['HUMAN_REALITY'],
        avoidReasoning: 'Stories brauchen keine Link-Klicks, sie enden im Feed'
      },
      decision: {
        priorities: ['COST_ROI', 'AUTHORITY', 'RISKS', 'EFFICIENCY'],
        reasoning: 'Klicks zu Conversion-Content. ROI-Calculator, Case Studies, Assessments.',
        avoid: ['HUMAN_REALITY'],
        avoidReasoning: 'Decision Traffic braucht Utility nicht Stories'
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTAGRAM
  // ═══════════════════════════════════════════════════════════════════════════
  instagram: {
    lead: {
      awareness: {
        priorities: ['HUMAN_REALITY', 'PAIN_POINTS', 'AUTHORITY', 'RISKS'],
        reasoning: 'Instagram Lead Gen startet mit Aufmerksamkeit. Visuelle Stories stoppen den Scroll.',
        avoid: ['COST_ROI'],
        avoidReasoning: 'Instagram ist emotional, keine Spreadsheet-Plattform'
      },
      consideration: {
        priorities: ['AUTHORITY', 'EFFICIENCY', 'HUMAN_REALITY', 'PAIN_POINTS'],
        reasoning: 'Follower Richtung Anfrage aufwärmen. Educational Carousels, Behind-the-Scenes.',
        avoid: ['RISKS'],
        avoidReasoning: 'Instagram Consideration ist positiv, nicht angstbasiert'
      },
      decision: {
        priorities: ['HUMAN_REALITY', 'AUTHORITY', 'EFFICIENCY', 'PAIN_POINTS'],
        reasoning: 'Follower zu Anfragen konvertieren. Success Stories, Transformationen.',
        avoid: ['COST_ROI'],
        avoidReasoning: 'Instagram-Entscheidungen sind emotional'
      }
    },
    branding: {
      awareness: {
        priorities: ['HUMAN_REALITY', 'AUTHORITY', 'EFFICIENCY', 'PAIN_POINTS'],
        reasoning: 'Markenbekanntheit visuell aufbauen. Team, Kultur, Behind-the-Scenes.',
        avoid: ['RISKS', 'COST_ROI'],
        avoidReasoning: 'Markenaufbau auf Instagram muss positiv und visuell sein'
      },
      consideration: {
        priorities: ['HUMAN_REALITY', 'AUTHORITY', 'EFFICIENCY', 'PAIN_POINTS'],
        reasoning: 'Markenbeziehung vertiefen. Tiefere Team-Stories, Educational Series.',
        avoid: ['RISKS'],
        avoidReasoning: 'Marken-Content aspirational halten'
      },
      decision: {
        priorities: ['HUMAN_REALITY', 'AUTHORITY', 'EFFICIENCY', 'COST_ROI'],
        reasoning: 'Markenfans zu Markenbotschaftern konvertieren. Client Stories, Testimonials.',
        avoid: ['RISKS'],
        avoidReasoning: 'Entscheidungs-Branding sollte aspirational sein'
      }
    },
    engagement: {
      awareness: {
        priorities: ['HUMAN_REALITY', 'PAIN_POINTS', 'AUTHORITY', 'EFFICIENCY'],
        reasoning: 'Likes, Kommentare, Saves, Shares maximieren. Relatable Content hat höchstes Engagement.',
        avoid: ['COST_ROI', 'RISKS'],
        avoidReasoning: 'Engagement braucht Emotion, nicht Angst oder Zahlen'
      },
      consideration: {
        priorities: ['HUMAN_REALITY', 'AUTHORITY', 'PAIN_POINTS', 'EFFICIENCY'],
        reasoning: 'Bestehende Follower engagieren. Polls, Fragen, Stories.',
        avoid: ['RISKS'],
        avoidReasoning: 'Engagement-Content muss positiv sein'
      },
      decision: {
        priorities: ['HUMAN_REALITY', 'EFFICIENCY', 'AUTHORITY', 'PAIN_POINTS'],
        reasoning: 'Warme Zielgruppe Richtung Aktion engagieren. Success Stories triggern Aspiration.',
        avoid: ['RISKS'],
        avoidReasoning: 'Positiv halten in der Entscheidungsphase'
      }
    },
    traffic: {
      awareness: {
        priorities: ['AUTHORITY', 'PAIN_POINTS', 'HUMAN_REALITY', 'EFFICIENCY'],
        reasoning: 'Link-in-Bio Klicks treiben. Free Guide Value Offer, Solution in Bio Hook.',
        avoid: ['RISKS'],
        avoidReasoning: 'Angst treibt Instagram-Traffic nicht gut'
      },
      consideration: {
        priorities: ['AUTHORITY', 'EFFICIENCY', 'HUMAN_REALITY', 'COST_ROI'],
        reasoning: 'Traffic von warmer Zielgruppe. Deep-Dive Content Offer, Tools und Resources.',
        avoid: ['RISKS'],
        avoidReasoning: 'Traffic aus Consideration sollte wertgetrieben sein'
      },
      decision: {
        priorities: ['AUTHORITY', 'EFFICIENCY', 'HUMAN_REALITY', 'COST_ROI'],
        reasoning: 'Traffic zu Conversion. Consultation Offer, Portfolio.',
        avoid: ['PAIN_POINTS'],
        avoidReasoning: 'Decision Traffic sollte lösungsfokussiert sein'
      }
    }
  }
};

// ============================================================================
// AUDIENCE PROFILES
// ============================================================================

interface ThemeModifier {
  weight: number;
  focus: string[];
  reasoning: string;
}

interface ContentRules {
  avoid: string[];
  prefer: string[];
  hookStyle: string;
  ctaStyle: string;
}

interface AudienceProfile {
  id: AudienceType;
  labels: string[];
  psychology: {
    timeAvailability: string;
    decisionAuthority: string;
    technicalDepth: string;
    riskSensitivity: string;
    primaryConcerns: string[];
  };
  themeModifiers: Record<ThemeCategory, ThemeModifier>;
  contentRules: ContentRules;
}

export const AUDIENCE_PROFILES: Record<AudienceType, AudienceProfile> = {
  ceo: {
    id: 'ceo',
    labels: ['CEO', 'Geschäftsführer', 'Managing Director', 'Inhaber', 'Vorstand', 'GF', 'Geschäftsleitung'],
    psychology: {
      timeAvailability: 'very_low',
      decisionAuthority: 'high',
      technicalDepth: 'low_to_medium',
      riskSensitivity: 'high',
      primaryConcerns: ['business_continuity', 'liability', 'reputation', 'costs']
    },
    themeModifiers: {
      RISKS: {
        weight: 1.5,
        focus: ['personal_liability', 'business_interruption', 'reputation_damage'],
        reasoning: 'CEOs sind persönlich haftbar, Risiko-Content resoniert stark'
      },
      COST_ROI: {
        weight: 1.3,
        focus: ['hidden_costs', 'tco_visibility', 'opportunity_cost'],
        reasoning: 'Budget-Verantwortung macht Kosten-Content relevant'
      },
      HUMAN_REALITY: {
        weight: 1.2,
        focus: ['ceo_dilemma', 'decision_pressure'],
        reasoning: 'Relatable Stories über CEO-Herausforderungen verbinden'
      },
      PAIN_POINTS: {
        weight: 1.0,
        focus: ['unreliable_systems', 'daily_firefighting'],
        reasoning: 'Fokus auf Business-Impact, nicht technische Details'
      },
      AUTHORITY: {
        weight: 0.9,
        focus: ['best_practices', 'industry_insights'],
        reasoning: 'Wollen Insights, keine technische Schulung'
      },
      EFFICIENCY: {
        weight: 0.8,
        focus: ['predictable_it', 'scalability'],
        reasoning: 'Interessiert an Ergebnissen, weniger an Methoden'
      }
    },
    contentRules: {
      avoid: ['Technischer Jargon', 'Feature-Listen', 'Implementierungsdetails', 'Zu lange Texte'],
      prefer: ['Executive Summary', 'Business Impact', 'Peer-Vergleiche', 'Klare Zahlen'],
      hookStyle: 'Business-Outcome fokussiert, direkt auf den Punkt',
      ctaStyle: 'Beratungsgespräch oder Assessment anbieten'
    }
  },

  it_dm: {
    id: 'it_dm',
    labels: ['IT-Leiter', 'CTO', 'IT-Verantwortlicher', 'Systemadministrator', 'IT-Manager', 'IT-Admin', 'IT-Abteilung'],
    psychology: {
      timeAvailability: 'low',
      decisionAuthority: 'medium_to_high',
      technicalDepth: 'high',
      riskSensitivity: 'medium',
      primaryConcerns: ['technical_quality', 'reliability', 'standards', 'team_workload']
    },
    themeModifiers: {
      EFFICIENCY: {
        weight: 1.5,
        focus: ['automation', 'standardization', 'proactive_monitoring'],
        reasoning: 'IT-Profis schätzen technische Effizienz sehr'
      },
      AUTHORITY: {
        weight: 1.4,
        focus: ['best_practices', 'technical_education', 'myth_busting'],
        reasoning: 'Schätzen Expertise und lernen von Peers'
      },
      PAIN_POINTS: {
        weight: 1.2,
        focus: ['overloaded_internal_it', 'shadow_it', 'knowledge_silos'],
        reasoning: 'Tägliche operative Frustrationen resonieren'
      },
      RISKS: {
        weight: 1.0,
        focus: ['security_breach', 'data_loss', 'compliance_violation'],
        reasoning: 'Technische Risiken sind beruflich relevant'
      },
      COST_ROI: {
        weight: 0.8,
        focus: ['license_waste', 'productivity_loss'],
        reasoning: 'Interessiert an Effizienz, weniger an reinen Kosten'
      },
      HUMAN_REALITY: {
        weight: 0.7,
        focus: ['team_dynamics'],
        reasoning: 'Weniger emotional, mehr pragmatisch'
      }
    },
    contentRules: {
      avoid: ['Übervereinfachung', 'Offensichtliche Ratschläge', 'Sales-Sprache', 'Buzzwords'],
      prefer: ['Technische Tiefe', 'Praktische Beispiele', 'Tools und Methoden', 'Konkrete Lösungen'],
      hookStyle: 'Technisches Problem fokussiert, zeigt Verständnis',
      ctaStyle: 'Technische Ressource, Demo oder Whitepaper'
    }
  },

  sme_owner: {
    id: 'sme_owner',
    labels: ['Kleinunternehmer', 'Mittelständler', 'Firmeninhaber', 'KMU', 'Selbständig', 'Unternehmer'],
    psychology: {
      timeAvailability: 'extremely_low',
      decisionAuthority: 'absolute',
      technicalDepth: 'low',
      riskSensitivity: 'medium_to_high',
      primaryConcerns: ['simplicity', 'reliability', 'cost_control', 'no_surprises']
    },
    themeModifiers: {
      PAIN_POINTS: {
        weight: 1.5,
        focus: ['daily_firefighting', 'unreliable_systems', 'inefficient_processes'],
        reasoning: 'Tägliche Frustrationen sind sehr relatable'
      },
      COST_ROI: {
        weight: 1.4,
        focus: ['hidden_costs', 'reactive_vs_preventive'],
        reasoning: 'Budget-bewusst, jeder Euro zählt'
      },
      EFFICIENCY: {
        weight: 1.3,
        focus: ['predictable_it', 'automation'],
        reasoning: '"Soll einfach funktionieren" Mentalität'
      },
      HUMAN_REALITY: {
        weight: 1.2,
        focus: ['ceo_dilemma', 'real_incidents'],
        reasoning: 'Stories von ähnlichen Unternehmen resonieren'
      },
      RISKS: {
        weight: 1.0,
        focus: ['business_interruption', 'data_loss'],
        reasoning: 'Besorgt aber nicht paranoid'
      },
      AUTHORITY: {
        weight: 0.7,
        focus: ['best_practices'],
        reasoning: 'Wollen Rat, keine tieftechnischen Inhalte'
      }
    },
    contentRules: {
      avoid: ['Enterprise-Komplexität', 'Technische Tiefe', 'Lange Texte', 'Abstrakte Konzepte'],
      prefer: ['Einfache Sprache', 'Quick Wins', 'Relatable Szenarien', 'Konkrete Beispiele'],
      hookStyle: 'Relatable Problem fokussiert, aus dem Alltag',
      ctaStyle: 'Einfacher nächster Schritt, niedrige Hürde'
    }
  },

  generic: {
    id: 'generic',
    labels: [],
    psychology: {
      timeAvailability: 'low',
      decisionAuthority: 'medium',
      technicalDepth: 'medium',
      riskSensitivity: 'medium',
      primaryConcerns: ['efficiency', 'reliability', 'costs']
    },
    themeModifiers: {
      PAIN_POINTS: { weight: 1.0, focus: ['daily_firefighting', 'inefficient_processes'], reasoning: 'Universell relevant' },
      RISKS: { weight: 1.0, focus: ['security_breach', 'data_loss'], reasoning: 'Universell relevant' },
      COST_ROI: { weight: 1.0, focus: ['hidden_costs', 'productivity_loss'], reasoning: 'Universell relevant' },
      AUTHORITY: { weight: 1.0, focus: ['best_practices', 'industry_insights'], reasoning: 'Universell relevant' },
      EFFICIENCY: { weight: 1.0, focus: ['automation', 'predictable_it'], reasoning: 'Universell relevant' },
      HUMAN_REALITY: { weight: 1.0, focus: ['real_incidents', 'transformation_journey'], reasoning: 'Universell relevant' }
    },
    contentRules: {
      avoid: ['Zu technisch', 'Zu abstrakt'],
      prefer: ['Klar', 'Konkret', 'Relevant'],
      hookStyle: 'Klar und direkt',
      ctaStyle: 'Konkreter nächster Schritt'
    }
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse target audience string to determine audience type
 */
function parseAudienceType(targetAudience: string): AudienceType {
  const normalized = targetAudience.toLowerCase();

  // Check CEO patterns
  for (const label of AUDIENCE_PROFILES.ceo.labels) {
    if (normalized.includes(label.toLowerCase())) {
      return 'ceo';
    }
  }

  // Check IT Decision Maker patterns
  for (const label of AUDIENCE_PROFILES.it_dm.labels) {
    if (normalized.includes(label.toLowerCase())) {
      return 'it_dm';
    }
  }

  // Check SME Owner patterns
  for (const label of AUDIENCE_PROFILES.sme_owner.labels) {
    if (normalized.includes(label.toLowerCase())) {
      return 'sme_owner';
    }
  }

  return 'generic';
}

/**
 * Select best subtopic based on audience focus and optional topic hint
 */
function selectSubtopic(focusSubtopics: string[], allSubtopics: string[], topicHint?: string): string {
  // If topic hint provided, try to match
  if (topicHint) {
    const hintLower = topicHint.toLowerCase();
    for (const subtopic of focusSubtopics) {
      const label = SUBTOPIC_LABELS[subtopic];
      if (label && (label.de.toLowerCase().includes(hintLower) || label.description.toLowerCase().includes(hintLower))) {
        return subtopic;
      }
    }
  }

  // Otherwise return first focus subtopic (they're ordered by relevance)
  return focusSubtopics[0] || allSubtopics[0];
}

/**
 * Generate a specific angle for the content
 */
function generateAngle(theme: ThemeCategory, subtopic: string, audienceType: AudienceType): string {
  const subtopicLabel = SUBTOPIC_LABELS[subtopic];
  const audience = AUDIENCE_PROFILES[audienceType];

  const angles: Record<ThemeCategory, string[]> = {
    PAIN_POINTS: [
      `Wie ${subtopicLabel?.de || subtopic} Ihr Unternehmen täglich Zeit kostet`,
      `Warum ${subtopicLabel?.de || subtopic} mehr ist als nur ein Ärgernis`,
      `Das unterschätzte Problem: ${subtopicLabel?.de || subtopic}`
    ],
    RISKS: [
      `Was passiert wenn ${subtopicLabel?.de || subtopic} eintritt`,
      `${subtopicLabel?.de || subtopic}: Das Risiko das viele ignorieren`,
      `Warum ${subtopicLabel?.de || subtopic} Chefsache ist`
    ],
    COST_ROI: [
      `Die wahren Kosten von ${subtopicLabel?.de || subtopic}`,
      `${subtopicLabel?.de || subtopic}: Was es Sie wirklich kostet`,
      `So rechnet sich die Lösung für ${subtopicLabel?.de || subtopic}`
    ],
    AUTHORITY: [
      `Was wir über ${subtopicLabel?.de || subtopic} gelernt haben`,
      `${subtopicLabel?.de || subtopic}: Die Expertensicht`,
      `Mythos vs. Realität: ${subtopicLabel?.de || subtopic}`
    ],
    EFFICIENCY: [
      `So erreichen Sie ${subtopicLabel?.de || subtopic}`,
      `${subtopicLabel?.de || subtopic} in der Praxis`,
      `Der Weg zu ${subtopicLabel?.de || subtopic}`
    ],
    HUMAN_REALITY: [
      `Eine Geschichte über ${subtopicLabel?.de || subtopic}`,
      `${subtopicLabel?.de || subtopic}: Aus dem echten Leben`,
      `Wie ein Kunde ${subtopicLabel?.de || subtopic} erlebt hat`
    ]
  };

  // Return first matching angle (could be randomized in future)
  return angles[theme][0];
}

/**
 * Get tone guidance based on platform and audience
 */
function getToneGuidance(platform: Platform, audienceType: AudienceType): string {
  const platformTone = platform === 'linkedin'
    ? 'Professionell, sachlich, thought leadership'
    : 'Visuell ansprechend, nahbar, storytelling-orientiert';

  const audienceTone: Record<AudienceType, string> = {
    ceo: 'Strategisch, ergebnisorientiert, respektvoll der Zeit',
    it_dm: 'Fachlich kompetent, praxisnah, auf Augenhöhe',
    sme_owner: 'Verständlich, pragmatisch, lösungsorientiert',
    generic: 'Klar, professionell, zugänglich'
  };

  return `${platformTone}. ${audienceTone[audienceType]}`;
}

/**
 * Build reasoning object explaining the selection
 */
function buildReasoning(
  input: ThemeSelectionInput,
  selected: { theme: ThemeCategory; score: number },
  audienceProfile: AudienceProfile,
  matrixEntry: MatrixEntry
): ThemeReasoning {
  const themeCategory = THEME_CATEGORIES[selected.theme];

  const platformReason = input.platform === 'linkedin'
    ? 'LinkedIn: Professionelles Netzwerk, längere Aufmerksamkeitsspanne, direkte Business-Kommunikation erlaubt'
    : 'Instagram: Visuell, emotional, Scroll-Stopper nötig, Beziehungsaufbau vor Verkauf';

  const goalReasons: Record<BusinessGoal, string> = {
    lead: 'Lead-Generierung: Dringlichkeit und klarer Mehrwert müssen kommuniziert werden',
    branding: 'Branding: Expertise und Vertrauen aufbauen, positive Assoziation schaffen',
    engagement: 'Engagement: Emotionen und Diskussionen auslösen, Community einbinden',
    traffic: 'Traffic: Neugier wecken, klaren Nutzen für Klick versprechen'
  };

  const journeyReasons: Record<JourneyStage, string> = {
    awareness: 'Awareness: Zielgruppe weiß noch nicht dass sie ein Problem hat, muss erst aufgeweckt werden',
    consideration: 'Consideration: Zielgruppe evaluiert Optionen, braucht Differenzierung und Fakten',
    decision: 'Decision: Zielgruppe ist bereit zu handeln, braucht finalen Anstoß und Vertrauen'
  };

  const audienceReason = `${audienceProfile.id.toUpperCase()}: ${audienceProfile.themeModifiers[selected.theme].reasoning}`;

  const summary = `Für ${input.platform.toUpperCase()} + ${input.goal.toUpperCase()} + ${input.journeyStage?.toUpperCase() || 'AWARENESS'} ` +
    `bei Zielgruppe "${input.targetAudience}" ist ${themeCategory.nameDE} (${selected.theme}) optimal. ` +
    `Emotionaler Trigger: ${themeCategory.emotion}. ` +
    matrixEntry.reasoning;

  return {
    platformReason,
    goalReason: goalReasons[input.goal],
    journeyReason: journeyReasons[input.journeyStage || 'awareness'],
    audienceReason,
    summary
  };
}

// ============================================================================
// MAIN FUNCTION: selectTheme
// ============================================================================

export function selectTheme(input: ThemeSelectionInput): ThemeSelectionOutput {
  const journeyStage = input.journeyStage || 'awareness';

  // Step 1: Get base priorities from matrix
  const matrixEntry = THEME_PRIORITY_MATRIX[input.platform][input.goal][journeyStage];

  // Step 2: Parse and identify audience type
  const audienceType = parseAudienceType(input.targetAudience);
  const audienceProfile = AUDIENCE_PROFILES[audienceType];

  // Step 3: Calculate weighted scores for all themes
  const weightedThemes: Array<{ theme: ThemeCategory; score: number; subtopics: string[] }> = [];

  matrixEntry.priorities.forEach((theme, index) => {
    const baseScore = 100 - (index * 15); // 100, 85, 70, 55...
    const audienceModifier = audienceProfile.themeModifiers[theme].weight;
    weightedThemes.push({
      theme,
      score: baseScore * audienceModifier,
      subtopics: audienceProfile.themeModifiers[theme].focus
    });
  });

  // Add remaining themes with lower base score
  const allThemes: ThemeCategory[] = ['PAIN_POINTS', 'RISKS', 'COST_ROI', 'AUTHORITY', 'EFFICIENCY', 'HUMAN_REALITY'];
  allThemes.forEach(theme => {
    if (!matrixEntry.priorities.includes(theme)) {
      const audienceModifier = audienceProfile.themeModifiers[theme].weight;
      weightedThemes.push({
        theme,
        score: 30 * audienceModifier, // Low base score for non-priority themes
        subtopics: audienceProfile.themeModifiers[theme].focus
      });
    }
  });

  // Step 4: Apply avoid penalty
  weightedThemes.forEach(t => {
    if (matrixEntry.avoid.includes(t.theme)) {
      t.score *= 0.3; // 70% penalty for avoided themes
    }
  });

  // Step 5: Apply rotation penalty (avoid recent themes)
  if (input.previousThemes?.length) {
    weightedThemes.forEach(t => {
      const recentIndex = input.previousThemes!.indexOf(t.theme);
      if (recentIndex !== -1) {
        // More recent = higher penalty
        const penalty = 1 - (0.3 * (input.previousThemes!.length - recentIndex) / input.previousThemes!.length);
        t.score *= penalty;
      }
    });
  }

  // Step 6: Sort by final score
  weightedThemes.sort((a, b) => b.score - a.score);

  // Step 6b: Normalize scores to 0-100 range
  const maxScore = weightedThemes[0].score;
  weightedThemes.forEach(t => {
    t.score = Math.round((t.score / maxScore) * 100);
  });

  // Step 7: Select top theme and specific subtopic
  const selected = weightedThemes[0];
  const themeCategory = THEME_CATEGORIES[selected.theme];
  const subtopic = selectSubtopic(selected.subtopics, themeCategory.subtopics, input.topicHint);
  const angle = generateAngle(selected.theme, subtopic, audienceType);

  // Step 8: Build alternatives
  const alternatives: ThemeAlternative[] = weightedThemes.slice(1, 4).map(t => {
    let whyNot = `Score ${Math.round(t.score)} vs. ${Math.round(selected.score)}`;
    if (matrixEntry.avoid.includes(t.theme)) {
      whyNot += `. ${matrixEntry.avoidReasoning}`;
    }
    if (input.previousThemes?.includes(t.theme)) {
      whyNot += '. Wurde kürzlich verwendet.';
    }
    return {
      category: t.theme,
      score: Math.round(t.score),
      whyNot
    };
  });

  // Step 9: Build content directives with formula recommendations
  const hookMapping = THEME_HOOK_MAPPING[selected.theme];
  const ctaMapping = GOAL_CTA_MAPPING[input.goal];

  // Get all recommended hook formulas (primary first, then secondary)
  const recommendedHookFormulas: HookFormula[] = [...hookMapping.primary, ...hookMapping.secondary];
  const recommendedCTAFormulas: CTAFormula[] = [...ctaMapping.primary, ...ctaMapping.secondary];

  // Get detailed formula definitions for the prompt
  const hookFormulaDetails: HookFormulaDefinition[] = recommendedHookFormulas.map(f => HOOK_FORMULAS[f]);
  const ctaFormulaDetails: CTAFormulaDefinition[] = recommendedCTAFormulas.map(f => CTA_FORMULAS[f]);

  const contentDirectives: ContentDirectives = {
    hookStyle: audienceProfile.contentRules.hookStyle,
    ctaStyle: audienceProfile.contentRules.ctaStyle,
    avoidTopics: [
      ...matrixEntry.avoid.map(t => THEME_CATEGORIES[t].nameDE),
      ...audienceProfile.contentRules.avoid
    ],
    emphasize: audienceProfile.contentRules.prefer,
    toneGuidance: getToneGuidance(input.platform, audienceType),
    // NEW: Specific formula recommendations
    recommendedHookFormulas,
    recommendedCTAFormulas,
    hookFormulaDetails,
    ctaFormulaDetails
  };

  // Step 10: Return complete output
  return {
    selectedTheme: {
      category: selected.theme,
      subtopic,
      angle
    },
    priorityScore: Math.round(selected.score),
    reasoning: buildReasoning(input, selected, audienceProfile, matrixEntry),
    alternatives,
    contentDirectives
  };
}

// ============================================================================
// UTILITY: Get theme prompt for content generation
// ============================================================================

export function getThemePromptSection(themeOutput: ThemeSelectionOutput): string {
  const category = THEME_CATEGORIES[themeOutput.selectedTheme.category];
  const subtopicLabel = SUBTOPIC_LABELS[themeOutput.selectedTheme.subtopic];
  const { hookFormulaDetails, ctaFormulaDetails } = themeOutput.contentDirectives;

  // Build hook formulas section
  const hookFormulasSection = hookFormulaDetails.length > 0
    ? hookFormulaDetails.map((f, i) => {
        const priority = i === 0 ? '⭐ EMPFOHLEN' : (i === 1 ? '✓ ALTERNATIV' : '○ MÖGLICH');
        return `${priority}: ${f.nameDE}
   Muster: ${f.pattern}
   Beispiel: "${f.example}"`;
      }).join('\n\n')
    : 'Keine spezifische Empfehlung';

  // Build CTA formulas section
  const ctaFormulasSection = ctaFormulaDetails.length > 0
    ? ctaFormulaDetails.map((f, i) => {
        const priority = i === 0 ? '⭐ EMPFOHLEN' : (i === 1 ? '✓ ALTERNATIV' : '○ MÖGLICH');
        return `${priority}: ${f.nameDE}
   Muster: ${f.pattern}
   Beispiel: "${f.example}"`;
      }).join('\n\n')
    : 'Keine spezifische Empfehlung';

  return `
THEMA-VORGABE (STRATEGISCH AUSGEWÄHLT):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kategorie: ${category.nameDE} (${themeOutput.selectedTheme.category})
Unterthema: ${subtopicLabel?.de || themeOutput.selectedTheme.subtopic}
Beschreibung: ${subtopicLabel?.description || ''}
Winkel: ${themeOutput.selectedTheme.angle}

Emotionaler Trigger: ${category.emotion}
Mechanismus: ${category.psychologicalTrigger}

WARUM DIESES THEMA:
${themeOutput.reasoning.summary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 HOOK-FORMEL (VERWENDE EINE DAVON!):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${hookFormulasSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 CTA-FORMEL (VERWENDE EINE DAVON!):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ctaFormulasSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WEITERE RICHTLINIEN:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tonalität: ${themeOutput.contentDirectives.toneGuidance}

BETONEN:
${themeOutput.contentDirectives.emphasize.map(e => `- ${e}`).join('\n')}

VERMEIDEN:
${themeOutput.contentDirectives.avoidTopics.map(a => `- ${a}`).join('\n')}

⚠️ WICHTIG: Der Hook MUSS eine der empfohlenen Formeln nutzen!
⚠️ WICHTIG: Der CTA MUSS konkret und niedrigschwellig sein!
`;
}
