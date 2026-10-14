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
- En enhet som dör tas bort ur rundans ordning direkt, inte först när turen är slut.
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

**Läge i koden:** den enda handlingen hittills är grundanfallet (B6). Förmågor kommer i steg 5.

### B3. Förflyttning

- Fyra riktningar, inga diagonaler. Att gå in på en ruta kostar enligt dess terräng, och en enhet har `move` att spendera per förflyttning. Just nu kostar sten och gräs 1, och vatten går inte att gå in på.
- Ett steg får gå upp eller ned högst `jump` i höjd.
- Vatten och pelare går inte att gå på.
- Man får gå **genom allierade** men inte genom fiender, och man får inte stanna på en ruta där någon står.
- Om flera vägar är lika billiga väljs vägen deterministiskt (grannar i ordningen norr, öster, söder, väster). Vägen skickas i händelsen så att klienten kan animera den.

**Varför:**
- Fyra riktningar gör räckvidd och avstånd lätta att läsa på ett isometriskt bräde.
- Hopphöjd gör höjd till en del av terrängen: en klippa är ett hinder för vissa enheter och inte för andra.
- Att gå genom allierade undviker trafikstockning med små lag. Att fiender blockerar gör att man kan skydda en enhet genom att ställa sig i vägen.

**Varför terrängkostnad:** tabellen finns redan så att steg 5 kan låta till exempel is eller grunt vatten kosta mer, utan att reglerna för förflyttning skrivs om.

**Att se över senare:** fallskada, och om det ska vara asymmetriskt att gå upp och gå ned.

### B4. Seger

Matchen är slut när högst ett lag har levande enheter kvar. Det laget vinner. Om inget lag har några kvar blir det oavgjort, vilket kan bli möjligt när reaktioner skadar alla runt omkring.

**Varför:** det är enklast och kräver inga extra regler. Andra mål, som att hålla en ruta eller överleva N rundor, kan läggas till som kartvarianter senare.

### B5. Kartor och lag är data

Kartans storlek, höjd och terräng per ruta, objekt och enheternas startpositioner och värden kommer från data. Inget av det är hårdkodat i reglerna. Samma motor ska klara 8×8, 10×10 och 12×12.

En ruta har i dag:
- **höjd**, ett heltal
- **terräng**: sten, gräs eller vatten
- **objekt**: inget eller pelare

### B6. Grundanfall

Varje enhet har ett grundanfall som räknas som turens handling.

- Målet anges som en **ruta**, och där måste det stå en levande fiende.
- **Räckvidd** är Manhattanavstånd på rutnätet (`range`), samma mått som förflyttningen. Ett närstridsanfall har räckvidd 1.
- Anfallaren måste ha **siktlinje** till målet (B7).
- Skadan är enhetens `attack`, justerad för **höjd**: +10 % per block anfallaren står över målet och −10 % per block under, högst ±3 block. Avrundas nedåt. Med 30 i anfall blir det 33 ett block ovanför och 27 ett block nedanför.
- Hp går inte under 0. En enhet med 0 hp är död: den tas bort ur rundans ordning, rutan blir ledig och den blockerar inte längre förflyttning.

**Varför:**
- Mål som ruta gör att områdesförmågor i steg 5 kan använda samma form.
- Manhattanavstånd gör att räckvidd och förflyttning läses på samma sätt på brädet.
- Höjdbonusen gör höjd värd att ta, och procent per block är lätt att visa i förhandsvisningen. Taket hindrar att en klippa avgör allt. Heltal med avrundning nedåt håller motorn deterministisk.

**Att se över:** om närstrid ska kräva att höjdskillnaden är högst `jump` (i dag kan man slå en granne oavsett höjd), och om räckvidd ska påverkas av höjd (bågskytt på en kulle når längre).

### B7. Siktlinje

En rak linje dras från mitten av anfallarens kropp till mitten av målets kropp: från rutans mitt horisontellt, och ett halvt block över rutans höjd vertikalt. Linjen är blockerad om den någonstans går **under toppen** av en ruta den passerar.

- Bara rutorna mellan de två kontrolleras. Grannar ser alltid varandra, även diagonalt.
- En pelare är 2 block högre än sin ruta.
- Går linjen exakt genom ett hörn räknas bara de rutor den faktiskt går in i, så hörn blockerar inte.
- Enheter blockerar inte siktlinje.
- Siktlinjen är symmetrisk: ser A B så ser B A.
- Allt räknas med heltal (koordinaterna dubblas så att alla mittpunkter blir heltal), så resultatet är exakt och lika på alla plattformar.

**Varför:**
- Mitt-till-mitt är enkelt att förklara och att visa som en linje i klienten.
- Exakt geometri i stället för stickprov längs linjen ger inga konstiga undantag där en tunn kant ibland blockerar och ibland inte.
- Symmetri känns rättvist: står du där du kan skjuta mig kan jag skjuta dig.
- Att enheter inte blockerar gör bräden med få enheter mindre klaustrofobiska och siktlinjen lättare att förutse. Kan ändras om det behövs för att skydda en enhet med en annan.

**Följder att känna till:** på samma höjd blockerar en ruta som är ett block högre. Från höjden går det att skjuta över ett hinder om man står tillräckligt högt. Den som står nedanför en klippa ser inte någon som står längre in på klippan, bara den som står på kanten.

### B8. Rundgräns

Ett parti har en rundgräns, i dag 30 rundor. Är partiet inte avgjort när sista rundan är slut blir det oavgjort. Gränsen är en del av partiets data och kan sättas per karta eller parti.

**Varför:**
- Bottar, särskilt slumpbotten, kan annars spela i det oändliga. Balanskörningar och egenskapstester behöver partier som alltid tar slut.
- Det ger ett tydligt slut även när två försiktiga spelare undviker varandra.

**Att se över:** 30 är en gissning. Med tre enheter per lag och fyra träffar för att döda bör ett aktivt parti vara avgjort långt tidigare. Ett alternativ till oavgjort är att den som har mest kvarvarande hp vinner.

## Platshållarvärden

| Värde | Nu | Kommentar |
|---|---|---|
| hp | 100 | |
| förflyttning (`move`) | 4 | |
| hopphöjd (`jump`) | 1 | |
| initiativ | 10 | Sätts per enhet. Utan klasser är alla lika, och då avgör utplaceringsordningen |
| anfall (`attack`) | 30 | Fyra träffar dödar en enhet med 100 hp, även ett block underifrån |
| räckvidd (`range`) | 1 | Närstrid. Avståndsenheter sätts per enhet tills klasser finns |
| höjdbonus | ±10 % per block, högst 3 block | |
| terrängkostnad | sten 1, gräs 1 | Vatten går inte att gå in på |
| terräng | sten, gräs, vatten | Sten och gräs fungerar likadant än så länge |
| objekt | pelare | Blockerar förflyttning. 2 block högt för siktlinje |

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
- Ett valfritt avsnitt `stats:` sätter värden per enhet, en rad per enhet: `b  range=4 attack=20`. Värden som inte anges tar standardvärdena ovan.

## Kartor

| Karta | Storlek | Lag | Idé |
|---|---|---|---|
| `skirmish` | 8×8 | 3 mot 3: riddare (120 hp, 35 i anfall), bågskytt (80 hp, räckvidd 4, initiativ 12), spejare (förflyttning 5, hopphöjd 2, initiativ 14) | Punktsymmetrisk så att ingen sida har bättre mark. En platå i mitten nås via en ramp från varje sida. Pelare och vatten bryter siktlinjer |

Alla inbyggda kartor testas för att vara punktsymmetriska, både terräng och enheter.

## Gränssnitt

Hur en tur spelas i webbklienten. Det är också preliminärt.

- Den aktiva enheten är alltid vald, eftersom bara den kan agera (B1). Att klicka på en annan enhet visar bara dess värden.
- Blå rutor visar vart enheten kan gå. Håller man muspekaren över en sådan ruta visas vägen dit. **Ett klick flyttar direkt**, utan bekräftelse.
- Röda rutor visar fiender som kan anfallas. **Ett anfall kräver bekräftelse**: klicket öppnar en förhandsvisning (hp före och efter, och vem som dör), och först "Confirm" utför anfallet. Esc avbryter.
- `E` eller knappen "End turn" avslutar turen.
- Motståndarens drag spelas upp som animationer i tur och ordning, med en kort paus före varje botdrag.

**Varför:** en förflyttning går inte att ångra, men konsekvensen syns redan i markeringen och vägen. Ett anfall är svårare att förutse, så det får en förhandsvisning. Färre klick för det vanligaste draget.

**Att se över:** ångra förflyttning innan handlingen är gjord, och kamerarotation för rutor som skyms (steg 7).

## Öppna frågor

| Fråga | Påverkar | När |
|---|---|---|
| Hur bryts lika initiativ rättvist? Varannan per lag? | B1 | När vi har bot-mot-bot-statistik |
| Får en handling avbryta förflyttningen, som "gå två, anfall, gå två"? | B2 | Om B2 känns stelt i speltest |
| Ska närstrid kräva liten höjdskillnad, och ska räckvidd växa med höjd? | B6 | Efter speltest |
| Ska enheter blockera siktlinje? | B7 | Efter speltest |
| Reaktionsmatris och siffror | Element | Steg 5 |
| Vind: med i MVP:n eller inte? | Element | Steg 5 |
| Rätt rundgräns, och oavgjort eller seger på kvarvarande hp? | B8 | Efter bot-mot-bot-statistik |
| Klasser (till exempel rogue) och hur de skiljer sig i värden och förmågor | Enheter | Efter MVP:n |

## Ändringslogg

| Datum | Ändring |
|---|---|
| 2026-10-14 | Första utkast: B1–B5, platshållarvärden och textformat för kartor |
| 2026-10-14 | B6 grundanfall med höjdbonus, B7 siktlinje. B3 har terrängkostnad i stället för fast stegkostnad |
| 2026-10-14 | B8 rundgräns (30, sedan oavgjort). Döda enheter lämnar turordningen direkt. `stats:` i textformatet och kartan `skirmish` |
