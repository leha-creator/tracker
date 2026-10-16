/** Две буквы для аватара: первые буквы имени и фамилии или первые две буквы одного слова. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : name.trim().slice(0, 2)
  ).toUpperCase();
}
