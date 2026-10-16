/**
 * Фрагменты подключения Claude Code к MCP-серверу Tasker. Одни и те же тексты показывает
 * диалог токена в профиле и описывает docs/agents.md.
 */

/** Имя сервера в Claude Code: промпты доступны как `/mcp__tasker__start_task`. */
export const MCP_SERVER_NAME = 'tasker';
/** Переменная окружения с токеном для `.mcp.json` (токен не попадает в репозиторий). */
export const TASKER_TOKEN_ENV = 'TASKER_TOKEN';

export function mcpEndpointUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/mcp`;
}

/**
 * Команда `claude mcp add`. Токен сохраняется в локальных настройках Claude Code
 * (`--scope local` — только для этого репозитория и только у вас, вне git).
 */
export function buildClaudeMcpCommand(baseUrl: string, token: string): string {
  return [
    `claude mcp add --transport http --scope local ${MCP_SERVER_NAME}`,
    mcpEndpointUrl(baseUrl),
    `--header "Authorization: Bearer ${token}"`,
  ].join(' ');
}

/** `.mcp.json` для корня репозитория: токен подставляется из переменной окружения. */
export function buildMcpJson(baseUrl: string): string {
  const config = {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: 'http',
        url: mcpEndpointUrl(baseUrl),
        headers: { Authorization: `Bearer \${${TASKER_TOKEN_ENV}}` },
      },
    },
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}
