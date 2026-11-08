# Puls og blodtrykk

En interaktiv nettside på bokmål som forklarer forskjellen mellom puls og blodtrykk.
Tesen er enkel: **Puls er hvor ofte. Blodtrykk er hvor hardt.**

Siden har en 3D-modell av hjertet og arteriene som man kan klikke seg inn i. Den har også en monitor
med trykkurve, glidebrytere og situasjoner, en sammenligning side om side, en veiledning i å måle riktig
og referanseverdier med kilder.

Siden er helt statisk. Den bygges med Vite, TypeScript og Three.js, uten andre rammeverk.

## Kom i gang

```bash
npm install
npm run dev        # utviklingsserver på http://localhost:5173
npm run build      # typesjekk og bygg til dist/
npm run preview    # server dist/ på http://localhost:4173
```

Node 20 eller nyere. Bygget er testet med Node 22.

### Tester og skjermbilder

```bash
npm run build
npx playwright test --trace off          # funksjonstester, desktop og mobil
npm run preview &                        # i et eget vindu
node tests/screenshots.mjs               # skjermbilder til screenshots/
```

`tests/screenshots.mjs` tar bilder i 1280×900 og 390×844, i lyst og mørkt tema, av oversikten og hver av
de fem delene. Den melder fra om feil i konsollen og om vannrett rulling. Playwright bruker nettleseren som
følger med `@playwright/test`. Uten skjermkort gjengis WebGL i programvare (SwiftShader).

`tests/debug-shot.mjs` tar ett bilde av én visning og kan kjøre kode i siden først. Den er nyttig ved feilsøking.

`tests/e2e.spec.ts` sjekker blant annet:

- ingen feil i konsollen og ingen vannrett rulling
- total nedlasting under 3 MB
- fanene kan brukes med tastatur
- alle knapper har et tilgjengelig navn
- klikk på etikett og klikk på selve modellen velger riktig del
- minst 20 mmHg mellom systolisk og diastolisk trykk
- blodtrykksmålingen gir en avlesning nær monitorens verdi
- pulstelleren teller i 15 sekunder og ganger med 4
- redusert bevegelse starter på pause
- lerretet har `touch-action: pan-y`

### Bygge 3D-modellen på nytt

Den ferdige modellen ligger i `public/models/heart.glb`. Den kan lages på nytt fra originalen:

```bash
npm run model
```

Skriptet `scripts/build-model.mjs` leser `models/source/nih-22787-heart.glb` og skriver både modellen og
`src/scene/heart-anchors.json`, som sier hvor aortastumpene er.

## Publisering

Bygget i `dist/` kan legges på en hvilken som helst statisk vert.

**Siden er ikke publisert.** Oppdraget var å publisere til Cloudflare Pages hvis wrangler var
konfigurert. Wrangler var ikke satt opp i prosjektet. Cloudflare-nøkkelen i arbeidsmiljøet ga tilgang til
Workers og R2, men ikke til Pages (API-et svarte «Authentication error»). Derfor stoppet arbeidet etter
bygget.

### Cloudflare Pages

```bash
npm run build
npx wrangler login                    # eller sett CLOUDFLARE_API_TOKEN med tilgangen «Pages: Edit»
npx wrangler pages project create puls-og-blodtrykk --production-branch main
npx wrangler pages deploy dist --project-name puls-og-blodtrykk
```

Siden blir da tilgjengelig på `https://puls-og-blodtrykk.pages.dev`. Du kan også koble GitHub-repoet til
Pages i Cloudflare-dashbordet, med byggekommandoen `npm run build` og mappen `dist`.

### Cloudflare Workers, som alternativ

Nøkkelen som finnes, har tilgang til Workers. Cloudflare anbefaler nå Workers med statiske filer også for
rene nettsider:

```bash
npm run build
npx wrangler deploy --name puls-og-blodtrykk --assets dist --compatibility-date 2026-11-01
```

## Valg som er tatt

### Prototypen fantes ikke

Oppdraget viste til `puls-og-blodtrykk.html` som fasit. Filen lå ikke i prosjektmappen, og repoet var tomt.
Den fantes heller ikke andre steder på maskinen. Siden er derfor bygget ut fra beskrivelsen i oppdraget:
tekster, tallverdier, situasjoner, fysiologimodell, design og interaksjon. Der beskrivelsen ikke sa noe,
er valgene skrevet ned her. Sammenlign gjerne med prototypen og meld fra om avvik.

### 3D-modellen av hjertet

- **Kilde:** «Human Heart 3d Model» fra NIH 3D, oppføring 3DPX-022787, versjon 2. Lisensen ble kontrollert
  8. november 2026. Feltet sier «Public Domain» og lenker til CC0 1.0. Modellen ble derfor brukt, og
  Z-Anatomy trengtes ikke.
- **Nedlasting:** Den direkte S3-lenken gir «Access Denied». Filen ble hentet gjennom NIH 3D sitt eget
  nedlastings-API (`/api/download?submissionId=37664&fileIds=1448470`), som er det nettstedet selv bruker.
- **Modellen er ett mesh.** Den har ikke egne deler for forkamre, kamre eller kransårer. Kransårene er bare
  malt i teksturen. Sammentrekningen styres derfor av høyden i modellen. Kamrene, fra spissen og opp til
  klaffeplanet, trekker seg sammen 7 prosent mot midten i systole. Et belte over dem, forkamrene, trekker
  seg sammen 8 prosent like før kamrene, ca. 0,08 s før slaget. De store karene øverst står stille.
- **Gløden** er svak og rød, og gjelder bare den røde hjertemuskelen i kamrene. Ellers ble de blå
  hulvenene og lungearteriene lilla i systole.
- **Aortabuen er fjernet fra modellen.** Modellen har sin egen aortabue med tre greiner. Den kan ikke
  vise pulsbølgen, fordi den ikke er bygget i kode. Skriptet fjerner derfor alle trekanter over et vannrett
  snitt som ikke er blå (aorta er rød, hulvenen og lungearteriene er blå i teksturen). Igjen står to
  stumper: den oppadgående og den nedadgående aorta. Skriptet finner senter og største radius for begge.
  Aortarøret i koden starter inne i den oppadgående stumpen, litt videre enn den, og går gjennom den
  nedadgående. Slik ser det ut som aorta kommer ut av hjertet.
- **Konvertering:** sveising, forenkling med meshoptimizer til ca. 60 000 trekanter, glatte normaler
  (modellen hadde ingen), rotasjon og skala inn i scenen, teksturer krympet til 1024 og 512 piksler som
  WebP, og meshopt-komprimering. Resultatet er 648 KB, mot 3,9 MB for originalen. Meshopt ble valgt fremfor
  Draco fordi dekoderen er liten og følger med Three.js.
- **Plassering:** Modellens forside vender mot +z, spissen peker ned mot personens venstre side, og hjertet
  er helt 0,2 radianer ekstra. Én enhet i scenen er ca. 5 cm, så hjertet er ca. 12 cm høyt.

### Anatomi bygget i kode

- **Arteriene** er rør langs Catmull-Rom-kurver: aorta med bue og nedadgående del, truncus
  brachiocephalicus med høyre halspulsåre, høyre arteria subclavia, venstre halspulsåre og arterien ut i
  venstre arm til håndleddet (arteria subclavia, axillaris, brachialis og radialis). Hvert hjørnepunkt har
  avstanden fra hjertet langs arteriene, radius og om det ligger i armen, som attributter.
- **Pulsbølgen** er en forskyvning langs rørets normal i skyggeleggeren. Den styres av alderen og styrken
  (pulstrykket) til de seks siste slagene. Profilen har en bratt front (0,34 enheter) og en hale som dør ut
  eksponentielt (1,75 enheter). Bølgen går 8,5 enheter i sekundet. Med 5 cm per enhet er det ca. 0,4 m/s,
  altså bremset ned 15 til 25 ganger.
- **Blodstrømmen** vises som svake striper som går 0,4 til 1,5 enheter i sekundet, raskest i systole.
- **Kroppen** er en gjennomsiktig overkropp med hals, venstre arm og hånd, med lys kant (fresnel). Arteriene
  og hjertet tegnes etter kroppen, så kanten ikke farger dem.
- **Mansjetten** sitter på overarmen. Den er halvgjennomsiktig, så du ser arterien inni. Den blåses opp
  etter mansjettrykket. Arterien under klemmes sammen når mansjettrykket er høyere enn trykket i arterien
  akkurat der, og åpner seg kort på toppen av hvert slag. Bølgen forbi mansjetten dempes med
  (systolisk minus mansjettrykk) delt på pulstrykket.
- **Arterieveggen** er et forstørret utsnitt med en kile skåret bort. Den har intima, media (med fem
  elastiske lag) og adventitia, blodlegemer som strømmer raskest i midten, og 15 trykkpiler. Pilene er
  lengst ved systolisk trykk og kortest ved diastolisk. Lengden følger det absolutte trykket, så høyt
  blodtrykk gir lengre piler. Veggen utvider seg litt i systole. En stiplet linje viser hvor utsnittet er
  hentet fra.
- **Håndleddet** har to fingre som ligger på tvers over arteria radialis. En ring brer seg ut når bølgen
  når frem, og den er svakere når mansjetten demper bølgen.

### Fysiologi

- **Én felles tilstand** (`src/physiology.ts`) styrer både 3D-modellen, monitoren, tesen øverst og panelet.
  Verdiene glir mot nye mål med en tidskonstant på ca. 1,1 s.
- **Trykkurven** per slag: stigning til systolisk trykk på 36 prosent av systolen, avrundet topp, fall til
  innsnittet, et dikrotisk innsnitt med en liten tilbakebølge, og eksponentielt fall mot diastolisk trykk
  ved slutten av slaget. Hvert slag starter fra trykket der forrige slag var, så kurven henger sammen også
  når verdiene endres.
- **Systole** varer 0,30 s ved puls 66 og blir 0,0006 s kortere per slag over det, mellom 0,22 og 0,32 s.
- **Glidebrytere:** puls 40 til 180, systolisk 90 til 200, diastolisk 50 til 120. Det er alltid minst
  20 mmHg mellom dem. Bryteren du drar i, bestemmer, og den andre flyttes.
- **Situasjoner:** I ro (66, 116/68), Løpetur (150, 165/74), Godt trent (46, 114/68), Høyt blodtrykk
  (70, 158/98), Væsketap (118, 92/58) og Nervøs hos legen (94, 146/90). Tekstene er skrevet ut fra
  beskrivelsen, fordi prototypen manglet.
- **Blodtrykksmålingen** blåses opp til systolisk trykk pluss 30, rundet opp til nærmeste 10. Luften
  slippes ut med 4 mmHg i sekundet, raskere enn anbefalt 2 mmHg i sekundet, så man slipper å vente. Dette
  står også på siden. En Korotkoff-lyd høres når bølgen når mansjetten og mansjettrykket ligger mellom
  diastolisk og systolisk trykk. Første lyd gir systolisk, siste lyd gir diastolisk, rundet til partall.
  Viseren svinger litt med pulsen, mest rundt middeltrykket. Lyden er av som standard.
- **Pulstelleren** teller bølgene som når håndleddet i 15 sekunder av simuleringstiden og ganger med 4.
  Står mansjetten oppblåst, når ikke pulsen frem.

### Merkelapper og referanseverdier

Referanseverdiene ble kontrollert 8. november 2026:

- **ESC 2024** (McEvoy mfl., European Heart Journal 2024;45(38):3912), tabell 5: ikke forhøyet under
  120/70, forhøyet 120 til 139 eller 70 til 89, høyt 140/90 eller mer. Hjemme 135/85 eller mer, døgn
  130/80 eller mer. Målemetoden i avsnitt 5.2: 5 minutters hvile, ryggen støttet, armen i hjertehøyde,
  tre målinger med 1 til 2 minutter mellom og snitt av de to siste. Alt stemte med oppdraget.
- **Lavt blodtrykk under 90/60** står ikke hos NHI eller i Norsk elektronisk legehåndbok. NHI omtaler bare
  fall i blodtrykk når man reiser seg. Grensen er derfor hentet fra Store medisinske leksikon. Det står på
  siden.
- **Hvilepuls 60 til 100** følger oppdraget. NHI-sidene trekker grensen for lav puls ulikt: under 60 på én
  side, under 50 på andre. Siden sier at kildene trekker grensen litt ulikt.
- **NHI og NEL** bruker fortsatt 140/90 som grense og har ikke tatt inn kategorien «forhøyet» fra ESC 2024.
  Siden følger ESC 2024, som oppdraget sa. NHI anbefaler 10 minutters hvile før måling, ESC sier 5. Siden
  sier minst 5.
- **Telling i 15 sekunder ganger 4** er bekreftet hos NHI. Rådet om å telle et helt minutt ved ujevn puls
  er vanlig klinisk praksis, men ble ikke funnet ordrett hos NHI eller NEL.
- **Tømmehastighet:** AHA 2019 anbefaler 2 mmHg i sekundet. Siden sier 2, ikke 2 til 3.
- NEL har betalingsmur, så bare den åpne oppsummeringen kunne leses. NHI forbyr kopiering av tekst, så
  alle tekster er skrevet med egne ord.

Klassifiseringen på siden:

- Hvilepuls: lav under 60, normal 60 til 100, høy over 100.
- Blodtrykk: høyt hvis systolisk 140 eller mer eller diastolisk 90 eller mer. Ellers lavt hvis systolisk
  under 90 eller diastolisk under 60. Ellers forhøyet hvis systolisk 120 eller mer eller diastolisk 70 eller
  mer. Ellers ikke forhøyet.

### Design

- Anatomisk atlas på EKG-papir. Rutenettet er laget med CSS-gradienter. Figurene er nummerert som i et
  atlas (Fig. 1 til 5, og 1a til 1e for delene).
- Pulsen er karmosinrød, blodtrykket er blått. Lyst og mørkt tema bruker CSS-variabler og følger
  systeminnstillingen. 3D-scenen og monitoren leser de samme variablene.
- Skriftene er Schibsted Grotesk (variabel vekt), Newsreader og IBM Plex Mono. De lastes fra samme server
  via Fontsource-pakkene, ikke fra Google Fonts. Det sparer en tredjepart og er bedre for personvernet.
  Bare de latinske delene lastes ned.
- Ordet «hardt» i tesen går fra vekt 400 til 900 i takt med trykket i arteriene. Plassen til den tykkeste
  vekten er reservert, så linjen ikke hopper. Streken under «ofte» blinker ved hvert slag.
- Den gjennomsiktige kroppen har lys kant i mørkt tema. I lyst tema er kanten blågrå, ellers ville den ikke
  synes mot det lyse papiret.

### Interaksjon

- Klikkbare deler: Hjertet, Aorta, Arterieveggen, Mansjetten og Håndleddet, i tillegg til Oversikt. Man
  kan klikke på modellen, på etikettene eller på fanene i panelet. Kameraet glir inn til en fast visning
  på 1,15 s. Avstanden regnes ut fra lerretets størrelse, så delen får plass både på mobil og desktop.
- Klikk på modellen treffer enkle, usynlige former for hjertet og håndleddet. Det er raskere og lettere å
  treffe på mobil enn 60 000 trekanter.
- Dra for å rotere. På berøringsskjerm roterer bare vannrett dra, så loddrett sveip ruller siden
  (`touch-action: pan-y`). Knip med to fingre zoomer. På styreflate zoomer knip (ctrl og hjul), mens vanlig
  hjul ruller siden.
- Knapper for Oversikt, zoom ut, zoom inn og pause. Det er også en pauseknapp på monitoren. Begge styrer
  samme tilstand.
- Etikettene er knapper som følger delene. De flyttes loddrett så de ikke dekker hverandre, og bytter side
  hvis de ellers ville gått utenfor bildet. I visningen av arterieveggen vises også etiketter for de tre
  lagene.
- Ved `prefers-reduced-motion` starter animasjonen på pause, og kameraet hopper rett til ny visning.

### Ytelse

- 3D-scenen lastes som egen fil etter resten av siden.
- Scenen tegnes bare når den er synlig (IntersectionObserver), og bare når noe har endret seg. På pause
  tegnes den bare når kameraet beveger seg. Monitoren gjør det samme.
- `devicePixelRatio` er begrenset til 2, både i 3D og på monitoren.
- Mister nettleseren WebGL-konteksten, tegnes scenen på nytt når den kommer tilbake.

Størrelser i bygget, målt 8. november 2026:

| Fil | Størrelse |
| --- | --- |
| Hjertemodell (GLB) | 648 KB |
| 3D-scenen med Three.js | 688 KB (175 KB med gzip) |
| Resten av JavaScript | 30 KB |
| CSS | 28 KB |
| Skrifter (bare latinske deler lastes ned) | ca. 200 KB |
| HTML | 17 KB |

Playwright måler at siden laster ned 1 620 KB totalt, ukomprimert. Grensen er 3 MB. Med komprimering
fra serveren blir det mindre.

### Tilgjengelighet

- Panelet er en fanegruppe (`role="tablist"`) som kan brukes med piltastene, Home og End.
- Alle knapper har tilgjengelige navn. Pauseknappene sier om de pauser eller spiller av.
- Synlig fokus med en tykk ring.
- Glidebryterne har tekst som leses opp med enhet.
- Statusen for målingen og resultatet av tellingen leses opp (`aria-live`).
- Siden har en lenke for å hoppe rett til modellen.

## Struktur

```
index.html              Innhold og struktur
src/main.ts             Oppstart og hovedløkke
src/physiology.ts       Felles tilstand, trykkurve og klassifisering
src/store.ts            Valgt del, hendelser og avstander langs arteriene
src/content.ts          Tekster for delene og situasjonene
src/monitor.ts          Trykkurven på EKG-papir
src/controls.ts         Glidebrytere, situasjoner og levende tall
src/panel.ts            Faner, tekst, manometer og pulsteller
src/measurement.ts      Blodtrykksmåling med mansjett
src/counter.ts          Pulstelling i 15 sekunder
src/hero.ts             Tesen øverst
src/audio.ts            Korotkoff-lyder
src/scene/              3D-scenen
  index.ts              Oppsett, klikk, dra, knip og tegning
  anatomy.ts            Koordinater og arterier
  geometry.ts           Rør, kroppsformer og veggutsnitt
  materials.ts          Skyggeleggere for arterier og kropp
  heart.ts              Lasting og hjerteslag
  body.ts, cuff.ts, wall.ts, wrist.ts
  camera.ts             Visninger og kamerabevegelse
  labels.ts             Etiketter
scripts/build-model.mjs Konvertering av hjertemodellen
models/source/          Originalmodellen fra NIH 3D
public/models/          Ferdig modell
tests/                  Playwright-tester og skjermbildeskript
```

## Hva som gjenstår

- Sammenligne med den ekte prototypen når den finnes, og justere tekster og tall.
- Publisere, se over.
- Teste på ekte mobiltelefoner. Testene er kjørt i Chromium med WebGL i programvare.
