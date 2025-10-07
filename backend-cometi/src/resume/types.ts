export type DomSnapshot = {
  html: string;
  title?: string;
};

export type ResumeRequestPayload = {
  url: string;
  title?: string;
  domSnapshot?: DomSnapshot;
};

export type ResumeSummary = {
  url: string;
  title: string;
  tldr: string[];
  summary: string;
  usedSources: string[];
};

export type ResumeServiceEnv = {
  apiKey?: string;
  model?: string;
};
