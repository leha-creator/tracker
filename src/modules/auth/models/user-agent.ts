export interface UserAgentInfo {
  browser: string | null;
  os: string | null;
  /** «Chrome · Windows», «Safari · iPhone» или «Неизвестное устройство». */
  label: string;
}

// Порядок важен: Edge, Opera и Яндекс Браузер содержат «Chrome», а Chrome — «Safari».
const BROWSERS: [RegExp, string][] = [
  [/YaBrowser\//, 'Яндекс Браузер'],
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

function match(ua: string, table: [RegExp, string][]): string | null {
  return table.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
}

/** Короткая подпись устройства по User-Agent (без внешней библиотеки, только популярные браузеры). */
export function describeUserAgent(ua: string | null | undefined): UserAgentInfo {
  if (!ua) return { browser: null, os: null, label: 'Неизвестное устройство' };
  const browser = match(ua, BROWSERS);
  const os = match(ua, SYSTEMS);
  const label = [browser, os].filter(Boolean).join(' · ') || 'Неизвестное устройство';
  return { browser, os, label };
}
