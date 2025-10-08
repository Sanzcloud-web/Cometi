import type { DomFieldFeature } from './classifyFields';
import { classifyFields, type ClassifyRequest, type Classification } from './classifyFields';

type CollectFieldsResponse = { ok: boolean; items?: DomFieldFeature[]; error?: string };

export async function collectDomFieldsViaBackground(): Promise<DomFieldFeature[]> {
  if (typeof chrome === 'undefined' || typeof chrome.runtime?.sendMessage !== 'function') {
    throw new Error('Commande disponible uniquement dans Chrome.');
  }
  return new Promise<DomFieldFeature[]>((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'dom:collect-fields' }, (response?: CollectFieldsResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Runtime error'));
        return;
      }
      if (!response?.ok || !Array.isArray(response.items)) {
        reject(new Error(response?.error ?? 'Impossible de collecter les champs DOM.'));
        return;
      }
      resolve(response.items);
    });
  });
}

export async function collectAndClassify(request: { language?: string }): Promise<{
  fields: DomFieldFeature[];
  classification: Classification;
}> {
  const fields = await collectDomFieldsViaBackground();
  const payload: ClassifyRequest = { items: fields, language: request.language };
  const classification = await classifyFields(payload);
  return { fields, classification };
}

