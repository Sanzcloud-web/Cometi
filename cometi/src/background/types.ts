export type ChatCompletionMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatCompletionRequest = {
  type: 'chat:complete';
  payload: {
    messages: ChatCompletionMessage[];
    chatId?: string;
  };
};

export type ChatCompletionResponse =
  | {
      message: string;
    }
  | {
      error: string;
    };

export type ResumeCommandRequest = {
  type: 'commands:resume';
};

export type ResumeCommandSuccess = {
  ok: true;
  result: ResumeCommandResult;
};

export type ResumeCommandFailure = {
  ok: false;
  error: string;
};

export type ResumeCommandResponse = ResumeCommandSuccess | ResumeCommandFailure;

export type ResumeCommandResult = {
  url: string;
  title: string;
  tldr: string[];
  summary: string;
  usedSources: string[];
};
