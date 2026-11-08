// Tekster for delene i 3D-modellen og situasjonene på monitoren.
// Språkregler: bokmål, korte setninger, ingen tankestreker.

export type PartId = 'oversikt' | 'hjertet' | 'aorta' | 'veggen' | 'mansjetten' | 'handleddet';

export interface PartText {
  id: PartId;
  name: string;
  kicker: string;
  paragraphs: string[];
}

export const PARTS: PartText[] = [
  {
    id: 'oversikt',
    name: 'Oversikt',
    kicker: 'Fig. 1',
    paragraphs: [
      'Hvert hjerteslag sender en trykkbølge ut i arteriene.',
      'Pulsen er hvor mange slike bølger som kommer i minuttet. Blodtrykket er hvor høyt trykket er på toppen og i bunnen av hver bølge.',
      'Klikk på en del av modellen for å se nærmere.',
    ],
  },
  {
    id: 'hjertet',
    name: 'Hjertet',
    kicker: 'Fig. 1a',
    paragraphs: [
      'Hjertet er en muskel med fire rom. Først trekker forkamrene seg sammen. Like etter trekker kamrene seg sammen og presser blodet ut i aorta. Det kalles systole.',
      'Så slapper hjertet av og fylles med blod igjen. Det kalles diastole.',
      'Hvor ofte dette skjer, er pulsen. Hvor hardt blodet presses ut, merkes som trykk i arteriene.',
    ],
  },
  {
    id: 'aorta',
    name: 'Aorta',
    kicker: 'Fig. 1b',
    paragraphs: [
      'Aorta er kroppens største arterie. Veggen er elastisk og strekker seg når blodet presses inn.',
      'Trykket stiger raskt til det systoliske trykket. Så synker det langsomt mot det diastoliske, mens veggen trekker seg sammen og skyver blodet videre.',
      'Trykkbølgen går mye raskere enn selve blodet. I virkeligheten går bølgen 5 til 10 meter i sekundet. Her er den bremset ned så du kan se den. De svake stripene viser blodet, som flyter mye saktere.',
    ],
  },
  {
    id: 'veggen',
    name: 'Arterieveggen',
    kicker: 'Fig. 1c',
    paragraphs: [
      'Arterieveggen har tre lag. Intima er et tynt og glatt innerlag. Media er et tykt lag med muskelceller og elastiske fibre. Adventitia er et ytre lag av bindevev.',
      'Blodtrykket er kraften blodet presser mot denne veggen med. Pilene viser trykket. De er lengst ved det systoliske trykket og kortest ved det diastoliske.',
      'Er trykket høyt i mange år, blir veggen tykkere og stivere.',
    ],
  },
  {
    id: 'mansjetten',
    name: 'Mansjetten',
    kicker: 'Fig. 1d',
    paragraphs: [
      'Mansjetten blåses opp til arterien i overarmen klemmes helt sammen. Så slippes luften sakte ut.',
      'Når trykket i mansjetten faller under det systoliske trykket, presses litt blod forbi i hvert slag. Det gir bankelyder, kalt Korotkoff-lyder. Når lydene forsvinner, er mansjettrykket under det diastoliske trykket.',
    ],
  },
  {
    id: 'handleddet',
    name: 'Håndleddet',
    kicker: 'Fig. 1e',
    paragraphs: [
      'Pulsen kjenner du der en arterie ligger nær huden. På innsiden av håndleddet, på tommelsiden, ligger arteria radialis.',
      'Legg pekefinger og langfinger lett over arterien. Tell slagene i 15 sekunder og gang med 4. Er pulsen ujevn, tell i et helt minutt.',
    ],
  },
];

export interface Scenario {
  id: string;
  name: string;
  hr: number;
  sys: number;
  dia: number;
  text: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'ro',
    name: 'I ro',
    hr: 66,
    sys: 116,
    dia: 68,
    text: 'Du sitter stille. Hjertet slår rolig, og trykket er normalt.',
  },
  {
    id: 'lop',
    name: 'Løpetur',
    hr: 150,
    sys: 165,
    dia: 74,
    text: 'Musklene trenger mer oksygen. Hjertet slår oftere og hardere. Det systoliske trykket stiger mye, mens det diastoliske endrer seg lite. Det er normalt under trening.',
  },
  {
    id: 'trent',
    name: 'Godt trent',
    hr: 46,
    sys: 114,
    dia: 68,
    text: 'Et trent hjerte pumper mer blod i hvert slag. Da trengs færre slag i hvile. Her er lav puls et tegn på god form, ikke på sykdom.',
  },
  {
    id: 'hoyt',
    name: 'Høyt blodtrykk',
    hr: 70,
    sys: 158,
    dia: 98,
    text: 'Pulsen er normal, men trykket er høyt. Det kjennes sjelden. Over tid sliter det på hjertet og årene. Derfor er det lurt å måle blodtrykket.',
  },
  {
    id: 'vaesketap',
    name: 'Væsketap',
    hr: 118,
    sys: 92,
    dia: 58,
    text: 'Det er mindre blod i årene, og trykket faller. Hjertet slår raskere for å holde blodet i gang. Høy puls og lavt trykk sammen kan være et faresignal.',
  },
  {
    id: 'nervos',
    name: 'Nervøs hos legen',
    hr: 94,
    sys: 146,
    dia: 90,
    text: 'Stress gir høyere puls og høyere trykk. Det kalles hvitfrakkeeffekt. Derfor bør et høyt blodtrykk bekreftes med flere målinger, gjerne hjemme.',
  },
];
