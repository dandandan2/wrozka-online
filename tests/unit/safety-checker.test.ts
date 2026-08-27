import { describe, expect, it } from "vitest";
import { checkFairyAnswerSafety } from "@/lib/ai/safety-checker";

describe("checkFairyAnswerSafety", () => {
  it.each([
    ["medical", "Weź 500 mg paracetamolu na ból głowy."],
    ["medical", "Zażyj dwie tabletki przed snem, to pomoże."],
    ["medical", "Powinieneś odstawić leki na nadciśnienie."],
    ["financial", "Kup akcje spółki X już teraz, to się opłaci."],
    ["financial", "Zaciągnij kredyt na ten dom, gwiazdy sprzyjają."],
    ["legal", "Podpisz tę umowę bez wahania."],
    ["legal", "Złóż pozew przeciwko sąsiadowi jeszcze dziś."],
    ["legal", "Zgodnie z art. 15 masz do tego pełne prawo."],
  ] as const)("flags a concrete %s recommendation: %s", (category, answer) => {
    expect(checkFairyAnswerSafety(answer)).toEqual({ safe: false, category });
  });

  it.each([
    "Gwiazdy mówią, że czeka Cię wielka zmiana w życiu zawodowym.",
    "Twoje zdrowie jest ważne, zadbaj o odpoczynek i relaks.",
    "Pieniądze do Ciebie wrócą, gdy otworzysz się na nowe możliwości.",
    "Nowa umowa może pojawić się w Twoim życiu, obserwuj znaki.",
  ])("does not flag a benign, topic-adjacent fairy answer: %s", (answer) => {
    expect(checkFairyAnswerSafety(answer)).toEqual({ safe: true });
  });
});
