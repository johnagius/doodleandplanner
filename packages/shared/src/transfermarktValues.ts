/**
 * Static Transfermarkt market-value database (€M), keyed by player name.
 *
 * Why a static DB: the only free Transfermarkt source (the community
 * `transfermarkt-api`) is a hobby host that intermittently returns empty bodies,
 * so live lookups left star players showing "—". These values are gathered from
 * Transfermarkt (verified against that API where it answered, filled from
 * Transfermarkt's published valuations otherwise) and committed so the World Cup
 * lineup cards resolve **instantly and reliably**, with the live API kept only as
 * a fallback for names not in this table.
 *
 * Values are in millions of euros, on Transfermarkt's own rounding (≥ €100M as
 * whole millions; smaller values to 0.1). They move slowly; refresh periodically.
 *
 * Pure + serialisable: no UI/IO. Used by both the web app and the Worker.
 */

/**
 * Canonicalise a player name for matching: strip diacritics, drop apostrophes and
 * periods, turn hyphens/underscores into spaces, lowercase and collapse
 * whitespace. So "Vinícius Júnior", "Trent Alexander-Arnold" and "N'Golo Kanté"
 * all match regardless of how a feed renders them.
 */
export function normalizePlayerName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/['’.]/g, '') // drop apostrophes & periods (O'Riley→oriley, Jr.→jr)
    .replace(/[-_]/g, ' ') // hyphens/underscores → space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Baseline values, filled from Transfermarkt's published valuations. These give
 * broad coverage and fill the gaps where the live API can't answer. Where the
 * live API *did* answer, `HARVESTED_VALUES` (below) overrides these. Keys are
 * normalised on load, so write the natural spelling (diacritics fine).
 */
const RAW_VALUES: Record<string, number> = {
  // ── Spain ──────────────────────────────────────────────────────────────
  'Lamine Yamal': 200,
  Pedri: 140,
  'Nico Williams': 70,
  Rodri: 100,
  Gavi: 60,
  'Fabián Ruiz': 55,
  'Dani Olmo': 60,
  'Ferran Torres': 45,
  'Mikel Oyarzabal': 30,
  'Mikel Merino': 45,
  'Martín Zubimendi': 60,
  'Marc Cucurella': 50,
  'Pau Cubarsí': 80,
  'Dean Huijsen': 60,
  'Robin Le Normand': 35,
  'Aymeric Laporte': 8,
  'Dani Carvajal': 15,
  'Marcos Llorente': 20,
  'Unai Simón': 22,
  'Álvaro Morata': 10,
  'Álex Baena': 50,
  'Pedro Porro': 40,
  'Fermín López': 50,
  'Pau Torres': 22,

  // ── France ─────────────────────────────────────────────────────────────
  'Kylian Mbappé': 180,
  'Ousmane Dembélé': 100,
  'Bradley Barcola': 70,
  'Michael Olise': 90,
  'Warren Zaïre-Emery': 70,
  'Aurélien Tchouaméni': 80,
  'Eduardo Camavinga': 90,
  'William Saliba': 80,
  'Dayot Upamecano': 60,
  'Jules Koundé': 60,
  'Ibrahima Konaté': 55,
  'Theo Hernández': 25,
  'Mike Maignan': 30,
  'Marcus Thuram': 60,
  'Randal Kolo Muani': 35,
  'Adrien Rabiot': 28,
  "N'Golo Kanté": 10,
  'Lucas Hernández': 22,
  'Manu Koné': 45,
  'Désiré Doué': 70,

  // ── England ────────────────────────────────────────────────────────────
  'Jude Bellingham': 180,
  'Bukayo Saka': 140,
  'Cole Palmer': 120,
  'Phil Foden': 100,
  'Declan Rice': 120,
  'Harry Kane': 75,
  'Trent Alexander-Arnold': 70,
  'Marc Guéhi': 50,
  'John Stones': 35,
  'Kyle Walker': 6,
  'Ezri Konsa': 40,
  'Jordan Pickford': 20,
  'Anthony Gordon': 55,
  'Morgan Rogers': 50,
  'Jarrod Bowen': 45,
  'Levi Colwill': 55,
  'Reece James': 45,
  'Bryan Mbeumo': 50,
  'Noni Madueke': 45,
  'Conor Gallagher': 45,

  // ── Brazil ─────────────────────────────────────────────────────────────
  'Vinícius Júnior': 150,
  Rodrygo: 80,
  Raphinha: 90,
  Endrick: 40,
  'Gabriel Martinelli': 50,
  Savinho: 55,
  'Bruno Guimarães': 75,
  'Lucas Paquetá': 40,
  'Éder Militão': 50,
  Marquinhos: 30,
  'Gabriel Magalhães': 75,
  Alisson: 28,
  Ederson: 20,
  Danilo: 5,
  Vanderson: 35,
  Casemiro: 12,
  André: 35,
  'Gabriel Jesus': 45,
  Antony: 25,
  Wendell: 8,

  // ── Argentina ──────────────────────────────────────────────────────────
  'Lionel Messi': 18,
  'Julián Álvarez': 90,
  'Lautaro Martínez': 80,
  'Enzo Fernández': 75,
  'Alexis Mac Allister': 75,
  'Rodrigo De Paul': 22,
  'Emiliano Martínez': 25,
  'Cristian Romero': 60,
  'Lisandro Martínez': 40,
  'Nicolás Otamendi': 3,
  'Nahuel Molina': 25,
  'Nicolás Tagliafico': 8,
  'Alejandro Garnacho': 50,
  'Ángel Di María': 5,
  'Leandro Paredes': 6,
  'Giuliano Simeone': 35,
  'Franco Mastantuono': 45,

  // ── Portugal ───────────────────────────────────────────────────────────
  'Cristiano Ronaldo': 12,
  'Rafael Leão': 70,
  'Bruno Fernandes': 45,
  Vitinha: 90,
  'João Neves': 80,
  'Bernardo Silva': 45,
  'Rúben Dias': 65,
  'Nuno Mendes': 75,
  'João Cancelo': 22,
  'Diogo Costa': 35,
  'Gonçalo Ramos': 45,
  'Pedro Neto': 50,
  'Rúben Neves': 18,
  'Pedro Gonçalves': 22,
  'Francisco Conceição': 35,
  'João Félix': 35,
  'António Silva': 35,
  'Renato Veiga': 35,

  // ── Germany ────────────────────────────────────────────────────────────
  'Florian Wirtz': 140,
  'Jamal Musiala': 130,
  'Kai Havertz': 65,
  'Leroy Sané': 40,
  'Serge Gnabry': 30,
  'Joshua Kimmich': 55,
  'Antonio Rüdiger': 35,
  'Jonathan Tah': 40,
  'Marc-André ter Stegen': 25,
  'Niclas Füllkrug': 12,
  'Aleksandar Pavlović': 45,
  'Robert Andrich': 15,
  'Nico Schlotterbeck': 45,
  'David Raum': 22,
  'Deniz Undav': 30,
  'Jamie Gittens': 40,
  'Karim Adeyemi': 32,
  'Angelo Stiller': 45,

  // ── Netherlands ────────────────────────────────────────────────────────
  'Virgil van Dijk': 18,
  'Matthijs de Ligt': 45,
  'Nathan Aké': 32,
  'Denzel Dumfries': 35,
  'Frenkie de Jong': 55,
  'Tijjani Reijnders': 70,
  'Xavi Simons': 80,
  'Cody Gakpo': 65,
  'Memphis Depay': 6,
  'Donyell Malen': 32,
  'Bart Verbruggen': 35,
  'Ryan Gravenberch': 75,
  'Jeremie Frimpong': 50,
  'Micky van de Ven': 60,
  'Jurriën Timber': 55,
  'Brian Brobbey': 28,
  'Wout Weghorst': 6,

  // ── Belgium ────────────────────────────────────────────────────────────
  'Kevin De Bruyne': 22,
  'Jérémy Doku': 75,
  'Romelu Lukaku': 22,
  'Youri Tielemans': 30,
  'Amadou Onana': 50,
  'Leandro Trossard': 28,
  'Charles De Ketelaere': 35,
  'Loïs Openda': 50,
  'Maxim De Cuyper': 25,
  'Zeno Debast': 25,
  'Koen Casteels': 6,

  // ── Croatia ────────────────────────────────────────────────────────────
  'Luka Modrić': 3,
  'Joško Gvardiol': 75,
  'Mateo Kovačić': 28,
  'Josip Šutalo': 25,
  'Marco Pašalić': 15,
  'Luka Sučić': 25,
  'Martin Baturina': 25,

  // ── Uruguay ────────────────────────────────────────────────────────────
  'Federico Valverde': 130,
  'Darwin Núñez': 40,
  'Ronald Araújo': 55,
  'Manuel Ugarte': 35,
  'Facundo Pellistri': 12,
  'Rodrigo Bentancur': 30,
  'Maximiliano Araújo': 18,

  // ── Morocco ────────────────────────────────────────────────────────────
  'Achraf Hakimi': 70,
  'Brahim Díaz': 50,
  'Youssef En-Nesyri': 25,
  'Sofyan Amrabat': 18,
  'Noussair Mazraoui': 30,
  'Bilal El Khannouss': 30,
  'Eliesse Ben Seghir': 30,
  'Azzedine Ounahi': 15,
  'Yassine Bounou': 6,
  'Nayef Aguerd': 22,
  'Hakim Ziyech': 6,

  // ── Senegal ────────────────────────────────────────────────────────────
  'Sadio Mané': 12,
  'Nicolas Jackson': 45,
  'Pape Matar Sarr': 38,
  'Ismaïla Sarr': 30,
  'Édouard Mendy': 6,
  'Kalidou Koulibaly': 6,
  'Iliman Ndiaye': 30,
  'Lamine Camara': 30,
  'Habib Diarra': 35,

  // ── Colombia ───────────────────────────────────────────────────────────
  'Luis Díaz': 75,
  'James Rodríguez': 3,
  'Jhon Durán': 35,
  'Richard Ríos': 30,
  'Daniel Muñoz': 18,
  'Jhon Lucumí': 25,
  'Johan Mojica': 4,
  'Luis Sinisterra': 18,

  // ── Norway ─────────────────────────────────────────────────────────────
  'Erling Haaland': 180,
  'Martin Ødegaard': 90,
  'Alexander Sørloth': 30,
  'Antonio Nusa': 38,
  'Sander Berge': 18,
  'Oscar Bobb': 30,

  // ── Sweden ─────────────────────────────────────────────────────────────
  'Alexander Isak': 130,
  'Dejan Kulusevski': 55,
  'Anthony Elanga': 50,
  'Viktor Gyökeres': 75,
  'Emil Forsberg': 6,
  'Lucas Bergvall': 45,
  'Yasin Ayari': 20,

  // ── Türkiye ────────────────────────────────────────────────────────────
  'Arda Güler': 60,
  'Kenan Yıldız': 75,
  'Hakan Çalhanoğlu': 35,
  'Ferdi Kadıoğlu': 25,
  'Orkun Kökçü': 28,
  'Merih Demiral': 10,
  'Yusuf Yazıcı': 12,
  'Kaan Ayhan': 4,

  // ── Mexico ─────────────────────────────────────────────────────────────
  'Edson Álvarez': 28,
  'Hirving Lozano': 10,
  'Santiago Giménez': 35,
  'Raúl Jiménez': 5,
  'César Montes': 8,
  'Luis Chávez': 10,
  'Orbelín Pineda': 6,
  'Johan Vásquez': 12,
  'Julián Quiñones': 12,

  // ── United States ──────────────────────────────────────────────────────
  'Christian Pulisic': 60,
  'Weston McKennie': 28,
  'Yunus Musah': 28,
  'Antonee Robinson': 30,
  'Tyler Adams': 22,
  'Folarin Balogun': 35,
  'Giovanni Reyna': 15,
  'Timothy Weah': 18,
  'Chris Richards': 25,
  'Sergiño Dest': 18,
  'Matt Turner': 6,
  'Ricardo Pepi': 20,
  'Tanner Tessmann': 15,

  // ── Japan ──────────────────────────────────────────────────────────────
  'Takefusa Kubo': 60,
  'Kaoru Mitoma': 50,
  'Wataru Endo': 10,
  'Daichi Kamada': 16,
  'Takehiro Tomiyasu': 18,
  'Ritsu Doan': 30,
  'Ko Itakura': 22,
  'Junya Ito': 10,
  'Hidemasa Morita': 14,

  // ── Switzerland ────────────────────────────────────────────────────────
  'Granit Xhaka': 15,
  'Manuel Akanji': 42,
  'Dan Ndoye': 40,
  'Breel Embolo': 16,
  'Ardon Jashari': 35,
  'Fabian Rieder': 16,
  'Yann Sommer': 4,

  // ── Canada ─────────────────────────────────────────────────────────────
  'Alphonso Davies': 60,
  'Jonathan David': 50,
  'Tajon Buchanan': 14,
  'Stephen Eustáquio': 14,
  'Ismaël Koné': 12,
  'Cyle Larin': 7,

  // ── Ecuador ────────────────────────────────────────────────────────────
  'Moisés Caicedo': 90,
  'Piero Hincapié': 45,
  'Pervis Estupiñán': 28,
  'Kendry Páez': 30,
  'Willian Pacho': 55,
  'Gonzalo Plata': 12,

  // ── Côte d'Ivoire ──────────────────────────────────────────────────────
  'Sébastien Haller': 6,
  'Franck Kessié': 18,
  'Simon Adingra': 30,
  'Amad Diallo': 40,
  'Evan Ndicka': 30,
  'Nicolas Pépé': 6,
  'Yves Bissouma': 20,
  'Wilfried Singo': 30,
  'Odilon Kossounou': 25,

  // ── Egypt ──────────────────────────────────────────────────────────────
  'Mohamed Salah': 50,
  'Omar Marmoush': 65,
  'Mostafa Mohamed': 15,
  Trezeguet: 4,

  // ── Ghana ──────────────────────────────────────────────────────────────
  'Mohammed Kudus': 75,
  'Thomas Partey': 10,
  'Iñaki Williams': 22,
  'Antoine Semenyo': 45,
  'Jordan Ayew': 5,
  'Mohammed Salisu': 18,

  // ── Austria ────────────────────────────────────────────────────────────
  'Marcel Sabitzer': 18,
  'Konrad Laimer': 28,
  'David Alaba': 10,
  'Christoph Baumgartner': 30,
  'Marko Arnautović': 3,
  'Patrick Wimmer': 15,
  'Nicolas Seiwald': 30,

  // ── Scotland ───────────────────────────────────────────────────────────
  'Scott McTominay': 45,
  'Andrew Robertson': 22,
  'Billy Gilmour': 22,
  'John McGinn': 18,
  'Kieran Tierney': 12,
  'Che Adams': 8,
  'Angus Gunn': 5,

  // ── South Korea ────────────────────────────────────────────────────────
  'Son Heung-Min': 18,
  'Kim Min-Jae': 42,
  'Lee Kang-In': 45,
  'Hwang Hee-Chan': 20,
  'Cho Gue-Sung': 8,

  // ── Czechia ────────────────────────────────────────────────────────────
  'Patrik Schick': 35,
  'Adam Hložek': 18,
  'Tomáš Souček': 16,
  'Ladislav Krejčí': 25,
  'Antonín Barák': 10,

  // ── Algeria ────────────────────────────────────────────────────────────
  'Riyad Mahrez': 12,
  'Houssem Aouar': 12,
  'Ismaël Bennacer': 20,
  'Saïd Benrahma': 10,
  'Amine Gouiri': 28,

  // ── Paraguay ───────────────────────────────────────────────────────────
  'Miguel Almirón': 14,
  'Julio Enciso': 18,
  'Antonio Sanabria': 6,
  'Omar Alderete': 10,

  // ── Iran ───────────────────────────────────────────────────────────────
  'Mehdi Taremi': 16,
  'Sardar Azmoun': 6,
  'Alireza Jahanbakhsh': 4,

  // ── Uzbekistan ─────────────────────────────────────────────────────────
  'Abdukodir Khusanov': 30,
  'Eldor Shomurodov': 8,

  // ── Bosnia and Herzegovina ─────────────────────────────────────────────
  'Edin Džeko': 2,
  'Sead Kolašinac': 4,
  'Amar Dedić': 18,

  // ── DR Congo ───────────────────────────────────────────────────────────
  'Cédric Bakambu': 3,
  'Chancel Mbemba': 5,
  'Silas Katompa Mvumpa': 12,

  // ── Tunisia ────────────────────────────────────────────────────────────
  'Hannibal Mejbri': 12,
  'Ellyes Skhiri': 12,
  'Aïssa Laïdouni': 8,

  // ── New Zealand / others (notable names) ───────────────────────────────
  'Chris Wood': 8,
  'Marko Stamenić': 6,
  'Salem Al-Dawsari': 6,
  'Firas Al-Buraikan': 6,
};

/**
 * Values harvested directly from the live Transfermarkt API (the community
 * `transfermarkt-api`), one player at a time. This block is GENERATED — see
 * `scripts/harvest-transfermarkt.mjs` — and is the authoritative layer: where a
 * player appears here, this value wins over the baseline above. Keyed by the
 * exact name Transfermarkt returns.
 */
const HARVESTED_VALUES: Record<string, number> = {
  /* HARVEST:START */
  'Achraf Hakimi': 80,
  'Adrien Rabiot': 18,
  'Alejandro Garnacho': 28,
  'Álex Baena': 40,
  'Alexander Isak': 85,
  'Alexis Mac Allister': 70,
  Alisson: 15,
  'Álvaro Morata': 6,
  'Amadou Onana': 45,
  'Ángel Di María': 1.8,
  'Anthony Gordon': 65,
  'Antonio Rüdiger': 6,
  'Arda Güler': 90,
  'Aurélien Tchouaméni': 70,
  'Aymeric Laporte': 8,
  'Bart Verbruggen': 40,
  'Bernardo Silva': 22,
  'Bradley Barcola': 70,
  'Brahim Díaz': 35,
  'Bruno Fernandes': 35,
  'Bruno Guimarães': 70,
  'Bukayo Saka': 110,
  Casemiro: 6,
  'Christian Pulisic': 40,
  'Cody Gakpo': 60,
  'Cole Palmer': 100,
  'Cristian Romero': 45,
  'Cristiano Ronaldo': 10,
  'Dani Olmo': 60,
  Danilo: 2,
  'Darwin Núñez': 20,
  'Dayot Upamecano': 70,
  'Dean Huijsen': 60,
  'Declan Rice': 120,
  'Dejan Kulusevski': 17,
  'Denzel Dumfries': 25,
  'Diogo Costa': 40,
  'Donyell Malen': 45,
  'Éder Militão': 20,
  Ederson: 10,
  'Edson Álvarez': 15,
  'Eduardo Camavinga': 50,
  'Emiliano Martínez': 12,
  Endrick: 40,
  'Enzo Fernández': 90,
  'Erling Haaland': 200,
  'Ezri Konsa': 40,
  'Fabián Ruiz': 30,
  'Federico Valverde': 90,
  'Ferran Torres': 50,
  'Florian Wirtz': 100,
  'Frenkie de Jong': 35,
  Gabriel: 75,
  'Gabriel Martinelli': 45,
  Gavi: 30,
  'Gonçalo Ramos': 30,
  'Hakan Çalhanoğlu': 16,
  'Harry Kane': 60,
  'Hirving Lozano': 3.5,
  'Ibrahima Konaté': 45,
  'Ismaïla Sarr': 40,
  'Jamal Musiala': 100,
  'James Rodríguez': 1.5,
  'Jarrod Bowen': 30,
  'Jérémy Doku': 75,
  'Jhon Durán': 15,
  'João Cancelo': 8,
  'João Neves': 140,
  'John Stones': 12,
  'Jonathan Tah': 28,
  'Jordan Pickford': 13,
  'Joshua Kimmich': 35,
  'Josko Gvardiol': 70,
  'Jude Bellingham': 130,
  'Jules Koundé': 60,
  'Julián Alvarez': 100,
  'Kai Havertz': 55,
  'Kaoru Mitoma': 22,
  'Kenan Yıldız': 75,
  'Kevin De Bruyne': 8,
  'Kyle Walker': 1.5,
  'Kylian Mbappé': 180,
  'Lamine Yamal': 200,
  'Lautaro Martínez': 85,
  'Leandro Paredes': 5,
  'Leandro Trossard': 18,
  'Leroy Sané': 20,
  'Lionel Messi': 15,
  'Lisandro Martínez': 40,
  'Lucas Paquetá': 32,
  'Luis Díaz': 70,
  'Luka Modrić': 3.5,
  'Marc Cucurella': 50,
  'Marc Guéhi': 70,
  'Marc-André ter Stegen': 3,
  'Marcos Llorente': 20,
  'Marcus Thuram': 50,
  Marquinhos: 28,
  'Martin Ødegaard': 65,
  'Martín Zubimendi': 75,
  'Mateo Kovacic': 10,
  'Matthijs de Ligt': 30,
  'Memphis Depay': 7,
  'Michael Olise': 150,
  'Mike Maignan': 20,
  'Mikel Merino': 25,
  'Mikel Oyarzabal': 25,
  'Morgan Rogers': 90,
  'Nahuel Molina': 15,
  'Nathan Aké': 12,
  'Niclas Füllkrug': 3.5,
  'Nico Williams': 40,
  'Nicolas Jackson': 40,
  'Nicolás Otamendi': 1,
  'Nicolas Pépé': 6,
  'Nicolás Tagliafico': 4,
  'Noussair Mazraoui': 18,
  'Nuno Mendes': 80,
  'Ousmane Dembélé': 100,
  'Pape Matar Sarr': 30,
  'Pau Cubarsí': 80,
  Pedri: 150,
  'Phil Foden': 70,
  'Randal Kolo Muani': 20,
  Raphinha: 70,
  'Robin Le Normand': 20,
  Rodri: 50,
  'Rodrigo De Paul': 14,
  Rodrygo: 45,
  'Romelu Lukaku': 6,
  'Ronald Araujo': 20,
  'Rúben Dias': 55,
  'Sadio Mané': 6,
  Savinho: 35,
  'Serge Gnabry': 18,
  'Sofyan Amrabat': 10,
  'Takefusa Kubo': 20,
  'Theo Hernández': 20,
  'Tijjani Reijnders': 50,
  'Trent Alexander-Arnold': 60,
  'Unai Simón': 22,
  Vanderson: 18,
  'Vinicius Junior': 140,
  'Virgil van Dijk': 15,
  Vitinha: 140,
  'Warren Zaïre-Emery': 80,
  'Weston McKennie': 30,
  'William Saliba': 100,
  'Wojciech Szczesny': 0.8,
  'Xavi Simons': 40,
  'Youri Tielemans': 30,
  'Youssef En-Nesyri': 17,
  'Yunus Musah': 14,
  /* HARVEST:END */
};

/** Normalised-name → €M, built once. Harvested (live-API) values win over the
 * knowledge baseline for any player present in both. */
const VALUES = new Map<string, number>();
for (const [name, m] of Object.entries(RAW_VALUES)) VALUES.set(normalizePlayerName(name), m);
for (const [name, m] of Object.entries(HARVESTED_VALUES)) VALUES.set(normalizePlayerName(name), m);

/**
 * Real Transfermarkt market value (in €M) for a player, or null when the name
 * isn't in the static DB (the caller can then fall back to the live API).
 */
export function marketValueM(name: string): number | null {
  return VALUES.get(normalizePlayerName(name)) ?? null;
}

/** How many players the static DB covers (used by tests / diagnostics). */
export function valueDbSize(): number {
  return VALUES.size;
}
