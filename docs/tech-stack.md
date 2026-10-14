# Teknikval – Elemental Voxel Tactics

Status: beslutat 2026-10-14 · Underlag: designcanvasen "Elemental Voxel Tactics" (13 artboards)

Det här dokumentet sammanfattar vilka tekniker vi har valt och varför. Det ska gå att läsa utan att ha varit med i diskussionen.

## Mål

- Spelet ska gå att spela **helt headless**, så att vi kan iterera snabbt och testdrivet.
- **Backend i fokus.** Samma spellogik ska kunna användas av olika frontends (webb, desktop, mobil), med olika brädstorlekar och upplägg.
- Sessioner ska kunna **serialiseras, analyseras och spelas upp igen**.
- **Låg kostnad när ingen spelar.**
- **Singleplayer och multiplayer** från start.
- **Enkel auth.** En ny spelare ska kunna testa direkt, utan registrering.
- **CI/CD** som släpper nya versioner utan att förstöra pågående partier.

## Vad designen kräver av tekniken

| Observation i designen | Konsekvens |
|---|---|
| Bräden på 8×8, 10×10 och 12×12 med höjd per ruta, terrängtyp och objekt (isväggar, pelare) | Kartan och lagstorleken är data, inget hårdkodas |
| Reaktioner som sprids mellan rutor (elektrifierad pöl, löpeld med vinden, magma som stelnar efter 3 rundor) | Ren regellogik med räknare per runda, ingen realtidsfysik |
| Siktlinje avgör vad som kan träffas; kamerarotation och röntgensilhuetter avgör vad man ser | Siktlinje hör till regelmotorn, kameran hör bara till klienten |
| Förhandsvisningar överallt: reaktion (−42/−14), förflyttning, väggplacering, hotvy | **Klienten måste köra samma regelmotor lokalt** |
| "Ranged attacks through steam can miss" | Slump finns, men bara via buffs/debuffs (se 2), och kräver en seedad PRNG |
| Ingen fog of war, alla enheter syns | Fullständig information (beslutat), så servern kan skicka hela brädet |

## Beslut

### 1. Webbteknik i stället för Unity eller Godot

**Val:** TypeScript genom hela stacken.

**Varför:**
- Spelet är turbaserat och saknar fysik. Spelmotorernas styrkor (fysik, animationsverktyg, scenredigerare, tunga effekter) ger oss lite.
- Det svåra är regelmotorn, och den måste köras på klient, server och i tester. Med TS är det samma kod på alla tre ställen.
- Med Unity eller Godot skulle vi behöva en headless spelmotorserver som alltid är igång, eller skriva reglerna två gånger.
- Unity WebGL ger tunga byggen som laddar långsamt i mobilwebbläsare. Godot har historiskt inte stöttat C# på webben.
- Designen består till stor del av paneler, text och sheets, och det gör HTML/CSS bäst.
- Samma webbygge räcker till webb, mobil och desktop.

**Om vi vill byta senare:** backend pratar JSON, så en Godot-klient kan bli ett eget frontendexperiment mot samma server. Våra golden replays (se 2) fungerar då som testsvit om regelmotorn någon gång behöver portas.

### 2. En ren, deterministisk regelmotor i TypeScript

**Val:** ett paket, `engine`, utan I/O, DOM eller klocka.

```ts
apply(state, action) -> { state, events }   // ren funktion
legalActions(state, player) -> Action[]
preview(state, action) -> Outcome           // apply på en kopia, sammanfattat
```

**Varför:**
- Headless spel, bottar, tester, förhandsvisningar i klienten och en server som avgör utfallet bygger alla på samma funktioner.
- Ett parti sparas som `{ rulesVersion, map, seed, actions[] }`. Att spela upp, analysera eller förgrena ("vad händer om vi går en annan väg från drag 14") blir då bara att köra motorn igen.

**Deterministiskt som standard.** Ett vanligt anfall har ett exakt utfall som förhandsvisningen kan visa. Slump finns bara när en buff eller debuff uttryckligen inför den, till exempel:
- att stå i steam ger 50 % chans att undvika ett anfall
- en rogue har en buff som ger chans att undvika ett anfall

Slumpen modelleras som en egenskap hos buffs, till exempel `dodgeChance`, och kan alltså spåras till en källa. Förhandsvisningen visar sannolikheten och de möjliga utfallen, till exempel "−30 · 50 % träff".

**Regler för determinism:**
- Heltalsmatematik med definierad avrundning, till exempel ×1.5 som `*3/2`. Chanser anges i procent, och ett slag är `roll(100) < chance`.
- Seeden ligger i matchens data och PRNG-läget i tillståndet. En lint-regel förbjuder `Math.random` och `Date` i `engine`.
- Stabil iterationsordning, till exempel när effekter sprids mellan rutor.
- Kanonisk serialisering och en hash av tillståndet efter varje steg, så att avvikelser märks direkt.

**Headless från dag ett:**
- CLI: `evt play --map 10x10 --p2 bot:greedy`, som ritar brädet i ASCII.
- Bottar: slumpmässig, girig (1-ply via `preview`), och MCTS senare.
- Scenariotester skrivna utifrån ASCII-kartor. Det första acceptanstestet blir Combo-chain från designen: isvägg, sedan eldklot, sedan kedjeblixt, sedan snabbfrysning.
- Egenskapstester med fast-check: slumpade lagliga drag, kontroll att invarianterna håller.
- Balanskörningar med bot mot bot.

**Varför inte Rust→WASM:** det är portablare till native-klienter men långsammare att iterera i. Vi kan ompröva om flera native-klienter behöver motorn lokalt.

### 3. Backend: Cloudflare Workers och Durable Objects

| Del | Teknik |
|---|---|
| API, lobby, auth | Workers (HTTP/JSON) |
| Ett pågående parti | **En Durable Object per match**. Den avgör utfallet, lagrar händelseloggen i sin egen SQLite och har WebSocket med hibernation |
| Användare, matchindex | D1 |
| Avslutade replays | R2 (JSON, kan exporteras till DuckDB/Parquet för analys) |
| Turtimers, asynkront spel | Durable Object-alarm |
| Webbklient | Workers static assets / Pages |

**Varför:**
- Ett inaktivt parti kostar ingenting, inte ens med öppna WebSockets. Räkna med 0–5 USD i månaden i början.
- En Durable Object per match passar turbaserat spel: ett enda ställe avgör vad som gäller, och partiets data ligger i den.
- Lokal utveckling med `wrangler dev`.

**Risk:** vi blir beroende av Cloudflare. Det begränsas av att motorn är ren och att servern bara är ett tunt lager för transport och lagring.

### 4. Kommunikation

**Val:** WebSocket under partiet, HTTP/JSON för allt annat. Gemensamma typer i paketet `protocol`, validerade med zod.

```
klient → server   { seq, action }
server → alla     { seq, events, stateHash }
klient → server   { sync, fromSeq }        // efter återanslutning
```

- Servern validerar varje drag med motorn, lägger det i loggen och skickar händelserna till alla. Klienten animerar utifrån händelseströmmen.

**Servern bestämmer i multiplayer.** Klienten skickar bara avsikter (`action`), aldrig utfall. Den lokala motorn i klienten används bara till förhandsvisningar. Det som räknas är serverns händelser.

**Seeden är hemlig under ett multiplayerparti.** Om klienten kände till PRNG-läget skulle den kunna räkna ut i förväg om nästa undvikningsslag lyckas och välja drag därefter. Därför:
- skickar servern tillståndet utan PRNG-läge
- kommer utfallet av ett slag med i händelsen (`{ type: 'dodge', unit, success }`)
- syns seeden i replayen först när partiet är slut, så att det går att kontrollera i efterhand.

Ingen fog of war behövs, så utöver seeden behöver servern inte filtrera något per spelare.
- Turbaserat spel gör att latens inte spelar någon roll. Asynkront spel med push-notiser följer därför med nästan gratis.

**Ett gränssnitt för singleplayer och multiplayer.** Klienten pratar med en `GameHost`:
- `LocalHost` kör motor och bot i webbläsaren. Singleplayer kostar då ingen server och fungerar offline.
- `RemoteHost` kopplar upp med WebSocket mot partiets Durable Object.

Båda lägena fungerar alltså från dag ett med samma klientkod.

### 5. Auth: gästkonto först

**Val:** Better Auth med anonymous-pluginet och D1.

- Vid första besöket skapas ett anonymt konto direkt, så man kan spela utan formulär.
- Senare kan man koppla Google, Discord, Apple eller passkey till samma konto.
- För multiplayer räcker en inbjudningslänk. Den som klickar går med som gäst.

### 6. Webbklient

| Del | Teknik |
|---|---|
| Bygge | Vite |
| UI (HUD, sheets, turordning, loggar) | React, HTML/CSS |
| Brädet | Three.js med ortografisk kamera |
| Mobil / desktop | PWA först, Capacitor för appbutiker, Tauri för desktop |

**Varför Three.js:**
- Voxlar är bara lådor.
- Rotation i fyra lägen blir en kamerarörelse, som kan animeras mjukt.
- Röntgensilhuetter görs med ett extra renderingspass med omvänt djuptest.
- Rutval sker med raycast.

Renderaren tar emot tillstånd och händelser och vet ingenting om reglerna.

### 7. CI/CD utan att förstöra pågående partier

**Pipeline (GitHub Actions):**
- typkontroll
- enhetstester och egenskapstester
- replay-regression
- preview-miljö per PR
- `wrangler deploy`, gärna med gradvis utrullning
- balanskörningar med bot mot bot varje natt

**Skydd för pågående partier:**
1. **Varje parti låses till sin `rulesVersion`.** Servern bundlar alla regelversioner som aktiva partier använder (`rules/v7`, `rules/v8` …). En gammal version är fryst, och CI kontrollerar att dess källkodshash inte ändras. En version tas bort när D1 visar att inga aktiva partier använder den.
2. **Golden replays.** Sparade partier körs om i CI och hasharna måste stämma. Ändrar en buggfix ett utfall blir den en ny regelversion, inte en tyst ändring.
3. **Återanslutning.** En deploy startar om Durable Objects och bryter WebSockets. Klienten återansluter och synkar automatiskt från senaste `seq`. Det täcks av ett e2e-test.
4. **Protokollversioner.** Servern stöder version N och N−1. Webbklientens filer har hashade namn, så en redan öppen flik fortsätter fungera, och spelaren ombeds ladda om mellan partier.
5. **Lagring.** Händelseloggen är append-only och schemaändringar får bara lägga till.

## Repo-struktur (pnpm workspaces)

```
packages/
  engine/     ren regelmotor – inga beroenden på I/O
  protocol/   meddelandetyper + zod-scheman
  bots/       AI-motståndare
  cli/        headless spel, replay-verktyg
  server/     Worker + Durable Objects
  web/        Vite + React + Three.js
docs/
```

Verktyg: Vitest, fast-check, Biome.

## Avgjorda designfrågor

| Fråga | Beslut | Konsekvens för tekniken |
|---|---|---|
| Slump? | Deterministiskt som standard. Slump bara via buffs och debuffs, till exempel steam (50 % undvikning) eller en rogue-buff | Seedad PRNG i motorn, sannolikhet i förhandsvisningen (se 2) |
| Fog of war? | Nej | Servern skickar hela brädet. Bara seeden hålls hemlig (se 4) |
| Fusk i singleplayer? | Bryr oss inte om det | Singleplayer körs helt i klienten (`LocalHost`) |
| Fusk i multiplayer? | Servern bestämmer, och det är viktigt | Servern validerar varje drag och slår alla slag. Klienten skickar bara avsikter (se 4) |
