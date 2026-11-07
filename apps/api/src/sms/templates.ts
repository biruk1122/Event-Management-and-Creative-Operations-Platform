import type { SmsCategory } from "./sms.types.js";

/**
 * Central SMS templates. Business modules pass a template key and parameters,
 * never raw text, so message wording and length live in one place.
 */
export interface SmsTemplateDefinition {
  key: string;
  category: SmsCategory;
  render: (params: Record<string, string>) => string;
}

export const SMS_TEMPLATES = {
  TEST_CONNECTION: {
    key: "test.connection",
    category: "TEST",
    render: () => "LELA: This is an SMS connection test. No action is needed.",
  },
} as const satisfies Record<string, SmsTemplateDefinition>;

export type SmsTemplateName = keyof typeof SMS_TEMPLATES;

/** Longest body accepted for one message (three standard segments). */
export const SMS_MAX_BODY_LENGTH = 480;

export function renderTemplate(
  name: SmsTemplateName,
  params: Record<string, string> = {},
): string {
  const template: SmsTemplateDefinition = SMS_TEMPLATES[name];
  const body = template.render(params);
  if (body.length > SMS_MAX_BODY_LENGTH) {
    throw new Error(
      `SMS template ${name} exceeds ${SMS_MAX_BODY_LENGTH} characters`,
    );
  }
  return body;
}
