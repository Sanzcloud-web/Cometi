const isDev = import.meta.env.MODE === 'development';

export const logger = {
  debug(message: string, context?: unknown) {
    if (isDev) {
      console.debug(`[Cometi::background] ${message}`, context ?? '');
    }
  },
  info(message: string, context?: unknown) {
    if (isDev) {
      console.info(`[Cometi::background] ${message}`, context ?? '');
    }
  },
  warn(message: string, context?: unknown) {
    console.warn(`[Cometi::background] ${message}`, context ?? '');
  },
  error(message: string, context?: unknown) {
    console.error(`[Cometi::background] ${message}`, context ?? '');
  },
};
