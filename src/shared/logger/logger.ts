import 'server-only';

import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import pretty from 'pino-pretty';

import { getEnv, type LogLevel } from '@/shared/env';

export type { Logger } from 'pino';

/** Пути, значения которых никогда не попадают в логи. */
export const REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
  '*.headers.authorization',
  '*.headers.cookie',
  'cookie',
  '*.cookie',
  'accessKeyId',
  '*.accessKeyId',
  'secretAccessKey',
  '*.secretAccessKey',
  'newPassword',
  '*.newPassword',
  'sessionToken',
  '*.sessionToken',
  // OAuth/OIDC (вход через IdP). Общие имена code и state не скрываем: так называются коды ошибок
  // и состояния — сам код авторизации и state в логи не передаются.
  'idToken',
  '*.idToken',
  'id_token',
  '*.id_token',
  'id_token_hint',
  '*.id_token_hint',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'codeVerifier',
  '*.codeVerifier',
  'code_verifier',
  '*.code_verifier',
  // Учётные данные SMTP (nodemailer: auth.pass).
  'pass',
  '*.pass',
];

export interface RootLoggerOptions {
  level: LogLevel;
  /** Человекочитаемый вывод (dev). В production — JSON в stdout. */
  pretty: boolean;
  /** Кастомный поток вывода (используется в тестах). */
  destination?: DestinationStream;
}

export function createRootLogger({
  level,
  pretty: usePretty,
  destination,
}: RootLoggerOptions): Logger {
  const options: LoggerOptions = {
    level,
    base: { app: 'tasker' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    serializers: { err: pino.stdSerializers.err, error: pino.stdSerializers.err },
  };

  if (destination) return pino(options, destination);

  if (usePretty) {
    // Синхронный поток вместо transport: без worker threads, корректно работает в Next.js dev.
    return pino(
      options,
      pretty({
        colorize: true,
        sync: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname,app',
      }),
    );
  }

  return pino(options);
}

let root: Logger | undefined;

function getRootLogger(): Logger {
  if (!root) {
    const env = getEnv();
    root = createRootLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
    root.info({ scope: 'logger', level: env.LOG_LEVEL, env: env.NODE_ENV }, '[logger] initialized');
  }
  return root;
}

/**
 * Child-логгер с полем `scope`. Инициализация ленивая: корневой логгер создаётся при первой записи.
 * Формат сообщений: `log.debug({ ...data }, '[Scope.method] message')`.
 */
export function createLogger(scope: string, bindings: Record<string, unknown> = {}): Logger {
  let child: Logger | undefined;
  const resolve = () => (child ??= getRootLogger().child({ scope, ...bindings }));

  return new Proxy({} as Logger, {
    get(_target, key: string | symbol) {
      const target = resolve();
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

/** Корневой логгер (ленивый). Для модульного кода предпочитайте `createLogger(scope)`. */
export const logger: Logger = new Proxy({} as Logger, {
  get(_target, key: string | symbol) {
    const target = getRootLogger();
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  },
});
