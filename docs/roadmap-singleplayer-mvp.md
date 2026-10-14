# Roadmap – spelbar singleplayer-MVP

Status: förslag 2026-10-14 · Bygger på [tech-stack.md](tech-stack.md)

## Vad MVP:n är

En spelare öppnar webbklienten, spelar ett helt parti mot en bot på en karta och vinner eller förlorar. Allt körs i webbläsaren via `LocalHost`, utan server.

**Klart när:**
- Ett parti på en 10×10-karta med höjd, två lag om 3–4 enheter och tre element (eld, is, blixt) går att spela från start till vinst eller förlust i webbläsaren.
- Minst en reaktionskedja fungerar, och Combo-chain från designen är ett grönt acceptanstest.
- Varje drag visar en förhandsvisning (skada, räckvidd, reaktion) innan det bekräftas.
- Motståndaren är den giriga botten.
- Partiet kan exporteras som replay, och `evt replay` spelar upp det till samma slutliga hash.

**Medvetet utanför MVP:n:** Durable Objects och multiplayer, auth, D1/R2, regelversionslåsning i servern, MCTS-bot, röntgensilhuetter, kartredigerare, PWA/Capacitor/Tauri, ljud.

## Princip

Motorn först och headless, men kom till något klickbart tidigt. Varje steg slutar i något som går att köra, antingen i CLI:t eller i webbläsaren. Regler läggs till med scenariotester skrivna som ASCII-kartor.

## Steg

Storlek är relativ: S < M < L.

### 0. Grund – klart

Monorepo, CI, seedad PRNG, kanonisk hash, renhetstest för motorn.

### 1. Kärnmodell och turordning (M) – klart

**Mål:** motorns datatyper finns och ett parti kan startas och avslutas.

- Typer för `Map` (ruta: höjd, terräng, objekt), `Unit` (id, lag, hp, förflyttning, hopphöjd, initiativ; element och förmågor kommer i steg 5), `MatchState` (karta, enheter, runda, tur, rng), `Action` och `Event`.
- `createMatch({ map, teams, seed })`, `apply(state, action) → { state, events }`, `legalActions(state, player)`.
- Turordning och första handlingar: `move`, `endTurn`. Vinst när ett lag saknar levande enheter.
- ASCII-parser för kartor och enhetsplacering, så att scenariotester går att skriva direkt.
- Invariant: `hashState` fungerar på varje tillstånd (bara heltal och vanliga objekt).

**Klart när:** ett scenariotest flyttar en enhet över en ASCII-karta och turen går över till nästa spelare.

**Beslutat:** turordning per enhet efter initiativ, och en förflyttning plus en handling per tur. Se [gameplay.md](gameplay.md) (B1, B2).

### 2. Förflyttning, siktlinje och strid (M) – klart

**Mål:** enheter kan gå, se och skada varandra.

- Vägsökning med höjd: kostnad per terräng, max hopphöjd upp/ned, objekt blockerar. Stabil ordning (BFS med fast grannordning).
- Siktlinje i 3D över voxelrutnätet med heltalsmatematik (t.ex. Bresenham/DDA på dubblad upplösning). Objekt och höga rutor blockerar.
- Grundanfall: räckvidd, skada, död. Höjdfördel som heltalsmodifierare.
- `preview(state, action) → Outcome` som kör `apply` på en kopia och sammanfattar (hp-förändringar, döda, sannolikheter).

**Klart när:** scenariotester för vägsökning (höjd, blockering), siktlinje (bakom pelare, uppför) och ett anfall som dödar en enhet är gröna.

### 3. Headless spel och replay (M) – klart

**Mål:** ett helt parti kan spelas och spelas upp i terminalen.

- `RandomBot` (seedad) i `bots`.
- Replay-format `{ rulesVersion, map, seed, actions[] }` och hash efter varje steg.
- CLI: `evt play --map <namn> --p1 human --p2 bot:random` med ASCII-rendering, och `evt replay <fil>` som verifierar hasharna.
- Egenskapstester med fast-check: slumpade lagliga drag i många partier, invarianterna håller (ingen hp < 0 som levande, inga två enheter på samma ruta, partiet tar slut inom N rundor, `apply` muterar inte indata).
- Första golden replay i CI.

**Klart när:** `evt play --p1 bot:random --p2 bot:random` spelar ett parti till slut, och dess replay ger samma hash när det körs om.

### 4. Gående skelett i webben (M) – klart

**Mål:** något klickbart så tidigt som möjligt, med samma motor.

- `GameHost`-gränssnitt i klienten och `LocalHost` som kör motor och bot i webbläsaren.
- Three.js-bräde: voxlar som lådor, ortografisk kamera, rutval med raycast. Enheter som enkla figurer eller färgade block.
- React-HUD: vald enhet, hp, turordning, knapp för att avsluta turen.
- Flöde: välj enhet → markera nåbara rutor → flytta → välj mål → förhandsvisning → bekräfta.
- Händelser spelas upp i ordning (först utan animation, sedan enkel tweening).

**Klart när:** steg 3:s parti går att spela med musen mot `RandomBot`.

### 5. Element, terräng och reaktioner (L) – klart

**Mål:** spelets kärna – det som gör det till *elemental* tactics.

- Förmågor per element: eld (eldklot), is (isvägg, snabbfrysning), blixt (kedjeblixt). Data, inte specialkod per förmåga, så långt det går.
- Rutstatus med räknare per runda: pöl, ånga, is, elektrifierad, isvägg. Brinnande mark och magma väntar till efter MVP:n.
- Reaktioner mellan element och rutstatus: eld + is → vatten/ånga, blixt + vatten → elektrifierad pöl, eld sprider sig (med vind om det finns i MVP:n), osv. Stabil spridningsordning.
- Buffs/debuffs med varaktighet, inklusive `dodgeChance` (ånga 50 %). Första användningen av PRNG:n i regler.
- Förhandsvisningen visar reaktioner och sannolikheter, t.ex. "−30 · 50 % träff".

**Klart när:** Combo-chain-testet (isvägg → eldklot → kedjeblixt → snabbfrysning) är grönt, och dodge-utfallet syns i händelserna och i replayen.

**Att besluta:** den exakta reaktionsmatrisen och siffrorna för MVP:n. Börja med en liten tabell (3 element × 5 rutstatusar) och utöka senare.

### 6. Girig bot och balans (S)

**Mål:** en motståndare som är värd att spela mot.

- `GreedyBot`: 1-ply över `legalActions` via `preview`, med en enkel värderingsfunktion (skada gjord, skada tagen, döda, position). Deterministisk vid lika värden.
- `evt sim --p1 bot:greedy --p2 bot:random -n 200` som skriver vinstandel och partilängd.

**Klart när:** girig slår slump i en klar majoritet av partierna och ett parti mot girig känns som ett riktigt motstånd.

### 7. Spelbar MVP i webben (M)

**Mål:** från skelett till något man kan ge till en testspelare.

- Kamerarotation i fyra lägen.
- Visa reaktioner och rutstatus på brädet (färg/overlay per status), hotvy för fiendens räckvidd.
- Logg över händelser, slutskärm med vinst/förlust och "spela igen".
- Exportera replay från webben (ladda ned JSON) så att buggar kan återskapas med `evt replay`.
- En handgjord 10×10-karta och fasta lag.
- Driftsätt webbklienten som statiska filer (Workers static assets/Pages) från CI.

**Klart när:** MVP-kriterierna överst är uppfyllda och någon som inte har byggt spelet kan spela ett parti utan förklaring.

## Ordning och parallellism

```
0 ─ 1 ─ 2 ─ 3 ─┬─ 5 ─ 6 ─┬─ 7
               └─ 4 ─────┘
```

Steg 4 (webbskelett) och 5 (element) kan göras parallellt efter steg 3, eftersom webben bara pratar med motorn via `GameHost` och händelser. Nya regler i steg 5 dyker då upp i klienten utan ändringar i renderaren, förutom att nya rutstatusar behöver en visning.

## Risker

| Risk | Hantering |
|---|---|
| Reaktionssystemet växer okontrollerat | Datadriven reaktionstabell, scenariotest per reaktion, liten matris i MVP:n |
| 3D-siktlinje blir fel i kantfall (hörn, höjdskillnader) | Definiera regeln i ord först, testa kantfall med ASCII-scenarier innan webben använder den |
| Förhandsvisning och faktiskt utfall skiljer sig | `preview` är `apply` på en kopia, aldrig en egen beräkning |
| Webben drar ut på tiden (Three.js, input, animation) | Skelettet i steg 4 är fult med flit; finish först i steg 7 |
| Determinismen bryts tyst | Hash efter varje steg, golden replays och fast-check i CI från steg 3 |
