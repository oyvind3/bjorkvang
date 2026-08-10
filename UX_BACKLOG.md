# 🗂 UX Backlog — Bjørkvang

> Opprettet: 2026-02-27  
> Mål: Redusere "bank-følelsen" og gjøre nettsiden varmere og mer fellesskapsorientert.

---

## 🔴 Høy prioritet — Rotårsaker til "bank-følelsen"

### UX-01 · Colour system overhaul
**Problem:** Den nåværende blåfargen (#0e5285) er ugjenkjennelig fra DNB/Nordea-branding. Ren blå-på-hvitt er kjerneproblemet.  
**Forslag:** Varm off-white bakgrunn + havsblå primærfarge + jordnær amber/sand som sterkere aksent brukt mer aktivt.  
**Impact:** 🔴 Høy | **Effort:** Medium  
**Status:** `[x] Fullført`

---

### UX-02 · First impression (hero-seksjonen)
**Problem:** Heroen leser som et B2B-utleieskjema. "Selskapslokale midt i Mjøsa" + to CTA-knapper er transaksjonelt — ikke inviterende.  
**Forslag:** Led med atmosfære og historie: "Et sted for Helgøyas folk", større herobildet, mykere tekst før CTA-er, kanskje en tagline om fellesskap.  
**Impact:** 🔴 Høy | **Effort:** Medium  
**Status:** `[x] Fullført`

---

### UX-03 · Forsidekortet ser ut som et produkt-/prisbilde
**Problem:** "Lei lokalet — Bli medlem — Priser fra 1 500 kr" side om side leser som en banks tjenestebrikker. Det signaliserer transaksjon før fellesskap.  
**Forslag:** Flytt priskortet til bookingsiden. Erstatt med en varm "Om oss"-seksjon, kommende arrangementer, eller et fotokollasj.  
**Impact:** 🔴 Høy | **Effort:** Lav  
**Status:** `[x] Fullført`

---

## 🟡 Medium prioritet — Layout og navigasjonsfølelse

### UX-04 · Navigasjonen har ingen personlighet
**Problem:** 7 flate navigasjonspunkter uten visuell gruppering. En foreningsside bør føles som en oppslagstavle, ikke en SaaS-app.  
**Forslag:** Grupper eller differensier "Lei lokalet" som en primær CTA-knapp i navigasjonen, reduser visuell vekt på resten.  
**Impact:** 🟡 Medium | **Effort:** Lav  
**Status:** `[x] Fullført`

---

### UX-05 · Ingen varme kommer inn på siden ved scrolling
**Problem:** Seksjoner har alle det samme hvite kort + skygge-mønsteret. Det er ingen teksturvariasjon, fotografipauser eller fellesskapsfølelsesinnhold.  
**Forslag:** Alternate seksjonsbakgrunner (varm krem, lett bildebakgrunn), legg til en "Kommende arrangementer"-forhåndsvisning på forsiden.  
**Impact:** 🟡 Medium | **Effort:** Medium  
**Status:** `[x] Fullført`

---

### UX-06 · Logoen føles som et fintech-ikon
**Problem:** En blå sirkel med "BV"-initialer i sans-serif er det alle fintech-startups bruker.  
**Forslag:** Vurder et ikon som fremkaller sted — et enkelt hus, tre eller fjordsilhuett, gjerne som SVG.  
**Impact:** 🟡 Medium | **Effort:** Høy  
**Status:** `[x] Fullført`

---

## 🟢 Lavere prioritet — Tekst og mikrodetaljer

### UX-07 · Knappteksten er transaksjonell
**Problem:** "Se tilgjengelighet" og "Bli medlem" er oppgaveorienterte. For en forening passer mykere alternativer bedre.  
**Forslag:**
- "Se tilgjengelighet" → "Planlegg ditt arrangement"
- "Bli medlem" → "Støtt Bjørkvang"

**Impact:** 🟢 Lav | **Effort:** Lav  
**Status:** `[x] Fullført`

---

### UX-08 · Bunnteksten er kald og teksttett
**Problem:** Mørk footer med små lenker ser ut som en bedriftspersonvern-footer.  
**Forslag:** En forenings-footer kan vise en adresse på kart, et bilde, eller en vennlig avslutningslinje.  
**Impact:** 🟢 Lav | **Effort:** Lav  
**Status:** `[x] Fullført`

---

### UX-09 · Ingen sosialt bevis eller felleskaps-signaler
**Problem:** Ingen bilder fra faktiske arrangementer, ingen "X medlemmer", ingen sitater fra brukere. Et felleskapslokale lever og dør på atmosfæren — nettsiden viser ingen nå.  
**Forslag:** Legg til bilder fra arrangementer, et membercount, eller et sitat fra en fornøyd leietaker.  
**Impact:** 🟢 Lav | **Effort:** Høy  
**Status:** `[ ] Ikke startet`

---

---

# 📋 Backlog fra tilbakemeldingsmøte — 28. februar 2026

---

## 🔴 Høy prioritet

### BK-01 · Hindre dobbelbooking og varsling
**Problem:** Det er ingen serverside-validering som forhindrer overlappende bookinger for samme lokale.  
**Forslag:** Implementer dobbelbookingsjekk i `bookingRequest`-funksjonen. Send varsel til admin ved nye bookingforespørsler som grenser til eksisterende.  
**Impact:** 🔴 Høy | **Effort:** Høy  
**Status:** `[x] Fullført`

---

### BK-02 · Salgsvilkår (Vipps-krav) og leieavtale
**Problem:** Vipps krever publiserte salgsvilkår for å aktivere betalingsløsningen. Leieavtalen må også ferdigstilles.  
**Forslag:** Skriv og publiser salgsvilkår på nettsiden. Ferdigstill leieavtalemalen som sendes ut ved bekreftet booking.  
**Impact:** 🔴 Høy | **Effort:** Medium  
**Status:** `[x] Fullført` *(utkast publisert — beløpsgrenser og frister merket [STYRET] må bekreftes av styret)*

---

### BK-03 · E-post for signering av leieavtale
**Problem:** Det sendes ikke ut signeringse-post til leietaker etter bekreftet booking.  
**Forslag:** Implementer automatisk utsending av leieavtale for signering (e-post med lenke) når en booking godkjennes av admin.  
**Impact:** 🔴 Høy | **Effort:** Høy  
**Status:** `[x] Fullført`

---

## 🟡 Medium prioritet

### BK-04 · Oppdater priser og pakker
**Problem:** Prisene i bookingskjema og på nettsiden er utdaterte og stemmer ikke med vedtatte priser.  
**Forslag:** Oppdater til følgende:
- **Hele lokalet:** 4 000 kr — Eksklusiv tilgang til både sal og peisestue. Passer for store arrangementer.
- **Bryllupspakke:** 6 000 kr — Torsdag til søndag. Inkluderer ekstra tid til pynting og nedrigg.

**Impact:** 🟡 Medium | **Effort:** Lav  
**Status:** `[x] Fullført`

---

### BK-05 · Medlemsrabatt på booking
**Problem:** Betalende medlemmer får ikke den avtalte rabatten ved booking.  
**Forslag:** Legg til et "Er du medlem?"-valg i bookingskjemaet. Ved bekreftelse: trekk 500 kr fra prisen på "Hele lokalet" og "Bryllupspakke".  
**Impact:** 🟡 Medium | **Effort:** Medium  
**Status:** `[x] Fullført`

---

### BK-06 · Vask som tilleggstjeneste
**Problem:** Vask er ikke synlig som en valgfri tilleggstjeneste i bookingflyten.  
**Forslag:** Legg til avkrysningsboks for vask i bookingskjemaet med tilhørende pris. Inkluder i e-postbekreftelse og leieavtale.  
**Impact:** 🟡 Medium | **Effort:** Lav  
**Status:** `[x] Fullført`

---

### BK-07 · Begrens til én booking per lokale om gangen
**Problem:** Det er mulig å booke delvis overlappende lokaler (f.eks. bare peisestue mens sal allerede er booket som del av "Hele lokalet").  
**Forslag:** Implementer logikk som blokkerer overlappende romreservasjoner. Kun ett lokale kan bookes per tidsrom.  
**Impact:** 🟡 Medium | **Effort:** Medium  
**Status:** `[x] Fullført`

---

### BK-08 · Admin kan registrere booking manuelt (telefon-inn)
**Problem:** Når noen ringer og ønsker å booke, finnes det ingen admin-flyt for å registrere bookingen på vegne av leietaker.  
**Forslag:** Legg til et admin-skjema i `admin.html` der styret kan opprette bookinger manuelt med kundens kontaktinfo.  
**Impact:** 🟡 Medium | **Effort:** Medium  
**Status:** `[x] Fullført`

---

### BK-09 · Norsk kalender (locale)
**Problem:** Kalenderen i bookingskjemaet viser ukedager og måneder på engelsk.  
**Forslag:** Sett FullCalendar-locale til `nb` (norsk bokmål) slik at alle datovisninger er på norsk.  
**Impact:** 🟡 Medium | **Effort:** Lav  
**Status:** `[x] Fullført`

---

## 🟢 Lavere prioritet

### BK-10 · Oppdater kontaktsiden og kalendermelding
**Problem:** Kontaktsiden manglet navn på kontaktperson i styret. Kalendermelding var uklar.  
**Forslag:**
- Legg til Trond Bjørnstad som kontaktperson på kontaktsiden (oppdateres videre av styret).
- Legg til informasjonstekst øverst på booking-/kalendervisningen: *«For leieforrespørsler bruker du bookingskjemaet. Kontaktperson i styret oppdateres snart.»*

**Impact:** 🟢 Lav | **Effort:** Lav  
**Status:** `[x] Fullført`

---

### BK-11 · Oppdater branding — navn og fargepalett
**Problem:** Navn og fargevalg gjenspeiler ikke Helgøens Vel-identiteten som ble spesifisert i møtet.  
**Forslag:**
- Fullt navn i footer/om-seksjon: *"Bjørkvang forsamlingslokale — Helgøens Vel"*
- Fargepalett: havsblå som primærfarge (ref. Facebook-siden), varm off-white bakgrunn. Vekk fra "Sparebankfølelsen".

**Impact:** 🟢 Lav | **Effort:** Medium  
**Status:** `[x] Fullført`

---

## Sammendrag

| ID     | Område              | Impact      | Effort | Status         |
|--------|---------------------|-------------|--------|----------------|
| UX-01  | Fargesystem         | 🔴 Høy      | Medium | Fullført       |
| UX-02  | Hero / førsteinntrykk | 🔴 Høy    | Medium | Fullført       |
| UX-03  | Forsidekort         | 🔴 Høy      | Lav    | Fullført       |
| UX-04  | Navigasjon          | 🟡 Medium   | Lav    | Fullført       |
| UX-05  | Seksjonsvariasjon   | 🟡 Medium   | Medium | Fullført       |
| UX-06  | Logo                | 🟡 Medium   | Høy    | Fullført       |
| UX-07  | Knapptekst          | 🟢 Lav      | Lav    | Fullført       |
| UX-08  | Footer              | 🟢 Lav      | Lav    | Fullført       |
| UX-09  | Sosialt bevis       | 🟢 Lav      | Høy    | Ikke startet   |
| BK-01  | Dobbelbooking       | 🔴 Høy      | Høy    | Fullført       |
| BK-02  | Salgsvilkår / leieavtale | 🔴 Høy | Medium | Fullført (utkast)  |
| BK-03  | E-post for signering | 🔴 Høy     | Høy    | Fullført       |
| BK-04  | Priser og pakker    | 🟡 Medium   | Lav    | Fullført       |
| BK-05  | Medlemsrabatt       | 🟡 Medium   | Medium | Fullført       |
| BK-06  | Vask som tillegg    | 🟡 Medium   | Lav    | Fullført       |
| BK-07  | Én booking per lokale | 🟡 Medium | Medium | Fullført       |
| BK-08  | Admin manuell booking | 🟡 Medium | Medium | Fullført       |
| BK-09  | Norsk kalender      | 🟡 Medium   | Lav    | Fullført       |
| BK-10  | Kontaktside         | 🟢 Lav      | Lav    | Fullført       |
| BK-11  | Branding / navn     | 🟢 Lav      | Medium | Fullført       |
| UX-09  | Sosialt bevis       | 🟢 Lav      | Høy    | Ikke startet   |
| FAK-01 | Faktura – admin-UI  | 🔴 Høy      | Medium | Fullført       |
| FAK-02 | Faktura – e-post    | 🔴 Høy      | Medium | Fullført       |
| FAK-03 | Faktura – PDF       | 🟡 Medium   | Høy    | Ikke startet   |
| DEP-01 | Depositum – sporing | 🔴 Høy      | Lav    | Fullført       |
| DEP-02 | Depositum – varsel  | 🟡 Medium   | Medium | Ikke startet   |
| VIP-01 | Vipps – depositum 50% | 🔴 Høy    | Medium | Fullført       |
| VIP-02 | Vipps – obligatorisk | 🔴 Høy     | Lav    | Fullført       |
| VIP-03 | Sluttfaktura – Vipps | 🟡 Medium  | Høy    | Fullført (Alt A) |

---

## 📱 Vipps-flyt — depositum + sluttfaktura

**Overordnet flyt:**
```
Booking-søknad → Vipps 50% depositum → Booking bekreftet →
Arrangement gjennomført → Admin sender sluttfaktura (50%)
```

> Merk: Backend-infrastruktur (Vipps API, token, redirect, callback) er allerede implementert.
> Nåværende flyt tar fullt beløp og betaling er valgfritt. Disse oppgavene justerer det.

### VIP-01 · Endre til 50% depositum ved booking
**Problem:** `vippsInitiateBooking` tar fullt beløp. Korrekt modell er halvparten ved bestilling, resten etter arrangement.  
**Forslag:** Del beregnet totalbeløp på 2 i `vippsInitiateBooking/index.js`. Lagre `totalAmount` og `depositAmount` på booking-objektet i Cosmos. Betalingsbeskrivelsen til Vipps merkes «Depositum – 50%».  
**Impact:** 🔴 Høy | **Effort:** Lav  
**Status:** `[x] Fullført`

---

### VIP-02 · Gjør Vipps-betaling obligatorisk i booking-skjemaet
**Problem:** Brukeren kan nå velge «betal senere» og sende inn forespørsel uten å betale. Booking bør ikke opprettes uten at depositum er bekreftet.  
**Forslag:** Fjern «betal senere»-alternativet i `booking.html`. Booking-knappen starter alltid Vipps-flyten. Booking-objektet opprettes i Cosmos *etter* Vipps bekrefter betaling (allerede tilfellet for Vipps-banen, behold det).  
**Notater:** Telefonbooking via admin er unntaket — admin kan fortsatt opprette uten Vipps.  
**Impact:** 🔴 Høy | **Effort:** Lav  
**Status:** `[x] Fullført`

---

### VIP-03 · Sluttfaktura — resterende 50% etter arrangement
**Problem:** Ingen flyt for å kreve inn restbeløpet etter arrangementet.  
**Forslag (to alternativer, velg ett):**

**Alt A – Bankoverføring (enklest):**  
Admin klikker «Send sluttfaktura» i admin-panelet etter arrangementet. En e-post sendes til leietaker med restbeløp, kontonummer og betalingsfrist 14 dager. Løses med FAK-01/FAK-02.

**Alt B – Vipps eCom charge (mer seamless):**  
Bruk Vipps [ePayment reserve/capture-mønster](https://developer.vippsmobilepay.com/docs/APIs/epayment-api/): reserver fullt beløp ved booking, capture 50% med det samme, capture resterende 50% manuelt fra admin etter arrangement. Krever at Vipps-avtalen støtter delvis capture.

**Anbefaling:** Start med Alt A (banker på eksisterende e-postinfrastruktur). Alt B er mer elegant men mer komplekst og krever at Vipps-avtalen er riktig satt opp.  
**Impact:** 🟡 Medium | **Effort:** Høy (Alt B) / Medium (Alt A)  
**Status:** `[x] Fullført (Alt A — bankoverføring via e-post)`

---

## 💳 Faktura-flyt

### FAK-01 · «Send faktura»-knapp i admin-panelet
**Problem:** Admin har ingen måte å markere at faktura er sendt eller trigge utsendelse. Det skjer manuelt utenfor systemet og spores ikke.  
**Forslag:** Legg til en «Send faktura»-knapp på godkjente/gjennomførte bookinger i admin. Knappen setter status `invoiced` og logger tidspunkt.  
**Impact:** 🔴 Høy | **Effort:** Medium  
**Status:** `[x] Fullført`

---

### FAK-02 · Fakturamail med betalingsinformasjon
**Problem:** Ingen automatisk e-post med fakturainfo sendes til leietaker etter arrangementet.  
**Forslag:** Ved klikk på «Send faktura» sendes en e-post med arrangement, beløp, kontonummer og betalingsfrist (f.eks. 14 dager). Bruker eksisterende Plunk-integrasjon.  
**Avhengigheter:** FAK-01  
**Notater:** Kontonummer / betalingsinfo må legges inn av styret (miljøvariabel eller hardkodes).  
**Impact:** 🔴 Høy | **Effort:** Medium  
**Status:** `[x] Fullført` *(kontonummer 1810.40.02508 og Vipps 104631 satt via miljøvariabler)*

---

### FAK-03 · PDF-faktura
**Problem:** Leietaker kan ha behov for en fakturakvittering for regnskap (lag/forening).  
**Forslag:** Generer en enkel PDF-faktura (via `@react-pdf` eller HTML-til-print) som vedlegges fakturamailen eller kan lastes ned fra admin.  
**Notater:** Kan løses enkelt med en print-vennlig HTML-side tilsvarende leieavtalen, med fakturanummer og betalingsinfo.  
**Impact:** 🟡 Medium | **Effort:** Høy  
**Status:** `[ ] Ikke startet`

---

## 💰 Depositumsflyt

### DEP-01 · Sporing av depositum i admin-panelet
**Problem:** Signeringssiden har checkbox «depositum er betalt», men dette er leietakers egenerklæring og spores ikke i admin. For telefonbooking finnes ingenting.  
**Forslag:** Legg til et lite «Depositum mottatt»-kryss/knapp i admin-kortet for godkjente bookinger. Lagres på bookingen og vises som badge. Admin bekrefter manuelt etter at betalingen er sjekket.  
**Impact:** 🔴 Høy | **Effort:** Lav  
**Status:** `[x] Fullført`

---

### DEP-02 · Automatisk purrevarsel for depositum
**Problem:** Hvis leietaker ikke betaler depositum, er det ingen automatikk som minner dem på det.  
**Forslag:** Dersom depositum ikke er markert som mottatt X dager etter signering (f.eks. 7 dager), sendes en automatisk påminnelse på e-post. Kan utløses av en Azure timer-funksjon eller manuelt fra admin.  
**Avhengigheter:** DEP-01  
**Impact:** 🟡 Medium | **Effort:** Medium  
**Status:** `[ ] Ikke startet`

---

## Anbefalt rekkefølge (etter effort/impact)

1. **DEP-01** — Depositum-sporing i admin: Lav effort, høy verdi, ingen avhengigheter
2. **FAK-01** — «Send faktura»-knapp i admin: Grunnmuren for fakturaflyt
3. **FAK-02** — Fakturamail med betalingsinfo: Direkte verdi for leietaker, bygger på FAK-01
4. **DEP-02** — Purrevarsel depositum: Bygger på DEP-01, krever litt mer infrastruktur
5. **FAK-03** — PDF-faktura: Nice-to-have, høyest effort

---
---

# 🎯 Booking-backlog — april 2026

> Oppdatert: 2026-04-03
> Kilde: E2E-testrapport (Playwright), kodegjennomgang og brukerflytanalyse.

---

## 🔴 Høy prioritet — Feil funnet i test

### FIX-01 · CSS overstyrer `hidden`-attributtet på skjemafelt
**Problem:** `.form-fieldset { display: grid }` i `style.css` overstyrer HTML-attributtet `hidden` på `#member-discount-section`, `#duration-field`, `#end-date-field` og `#end-time-field`. Brukeren ser felt som skal være skjult.
**Filer:** `style.css` (linje 1712), `booking.js` (linje 110, 1038–1040, 1096–1098)
**Forslag:** Legg til `[hidden] { display: none !important; }` i `style.css`, eller bytt til `style.display = 'none'` / `style.display = ''` i JS.
**Impact:** 🔴 Høy | **Effort:** XS
**Status:** `[ ] Ikke startet`

---

### FIX-02 · Booking-kvittering vises aldri etter vellykket innsending
**Problem:** `#booking-confirmation`-seksjonen finnes i `booking.html` med oppsummering, depositum-info og referansenummer, men `booking.js` setter aldri `confirmation.hidden = false` etter vellykket POST. All kode for å fylle inn `#conf-date`, `#conf-name` osv. mangler. Brukeren ser kun en grønn statusmelding.
**Filer:** `booking.js` (linje 1030–1060), `booking.html` (linje 472–540)
**Forslag:** Etter `await submitBooking(...)`:
1. Fyll inn `#conf-date`, `#conf-time`, `#conf-eventtype`, `#conf-spaces`, `#conf-name`, `#conf-email`, `#conf-price`, `#conf-deposit`, `#conf-payment`, `#conf-id`
2. Sett `form.hidden = true` og `confirmation.hidden = false`
3. Scroll til kvitteringen
**Impact:** 🔴 Høy | **Effort:** S
**Status:** `[ ] Ikke startet`

---

### FIX-03 · Native nettleservalidering blokkerer norske feilmeldinger
**Problem:** Alle påkrevde felt (`name`, `email`, `phone`, `date`, `time`, `event-type`) har HTML `required`-attributtet. Nettleseren viser sin egen engelsk/systemspråk popup *før* JS-handleren i `booking.js` kjører. De norske meldingene (`Vennligst fyll ut...`) blir aldri vist.
**Filer:** `booking.html` (linje 283–329)
**Forslag:** Legg til `novalidate` på `<form id="booking-form">` og stol på JS-valideringen som allerede finnes.
**Impact:** 🔴 Høy | **Effort:** XS
**Status:** `[ ] Ikke startet`

---

## 🔴 Høy prioritet — Manglende funksjoner

### BOOK-01 · Selvbetjent avbestilling for leietaker
**Problem:** Leietaker kan ikke avbestille sin egen booking. De må sende e-post til styret manuelt. Avbestillingsregler er definert i vilkårene (>2 uker = 50 % tilbakebetaling, <2 uker = full pris) men ikke tilgjengelig i brukergrensesnittet.
**Forslag:** Legg til en «Avbestill booking»-side (`cancel.html?id={bookingId}`) med:
- Booking-oppsummering
- Beregnet refusjonsbeløp (basert på dager til arrangement)
- Bekreftelsessteg med tydelig varsel om konsekvens
- POST til ny funksjon `cancelBooking` som setter status og sender e-post
**Impact:** 🔴 Høy | **Effort:** M
**Status:** `[ ] Ikke startet`

---

### BOOK-02 · Bookingstatus-side for leietaker (Min booking)
**Problem:** Etter innsending har leietaker ingen side å sjekke bookingstatus. All info kommer i e-post, og linkene peker kun til leieavtale og betaling.
**Forslag:** Lag en `booking-status.html?id={bookingId}` med:
- Status (venter → godkjent → depositum betalt → gjennomført)
- Tidslinje med datoer for hvert steg
- Lenker til leieavtale og betaling når aktuelt
- Avbestillingsknapp (→ BOOK-01)
**Impact:** 🔴 Høy | **Effort:** M
**Status:** `[ ] Ikke startet`

---

### BOOK-03 · Konfliktsjekk mangler i admin-ombooking
**Problem:** `rescheduleBooking`-funksjonen oppdaterer dato/tid uten å sjekke om ny dato kolliderer med eksisterende bookinger. Admin kan utilsiktet skape dobbelbooking.
**Filer:** `functions/src/functions/rescheduleBooking/index.js`
**Forslag:** Gjenbruk dobbelbookingsjekken fra `bookingRequest.js` i ombookingsflyten. Returner 409 ved konflikt.
**Impact:** 🔴 Høy | **Effort:** S
**Status:** `[ ] Ikke startet`

---

## 🟡 Medium prioritet — UX-forbedringer

### BOOK-04 · Feilmeldinger koblet til felt (inline validering)
**Problem:** Valideringsfeil vises i en generisk statusboks under skjemaet. Brukeren må scrolle ned og gjette hvilket felt som mangler.
**Forslag:** Ved valideringsfeil:
1. Vis inline feilmelding under det aktuelle feltet
2. Sett fokus på første feltet med feil
3. Behold oppsummeringsmelding i statusboksen som supplement
**Impact:** 🟡 Medium | **Effort:** M
**Status:** `[ ] Ikke startet`

---

### BOOK-05 · Bankoverføring mangler i complete-payment.html
**Problem:** Betalingssiden (`complete-payment.html`) viser kun «Betal med Vipps»-knappen, men booking kan ha `paymentMethod: 'bank'`. Leietakere som valgte bank ser en Vipps-side uten relevant informasjon.
**Forslag:** Vis kontonummer, beløp og KID/referanse for bookinger med `paymentMethod: 'bank'`. Vis Vipps-knappen bare for `paymentMethod: 'vipps'`.
**Impact:** 🟡 Medium | **Effort:** S
**Status:** `[ ] Ikke startet`

---

### BOOK-06 · Depositum-purring via tidsutløser
**Problem:** Ingen automatisk påminnelse hvis depositum ikke er betalt innen fristen (5 dager). Admin må følge opp manuelt.
**Avhengigheter:** DEP-01, DEP-02
**Forslag:** Azure Timer-funksjon som kjører daglig, finner bookinger med `depositRequested: true`, `depositPaid: false` og `depositRequestedAt` > 5 dager. Sender påminnelses-e-post og varsler admin.
**Impact:** 🟡 Medium | **Effort:** M
**Status:** `[ ] Ikke startet`

---

### BOOK-07 · Paginering i admin-panelet
**Problem:** Admin-panelet henter alle bookinger uten paginering. Ved >100 bookinger vil spørringsytelsen og DOM-ytelsen degradere.
**Forslag:** Implementer datopaginering (vis per måned) eller «last inn mer»-knapp. Bruk `startDate`/`endDate` i CosmosDB-spørring.
**Impact:** 🟡 Medium | **Effort:** M
**Status:** `[ ] Ikke startet`

---

### BOOK-08 · Venteliste / alternative datoer
**Problem:** Når ønsket dato er opptatt, får brukeren kun feilmelding. Ingen forslag til alternative ledige datoer, og ingen venteliste-funksjon.
**Forslag:** Ved 409-konflikt: vis 3 nærmeste ledige helger/datoer. Valgfritt: «Gi meg beskjed hvis datoen blir ledig»-knapp (stopper e-postadressen i en venteliste).
**Impact:** 🟡 Medium | **Effort:** L
**Status:** `[ ] Ikke startet`

---

## 🟢 Lavere prioritet — Teknisk gjeld og polish

### TECH-01 · Cosmos DB-indeks for datospørringer
**Problem:** `listBookings()` i `cosmosDb.js` henter potensielt alle bookinger og filtrerer i minnet. Ingen kompositt-indeks for raskere datospørringer.
**Forslag:** Opprett indeks på `(date, status)` i Cosmos DB-containeren.
**Impact:** 🟢 Lav | **Effort:** XS
**Status:** `[ ] Ikke startet`

---

### TECH-02 · In-memory fallback i cosmosDb.js bør feile i produksjon
**Problem:** `cosmosDb.js` faller tilbake til in-memory lagring hvis Cosmos DB er utilgjengelig, uten advarsel. I produksjon betyr det at data forsvinner ved restart.
**Forslag:** Sjekk `NODE_ENV` / `AZURE_FUNCTIONS_ENVIRONMENT`. I produksjon: kast feil i stedet for å bruke in-memory fallback.
**Impact:** 🟢 Lav | **Effort:** XS
**Status:** `[ ] Ikke startet`

---

### TECH-03 · Sentraliser HTML-oppsett i e-postmaler
**Problem:** Pristabell, bookingoppsummering og betalingstabell bygges som HTML-strenger i flere separate funksjoner (approveBooking, sendDepositRequest, depositPaid, rejectBooking). Endringer i layout må gjøres på mange steder.
**Forslag:** Flytt felles blokker (pristabell, oppsummeringstabell, betalingsinformasjon) til delte funksjoner i `shared/emailTemplate.js`.
**Impact:** 🟢 Lav | **Effort:** M
**Status:** `[ ] Ikke startet`

---

### TECH-04 · Fokus-håndtering i admin-modaler
**Problem:** Omboking- og faktura-modaler i admin-panelet trapper ikke fokus. Tastaturbrukere kan tabbe ut av modal til bakgrunnen.
**Forslag:** Implementer fokus-trap i modale dialoger (bruk `inert`-attributtet eller fokus-loop).
**Impact:** 🟢 Lav | **Effort:** S
**Status:** `[ ] Ikke startet`

---

### TECH-05 · Kalender-tilgjengelighet for skjermlesere
**Problem:** FullCalendar er visuelt robust men har begrenset støtte for skjermlesere. Ingen instruksjoner for tastaturbetjening.
**Forslag:** Legg til en skjult `aria-label` med bruksinstruks. Vurder en fallback tekstbasert liste over kommende reservasjoner (finnes allerede men kan gjøres mer synlig).
**Impact:** 🟢 Lav | **Effort:** S
**Status:** `[ ] Ikke startet`

---

### TEST-01 · Fiks testfeil i E2E-testsuiten
**Problem:** 22 av 75 Playwright-tester feiler. 3 skyldes produktfeil (FIX-01/02/03), resten skyldes testpresisjon (lokator-match, månedsnavigering, URL-mønster).
**Filer:** `tests/e2e/01-calendar.spec.js` – `06-ux-accessibility.spec.js`
**Forslag:** Fiks produktfeilene (FIX-01/02/03) først, deretter oppdater testkoden.
**Impact:** 🟡 Medium | **Effort:** S
**Status:** `[ ] Ikke startet`

---

## Oppsummering — ny backlog

| ID      | Område                             | Impact    | Effort | Status        |
|---------|------------------------------------|-----------|--------|---------------|
| FIX-01  | CSS overstyrer `hidden`            | 🔴 Høy    | XS     | Ikke startet  |
| FIX-02  | Kvittering vises aldri             | 🔴 Høy    | S      | Ikke startet  |
| FIX-03  | Native validering blokkerer norsk  | 🔴 Høy    | XS     | Ikke startet  |
| BOOK-01 | Selvbetjent avbestilling           | 🔴 Høy    | M      | Ikke startet  |
| BOOK-02 | Bookingstatus-side (leietaker)     | 🔴 Høy    | M      | Ikke startet  |
| BOOK-03 | Konfliktsjekk i admin-ombooking    | 🔴 Høy    | S      | Ikke startet  |
| BOOK-04 | Inline validering i skjema         | 🟡 Medium | M      | Ikke startet  |
| BOOK-05 | Bank-betaling på complete-payment  | 🟡 Medium | S      | Ikke startet  |
| BOOK-06 | Depositum-purring automatikk       | 🟡 Medium | M      | Ikke startet  |
| BOOK-07 | Paginering i admin                 | 🟡 Medium | M      | Ikke startet  |
| BOOK-08 | Venteliste / alternative datoer    | 🟡 Medium | L      | Ikke startet  |
| TECH-01 | Cosmos DB dato-indeks              | 🟢 Lav    | XS     | Ikke startet  |
| TECH-02 | Fjern in-memory fallback i prod    | 🟢 Lav    | XS     | Ikke startet  |
| TECH-03 | Sentraliser e-postmaler            | 🟢 Lav    | M      | Ikke startet  |
| TECH-04 | Fokus-trap i admin-modaler         | 🟢 Lav    | S      | Ikke startet  |
| TECH-05 | Kalender-tilgjengelighet           | 🟢 Lav    | S      | Ikke startet  |
| TEST-01 | Fiks E2E-testfeil                  | 🟡 Medium | S      | Ikke startet  |

### Anbefalt rekkefølge

1. **FIX-01 + FIX-03** — Begge er XS-effort éttlinjers fikser som løser synlige brukerfeil
2. **FIX-02** — Aktivér kvitteringsseksjonen som allerede finnes i HTML
3. **TEST-01** — Fiks tester slik at regresjoner kan fanges fremover
4. **BOOK-03** — Liten effort, forhindrer dataintegritetsfeil
5. **BOOK-02** — Gir leietaker selvbetjening og bygger grunnlaget for BOOK-01
6. **BOOK-01** — Avbestilling (avhenger av BOOK-02-side)
7. **BOOK-05** — Bank-betaling på betalingsside
8. **BOOK-04** — Inline validering (brukeropplevelse)
9. **TECH-01 + TECH-02** — Rask teknisk gjeld
10. Resten etter behov
