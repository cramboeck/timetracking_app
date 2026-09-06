// Aufgeteilt am 6.9.2026 (Schichtenarchitektur-Pilot): Die Routen leben in
// ./tickets/01-core … 08-tasks, gemeinsame Schemas/Helfer in
// ./tickets/shared.ts. Dieser Shim haelt den Importpfad './routes/tickets'
// fuer index.ts, microsoft365.ts und entries.ts stabil.
export { generateTicketNumber, logTicketActivity, calculateSlaDeadlines } from './tickets/index';
export { default } from './tickets/index';
