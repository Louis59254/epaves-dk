// ── Épaves DK — Base de données complète ──────────────────────────────────
// Source originale : dkepaves.free.fr (245 épaves répertoriées)
// Coordonnées en DDM (degrés + minutes décimales) → converties ci-dessous

function ddm(s) {
  const p = String(s).trim().split('.');
  const deg = parseInt(p[0], 10);
  const min = parseFloat(p[1] + '.' + (p[2] || '0'));
  return deg + min / 60;
}

const CAT = {
  dd:       { label: 'Destroyer / Torpilleur',      color: '#f43f5e', emoji: '⚔️'  },
  passager: { label: 'Paquebot / Passager',          color: '#a78bfa', emoji: '🚢'  },
  cargo:    { label: 'Cargo / Caboteur',             color: '#fb923c', emoji: '📦'  },
  chalk:    { label: 'Chalutier',                    color: '#34d399', emoji: '🎣'  },
  sub:      { label: 'Sous-marin',                   color: '#fbbf24', emoji: '🔭'  },
  lct:      { label: 'Bâtiment de débarquement',    color: '#60a5fa', emoji: '⚓'  },
  avion:    { label: 'Avion',                        color: '#e879f9', emoji: '✈️'  },
  autre:    { label: 'Autre / Inconnu',              color: '#94a3b8', emoji: '❓'  },
};

function speciesByDepth(d) {
  if (!d || d <= 3)  return ['Bar 🐟', 'Mulet 🐡'];
  if (d <= 15)       return ['Bar 🐟', 'Lieu jaune 🐠', 'Mulet 🐡'];
  if (d <= 25)       return ['Lieu jaune 🐠', 'Bar 🐟', 'Merlan 🦑'];
  if (d <= 35)       return ['Lieu jaune 🐠', 'Cabillaud 🐟', 'Merlan 🦑', 'Congre 🦐'];
  return              ['Cabillaud 🐟', 'Lieu jaune 🐠', 'Raie 🦈', 'Congre 🦐'];
}

// Format: [id, nom, lat_ddm, lng_ddm, categorie, annee, prof_max, op_dynamo, note]
const RAW = [
  [1,   'A 7',                      '51.13.88',  '02.38.13', 'autre',    null, null,  false, null],
  [2,   'A 10',                     '51.15.300', '02.53.210','autre',    null, null,  false, null],
  [3,   'A 15',                     '51.19.93',  '02.45.65', 'autre',    null, null,  false, null],
  [4,   'A 58',                     '51.22.020', '03.11.650','autre',    null, null,  false, null],
  [6,   'Abukir',                   '51.18.820', '2.18.480', 'passager', null, null,  false, null],
  [7,   'Admiralengracht',          '51.22.394', '03.11.941','cargo',    null, null,  false, null],
  [8,   'Adroit',                   '51.03.42',  '2.23.20',  'dd',       1940, 18,    true,  'Contre-torpilleur français, Opération Dynamo'],
  [11,  'Aloha',                    '51.14.920', '2.42.200', 'cargo',    null, null,  false, null],
  [13,  'Amethyste',                '51.3.067',  '2.21.050', 'autre',    null, null,  false, null],
  [14,  'Amor',                     '51.24.980', '2.09.370', 'cargo',    null, null,  false, null],
  [15,  'Anna Catherina',           '51.24.880', '03.12.820','cargo',    null, null,  false, null],
  [16,  'Anton Hammerbacher',       '51.15.920', '02.53.090','cargo',    null, null,  false, null],
  [17,  'Apache',                   '51.18.880', '2.47.581', 'cargo',    null, null,  false, null],
  [18,  'Ardmount',                 '51.25.600', '02.54.520','cargo',    null, null,  false, null],
  [19,  'Argyllshire',              '51.18.629', '2.07.512', 'cargo',    null, null,  false, null],
  [20,  'Auretta',                  '51.24.441', '02.48.249','cargo',    null, null,  false, null],
  [21,  'Basilisk',                 '51.08.22',  '2.35.02',  'dd',       1940, 20,    true,  'HMS Basilisk, destroyer britannique, coulé 1er juin 1940'],
  [22,  'Bateau-feu',               '51.06.33',  '2.14.12',  'autre',    1940, 28,    false, 'Bateau-feu (lightship) — voir aussi Bateau-feu Dyck'],
  [24,  'Birkenfels',               '51.39.02',  '2.31.93',  'cargo',    null, null,  false, null],
  [25,  'Blackburn Rovers FY.116',  '51.24.79',  '02.13.89', 'chalk',    1940, null,  true,  'Chalutier armé britannique, Opération Dynamo'],
  [26,  'Bourrasque',               '51.14.964', '2.33.026', 'dd',       1940, 25,    true,  'Contre-torpilleur, 106m, 1458T, coulé 30 mai 1940 — ~500 victimes. Identifié 1984 (tête de sanglier).'],
  [27,  'Bowsprite',                '51.22.860', '02.34.637','cargo',    null, null,  false, null],
  [28,  'BR 16 André',              '51.29.05',  '02.04.06', 'chalk',    null, null,  false, 'Chalutier belge (immatriculation Bruges)'],
  [29,  'Branlebas (1907)',         '51.13.006', '2.37.706', 'dd',       null, null,  false, 'Torpilleur français (classe Branlebas 1907)'],
  [30,  'Breda',                    '51.37.630', '2.28.488', 'cargo',    null, null,  false, null],
  [31,  'Brighton',                 '51.03.070', '2.10.590', 'passager', 1940, null,  true,  'Paquebot britannique, Opération Dynamo'],
  [32,  'Brighton Belle',           '51.17.53',  '1.30.10',  'passager', 1940, null,  true,  'Paddle steamer, Opération Dynamo'],
  [33,  'Brighton Queen',           '51.06.45',  '2.11.41',  'passager', 1940, null,  true,  'Paddle steamer, Opération Dynamo'],
  [34,  'Bruno Heinemann',          '51.16.250', '2.17.150', 'dd',       1942, null,  false, 'Destroyer de la Kriegsmarine (classe Diether von Roeder)'],
  [36,  'Capella',                  '51.23.840', '03.05.140','cargo',    null, null,  false, null],
  [37,  'Cargo (inconnu)',          '51.03.85',  '2.14.87',  'cargo',    null, null,  false, null],
  [38,  'Carl',                     '51.22.128', '03.12.972','cargo',    null, null,  false, null],
  [39,  'Charles D. McIver',        '51.22.480', '03.04.790','cargo',    null, null,  false, null],
  [40,  'Chasseur 9',               '51.03.033', '2.24.00',  'dd',       1940, null,  true,  'Vedette chasseur de sous-marins française, Opération Dynamo'],
  [42,  'Clan MacAlister',          '51.05.210', '02.28.660','cargo',    1940, 14,    true,  'Cargo écossais de la Clan Line, Opération Dynamo'],
  [43,  'CMB 1',                    '51.17.195', '02.50.959','lct',      1940, null,  false, 'Coastal Motor Boat britannique'],
  [44,  'CMB 71A',                  '51.08.03',  '02.27.58', 'lct',      1940, null,  false, 'Coastal Motor Boat britannique'],
  [45,  'Coaster',                  '51.33.65',  '03.13.93', 'cargo',    null, null,  false, null],
  [46,  'Colsay',                   '51.14.78',  '02.47.85', 'cargo',    null, null,  false, null],
  [48,  'Crested Eagle',            '51.04.560', '2.29.461', 'passager', 1940, 2,     true,  'Paddle steamer, visible marée basse plage Zuydcoote. ~600 à bord, >200 victimes mitraillés.'],
  [49,  'Crete Moore',              '51.3.117',  '2.21.033', 'cargo',    null, null,  false, null],
  [50,  'Croxteth Hall',            '51.21.450', '02.59.320','cargo',    null, null,  false, null],
  [51,  'D. Meersburg SR (KW 7)',   '51.11.94',  '02.44.99', 'chalk',    null, null,  false, null],
  [52,  'De mast',                  '51.20.72',  '02.45.57', 'autre',    null, null,  false, null],
  [53,  'Denis Papin',              '51.07.41',  '2.09.15',  'cargo',    null, null,  false, null],
  [54,  'Devonia',                  '51.04.773', '2.30.169', 'passager', 1940, 2,     true,  'Paddle steamer / dragueur de mines, coulé volontairement 30 mai 1940. Visible marée basse.'],
  [55,  'Douaisien',                '51.04.60',  '2.27.31',  'cargo',    null, null,  false, null],
  [56,  'Duc de Normandie',         '51.25.580', '2.36.390', 'passager', null, null,  false, null],
  [57,  'Eleftheria',               '51.22.030', '03.07.090','cargo',    null, null,  false, null],
  [58,  'Ely',                      '51.3.833',  '2.21.600', 'cargo',    null, null,  false, null],
  [59,  'Emeraude',                 '51.21.592', '2.50.427', 'cargo',    null, null,  false, null],
  [60,  'Emile Deschamps',          '51.24.18',  '1.29.18',  'cargo',    null, null,  false, null],
  [62,  'Empire Faith',             '51.21.654', '02.50.442','cargo',    null, null,  false, null],
  [63,  'Empire Path',              '51.21.71',  '2.50.53',  'cargo',    null, null,  false, null],
  [64,  'Etendard (1907)',          '51.11.770', '02.29.420','dd',       null, null,  false, 'Torpilleur français classe Branlebas (1907)'],
  [65,  'Etendard',                 '51.06.583', '2.29.416', 'dd',       1940, null,  true,  'Contre-torpilleur / destroyer français, Opération Dynamo'],
  [66,  'Etincelle',                '51.3.283',  '2.17.333', 'autre',    null, null,  false, null],
  [67,  'Etoile du Nord',           '51.3.75',   '2.23.53',  'passager', null, null,  false, 'Fiche : dkepaves.free.fr/html/etoile_du_nord.htm'],
  [68,  'Fenella',                  '51.03.61',  '2.21.40',  'passager', 1940, 5,     true,  'Ferry Isle of Man Steam Packet Co., Opération Dynamo'],
  [69,  'Flakplatform',             '51.14.71',  '02.55.70', 'autre',    null, null,  false, 'Plate-forme de DCA (Flak)'],
  [70,  'Flandre',                  '51.09.39',  '02.19.39', 'passager', null, null,  false, null],
  [71,  'Florentino',               '51.20.870', '03.12.990','cargo',    null, null,  false, null],
  [72,  'Floride',                  '51.04.00',  '2.23.60',  'cargo',    1939, null,  false, 'Cargo ex-La Marseillaise. Fiche : dkepaves.free.fr/html/floride.htm'],
  [75,  'Foudroyant',               '51.05.20',  '2.15.55',  'dd',       1940, 28,    true,  'Contre-torpilleur classe Forbin, 100m, 1500T, coulé 1er juin 1940 vers 10h30. Orientation 325/155°. Munitions et fuel visibles.'],
  [76,  'Francis Asbury',           '51.21.370', '03.02.090','cargo',    null, null,  false, null],
  [77,  'G96',                      '51.17.407', '02.36.385','dd',       null, null,  false, 'Torpilleur / vedette rapide allemand'],
  [78,  'Garden City',              '51.29.14',  '2.18.33',  'cargo',    null, null,  false, null],
  [79,  'Goldshell',                '51.20.980', '02.54.00', 'cargo',    null, null,  false, null],
  [80,  'Gorm',                     '51.22.148', '03.12.992','cargo',    null, null,  false, null],
  [81,  'Gourko',                   '51.03.82',  '2.20.30',  'cargo',    1940, null,  true,  'Opération Dynamo'],
  [82,  'Gracie Fields',            '51.12.556', '2.39.391', 'passager', 1940, null,  true,  'Paddle steamer, Opération Dynamo'],
  [83,  'Grafton',                  '51.24.421', '2.49.087', 'dd',       1940, 30,    true,  'HMS Grafton, destroyer britannique, torpillé 29 mai 1940'],
  [84,  'Grenade',                  '51.3.200',  '2.21.400', 'dd',       1940, null,  true,  'Contre-torpilleur français, Opération Dynamo'],
  [85,  'Greta Dania',              '51.35.54',  '3.12.77',  'cargo',    null, null,  false, null],
  [86,  'Grive',                    '51.03.72',  '2.18.55',  'dd',       null, null,  false, null],
  [87,  'Halo',                     '51.21.135', '2.22.930', 'cargo',    null, null,  false, null],
  [88,  'Harfry',                   '51.3.650',  '2.20.517', 'cargo',    null, null,  false, null],
  [89,  'Havant',                   '51.08.00',  '2.15.77',  'dd',       1940, null,  true,  'HMS Havant, destroyer britannique, coulé 1er juin 1940'],
  [90,  'Hayburn Wyke',             '51.15.400', '02.48.710','cargo',    null, null,  false, null],
  [91,  'Heinkel 111',              '51.13.364', '02.51.839','avion',    1940, null,  true,  'Bombardier Heinkel He 111 de la Luftwaffe'],
  [92,  'Henry B. Plant',           '51.19.20',  '01.47.98', 'cargo',    null, null,  false, null],
  [93,  'Hermes',                   '51.06.344', '01.50.332','dd',       1914, 32,    false, '1er porte-avions de l\'histoire (croiseur léger converti), 5 600T. Torpillé 31 oct. 1914 par U-27.'],
  [95,  'Hollandia',                '51.18.74',  '2.09.05',  'cargo',    null, null,  false, null],
  [96,  'Horst',                    '51.03.633', '2.25.550', 'cargo',    null, null,  false, 'Visible depuis Malo-Terminus à marée basse (avance 70m en mer)'],
  [97,  'Hughli',                   '51.13.491', '02.51.999','cargo',    null, null,  false, null],
  [98,  'Iltis',                    '50.46.0',   '1.34.0',   'dd',       null, null,  false, 'Torpilleur allemand'],
  [99,  'Jaguar',                   '51.03.50',  '2.22.30',  'dd',       1940, null,  true,  'Contre-torpilleur français, Opération Dynamo. Fiche : dkepaves.free.fr.'],
  [100, 'John Mahn (V1302)',        '51.28.937', '02.41.339','autre',    1941, null,  false, 'Vorpostenboote (vedette de surveillance) allemand'],
  [102, 'Kap Arkona',               '51.22.026', '02.43.541','cargo',    null, null,  false, null],
  [103, 'Keith',                    '51.04.75',  '2.26.70',  'dd',       1940, 18,    true,  'HMS Keith, destroyer britannique, coulé 1er juin 1940. Bon spot lieu jaune.'],
  [104, 'Kempton',                  '51.03.75',  '02.08.77', 'cargo',    null, null,  false, null],
  [105, 'Kestrel',                  '51.04.115', '2.28.024', 'autre',    null, null,  false, null],
  [106, 'Keulse Vaart IV',          '51.10.987', '02.40.106','cargo',    null, null,  false, null],
  [107, 'Kilmore',                  '51.23.782', '2.25.875', 'lct',      1940, null,  true,  'Dragueur de mines / vedette, Opération Dynamo'],
  [108, 'King Orry',                '51.04.00',  '2.20.850', 'passager', 1940, 10,    true,  'Ferry Isle of Man Steam Packet Co., Opération Dynamo'],
  [109, 'Kuster',                   '51.23.46',  '2.35.89',  'cargo',    null, null,  false, null],
  [110, 'La Fred',                  '51.04.05',  '2.16.60',  'cargo',    null, null,  false, 'Fiche : dkepaves.free.fr'],
  [111, 'Laura',                    '51.23.106', '2.28.444', 'cargo',    null, null,  false, null],
  [112, 'LCT (inconnu)',            '51.21.927', '02.39.313','lct',      null, null,  false, 'Landing Craft Tank non identifié'],
  [113, 'LCT 457 (R)',              '51.24.655', '02.43.702','lct',      null, null,  false, 'Landing Craft Tank'],
  [114, 'LCT 7015',                 '51.22.898', '02.37.214','lct',      null, null,  false, 'Landing Craft Tank'],
  [115, 'Lientje',                  '51.24.458', '03.08.627','cargo',    null, null,  false, null],
  [117, 'Lorina',                   '51.03.586', '2.25.420', 'passager', 1940, 2,     true,  'Paquebot visible marée basse côté Leffrinckoucke. 8 victimes. Opération Dynamo.'],
  [118, 'LST 80',                   '51.27.606', '03.06.508','lct',      null, null,  false, 'Landing Ship Tank'],
  [119, 'LST 364',                  '51.18.39',  '01.54.91', 'lct',      null, null,  false, 'Landing Ship Tank'],
  [120, 'LST 420 (avant)',          '51.15.460', '02.40.755','lct',      null, null,  false, 'Landing Ship Tank — partie avant'],
  [121, 'LST 420 (arrière)',        '51.15.030', '02.41.800','lct',      null, null,  false, 'Landing Ship Tank — partie arrière'],
  [122, 'M 345',                    '51.03.0',   '2.02.0',   'autre',    null, null,  false, 'Dragueur de mines allemand'],
  [123, 'M 3604',                   '51.19.12',  '03.01.86', 'autre',    null, null,  false, 'Dragueur de mines'],
  [124, 'M 3606',                   '51.19.22',  '03.01.88', 'autre',    null, null,  false, 'Dragueur de mines'],
  [125, 'Maori',                    '51.24.020', '3.05.860', 'dd',       null, null,  false, 'HMS Maori, destroyer britannique'],
  [126, 'Marie',                    '51.08.967', '2.33.767', 'cargo',    null, null,  false, null],
  [127, 'Marthe',                   '51.09.130', '2.13.080', 'cargo',    null, null,  false, 'Quatre-mâts. Fiche : dkepaves.free.fr/html/marthe.htm'],
  [128, 'Melrose',                  '51.20.801', '02.10.653','cargo',    null, null,  false, null],
  [129, 'Mistwrak',                 '51.24.53',  '2.32.88',  'autre',    null, null,  false, null],
  [130, "Mona's Queen",             '51.04.10',  '2.23.38',  'passager', 1940, 10,    true,  'Ferry Isle of Man, Opération Dynamo'],
  [131, 'Mont Louis',               '51.21.560', '02.55.770','cargo',    null, null,  false, null],
  [132, 'Montrose',                 '51.3.383',  '2.6.950',  'passager', null, null,  false, null],
  [133, 'Moussaillon',              '51.07.31',  '2.08.49',  'chalk',    null, null,  false, 'Chalutier répertorié Dunkerque Plongée'],
  [134, 'N 7 Nordwarff',            '51.14.270', '02.54.240','chalk',    null, null,  false, 'Chalutier néerlandais (imm. Flessingue)'],
  [135, 'N 12',                     '51.23.504', '03.03.038','chalk',    null, null,  false, null],
  [136, 'N 147 Suzanna',            '51.21.530', '02.22.190','chalk',    null, null,  false, null],
  [137, 'N 591 Dageraad',           '51.24.309', '02.29.504','chalk',    null, null,  false, null],
  [138, 'N 741 Hoop op Vrede',      '51.17.167', '02.52.985','chalk',    null, null,  false, null],
  [139, 'Nashaba',                  '51.22.363', '2.54.528', 'cargo',    null, null,  false, null],
  [140, 'Neutron',                  '51.23.064', '03.01.842','cargo',    null, null,  false, null],
  [141, 'Nauticus Ena',             '51.18.020', '2.52.862', 'cargo',    null, null,  false, null],
  [142, 'Niger',                    '51.02.31',  '2.09.22',  'dd',       null, null,  false, null],
  [143, 'Nippon',                   '51.22.716', '03.05.202','cargo',    null, null,  false, null],
  [144, 'Normannia',                '51.03.90',  '2.14.45',  'passager', null, null,  false, null],
  [145, 'North Star',               '51.21.750', '03.12.900','cargo',    null, null,  false, null],
  [146, 'ND de Lorette',            '51.04.30',  '2.20.05',  'cargo',    null, null,  false, null],
  [147, 'O 73 Renilde',             '51.18.788', '02.56.751','chalk',    null, null,  false, 'Chalutier belge (Ostende)'],
  [148, 'O 76 Noordster',           '51.17.320', '02.56.460','chalk',    null, null,  false, 'Chalutier belge (Ostende)'],
  [149, 'O 82 Mariner',             '51.22.193', '02.34.454','chalk',    null, null,  false, 'Chalutier belge (Ostende)'],
  [150, 'O 137 Ste Thérèse',        '51.12.20',  '02.46.03', 'chalk',    null, null,  false, 'Chalutier belge (Ostende)'],
  [151, 'O 807 Maurice',            '51.18.422', '02.54.620','chalk',    null, null,  false, 'Chalutier belge (Ostende)'],
  [152, 'O 818 Lucie Jenny II',     '51.16.48',  '02.41.53', 'chalk',    null, null,  false, 'Chalutier belge (Ostende)'],
  [153, 'Orion',                    '51.15.200', '02.56.721','cargo',    null, null,  false, null],
  [154, 'Oskobel',                  '51.22.001', '02.50.982','cargo',    null, null,  false, null],
  [155, 'Paris',                    '51.10.995', '02.07.620','passager', 1940, null,  true,  'Paquebot français. Fiche : dkepaves.free.fr/html/paris.htm. Opération Dynamo.'],
  [156, 'Peppinella',               '51.24.341', '2.15.087', 'cargo',    null, null,  false, null],
  [157, 'Plumpton',                 '51.14.580', '02.55.650','cargo',    null, null,  false, null],
  [158, 'Polly Johnson',            '51.09.91',  '2.43.02',  'cargo',    null, null,  false, null],
  [159, 'Port de Beyrouth',         '51.3.033',  '2.23.133', 'cargo',    null, null,  false, null],
  [160, 'Portrieux',                '51.00.417', '2.3.400',  'cargo',    null, null,  false, null],
  [162, 'Princess Astrid',          '51.03.78',  '2.12.78',  'passager', 1940, null,  true,  'Ferry belge Princess Astrid, Opération Dynamo'],
  [163, 'Putten',                   '51.15.600', '02.50.690','cargo',    null, null,  false, null],
  [164, 'Queen of the Channel',     '51.18.477', '2.43.319', 'passager', 1940, null,  true,  'Paquebot, Opération Dynamo'],
  [165, 'Quo Vadis',                '51.23.077', '02.31.979','cargo',    null, null,  false, null],
  [166, 'Raumboote R44-R101',       '51.09.98',  '02.37.09', 'lct',      null, null,  false, 'Vedettes rapides allemandes R44 et R101'],
  [167, 'Redcar',                   '51.03.758', '02.06.961','cargo',    null, null,  false, null],
  [168, 'Richard II',               '51.14.46',  '02.54.87', 'cargo',    null, null,  false, null],
  [169, 'Rio Bravo',                '51.17.350', '02.58.470','cargo',    null, null,  false, null],
  [170, 'Rita',                     '51.16.742', '02.41.326','cargo',    null, null,  false, null],
  [171, 'Robert L. Vann',           '51.22.807', '02.47.202','cargo',    null, null,  false, null],
  [172, 'Ruytingen',                '51.05.285', '02.28.429','chalk',    null, 31,    false, 'Chalutier à vapeur, 31m de fond, incliné sur bâbord. Recouverte de moules.'],
  [173, 'Sab',                      '51.13.282', '2.31.069', 'autre',    null, null,  false, null],
  [174, 'Saint Abbs',               '51.04.95',  '2.27.57',  'cargo',    1940, null,  true,  'Opération Dynamo'],
  [175, 'Saint Achilleus',          '51.12.70',  '02.33.28', 'cargo',    null, null,  false, null],
  [176, 'Sainte Camille',           '51.04.50',  '2.21.90',  'cargo',    null, null,  false, null],
  [177, 'Saint Corentin',           '51.03.850', '2.10.800', 'chalk',    null, null,  false, null],
  [178, 'Saint Fagan',              '51.04.31',  '2.24.48',  'lct',      1940, 22,    true,  'Navire de sauvetage armé (43.6m × 8.85m), mine le 1er juin 1940 à 3h50. Retrouvé 2016 au magnétomètre.'],
  [179, 'Saint Pierre (avant)',     '51.02.468', '2.06.367', 'cargo',    null, null,  false, 'Épave brisée en deux — partie avant'],
  [180, 'Saint Pierre (arrière)',   '51.02.441', '2.06.023', 'cargo',    null, null,  false, 'Épave brisée en deux — partie arrière'],
  [181, 'Sampa',                    '51.24.203', '02.53.147','cargo',    null, null,  false, null],
  [182, 'Samselbu',                 '51.22.917', '03.07.870','cargo',    null, null,  false, null],
  [183, 'Samsip (1ère partie)',     '51.23.471', '03.02.979','cargo',    null, null,  false, null],
  [184, 'Samsip (2ème partie)',     '51.23.510', '03.03.037','cargo',    null, null,  false, null],
  [185, 'Samvern (W)',              '51.22.725', '3.04.426', 'cargo',    null, null,  false, 'Partie Ouest'],
  [186, 'Samvern (E)',              '51.23.400', '3.06.790', 'cargo',    null, null,  false, 'Partie Est'],
  [187, 'Sanda',                    '51.12.011', '02.42.736','cargo',    null, null,  false, null],
  [188, 'S 20',                     '51.31.79',  '02.52.12', 'dd',       null, null,  false, 'S-Boot (Schnellboot) allemand'],
  [189, 'S 168',                    '51.31.680', '02.32.400','dd',       null, null,  false, 'S-Boot (Schnellboot) allemand'],
  [190, 'Schnellboot 220',          '51.16.43',  '02.52.28', 'dd',       null, null,  false, 'Vedette lance-torpilles allemande S-220'],
  [191, 'Schnellboot (A)',          '51.29.71',  '02.30.17', 'dd',       null, null,  false, 'Vedette lance-torpilles allemande'],
  [192, 'Schnellboot (B)',          '51.10.18',  '02.22.95', 'dd',       null, null,  false, 'Vedette lance-torpilles allemande'],
  [193, 'Scotia',                   '51.06.53',  '2.11.12',  'passager', 1940, null,  true,  'Paquebot LMS Scotia, Opération Dynamo'],
  [194, 'Seahunter N 52',           '51.17.291', '02.28.338','chalk',    null, null,  false, null],
  [195, 'Seeadler',                 '50.48.0',   '1.32.0',   'dd',       null, null,  false, 'Torpilleur allemand'],
  [196, 'Senator Holthusen',        '51.19.707', '02.49.298','cargo',    null, null,  false, null],
  [197, 'Senator Sthamer',          '51.19.900', '02.56.440','cargo',    null, null,  false, null],
  [198, 'Sigurd Faulbaums',         '51.20.091', '2.36.907', 'cargo',    null, null,  false, null],
  [199, 'Sint Annaland',            '51.22.98',  '02.00.14', 'cargo',    null, null,  false, null],
  [200, 'Sirius',                   '51.14.800', '02.56.270','cargo',    null, null,  false, null],
  [201, 'Siroco',                   '51.18.95',  '02.14.13', 'dd',       1940, null,  true,  'Contre-torpilleur français, Opération Dynamo. Fiche : dkepaves.free.fr.'],
  [202, 'Skipjack',                 '51.05.285', '2.28.429', 'dd',       1940, null,  true,  'HMS Skipjack, dragueur de mines britannique, Opération Dynamo'],
  [204, 'Solent',                   '51.21.855', '03.10.622','cargo',    null, null,  false, null],
  [205, 'Sperrbrecher 141 (Lies)',  '51.17.693', '2.49.594', 'cargo',    null, null,  false, 'Navire brise-mines armé allemand (ex Lies)'],
  [206, 'Sperrbrecher 142',         '51.16.658', '2.49.801', 'cargo',    null, null,  false, 'Navire brise-mines armé (ex Westerbroek)'],
  [207, 'Sperrbrecher 143 (Lola)',  '51.13.23',  '02.44.30', 'cargo',    null, null,  false, 'Navire brise-mines armé allemand (ex Lola)'],
  [209, 'Stella Dorado',            '51.16.620', '2.15.790', 'cargo',    null, null,  false, null],
  [210, 'Stephanie II',             '51.21.168', '03.04.674','cargo',    null, null,  false, null],
  [211, 'Sterre D. Zee',            '51.04.083', '2.26.133', 'cargo',    null, null,  false, null],
  [212, 'Thuringia',                '51.20.56',  '02.02.44', 'cargo',    null, null,  false, null],
  [213, 'Torpilleur nr 319',        '51.12.56',  '02.38.71', 'dd',       null, null,  false, null],
  [214, 'Treffry',                  '51.03.12',  '2.22.70',  'cargo',    null, null,  false, null],
  [215, 'Tricolor',                 '51.21.980', '2.12.790', 'cargo',    null, null,  false, null],
  [216, 'Trifels',                  '51.13.804', '02.22.104','cargo',    null, null,  false, 'Répertorié Dunkerque Plongée. Fiche : dkepaves.free.fr.'],
  [217, 'Tringa',                   '51.21.226', '02.26.269','cargo',    null, null,  false, null],
  [220, 'U 11',                     '51.20.550', '02.52.074','sub',      null, null,  false, 'Sous-marin allemand'],
  [221, 'UB 20',                    '51.21.190', '2.38.331', 'sub',      1917, null,  false, 'Sous-marin allemand type UB-II (1ère Guerre Mondiale)'],
  [222, 'UB 29',                    '51.09.24',  '01.43.22', 'sub',      null, 28,    false, 'Sous-marin allemand (1ère GM)'],
  [223, 'UC 14',                    '51.31.60',  '3.08.45',  'sub',      null, null,  false, 'Sous-marin poseur de mines allemand'],
  [224, 'UC 62',                    '51.26.84',  '02.20.07', 'sub',      null, null,  false, 'Sous-marin poseur de mines allemand'],
  [225, 'Vénus',                    '51.07.26',  '2.08.72',  'cargo',    null, null,  false, null],
  [226, 'Viiu (ex Flamma)',         '51.22.16',  '02.26.22', 'cargo',    null, null,  false, null],
  [227, 'Vissersschip',             '51.24.92',  '2.44.30',  'chalk',    null, null,  false, 'Navire de pêche (terme néerlandais)'],
  [229, 'Vonette',                  '51.04.697', '2.30.032', 'cargo',    1929, 2,     false, 'Trois-mâts goélette (Saint-Malo 1921), naufrage tempête 1929. Visible marée basse Zuydcoote.'],
  [230, 'Wakeful',                  '51.22.730', '02.43.360','dd',       1940, null,  true,  'HMS Wakeful, destroyer britannique, torpillé 29 mai 1940 — ~700 victimes'],
  [231, 'Wandelaar Lightschip',     '51.21.930', '02.59.020','autre',    null, null,  false, 'Bateau-feu du banc Wandelaar'],
  [233, 'Waverley',                 '51.17.020', '2.41.237', 'passager', 1940, null,  true,  'Paddle steamer, Opération Dynamo'],
  [234, 'Wessex',                   '51.0.0',    '1.48.0',   'dd',       1940, 36,    true,  'HMS Wessex D43, destroyer, coulé 25 mai 1940. Brisé au niveau chaudières. ⚠️ Munitions non explosées!'],
  [235, 'Westella',                 '51.24.97',  '02.13.32', 'chalk',    null, null,  false, 'Chalutier'],
  [236, 'Wheatberry',               '51.3.133',  '2.21.033', 'cargo',    null, null,  false, null],
  [237, 'Westhinder',               '51.22.878', '02.27.134','autre',    null, null,  false, 'Bateau-feu / lightship belge'],
  [238, 'Whitley',                  '51.09.07',  '2.39.56',  'cargo',    null, null,  false, null],
  [239, 'Wolf',                     '51.07.402', '2.29.889', 'dd',       1941, null,  false, 'Torpilleur allemand coulé à Dunkerque 1941'],
  [240, 'Z 428 Deo Gratias',        '51.30.40',  '02.08.18', 'chalk',    null, null,  false, 'Chalutier belge (Zeebrugge)'],
  [241, 'Z 438 Kompas',             '51.22.470', '03.06.580','chalk',    null, null,  false, 'Chalutier belge (Zeebrugge)'],
  [242, 'Z 442 André Jeannine',     '51.29.132', '03.06.424','chalk',    null, null,  false, 'Chalutier belge (Zeebrugge)'],
  [243, 'Z 577 Sabrina II',         '51.13.30',  '2.31.12',  'chalk',    null, null,  false, 'Chalutier belge (Zeebrugge)'],
  [245, 'Zuigbuis Deelnedt',        '51.14.740', '02.53.850','autre',    null, null,  false, null],
];

// ── Construction WRECKS ───────────────────────────────────────────────────
const DK_PORT = { lat: 51.038, lng: 2.367 };

function haversineKm(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lng - a.lng) * toR;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*toR)*Math.cos(b.lat*toR)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

const WRECKS = RAW.filter(r => r[4] !== 'autre').map(([id, name, latRaw, lngRaw, cat, year, depth, dynamo, note]) => {
  const lat = ddm(latRaw), lng = ddm(lngRaw);
  const d = { lat, lng };
  const km = haversineKm(DK_PORT, d);
  return {
    id, name, lat, lng,
    gps_raw: latRaw + ' N / ' + lngRaw + ' E',
    category: cat,
    sunk_year: year,
    depth_max: depth,
    op_dynamo: !!dynamo,
    note: note || null,
    species: speciesByDepth(depth),
    visible_low_tide: depth !== null && depth <= 3,
    dist_port_nm: Math.round(km / 1.852 * 10) / 10,
  };
});

const DK_CENTER = [51.12, 2.45];
const DK_ZOOM   = 9;

// ── Techniques de pêche par catégorie d'épave ─────────────────────────────
const TECHNIQUES = {
  dd: {
    tips: [
      { depth: [0, 22], techs: ['Jigging vertical (30–60 g)', 'Drop shot', 'Shad 12–15 cm'], note: 'Les superstructures métalliques (tourelles, cheminées) concentrent le lieu jaune. Jigging lent avec pause sur le fond.' },
      { depth: [22, 99], techs: ['Jigging lourd (80–150 g)', 'Verticale au vif', 'Bas de ligne plombé'], note: 'Gros congres dans les soutes et compartiments. Appât naturel (sardine, maquereau) très efficace. Jigging lent.' },
    ],
    saison: '🗓 Lieu jaune toute l\'année · Bar mai–sept · Congre été',
  },
  passager: {
    tips: [
      { depth: [0, 25], techs: ['Jigging', 'Traine profonde', 'Lancer-ramener (shad)'], note: 'Grandes surfaces = refuge pour bancs de lieus. Traine lente au-dessus de l\'épave, 2–3 m au-dessus.' },
      { depth: [25, 99], techs: ['Jigging lourd (100–200 g)', 'Drop shot profond', 'Vif au fond'], note: 'Paquebots profonds : grosses prises possibles. Cabillaud, raie, congre. Pêche lourde indispensable.' },
    ],
    saison: '🗓 Cabillaud nov–mars · Lieu jaune toute l\'année · Raie avr–sept',
  },
  cargo: {
    tips: [
      { depth: [0, 20], techs: ['Jigging léger', 'Drop shot', 'Lancer (shad 10 cm)'], note: 'Cargos peu profonds : bar et mulet en surface, lieu jaune sur structure. Attention aux nombreux accrochages.' },
      { depth: [20, 99], techs: ['Jigging 80–150 g', 'Verticale', 'Anchois/calmar fond'], note: 'Cargos profonds : congres et raies sous les tôles. Pêche lourde selon courant. Prévoir hameçons sacrifiés.' },
    ],
    saison: '🗓 Toute l\'année · Pic printemps & automne',
  },
  chalk: {
    tips: [
      { depth: [0, 20], techs: ['Jigging léger (20–50 g)', 'Shad 8–12 cm', 'Drop shot'], note: 'Petite structure mais très poissonneuse. Lieu jaune et bar autour de la coque. Chercher les treuils et mâts.' },
      { depth: [20, 99], techs: ['Jigging médium', 'Verticale', 'Bas de ligne anchois'], note: 'Chalutiers profonds : bon spot congre. Anchois ou bout de calmar en appât naturel sur le fond.' },
    ],
    saison: '🗓 Bar mai–sept · Lieu jaune toute l\'année',
  },
  sub: {
    tips: [
      { depth: [0, 30], techs: ['Jigging vertical', 'Verticale jig', 'Traine lente (3 kts)'], note: 'Silhouette allongée unique. Pêche au-dessus du kiosque et de la proue. Courant tourbillonnaire en arrière.' },
      { depth: [30, 99], techs: ['Jigging lourd (120 g+)', 'Pêche au fond', 'Longue ligne'], note: 'Profondeur importante — leurres lourds obligatoires. Congres massifs dans les torpilles. Pêche de nuit rentable.' },
    ],
    saison: '🗓 Jigging très efficace · Congre toute l\'année · Lieu jaune avril–oct',
  },
  lct: {
    tips: [
      { depth: [0, 15], techs: ['Jigging ultra-léger', 'Lancer-ramener', 'Pêche à l\'anglaise'], note: 'Épaves plates et peu profondes. Bar et mulet en surface. Pêche au posé si courant faible. Idéal au leurre souple.' },
      { depth: [15, 99], techs: ['Jigging médium', 'Drop shot', 'Bas de ligne plombé'], note: 'Lieu jaune et merlan en bancs. Pêche verticale efficace sur les angles de coque.' },
    ],
    saison: '🗓 Bar mai–sept · Surface idéale en été',
  },
  avion: {
    tips: [
      { depth: [0, 99], techs: ['Jigging ultra-léger (5–20 g)', 'Lancer fin', 'Drop shot délicat'], note: 'Petite structure — grande précision nécessaire. Bar curieux autour des ailes. Leurres petits (5–8 cm). Pêche sportive.' },
    ],
    saison: '🗓 Bar juin–sept · Pêche sportive light',
  },
  autre: {
    tips: [
      { depth: [0, 20], techs: ['Jigging léger', 'Drop shot', 'Shad 10 cm'], note: 'Explorer d\'abord à faible allure. Petits jigs pour sonder et éviter les accrochages sur structure inconnue.' },
      { depth: [20, 99], techs: ['Jigging médium/lourd', 'Verticale', 'Appât naturel fond'], note: 'Structure inconnue = accrochages possibles. Adapter le lest au courant, prévoir des hameçons sacrifiés.' },
    ],
    saison: '🗓 Variable selon profondeur',
  },
};

// ── Base espèces enrichie ─────────────────────────────────────────────────
const FISH_DB = {
  'Bar':        { emoji: '🐟', color: '#60a5fa', best: 'Mai – Septembre',  techs: ['Leurre souple', 'Popper', 'Jigging'] },
  'Lieu jaune': { emoji: '🐠', color: '#fbbf24', best: 'Toute l\'année',   techs: ['Jigging', 'Verticale', 'Drop shot'] },
  'Cabillaud':  { emoji: '🐡', color: '#a78bfa', best: 'Novembre – Mars',  techs: ['Fond plombé', 'Appât naturel', 'Bas de ligne'] },
  'Merlan':     { emoji: '🪼', color: '#94a3b8', best: 'Octobre – Avril',  techs: ['Drop shot', 'Fond', 'Traine légère'] },
  'Congre':     { emoji: '🐍', color: '#f43f5e', best: 'Toute l\'année',   techs: ['Vif au fond', 'Anchois', 'Calmar entier'] },
  'Raie':       { emoji: '🦈', color: '#fb923c', best: 'Avril – Septembre',techs: ['Fond plombé', 'Appât naturel', 'Longue ligne'] },
  'Mulet':      { emoji: '🐟', color: '#34d399', best: 'Mai – Octobre',    techs: ['Leurre fin', 'Pêche bread', 'Mouche'] },
  'Maquereau':  { emoji: '💙', color: '#00c2e0', best: 'Mai – Septembre',  techs: ['Ligne à plumes', 'Trainée', 'Leurre métallique'] },
};

function getTechniques(w) {
  const t = TECHNIQUES[w.category] || TECHNIQUES.autre;
  const depth = w.depth_max || 20;
  return t.tips.find(tip => depth >= tip.depth[0] && depth <= tip.depth[1]) || t.tips[t.tips.length - 1];
}
