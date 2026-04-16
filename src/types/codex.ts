export type CodexInputTextPart = {
  type: "input_text";
  text: string;
};

export type CodexInputMessage = {
  type: "message";
  role: "user" | "assistant";
  content: CodexInputTextPart[];
};

export type CodexResponsesRequest = {
  model: string;
  instructions?: string;
  input: CodexInputMessage[];
  stream: true;
  store: false;
  max_output_tokens?: number;
};
