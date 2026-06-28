/**
 * Real FIFA World Cup 2026 knockout kick-offs and venues, keyed by this engine's
 * match id. Times are the official UTC instants; the id order also encodes the
 * official bracket layout (each tie sits with its partner so the bracket renders
 * as a clean tree, top-to-bottom in kick-off order). Source: FIFA match schedule
 * (cross-checked against the published fixtures list).
 */
export const WC_KNOCKOUT_SCHEDULE: Readonly<Record<string, { kickoff: string; venue: string }>> = {
  'r32-1': { kickoff: '2026-06-28T19:00:00Z', venue: 'SoFi Stadium' }, // M73 2A v 2B
  'r32-2': { kickoff: '2026-06-30T01:00:00Z', venue: 'Estadio BBVA' }, // M75 1F v 2C
  'r32-3': { kickoff: '2026-06-29T20:30:00Z', venue: 'Gillette Stadium' }, // M74 1E v best3_of_ABCDF
  'r32-4': { kickoff: '2026-06-30T21:00:00Z', venue: 'MetLife Stadium' }, // M77 1I v best3_of_CDFGH
  'r32-5': { kickoff: '2026-07-01T20:00:00Z', venue: 'Lumen Field' }, // M82 1G v best3_of_AEHIJ
  'r32-6': { kickoff: '2026-07-02T00:00:00Z', venue: "Levi's Stadium" }, // M81 1D v best3_of_BEFIJ
  'r32-7': { kickoff: '2026-07-02T19:00:00Z', venue: 'SoFi Stadium' }, // M84 1H v 2J
  'r32-8': { kickoff: '2026-07-02T23:00:00Z', venue: 'BMO Field' }, // M83 2K v 2L
  'r32-9': { kickoff: '2026-06-29T17:00:00Z', venue: 'NRG Stadium' }, // M76 1C v 2F
  'r32-10': { kickoff: '2026-06-30T17:00:00Z', venue: 'AT&T Stadium' }, // M78 2E v 2I
  'r32-11': { kickoff: '2026-07-01T01:00:00Z', venue: 'Estadio Azteca' }, // M79 1A v best3_of_CEFHI
  'r32-12': { kickoff: '2026-07-01T16:00:00Z', venue: 'Mercedes-Benz Stadium' }, // M80 1L v best3_of_EHIJK
  'r32-13': { kickoff: '2026-07-03T03:00:00Z', venue: 'BC Place' }, // M85 1B v best3_of_EFGIJ
  'r32-14': { kickoff: '2026-07-04T01:30:00Z', venue: 'Arrowhead Stadium' }, // M87 1K v best3_of_DEIJL
  'r32-15': { kickoff: '2026-07-03T18:00:00Z', venue: 'AT&T Stadium' }, // M88 2D v 2G
  'r32-16': { kickoff: '2026-07-03T22:00:00Z', venue: 'Hard Rock Stadium' }, // M86 1J v 2H
  'r16-1': { kickoff: '2026-07-04T17:00:00Z', venue: 'NRG Stadium' }, // M90 W73 v W75
  'r16-2': { kickoff: '2026-07-04T21:00:00Z', venue: 'Lincoln Financial Field' }, // M89 W74 v W77
  'r16-3': { kickoff: '2026-07-07T00:00:00Z', venue: 'Lumen Field' }, // M94 W81 v W82
  'r16-4': { kickoff: '2026-07-06T19:00:00Z', venue: 'AT&T Stadium' }, // M93 W83 v W84
  'r16-5': { kickoff: '2026-07-05T20:00:00Z', venue: 'MetLife Stadium' }, // M91 W76 v W78
  'r16-6': { kickoff: '2026-07-06T00:00:00Z', venue: 'Estadio Azteca' }, // M92 W79 v W80
  'r16-7': { kickoff: '2026-07-07T20:00:00Z', venue: 'BC Place' }, // M96 W85 v W87
  'r16-8': { kickoff: '2026-07-07T16:00:00Z', venue: 'Mercedes-Benz Stadium' }, // M95 W86 v W88
  'qf-1': { kickoff: '2026-07-09T20:00:00Z', venue: 'Gillette Stadium' }, // M97 W89 v W90
  'qf-2': { kickoff: '2026-07-10T19:00:00Z', venue: 'SoFi Stadium' }, // M98 W93 v W94
  'qf-3': { kickoff: '2026-07-11T21:00:00Z', venue: 'Hard Rock Stadium' }, // M99 W91 v W92
  'qf-4': { kickoff: '2026-07-12T01:00:00Z', venue: 'Arrowhead Stadium' }, // M100 W95 v W96
  'sf-1': { kickoff: '2026-07-14T19:00:00Z', venue: 'AT&T Stadium' }, // M101 W97 v W98
  'sf-2': { kickoff: '2026-07-15T19:00:00Z', venue: 'Mercedes-Benz Stadium' }, // M102 W99 v W100
  'third-1': { kickoff: '2026-07-18T21:00:00Z', venue: 'Hard Rock Stadium' }, // M103 L101 v L102
  'final-1': { kickoff: '2026-07-19T19:00:00Z', venue: 'MetLife Stadium' }, // M104 W101 v W102
};
