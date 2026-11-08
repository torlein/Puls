# Kreditering

## 3D-modell av hjertet

- **Tittel:** Human Heart 3d Model
- **Laget av:** Biology Notes Online (https://biologynotesonline.com/)
- **Publisert på:** NIH 3D, oppføring 3DPX-022787, versjon 2 (publisert 7. oktober 2026)
  https://3d.nih.gov/entries/22787
- **Lisens:** CC0 1.0 Universal (Public Domain Dedication)
  https://creativecommons.org/publicdomain/zero/1.0/
- **Kontrollert:** 8. november 2026. Lisensfeltet på NIH 3D er «Public Domain» og lenker til CC0 1.0.
- **Endringer:** Modellens egen aortabue og avgreninger er fjernet, slik at aorta kan bygges i kode og
  fortsette fra stumpen. Modellen er forenklet fra ca. 150 000 til ca. 60 000 trekanter, har fått glatte
  normaler, er rotert og skalert inn i scenen, har fått teksturer krympet til WebP og er komprimert med
  meshopt. Se `scripts/build-model.mjs`.

CC0 krever ikke kreditering, men vi oppgir kilden likevel. Originalfilen ligger i `models/source/`.

## Resten av 3D-scenen

Arteriene, kroppen, mansjetten, veggutsnittet og håndleddet er laget i kode for dette prosjektet.

## Skrifter

Alle skriftene er lastet ned fra npm via Fontsource og ligger på samme server som siden.

- **Schibsted Grotesk** av Schibsted. SIL Open Font License 1.1.
- **Newsreader** av Production Type. SIL Open Font License 1.1.
- **IBM Plex Mono** av IBM. SIL Open Font License 1.1.

## Programvare

- **Three.js** (MIT). 3D-gjengivelse, GLTFLoader og meshopt-dekoderen.
- **glTF Transform** av Don McCurdy (MIT). Konvertering og optimalisering av modellen.
- **meshoptimizer** av Arseny Kapoulkine (MIT). Forenkling og komprimering.
- **sharp** (Apache 2.0). Konvertering av teksturer.
- **Vite** (MIT) og **TypeScript** (Apache 2.0). Bygging.
- **Playwright** (Apache 2.0). Testing og skjermbilder.

## Fagkilder

Se seksjonen «Referanseverdier» på siden og `README.md`.
