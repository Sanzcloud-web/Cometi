import type { ResumeSummary } from '../types/resume';

class ResumeCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResumeCommandError';
  }
}

type ResumeCommandRequest = {
  type: 'commands:resume';
};

type ResumeCommandResponse =
  | {
      ok: true;
      result: ResumeSummary;
    }
  | {
      ok: false;
      error: string;
    };

export async function requestResumeSummary(): Promise<ResumeSummary> {
  if (typeof chrome === 'undefined' || typeof chrome.runtime?.sendMessage !== 'function') {
    throw new ResumeCommandError('Commande disponible uniquement dans Chrome.');
  }

  return new Promise<ResumeSummary>((resolve, reject) => {
    const request: ResumeCommandRequest = { type: 'commands:resume' };

    chrome.runtime.sendMessage(request, (response?: ResumeCommandResponse) => {
      if (chrome.runtime.lastError) {
        reject(new ResumeCommandError(chrome.runtime.lastError.message ?? 'Runtime error'));
        return;
      }

      if (!response) {
        reject(new ResumeCommandError('Réponse vide du service d’arrière-plan.'));
        return;
      }

      if (!response.ok) {
        reject(new ResumeCommandError(response.error ?? 'La commande /resume a échoué.'));
        return;
      }

      resolve(response.result);
    });
  });
}
