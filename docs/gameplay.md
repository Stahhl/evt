# Gameplay – Elemental Voxel Tactics

Status: **utkast, allt kan ändras** · Senast uppdaterad 2026-10-14

Det här dokumentet samlar besluten om spelregler och varför vi tog dem. Det kompletterar [tech-stack.md](tech-stack.md), som handlar om teknik, och [roadmap-singleplayer-mvp.md](roadmap-singleplayer-mvp.md), som handlar om ordning.

Alla beslut är preliminära. Siffror är platshållare tills vi har spelat och kört balanskörningar med bottar. När ett beslut ändras uppdateras avsnittet och ändringen loggas längst ned, så att det går att se vad vi har provat.

## Grundidé

Turbaserad taktik på ett voxelbräde. Två lag med några enheter var. Elementförmågor ändrar terrängen, och terrängen reagerar på nästa element. Det intressanta ska vara att kombinera element och position, inte att räkna skada.

## Beslut

### B1. Turordning per enhet efter initiativ

En runda består av att varje levande enhet gör en tur, en i taget. Ordningen bestäms av initiativ: högst först. Lag blandas, så en fiende kan agera mellan två av dina enheter.

- Ordningen räknas fram när rundan börjar. Ändras initiativ mitt i rundan, till exempel av en buff, gäller det från nästa runda.
- En enhet som dör tas bort ur rundans ordning.
- **Lika initiativ** avgörs av ordningen enheterna placerades ut i. Det är deterministiskt men gynnar den som placeras först (se öppna frågor).

**Varför:**
- Designens turordningslista visar enheter, inte lag.
- Tempo blir en egen resurs: initiativ blir värt något, och "hinner jag före fienden?" blir en del av besluten.
- Ett drag gäller en enda enhet. Det gör bottarna enklare (färre handlingar att söka bland per drag) och förhandsvisningen tydligare.
- Lagvis tur ger en stark förstadragsfördel med små lag, där hela laget kan slå till innan motståndaren hinner reagera.

**Alternativ vi valde bort:** lagvis tur (alla dina enheter, sedan alla motståndarens), som i Advance Wars eller XCOM.

### B2. En förflyttning och en handling per tur

Den aktiva enheten får **flytta en gång och göra en handling**, i valfri ordning. Turen tar slut när båda är gjorda eller när spelaren avslutar den. Man kan alltså stå still, eller flytta utan att göra något.

**Varför:**
- Det är välbekant från genren och lätt att förklara.
- Valfri ordning ger taktiskt djup: anfall och dra dig sedan undan, eller flytta fram och anfall.
- Det passar förhandsvisningen. Varje steg går att visa innan det bekräftas.

**Alternativ vi valde bort:** handlingspoäng (AP) som delas mellan förflyttning och handlingar. Det ger fler val, men blir svårare att förhandsvisa och balansera i ett tidigt skede.

**Läge i koden:** det finns ännu inga handlingar utöver förflyttning, så turen avslutas med `endTurn` tills anfall kommer i steg 2.

### B3. Förflyttning

- Fyra riktningar, inga diagonaler. Varje steg kostar 1, och en enhet går högst `move` steg.
- Ett steg får gå upp eller ned högst `jump` i höjd.
- Vatten och pelare går inte att gå på.
- Man får gå **genom allierade** men inte genom fiender, och man får inte stanna på en ruta där någon står.
- Om flera vägar är lika korta väljs vägen deterministiskt (grannar i ordningen norr, öster, söder, väster). Vägen skickas i händelsen så att klienten kan animera den.

**Varför:**
- Fyra riktningar gör räckvidd och avstånd lätta att läsa på ett isometriskt bräde.
- Hopphöjd gör höjd till en del av terrängen: en klippa är ett hinder för vissa enheter och inte för andra.
- Att gå genom allierade undviker trafikstockning med små lag. Att fiender blockerar gör att man kan skydda en enhet genom att ställa sig i vägen.

**Att se över i steg 2:** terrängkostnad (till exempel att ett steg i vatten kostar mer i stället för att vara förbjudet), fallskada och om det ska vara asymmetriskt att gå upp och gå ned.

### B4. Seger

Matchen är slut när högst ett lag har levande enheter kvar. Det laget vinner. Om inget lag har några kvar blir det oavgjort, vilket kan bli möjligt när reaktioner skadar alla runt omkring.

**Varför:** det är enklast och kräver inga extra regler. Andra mål, som att hålla en ruta eller överleva N rundor, kan läggas till som kartvarianter senare.

### B5. Kartor och lag är data

Kartans storlek, höjd och terräng per ruta, objekt och enheternas startpositioner och värden kommer från data. Inget av det är hårdkodat i reglerna. Samma motor ska klara 8×8, 10×10 och 12×12.

En ruta har i dag:
- **höjd**, ett heltal
- **terräng**: sten, gräs eller vatten
- **objekt**: inget eller pelare

## Platshållarvärden

| Värde | Nu | Kommentar |
|---|---|---|
| hp | 100 | |
| förflyttning (`move`) | 4 | |
| hopphöjd (`jump`) | 1 | |
| initiativ | 10 | Sätts per enhet. Utan klasser är alla lika, och då avgör utplaceringsordningen |
| terräng | sten, gräs, vatten | Sten och gräs fungerar likadant än så länge |
| objekt | pelare | Blockerar förflyttning, och siktlinje från steg 2 |

## Textformat för kartor

Scenariotester och CLI:t skriver bräden som text:

```
map:
1g 1g 2s 2sP
1g 0w 2s 2s
units:
a  .  .  B
.  .  b  .
```

- En ruta är `<höjd><terräng>`, med ett valfritt `P` för pelare. Terräng är `s` (sten), `g` (gräs) eller `w` (vatten).
- I `units:` är `.` en tom ruta och en bokstav en enhet med bokstaven som id. Liten bokstav är lag 0 och stor bokstav lag 1.
- Enheternas värden sätts i koden, och standardvärdena ovan gäller om inget annat anges.

## Öppna frågor

| Fråga | Påverkar | När |
|---|---|---|
| Hur bryts lika initiativ rättvist? Varannan per lag? | B1 | När vi har bot-mot-bot-statistik |
| Får en handling avbryta förflyttningen, som "gå två, anfall, gå två"? | B2 | Om B2 känns stelt i speltest |
| Höjdfördel för anfall, och i så fall hur mycket? | Strid | Steg 2 |
| Siktlinjens exakta regel: från vilken punkt till vilken, och blockerar halva rutor? | Strid | Steg 2 |
| Reaktionsmatris och siffror | Element | Steg 5 |
| Vind: med i MVP:n eller inte? | Element | Steg 5 |
| Rundgräns eller oavgjort efter N rundor, så att bottar inte kan dra ut på partiet? | B4 | Steg 3 |
| Klasser (till exempel rogue) och hur de skiljer sig i värden och förmågor | Enheter | Efter MVP:n |

## Ändringslogg

| Datum | Ändring |
|---|---|
| 2026-10-14 | Första utkast: B1–B5, platshållarvärden och textformat för kartor |
