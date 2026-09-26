export type TarotOrientation = "upright" | "reversed";

export interface TarotCard {
  key: string;
  name: string;
  keywords: string[];
}

export const MAJOR_ARCANA: TarotCard[] = [
  { key: "the-fool", name: "Głupiec", keywords: ["nowy początek", "spontaniczność", "niewinność", "ryzyko"] },
  { key: "the-magician", name: "Mag", keywords: ["sprawczość", "umiejętności", "inicjatywa", "zasoby"] },
  { key: "the-high-priestess", name: "Kapłanka", keywords: ["intuicja", "tajemnica", "podświadomość", "cisza"] },
  { key: "the-empress", name: "Cesarzowa", keywords: ["obfitość", "płodność", "opieka", "natura"] },
  { key: "the-emperor", name: "Cesarz", keywords: ["struktura", "autorytet", "stabilność", "kontrola"] },
  { key: "the-hierophant", name: "Hierofant", keywords: ["tradycja", "nauka", "konwencja", "przynależność"] },
  { key: "the-lovers", name: "Kochankowie", keywords: ["wybór", "relacja", "harmonia", "wartości"] },
  { key: "the-chariot", name: "Rydwan", keywords: ["determinacja", "wola", "kierunek", "zwycięstwo"] },
  { key: "strength", name: "Siła", keywords: ["odwaga", "cierpliwość", "łagodność", "wewnętrzna moc"] },
  { key: "the-hermit", name: "Pustelnik", keywords: ["refleksja", "samotność", "poszukiwanie", "mądrość"] },
  { key: "wheel-of-fortune", name: "Koło Fortuny", keywords: ["zmiana", "cykle", "los", "zwrot akcji"] },
  { key: "justice", name: "Sprawiedliwość", keywords: ["równowaga", "prawda", "konsekwencje", "uczciwość"] },
  {
    key: "the-hanged-man",
    name: "Wisielec",
    keywords: ["zawieszenie", "nowa perspektywa", "poświęcenie", "cierpliwość"],
  },
  { key: "death", name: "Śmierć", keywords: ["zakończenie", "transformacja", "przejście", "odnowa"] },
  { key: "temperance", name: "Umiarkowanie", keywords: ["równowaga", "cierpliwość", "harmonia", "umiar"] },
  { key: "the-devil", name: "Diabeł", keywords: ["przywiązanie", "pokusa", "ograniczenie", "cień"] },
  { key: "the-tower", name: "Wieża", keywords: ["nagła zmiana", "przełom", "objawienie", "kryzys"] },
  { key: "the-star", name: "Gwiazda", keywords: ["nadzieja", "inspiracja", "uzdrowienie", "wiara"] },
  { key: "the-moon", name: "Księżyc", keywords: ["iluzja", "lęk", "podświadomość", "niepewność"] },
  { key: "the-sun", name: "Słońce", keywords: ["radość", "witalność", "sukces", "jasność"] },
  { key: "judgement", name: "Sąd Ostateczny", keywords: ["odrodzenie", "rozliczenie", "powołanie", "przebudzenie"] },
  { key: "the-world", name: "Świat", keywords: ["spełnienie", "całość", "podróż", "osiągnięcie"] },
];

export function drawCard(): { card: TarotCard; orientation: TarotOrientation } {
  const card = MAJOR_ARCANA[Math.floor(Math.random() * MAJOR_ARCANA.length)];
  const orientation: TarotOrientation = Math.random() < 0.5 ? "upright" : "reversed";
  return { card, orientation };
}
