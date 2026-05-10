export type CodexInputTextPart = {
  type: "input_text";
  text: string;
};

export type CodexInputImagePart = {
  type: "input_image";
  image_url: string;
  detail?: "auto" | "low" | "high";
};

export type CodexInputPart = CodexInputTextPart | CodexInputImagePart;

export type CodexInputMessage = {
  type: "message";
  role: "user" | "assistant";
  content: CodexInputPart[];
};

export type CodexResponsesRequest = {
  model: string;
  instructions?: string;
  input: CodexInputMessage[];
  stream: true;
  store: false;
};
