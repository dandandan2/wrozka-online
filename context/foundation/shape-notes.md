---
project: "Wróżbita Online"
context_type: greenfield
created: 2026-08-24
updated: 2026-08-24
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  product_type: web-app
  target_scale:
    users: small
    qps: low
    data_volume: small
  timeline_budget:
    mvp_weeks: 3
    hard_deadline: null
    after_hours_only: true
  gray_areas_resolved:
    - topic: "kategoria bólu"
      decision: "brak decyzyjności / potrzeba impulsu do refleksji"
    - topic: "insight"
      decision: "personaz wróżki + uczenie się stylu z polubień (do 10 ostatnich)"
    - topic: "zakres persony"
      decision: "pojedynczy zarejestrowany użytkownik indywidualny, dowolna osoba online"
    - topic: "auth strategy"
      decision: "logowanie bezhasłowe (magic link / kod)"
    - topic: "role"
      decision: "płaski model — jedna rola: zalogowany użytkownik"
    - topic: "MVP flow"
      decision: "login → profil → pytanie do wróżki → odpowiedź LLM → like → historia"
    - topic: "timeline"
      decision: "3 tygodnie po godzinach, zaakceptowane bez skracania zakresu"
  frs_drafted: 10
  quality_check_status: accepted
---

## Vision & Problem Statement

Osoba szukająca rozrywki i chwili refleksji nad sobą sięga po "Wróżbitę Online"
w momencie, gdy chce uzyskać spersonalizowaną, "magiczną" odpowiedź na
nurtujące pytanie — zamiast generycznego horoskopu z gazety/apki albo
bezosobowego czatu z AI bez charakteru. Dziś w tym celu korzysta z ogólnych
horoskopów lub zwykłych chatbotów, które nie uwzględniają jej imienia, daty
urodzenia ani kontekstu, i nie pamiętają, jaki styl odpowiedzi jej się podoba.

Insight: połączenie spójnej postaci wróżki (personaz, klimat, ton) z
mechanizmem uczenia się preferowanego stylu na podstawie polubionych
odpowiedzi (do 10 ostatnich) daje wrażenie coraz bardziej trafnej,
"znającej użytkownika" wróżby — czego nie oferują generyczne horoskopy ani
standardowe czaty z AI bez pamięci o preferencjach.

## User & Persona

Pojedynczy zarejestrowany użytkownik indywidualny — dowolna osoba online,
bez segmentacji wg roli czy organizacji. Sięga po aplikację, gdy chce
zadać pytanie i otrzymać spersonalizowaną, klimatyczną odpowiedź od
"wróżki", zamiast szukać generycznego horoskopu.

## Access Control

Logowanie bezhasłowe (magic link / kod wysyłany na e-mail). Płaski model
użytkowników — jedna rola: zalogowany użytkownik, z dostępem wyłącznie do
własnego profilu i własnej historii wróżb. Brak ról administracyjnych w MVP.

## Success Criteria

### Primary
- Zalogowany użytkownik może wypełnić profil, zadać pytanie wróżce,
  otrzymać wygenerowaną przez LLM odpowiedź i polubić ją.
- Polubione odpowiedzi (do 10 ostatnich) są przekazywane do LLM w kolejnych
  sesjach jako wzorzec preferowanego stylu.

### Secondary
- Użytkownicy wracają na kolejne sesje wróżby (retencja).

### Guardrails
- Prywatność danych profilu (imię, data urodzenia, "o sobie") i treści
  wróżb — nie mogą wyciekać do innych użytkowników.

## Functional Requirements

### Uwierzytelnianie i profil
- FR-001: Użytkownik może zalogować się przez magic link/kod (bez hasła). Priority: must-have
  > Socrates: Kontrargument rozważony: brak — decyzja stoi jak jest.
- FR-002: Użytkownik może wypełnić profil (imię, data urodzenia, "o sobie"). Priority: must-have
  > Socrates: Kontrargument rozważony: pole "o sobie" bez limitu może rozdymać prompt LLM.
  > Rozstrzygnięcie: dodać NFR ograniczający długość pola "o sobie", egzekwowany w UI.
- FR-003: Użytkownik może edytować swój profil. Priority: must-have
  > Socrates: Kontrargument rozważony: brak — decyzja stoi jak jest.

### Zapytanie do wróżki
- FR-004: Użytkownik może zadać pytanie wróżce w formularzu. Priority: must-have
  > Socrates: patrz FR-005 (rozpatrzone łącznie).
- FR-005: Aplikacja generuje odpowiedź wróżki przez LLM. Priority: must-have
  > Socrates: Kontrargument rozważony: brak moderacji treści może prowadzić do
  > szkodliwych odpowiedzi (np. rad zdrowotnych/finansowych) potraktowanych serio.
  > Rozstrzygnięcie: dodać widoczny disclaimer "to rozrywka, nie porada" w UI oraz
  > system prompt LLM unikający tematyki medycznej/finansowej/prawnej.
- FR-006: Użytkownik może polubić (like) otrzymaną odpowiedź. Priority: must-have
  > Socrates: patrz FR-007 (rozpatrzone łącznie).
- FR-007: Do 10 ostatnich polubionych odpowiedzi jest przekazywanych do LLM jako wzorzec preferowanego stylu w kolejnych sesjach. Priority: must-have
  > Socrates: Kontrargument rozważony: limit 10 może być arbitralny (za mało/za dużo
  > kontekstu). Rozstrzygnięcie: zostaje na MVP, ale liczba do przetestowania po
  > launchu — patrz Open Questions.

### Historia sesji
- FR-008: Użytkownik widzi historię swoich sesji/wróżb. Priority: must-have
  > Socrates: patrz FR-009 (rozpatrzone łącznie).
- FR-009: Użytkownik może usunąć wpis z historii. Priority: must-have
  > Socrates: Kontrargument rozważony: usunięcie polubionego wpisu z historii mogłoby
  > pozostawić go w puli wzorców stylu, mimo że user już go nie chce widzieć.
  > Rozstrzygnięcie: usunięcie wpisu usuwa go też z puli wzorców stylu przekazywanych do LLM.
- FR-010: Użytkownik może polubić/odlubić wpis z poziomu historii. Priority: must-have
  > Socrates: patrz FR-007 — to samo rozstrzygnięcie o limicie 10 dotyczy tej ścieżki.

## User Stories

### US-01: Użytkownik zadaje pytanie wróżce i otrzymuje spersonalizowaną odpowiedź

- **Given** zalogowany użytkownik z wypełnionym profilem
- **When** wpisuje pytanie do wróżki i wysyła formularz
- **Then** otrzymuje wygenerowaną przez LLM odpowiedź i może ją polubić

#### Acceptance Criteria
- Odpowiedź LLM uwzględnia dane profilu (imię, data urodzenia, "o sobie")
- Jeśli istnieją wcześniej polubione odpowiedzi (maks. 10), są przekazane do LLM jako wzorzec preferowanego stylu
- Brak wcześniejszych polubień nie blokuje wygenerowania odpowiedzi

## Non-Functional Requirements

- Użytkownik widzi ciągły, widoczny feedback (np. wskaźnik postępu) podczas
  generowania odpowiedzi wróżki, gdy operacja trwa dłużej niż 2 sekundy.
- Dane profilowe (imię, data urodzenia, "o sobie") i historia sesji/wróżb są
  dostępne wyłącznie dla ich właściciela — żaden inny użytkownik nie może ich
  odczytać.
- Pole "o sobie" w profilu ma rozsądny, egzekwowany limit długości, tak by
  nie rozdymać kontekstu przekazywanego do LLM.

## Business Logic

Aplikacja komponuje spersonalizowaną wróżbę, łącząc treść odpowiadającą na
pytanie użytkownika z kontekstem jego profilu (imię, data urodzenia, "o sobie")
oraz stylem wynikającym z do 10 ostatnio polubionych przez niego odpowiedzi.

Wejścia reguły: treść pytania zadanego przez użytkownika, dane profilu oraz
zbiór jego dotychczasowych polubionych odpowiedzi (maks. 10, malejąco po
czasie). Wyjście: tekstowa odpowiedź "wróżki" w stylu dopasowanym do
preferencji użytkownika. Użytkownik spotyka tę regułę za każdym razem, gdy
zadaje pytanie w formularzu wróżby — im więcej polubień zgromadzi w czasie,
tym bardziej odpowiedzi mają odzwierciedlać jego preferowany styl.

Ze względu na wrażliwość tematu (odpowiedzi mogą być odczytane jako realna
porada), aplikacja utrzymuje widoczny disclaimer "to rozrywka, nie porada" i
unika tematyki medycznej, finansowej i prawnej w generowanych odpowiedziach.

## Non-Goals

- Brak płatności/subskrypcji w MVP — aplikacja jest darmowa na start,
  monetyzacja to temat na później.
- Brak wielu person/wróżek do wyboru — MVP ma jedną, spójną postać wróżki,
  bez wyboru charakteru czy stylu innej postaci.
- Brak dodatkowych metod wróżenia (np. tarot, karty, runy) — MVP opiera się
  wyłącznie na tekstowej odpowiedzi generowanej przez LLM na podstawie pytania.
- Brak udostępniania wróżb innym użytkownikom (social sharing) — wróżby
  pozostają prywatne, bez publikowania czy udostępniania publicznie.
- Brak gwarancji offline / natywnej aplikacji mobilnej — MVP działa wyłącznie
  jako aplikacja webowa online.

## Open Questions

1. **Czy limit 10 ostatnich polubionych odpowiedzi przekazywanych do LLM jako
   wzorzec stylu jest właściwy?** — Owner: użytkownik/zespół. Do przetestowania
   po launchu na podstawie realnego użycia; nie blokuje MVP.

## Forward: tech-stack

_(brak notatek na razie)_

## Forward: technical-roadmap

_(brak notatek na razie)_
