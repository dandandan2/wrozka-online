---
project: "Wróżbita Online"
version: 1
status: draft
created: 2026-08-25
updated: 2026-08-26
prd_version: 1
main_goal: market-feedback
top_blocker: decisions
milestone_id: first-personalized-fairy-loop
milestone_seq: 1
milestone_status: open
---

# Roadmap: Wróżbita Online

> Wyprowadzone z `context/foundation/prd.md` (v1) + automatycznie zbadanej bazy
> kodu. Edytuj w miejscu; archiwizuj przy pełnej regeneracji.
> Poniższe elementy są w kolejności zależności. Tabela "W skrócie" to indeks.

## Milestone

**M-1: Pierwsza spersonalizowana pętla wróżby** — Status: open

- **Intent:** Doprowadzić do stanu, w którym zalogowany użytkownik może
  wypełnić profil, zadać wróżce pytanie, dostać spersonalizowaną odpowiedź,
  polubić ją, zobaczyć historię swoich sesji i zarządzać nią — czyli cały
  zestaw must-have wymagań z PRD v1.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** wszystkie pozycje F-NN i S-NN poniżej mają status `done`.
- **Scope anchors:** FR-001 – FR-010, US-01, NFR (feedback wizualny >2s,
  prywatność danych profilu/historii, limit długości pola "o sobie").

## Vision recap

Osoba szukająca rozrywki chce spersonalizowanej, "magicznej" odpowiedzi od
spójnej postaci wróżki — nie generycznego horoskopu ani bezosobowego czatu.
Rdzeń hipotezy produktu (tzw. **wedge** — cecha, bez której produkt byłby
nieodróżnialny od zwykłego czatu z AI): połączenie profilu użytkownika
(imię, data urodzenia, "o sobie") z mechanizmem uczenia się preferowanego
stylu na podstawie do 10 ostatnio polubionych odpowiedzi ma dawać wrażenie
coraz trafniejszej, "znającej użytkownika" wróżby.

## North star

**S-01: Profil + pytanie + spersonalizowana odpowiedź** — najmniejszy
kompletny przepływ, który jako pierwszy dowodzi, że silnik generowania
odpowiedzi w ogóle działa i uwzględnia dane profilu; wszystko inne (polubienia,
uczenie się stylu, historia) nabiera sensu dopiero, gdy ten przepływ istnieje.

> Gwiazda przewodnia = najmniejszy fragment produktu, który jako pierwszy
> testuje główną hipotezę produktu (tu: czy spersonalizowana odpowiedź w
> ogóle działa i ma sens dla użytkownika) — dlatego stawiamy go najwcześniej,
> zanim zainwestujemy gdziekolwiek indziej.

## At a glance

| ID   | Change ID                        | Outcome (user can …)                                                  | Prerequisites | PRD refs                  | Status   |
| ---- | --------------------------------- | ----------------------------------------------------------------------- | -------------- | -------------------------- | -------- |
| F-01 | fairy-data-foundation             | (foundation) minimalny schemat danych (profil + odpowiedzi wróżki) z RLS | —              | NFR (prywatność)            | done |
| F-02 | passwordless-magic-link-auth      | (foundation) logowanie magic-link/kod zastępuje logowanie hasłowe        | —              | FR-001                     | in-progress |
| S-01 | ask-fairy-personalized-answer     | wypełnić profil, zadać pytanie wróżce i dostać spersonalizowaną odpowiedź | F-01, F-02      | US-01, FR-002, FR-004, FR-005 | proposed |
| S-02 | edit-profile                      | edytować wcześniej wypełniony profil                                    | S-01            | FR-003                     | proposed |
| S-03 | like-response-style-learning      | polubić odpowiedź, a kolejne odpowiedzi odzwierciedlają styl polubień   | S-01            | FR-006, FR-007             | proposed |
| S-04 | session-history-management        | zobaczyć historię sesji, usunąć wpis, polubić/odlubić z poziomu historii | S-01, S-03      | FR-008, FR-009, FR-010     | proposed |

## Streams

Pomoc nawigacyjna — kanoniczna kolejność wciąż wynika z grafu zależności
poniżej; ta tabela to proponowana kolejność czytania równoległych ścieżek.

| Stream | Motyw                              | Łańcuch                     | Uwaga                                                                 |
| ------ | ----------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| A      | Dane + rdzeń pętli wróżby           | `F-01` → `S-01` → `S-02`     | Główna ścieżka pod cel "feedback z rynku" — jak najszybciej do pierwszej odpowiedzi. |
| B      | Logowanie bez hasła                | `F-02`                        | Dołącza do Streamu A przy `S-01`; niezależne od F-01, może iść równolegle. |
| C      | Uczenie się stylu + historia        | `S-03` → `S-04`              | Dołącza do Streamu A przy `S-01`; to jest właściwa weryfikacja hipotezy produktu (rosnąca trafność). |

## Baseline

Co już jest w kodzie na `2026-08-25` (auto-zbadane + potwierdzone przez
użytkownika). Poniższe Foundations zakładają, że to jest prawdą i NIE
odtwarzają tego od nowa.

- **Frontend:** partial — Astro 6 + React 19 islands, Tailwind + shadcn/ui
  skonfigurowane (`components.json`), ale istnieją tylko formularze auth
  (`src/components/auth/*`); brak komponentów profilu/formularza pytania.
- **Backend / API:** partial — trzy route'y auth (`src/pages/api/auth/{signup,signin,signout}.ts`),
  zero integracji AI/LLM.
- **Data:** absent — klient Supabase jest podłączony (`src/lib/supabase.ts`),
  ale nie istnieje ani jedna tabela/migracja (`supabase/` ma tylko `config.toml`).
- **Auth:** partial — Supabase Auth działa, ale logowaniem hasłowym
  (`signInWithPassword`/`signUp`), nie magic-link/kodem wymaganym przez FR-001;
  middleware chroniące `/dashboard` już działa (`src/middleware.ts`).
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`) + GitHub
  Actions CI z auto-deployem na `main` (`.github/workflows/ci.yml`).
- **Observability:** absent — brak logowania/error-trackingu/metryk w kodzie
  aplikacji poza wbudowanym loggingiem Workers.

## Foundations

### F-01: Minimalny fundament danych

- **Outcome:** (foundation) istnieje minimalny schemat danych — tabela
  profilu użytkownika i tabela odpowiedzi wróżki — z politykami RLS
  ograniczającymi dostęp wyłącznie do właściciela danych.
- **Change ID:** fairy-data-foundation
- **PRD refs:** NFR (dane profilowe i historia dostępne wyłącznie dla
  właściciela)
- **Unlocks:** S-01 (bez tego nie ma gdzie zapisać profilu ani
  wygenerowanej odpowiedzi); pośrednio odblokowuje też S-02/S-03/S-04, które
  rozszerzają te same tabele wąskimi migracjami we własnym zakresie, bez
  potrzeby kolejnego fundamentu.
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Baza danych jest dziś całkowicie pusta — to jedyny fundament
  wymagany przed jakąkolwiek trwałością danych; trzymamy go minimalnym
  (2 tabele), żeby nie zamienić się w "cały model danych z góry".
- **Status:** done

### F-02: Logowanie magic-link zamiast hasła

- **Outcome:** (foundation) logowanie odbywa się przez magic link/kod
  wysyłany na e-mail zamiast przez hasło; istniejące formularze i route'y
  auth przełączone na przepływ bezhasłowy.
- **Change ID:** passwordless-magic-link-auth
- **PRD refs:** FR-001
- **Unlocks:** poprawnie zgodny z PRD przepływ logowania wymagany przez
  każdy downstream slice zaczynający się od "zalogowany użytkownik"
  (S-01…S-04); pokrywa must-have FR-001.
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Trzeba przerobić trzy istniejące route'y (`signup.ts`,
  `signin.ts`, `signout.ts`) i dwa komponenty formularzy auth zbudowane pod
  hasło — umiarkowany zakres prac, ale niskie ryzyko, bo Supabase natywnie
  wspiera logowanie OTP/magic-link.
- **Status:** in-progress

## Slices

### S-01: Profil + pytanie + spersonalizowana odpowiedź

- **Outcome:** użytkownik wypełnia profil (imię, data urodzenia, "o sobie"),
  zadaje pytanie wróżce i otrzymuje wygenerowaną, spersonalizowaną odpowiedź.
- **Change ID:** ask-fairy-personalized-answer
- **PRD refs:** US-01, FR-002, FR-004, FR-005, NFR (widoczny feedback przy
  generowaniu >2s, limit długości pola "o sobie")
- **Prerequisites:** F-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Który dostawca/model AI wygeneruje treść odpowiedzi wróżki (koszt,
    latencja pod limitem 10ms CPU na Cloudflare Workers free tier, i
    unikanie tematyki medycznej/finansowej/prawnej per FR-005)? — Owner:
    użytkownik/zespół, rozstrzygane w `/10x-plan`. Block: no.
  - Dokładna wartość limitu długości pola "o sobie"? — Owner: zespół. Block: no.
- **Risk:** To jest gwiazda przewodnia — sekwencjonowana najwcześniej, jak
  tylko oba fundamenty (dane, logowanie) są gotowe, żeby jak najszybciej
  zweryfikować, czy spersonalizowana odpowiedź w ogóle ma sens dla
  użytkownika.
- **Status:** proposed

### S-02: Edycja profilu

- **Outcome:** użytkownik edytuje wcześniej wypełniony profil (imię, data
  urodzenia, "o sobie").
- **Change ID:** edit-profile
- **PRD refs:** FR-003
- **Prerequisites:** S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Niska złożoność — rozszerza istniejący formularz profilu z S-01;
  jedyne ryzyko to spójność z limitem długości "o sobie" ustalonym w S-01.
- **Status:** proposed

### S-03: Polubienie odpowiedzi i uczenie się stylu

- **Outcome:** użytkownik lubi (like) otrzymaną odpowiedź, a do 10 ostatnio
  polubionych odpowiedzi wpływa jako wzorzec stylu na odpowiedzi w kolejnych
  sesjach.
- **Change ID:** like-response-style-learning
- **PRD refs:** FR-006, FR-007
- **Prerequisites:** S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Czy limit 10 ostatnich polubionych odpowiedzi jako wzorzec stylu jest
    właściwy? — Owner: użytkownik/zespół. Do przetestowania po launchu na
    podstawie realnego użycia. Block: no.
- **Risk:** To jest właściwa weryfikacja głównej hipotezy produktu
  (rosnąca trafność wróżby) — sekwencjonowana zaraz po S-01, żeby cel
  "feedback z rynku" mógł zostać sprawdzony jak najszybciej.
- **Status:** proposed

### S-04: Zarządzanie historią sesji

- **Outcome:** użytkownik widzi historię swoich sesji/wróżb, może usunąć
  wpis (co usuwa go też z puli wzorców stylu) oraz polubić/odlubić wpis z
  poziomu historii.
- **Change ID:** session-history-management
- **PRD refs:** FR-008, FR-009, FR-010
- **Prerequisites:** S-01, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zależy od S-03 (pula wzorców stylu), bo usunięcie wpisu z
  historii musi też usuwać go z tej puli (FR-009) — sekwencjonowany jako
  ostatni, żeby ta reguła miała co usuwać.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                    | Suggested issue title                                    | Ready for `/10x-plan` | Notes |
| ---------- | ------------------------------ | ------------------------------------------------------------ | --------------------- | ----- |
| F-01       | fairy-data-foundation           | Minimalny schemat danych (profil + odpowiedzi) z RLS          | yes                   | Run `/10x-plan fairy-data-foundation` |
| F-02       | passwordless-magic-link-auth   | Zamiana logowania hasłowego na magic-link/kod                 | yes                   | Run `/10x-plan passwordless-magic-link-auth` |
| S-01       | ask-fairy-personalized-answer  | Profil + pytanie do wróżki + spersonalizowana odpowiedź       | no                    | Czeka na F-01 i F-02 |
| S-02       | edit-profile                    | Edycja profilu użytkownika                                     | no                    | Czeka na S-01 |
| S-03       | like-response-style-learning   | Polubienie odpowiedzi + uczenie się stylu                     | no                    | Czeka na S-01 |
| S-04       | session-history-management      | Historia sesji: podgląd, usuwanie, like/unlike                | no                    | Czeka na S-01, S-03 |

## Open Roadmap Questions

1. **Czy limit 10 ostatnich polubionych odpowiedzi uwzględnianych jako
   wzorzec stylu jest właściwy?** — Owner: użytkownik/zespół. Block: S-03
   (nie blokująco — do przetestowania po launchu, nie wstrzymuje MVP).
2. **Którego dostawcę/model AI wybrać do generowania odpowiedzi wróżki,
   biorąc pod uwagę koszt vs. 3-tygodniowy budżet po godzinach i limit
   CPU na Cloudflare Workers?** — Owner: użytkownik/zespół. Block: S-01, S-03
   (nieblokująco na poziomie roadmapy — rozstrzygane w `/10x-plan`, ale to
   główne ryzyko tego milestone'u per `top_blocker: decisions`).

## Parked

- **Płatności/subskrypcje** — Why parked: PRD §Non-Goals — aplikacja
  darmowa na start, monetyzacja to temat na później.
- **Wiele person/wróżek do wyboru** — Why parked: PRD §Non-Goals — MVP ma
  jedną, spójną postać wróżki.
- **Dodatkowe metody wróżenia (tarot, karty, runy)** — Why parked: PRD
  §Non-Goals — MVP opiera się wyłącznie na tekstowej odpowiedzi.
- **Udostępnianie wróżb innym użytkownikom (social sharing)** — Why parked:
  PRD §Non-Goals — wróżby pozostają prywatne.
- **Offline / natywna aplikacja mobilna** — Why parked: PRD §Non-Goals —
  MVP działa wyłącznie jako aplikacja webowa online.

## Milestone History

(brak — to pierwszy milestone)

## Done

- **F-01: (foundation) minimalny schemat danych (profil + odpowiedzi wróżki) z RLS** — Archived 2026-08-26 → `context/archive/2026-08-25-fairy-data-foundation/`. Lesson: —.
