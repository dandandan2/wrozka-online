export interface FairyProfile {
  name: string | null;
  birthDate: string | null;
  aboutMe: string | null;
}

export function describeProfile(profile: FairyProfile): string {
  const name = profile.name?.trim() ?? "nie podano";
  const birthDate = profile.birthDate ?? "nie podano";
  const aboutMe = profile.aboutMe?.trim() ?? "nie podano";
  return `Imię: ${name}\nData urodzenia: ${birthDate}\nO sobie: ${aboutMe}`;
}

export function describeStyleReference(likedAnswers: string[]): string {
  if (likedAnswers.length === 0) return "";
  const examples = likedAnswers.map((answer, i) => `${i + 1}. ${answer}`).join("\n");
  return `\n\nPoniższe to przykłady odpowiedzi, które użytkownik wcześniej polubił — potraktuj je jako luźną inspirację dla tonu Twojej odpowiedzi, nie kopiuj ich dosłownie i nie powtarzaj tych samych fraz:\n${examples}`;
}
