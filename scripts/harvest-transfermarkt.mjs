#!/usr/bin/env node
/**
 * Refresh the harvested Transfermarkt values in
 * `packages/shared/src/transfermarktValues.ts`.
 *
 * transfermarkt.com blocks bots, so we go through the community
 * `transfermarkt-api` (a hosted scraper), one player at a time. That host is a
 * hobby instance that intermittently returns empty bodies, so we retry with
 * backoff and pause between players. Whatever it answers is written into the
 * `HARVESTED_VALUES` block (between the HARVEST:START/END markers) as the
 * authoritative layer; players it can't resolve keep their knowledge-baseline
 * value in the same file.
 *
 * Run offline (not in CI — the upstream is too flaky to gate a build):
 *   node scripts/harvest-transfermarkt.mjs
 * Add names to NAMES below to extend coverage, then re-run and commit the diff.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const TM_API = 'https://transfermarkt-api.fly.dev';
const here = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(here, '../packages/shared/src/transfermarktValues.ts');

// World Cup 2026 squad players worth carrying real values for. Extend freely.
const NAMES = [
  // Spain
  'Unai Simón',
  'Aymeric Laporte',
  'Pau Cubarsí',
  'Marc Cucurella',
  'Marcos Llorente',
  'Dani Carvajal',
  'Robin Le Normand',
  'Dean Huijsen',
  'Rodri',
  'Pedri',
  'Gavi',
  'Fabián Ruiz',
  'Mikel Merino',
  'Martín Zubimendi',
  'Ferran Torres',
  'Mikel Oyarzabal',
  'Lamine Yamal',
  'Nico Williams',
  'Álvaro Morata',
  'Dani Olmo',
  'Álex Baena',
  'Pedro Porro',
  'Fermín López',
  'Pau Torres',
  // France
  'Mike Maignan',
  'Theo Hernández',
  'William Saliba',
  'Dayot Upamecano',
  'Jules Koundé',
  'Ibrahima Konaté',
  'Aurélien Tchouaméni',
  'Eduardo Camavinga',
  'Adrien Rabiot',
  'Warren Zaïre-Emery',
  'Kylian Mbappé',
  'Ousmane Dembélé',
  'Bradley Barcola',
  'Michael Olise',
  'Marcus Thuram',
  'Randal Kolo Muani',
  'Lucas Hernández',
  'Manu Koné',
  'Désiré Doué',
  // England
  'Jordan Pickford',
  'Kyle Walker',
  'John Stones',
  'Marc Guéhi',
  'Ezri Konsa',
  'Trent Alexander-Arnold',
  'Declan Rice',
  'Jude Bellingham',
  'Cole Palmer',
  'Phil Foden',
  'Bukayo Saka',
  'Harry Kane',
  'Anthony Gordon',
  'Morgan Rogers',
  'Jarrod Bowen',
  'Levi Colwill',
  'Reece James',
  'Bryan Mbeumo',
  'Noni Madueke',
  'Conor Gallagher',
  // Brazil
  'Alisson',
  'Ederson',
  'Marquinhos',
  'Gabriel Magalhães',
  'Éder Militão',
  'Danilo',
  'Vanderson',
  'Bruno Guimarães',
  'Casemiro',
  'Lucas Paquetá',
  'André',
  'Vinícius Júnior',
  'Rodrygo',
  'Raphinha',
  'Endrick',
  'Gabriel Martinelli',
  'Savinho',
  'Gabriel Jesus',
  'Antony',
  'Wendell',
  // Argentina
  'Emiliano Martínez',
  'Cristian Romero',
  'Lisandro Martínez',
  'Nicolás Otamendi',
  'Nahuel Molina',
  'Nicolás Tagliafico',
  'Rodrigo De Paul',
  'Enzo Fernández',
  'Alexis Mac Allister',
  'Leandro Paredes',
  'Lionel Messi',
  'Julián Álvarez',
  'Lautaro Martínez',
  'Ángel Di María',
  'Alejandro Garnacho',
  'Giuliano Simeone',
  'Franco Mastantuono',
  // Portugal
  'Diogo Costa',
  'Rúben Dias',
  'João Cancelo',
  'Nuno Mendes',
  'Bruno Fernandes',
  'Vitinha',
  'João Neves',
  'Bernardo Silva',
  'Cristiano Ronaldo',
  'Rafael Leão',
  'Gonçalo Ramos',
  'Pedro Neto',
  'Rúben Neves',
  'Pedro Gonçalves',
  'Francisco Conceição',
  'João Félix',
  'António Silva',
  'Renato Veiga',
  // Germany
  'Marc-André ter Stegen',
  'Antonio Rüdiger',
  'Jonathan Tah',
  'Joshua Kimmich',
  'Florian Wirtz',
  'Jamal Musiala',
  'Kai Havertz',
  'Leroy Sané',
  'Serge Gnabry',
  'Niclas Füllkrug',
  'Aleksandar Pavlović',
  'Robert Andrich',
  'Nico Schlotterbeck',
  'David Raum',
  'Deniz Undav',
  'Jamie Gittens',
  'Karim Adeyemi',
  'Angelo Stiller',
  // Netherlands
  'Bart Verbruggen',
  'Virgil van Dijk',
  'Matthijs de Ligt',
  'Nathan Aké',
  'Denzel Dumfries',
  'Frenkie de Jong',
  'Tijjani Reijnders',
  'Xavi Simons',
  'Cody Gakpo',
  'Memphis Depay',
  'Donyell Malen',
  'Ryan Gravenberch',
  'Jeremie Frimpong',
  'Micky van de Ven',
  'Jurriën Timber',
  'Brian Brobbey',
  'Wout Weghorst',
  // Belgium
  'Kevin De Bruyne',
  'Romelu Lukaku',
  'Jérémy Doku',
  'Youri Tielemans',
  'Amadou Onana',
  'Leandro Trossard',
  'Charles De Ketelaere',
  'Loïs Openda',
  'Maxim De Cuyper',
  'Zeno Debast',
  'Koen Casteels',
  // Croatia
  'Luka Modrić',
  'Joško Gvardiol',
  'Mateo Kovačić',
  'Josip Šutalo',
  'Marco Pašalić',
  'Luka Sučić',
  'Martin Baturina',
  // Uruguay
  'Federico Valverde',
  'Darwin Núñez',
  'Ronald Araújo',
  'Manuel Ugarte',
  'Facundo Pellistri',
  'Rodrigo Bentancur',
  'Maximiliano Araújo',
  // Morocco
  'Achraf Hakimi',
  'Brahim Díaz',
  'Youssef En-Nesyri',
  'Sofyan Amrabat',
  'Noussair Mazraoui',
  'Bilal El Khannouss',
  'Eliesse Ben Seghir',
  'Azzedine Ounahi',
  'Yassine Bounou',
  'Nayef Aguerd',
  'Hakim Ziyech',
  // Senegal
  'Sadio Mané',
  'Nicolas Jackson',
  'Pape Matar Sarr',
  'Ismaïla Sarr',
  'Édouard Mendy',
  'Kalidou Koulibaly',
  'Iliman Ndiaye',
  'Lamine Camara',
  'Habib Diarra',
  // Colombia
  'Luis Díaz',
  'James Rodríguez',
  'Jhon Durán',
  'Richard Ríos',
  'Daniel Muñoz',
  'Jhon Lucumí',
  'Johan Mojica',
  'Luis Sinisterra',
  // Norway
  'Erling Haaland',
  'Martin Ødegaard',
  'Alexander Sørloth',
  'Antonio Nusa',
  'Sander Berge',
  'Oscar Bobb',
  // Sweden
  'Alexander Isak',
  'Dejan Kulusevski',
  'Anthony Elanga',
  'Viktor Gyökeres',
  'Emil Forsberg',
  'Lucas Bergvall',
  'Yasin Ayari',
  // Türkiye
  'Arda Güler',
  'Kenan Yıldız',
  'Hakan Çalhanoğlu',
  'Ferdi Kadıoğlu',
  'Orkun Kökçü',
  'Merih Demiral',
  'Yusuf Yazıcı',
  'Kaan Ayhan',
  // Mexico
  'Edson Álvarez',
  'Hirving Lozano',
  'Santiago Giménez',
  'Raúl Jiménez',
  'César Montes',
  'Luis Chávez',
  'Orbelín Pineda',
  'Johan Vásquez',
  'Julián Quiñones',
  // USA
  'Christian Pulisic',
  'Weston McKennie',
  'Yunus Musah',
  'Antonee Robinson',
  'Tyler Adams',
  'Folarin Balogun',
  'Giovanni Reyna',
  'Timothy Weah',
  'Chris Richards',
  'Sergiño Dest',
  'Matt Turner',
  'Ricardo Pepi',
  'Tanner Tessmann',
  // Japan
  'Takefusa Kubo',
  'Kaoru Mitoma',
  'Wataru Endo',
  'Daichi Kamada',
  'Takehiro Tomiyasu',
  'Ritsu Doan',
  'Ko Itakura',
  'Junya Ito',
  'Hidemasa Morita',
  // Switzerland
  'Granit Xhaka',
  'Manuel Akanji',
  'Dan Ndoye',
  'Breel Embolo',
  'Ardon Jashari',
  'Fabian Rieder',
  'Yann Sommer',
  // Canada
  'Alphonso Davies',
  'Jonathan David',
  'Tajon Buchanan',
  'Stephen Eustáquio',
  'Ismaël Koné',
  'Cyle Larin',
  // Ecuador
  'Moisés Caicedo',
  'Piero Hincapié',
  'Pervis Estupiñán',
  'Kendry Páez',
  'Willian Pacho',
  'Gonzalo Plata',
  // Côte d'Ivoire
  'Sébastien Haller',
  'Franck Kessié',
  'Simon Adingra',
  'Amad Diallo',
  'Evan Ndicka',
  'Nicolas Pépé',
  'Yves Bissouma',
  'Wilfried Singo',
  'Odilon Kossounou',
  // Egypt
  'Mohamed Salah',
  'Omar Marmoush',
  'Mostafa Mohamed',
  'Trezeguet',
  // Ghana
  'Mohammed Kudus',
  'Thomas Partey',
  'Iñaki Williams',
  'Antoine Semenyo',
  'Jordan Ayew',
  'Mohammed Salisu',
  // Austria
  'Marcel Sabitzer',
  'Konrad Laimer',
  'David Alaba',
  'Christoph Baumgartner',
  'Marko Arnautović',
  'Patrick Wimmer',
  'Nicolas Seiwald',
  // Scotland
  'Scott McTominay',
  'Andrew Robertson',
  'Billy Gilmour',
  'John McGinn',
  'Kieran Tierney',
  'Che Adams',
  'Angus Gunn',
  // South Korea
  'Son Heung-min',
  'Kim Min-jae',
  'Lee Kang-in',
  'Hwang Hee-chan',
  'Cho Gue-sung',
  // Czechia
  'Patrik Schick',
  'Adam Hložek',
  'Tomáš Souček',
  'Ladislav Krejčí',
  'Antonín Barák',
  // Algeria
  'Riyad Mahrez',
  'Houssem Aouar',
  'Ismaël Bennacer',
  'Saïd Benrahma',
  'Amine Gouiri',
  // Paraguay
  'Miguel Almirón',
  'Julio Enciso',
  'Antonio Sanabria',
  'Omar Alderete',
  // Iran
  'Mehdi Taremi',
  'Sardar Azmoun',
  'Alireza Jahanbakhsh',
  // Uzbekistan
  'Abdukodir Khusanov',
  'Eldor Shomurodov',
  // Bosnia and Herzegovina
  'Edin Džeko',
  'Sead Kolašinac',
  'Amar Dedić',
  // DR Congo
  'Cédric Bakambu',
  'Chancel Mbemba',
  'Silas Katompa Mvumpa',
  // Tunisia
  'Hannibal Mejbri',
  'Ellyes Skhiri',
  'Aïssa Laïdouni',
  // New Zealand / Saudi Arabia (notable names)
  'Chris Wood',
  'Marko Stamenić',
  'Salem Al-Dawsari',
  'Firas Al-Buraikan',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// The community API's search is fuzzy and sometimes returns a different player
// (e.g. "André" → "Andrew Robertson"). Accept a hit only when its name equals the
// query or shares an exact name token (≥3 chars); otherwise we keep the baseline.
function looksLikeMatch(query, returned) {
  const a = norm(query);
  const b = norm(returned);
  if (a === b) return true;
  const tb = new Set(b.split(' '));
  return a.split(' ').some((t) => t.length >= 3 && tb.has(t));
}

/** First usable market value (€M, TM rounding) + the name TM returns, or null. */
async function fetchValue(name, tries = 4) {
  const url = `${TM_API}/players/search/${encodeURIComponent(name)}?page_number=1`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.text();
      if (body.trim()) {
        const data = JSON.parse(body);
        const hit = (data.results ?? []).find(
          (r) => typeof r.marketValue === 'number' && r.marketValue > 0,
        );
        if (!hit) return null; // got data, no value
        const mv = hit.marketValue;
        const valueM = mv >= 1e8 ? Math.round(mv / 1e6) : Math.round((mv / 1e6) * 10) / 10;
        return { name: hit.name ?? name, valueM };
      }
    } catch {
      /* retry */
    }
    await sleep(2000 * (i + 1));
  }
  return undefined; // could not reach the host
}

async function main() {
  const harvested = new Map(); // tmName → €M
  let ok = 0;
  let miss = 0;
  let err = 0;
  let mismatch = 0;
  for (const name of NAMES) {
    const r = await fetchValue(name);
    if (r === undefined) {
      err++;
      process.stderr.write(`ERR   ${name}\n`);
    } else if (r === null) {
      miss++;
      process.stderr.write(`NONE  ${name}\n`);
    } else if (!looksLikeMatch(name, r.name)) {
      mismatch++;
      process.stderr.write(`SKIP  ${name} → ${r.name} (fuzzy mismatch, kept baseline)\n`);
    } else {
      ok++;
      harvested.set(r.name, r.valueM);
      process.stderr.write(`OK    ${name} → €${r.valueM}M (${r.name})\n`);
    }
    await sleep(1500);
  }

  const entries = [...harvested.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const block = entries.map(([n, m]) => `  ${JSON.stringify(n)}: ${m},`).join('\n');

  const src = await readFile(TARGET, 'utf8');
  const next = src.replace(
    /\/\* HARVEST:START \*\/[\s\S]*?\/\* HARVEST:END \*\//,
    `/* HARVEST:START */\n${block}\n  /* HARVEST:END */`,
  );
  await writeFile(TARGET, next);
  process.stderr.write(
    `\nWrote ${entries.length} harvested values (ok ${ok}, none ${miss}, mismatch ${mismatch}, err ${err}).\n`,
  );
}

main();
