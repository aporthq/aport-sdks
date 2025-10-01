/**
 * Email Service
 *
 * Generic, scalable email service that supports multiple providers (Resend, SES)
 * with a pluggable architecture. Can send any type of email with configurable
 * content, subject, and sender information.
 */

import { AuthEnv } from "../../types/auth";

export type EmailProvider = "resend" | "ses";

export interface EmailConfig {
  provider: EmailProvider;
  apiKey?: string;
  from: string;
  appName?: string; // Default app name for sender
  region?: string; // For SES
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: Record<string, string>; // For email tracking/tagging
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface MagicLinkEmailData {
  email: string;
  token: string;
  agentId?: string;
  returnUrl?: string;
  provisioned_by_org_id?: string;
}

/**
 * Resend email service implementation
 */
class ResendEmailService {
  constructor(private config: EmailConfig) {}

  /**
   * Send a generic email message
   */
  async sendEmail(message: EmailMessage): Promise<boolean> {
    if (!this.config.apiKey) {
      console.error("Resend API key not configured");
      return false;
    }

    if (!message.html && !message.text) {
      console.error("Email must have either HTML or text content");
      return false;
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.formatSender(),
          to: Array.isArray(message.to) ? message.to : [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: message.replyTo,
          tags: message.tags
            ? Object.entries(message.tags).map(([key, value]) => ({
                name: key,
                value,
              }))
            : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Resend email failed:", response.status, error);
        return false;
      }

      const result = (await response.json()) as { id: string };
      console.log("Email sent via Resend:", result.id);
      return true;
    } catch (error) {
      console.error("Resend email error:", error);
      return false;
    }
  }

  /**
   * Send magic link email (specialized method for backward compatibility)
   */
  async sendMagicLink(
    data: MagicLinkEmailData,
    env?: AuthEnv
  ): Promise<boolean> {
    const template = this.createMagicLinkTemplate(data, env);
    const magicLinkUrl = this.createMagicLinkUrl(data, env);

    const message: EmailMessage = {
      to: data.email,
      subject: template.subject,
      html: template.html.replace("{{MAGIC_LINK}}", magicLinkUrl),
      text: template.text.replace("{{MAGIC_LINK}}", magicLinkUrl),
      tags: {
        type: "magic_link",
        ...(data.agentId && { agent_id: data.agentId }),
      },
    };

    return this.sendEmail(message);
  }

  /**
   * Format sender with app name if provided
   */
  private formatSender(): string {
    if (this.config.appName) {
      return `${this.config.appName} <${this.config.from}>`;
    }
    return this.config.from;
  }

  private createMagicLinkTemplate(
    data: MagicLinkEmailData,
    env?: AuthEnv
  ): EmailTemplate {
    const subject = data.agentId
      ? `Claim your agent passport: ${data.agentId}`
      : "Sign in to APort";

    const magicLinkUrl = this.createMagicLinkUrl(data, env);
    const appName = this.config.appName || "APort";

    const html = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${subject}</title>
  
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  
  <style>
    /* Reset styles */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    
    /* Main styles */
    body {
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
    }
    
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    
    .email-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 32px 24px;
      text-align: center;
    }
    
    .email-header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      line-height: 1.2;
    }
    
    .email-content {
      padding: 32px 24px;
      background-color: #ffffff;
    }
    
    .email-footer {
      padding: 24px;
      background-color: #f8fafc;
      border-top: 1px solid #e5e7eb;
      text-align: center;
    }
    
    .email-footer p {
      margin: 0 0 8px 0;
      font-size: 14px;
      color: #6b7280;
      line-height: 1.4;
    }
    
    .email-footer p:last-child {
      margin-bottom: 0;
    }
    
    /* Button styles */
    .email-button {
      display: inline-block;
      background: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      line-height: 1.25;
      text-align: center;
      transition: background-color 0.2s ease;
    }
    
    .email-button:hover {
      background: #1d4ed8;
    }
    
    /* Responsive */
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .email-header,
      .email-content,
      .email-footer {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
      .email-header h1 {
        font-size: 20px !important;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="email-header">
      <h1>🔐 ${appName}</h1>
    </div>
    
    <!-- Content -->
    <div class="email-content">
      <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
        Hello!
      </p>
      
      ${
        data.agentId
          ? `
      <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.5;">
        ${
          data.provisioned_by_org_id
            ? `An organization has created an agent passport for you: <strong style="color: #2563eb;">${data.agentId}</strong>`
            : `You've requested to claim the agent passport <strong style="color: #2563eb;">${data.agentId}</strong>`
        }.
      </p>
      ${
        data.provisioned_by_org_id
          ? `
      <div style="margin: 0 0 24px 0; padding: 16px; background: #eff6ff; border: 1px solid #3b82f6; border-radius: 8px;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e40af; font-weight: 600;">
          🏢 Sponsored by Organization
        </p>
        <p style="margin: 0; font-size: 14px; color: #1e40af; line-height: 1.4;">
          This agent passport was created and sponsored by organization <strong>${data.provisioned_by_org_id}</strong>. 
          They will remain as a sponsor after you claim ownership.
        </p>
      </div>
      `
          : ""
      }
      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5;">
        Click the button below to complete the claim process:
      </p>
      `
          : `
      <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.5;">
        You've requested to sign in to ${appName}.
      </p>
      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5;">
        Click the button below to complete the sign-in process:
      </p>
      `
      }
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${magicLinkUrl}" class="email-button">
          ${data.agentId ? "Claim Agent Passport" : "Sign In"}
        </a>
      </div>
      
      <div style="margin: 32px 0; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b; font-weight: 500;">
          Or copy and paste this link into your browser:
        </p>
        <p style="margin: 0; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace; font-size: 12px; color: #475569; word-break: break-all; line-height: 1.4;">
          ${magicLinkUrl}
        </p>
      </div>
      
      <div style="margin: 32px 0; padding: 16px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #92400e; font-weight: 600;">
          🔒 Security Note
        </p>
        <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.4;">
          This link will expire in 15 minutes and can only be used once. If you didn't request this email, please ignore it.
        </p>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="email-footer">
      <p>This email was sent from ${appName}</p>
      <p>© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    const text = `
${subject}

Hello!

${
  data.agentId
    ? `
${
  data.provisioned_by_org_id
    ? `An organization has created an agent passport for you: ${data.agentId}`
    : `You've requested to claim the agent passport ${data.agentId}`
}.

${
  data.provisioned_by_org_id
    ? `🏢 SPONSORED BY ORGANIZATION
This agent passport was created and sponsored by organization ${data.provisioned_by_org_id}. 
They will remain as a sponsor after you claim ownership.

`
    : ""
}Click the link below to complete the claim process:
`
    : `
You've requested to sign in to ${appName}.

Click the link below to complete the sign-in process:
`
}

${magicLinkUrl}

Security Note: This link will expire in 15 minutes and can only be used once.

If you didn't request this email, please ignore it.

© ${new Date().getFullYear()} ${appName}
`;

    return { subject, html, text };
  }

  private createMagicLinkUrl(data: MagicLinkEmailData, env?: AuthEnv): string {
    // Use backend URL for API endpoints (callbacks)
    const backendUrl = env ? getBackendBaseUrl(env) : "https://aport.io";

    // For claim emails, use the claim confirm endpoint
    if (data.agentId) {
      return `${backendUrl}/api/claim/confirm?token=${data.token}`;
    }
    // For regular auth emails, use the email callback endpoint
    return `${backendUrl}/api/auth/email/callback?token=${data.token}`;
  }
}

/**
 * AWS SES email service implementation
 */
class SESEmailService {
  constructor(private config: EmailConfig) {}

  /**
   * Send a generic email message
   */
  async sendEmail(message: EmailMessage): Promise<boolean> {
    // TODO: Implement SES integration
    console.log("SES email service not yet implemented");
    return false;
  }

  /**
   * Send magic link email (specialized method for backward compatibility)
   */
  async sendMagicLink(
    data: MagicLinkEmailData,
    env?: AuthEnv
  ): Promise<boolean> {
    const template = this.createMagicLinkTemplate(data, env);
    const magicLinkUrl = this.createMagicLinkUrl(data, env);

    const message: EmailMessage = {
      to: data.email,
      subject: template.subject,
      html: template.html.replace("{{MAGIC_LINK}}", magicLinkUrl),
      text: template.text.replace("{{MAGIC_LINK}}", magicLinkUrl),
      tags: {
        type: "magic_link",
        ...(data.agentId && { agent_id: data.agentId }),
      },
    };

    return this.sendEmail(message);
  }

  /**
   * Format sender with app name if provided
   */
  private formatSender(): string {
    if (this.config.appName) {
      return `${this.config.appName} <${this.config.from}>`;
    }
    return this.config.from;
  }

  private createMagicLinkTemplate(
    data: MagicLinkEmailData,
    env?: AuthEnv
  ): EmailTemplate {
    // Reuse the same template logic as Resend
    const subject = data.agentId
      ? `Claim your agent passport: ${data.agentId}`
      : "Sign in to APort";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 APort Authentication</h1>
    </div>
    
    <p>Hello!</p>
    
    ${
      data.agentId
        ? `
    <p>${
      data.provisioned_by_org_id
        ? `An organization has created an agent passport for you: <strong>${data.agentId}</strong>`
        : `You've requested to claim the agent passport <strong>${data.agentId}</strong>`
    }.</p>
    ${
      data.provisioned_by_org_id
        ? `
    <div style="margin: 20px 0; padding: 15px; background: #eff6ff; border: 1px solid #3b82f6; border-radius: 6px;">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #1e40af;">🏢 Sponsored by Organization</p>
      <p style="margin: 0; color: #1e40af;">
        This agent passport was created and sponsored by organization <strong>${data.provisioned_by_org_id}</strong>. 
        They will remain as a sponsor after you claim ownership.
      </p>
    </div>
    `
        : ""
    }
    <p>Click the button below to complete the claim process:</p>
    `
        : `
    <p>You've requested to sign in to APort.</p>
    <p>Click the button below to complete the sign-in process:</p>
    `
    }
    
    <a href="{{MAGIC_LINK}}" class="button">${
      data.agentId ? "Claim Agent Passport" : "Sign In"
    }</a>
    
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace;">{{MAGIC_LINK}}</p>
    
    <div class="footer">
      <p><strong>Security Note:</strong> This link will expire in 15 minutes and can only be used once.</p>
      <p>If you didn't request this email, please ignore it.</p>
      <p>© ${new Date().getFullYear()} APort</p>
    </div>
  </div>
</body>
</html>`;

    const text = `
${subject}

Hello!

${
  data.agentId
    ? `
${
  data.provisioned_by_org_id
    ? `An organization has created an agent passport for you: ${data.agentId}`
    : `You've requested to claim the agent passport ${data.agentId}`
}.

${
  data.provisioned_by_org_id
    ? `🏢 SPONSORED BY ORGANIZATION
This agent passport was created and sponsored by organization ${data.provisioned_by_org_id}. 
They will remain as a sponsor after you claim ownership.

`
    : ""
}Click the link below to complete the claim process:
`
    : `
You've requested to sign in to Agent Passport.

Click the link below to complete the sign-in process:
`
}

{{MAGIC_LINK}}

Security Note: This link will expire in 15 minutes and can only be used once.

If you didn't request this email, please ignore it.

© ${new Date().getFullYear()} APort
`;

    return { subject, html, text };
  }

  private createMagicLinkUrl(data: MagicLinkEmailData, env?: AuthEnv): string {
    // Use backend URL for API endpoints (callbacks)
    const backendUrl = env ? getBackendBaseUrl(env) : "https://aport.io";

    // For claim emails, use the claim confirm endpoint
    if (data.agentId) {
      return `${backendUrl}/api/claim/confirm?token=${data.token}`;
    }
    // For regular auth emails, use the email callback endpoint
    return `${backendUrl}/api/auth/email/callback?token=${data.token}`;
  }
}

/**
 * Email service factory
 */
export function createEmailService(config: EmailConfig) {
  switch (config.provider) {
    case "resend":
      return new ResendEmailService(config);
    case "ses":
      return new SESEmailService(config);
    default:
      throw new Error(`Unsupported email provider: ${config.provider}`);
  }
}

/**
 * Get app base URL with smart environment detection
 */
export function getAppBaseUrl(env: AuthEnv): string {
  // If APP_BASE_URL is explicitly set, use it
  if (env.APP_BASE_URL) {
    return env.APP_BASE_URL;
  }

  // For Cloudflare Workers/Pages, detect if we're in production
  // In production, use the production domain
  // In development, use localhost:3000
  if (typeof globalThis !== "undefined" && (globalThis as any).location) {
    const hostname = (globalThis as any).location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:3000";
    }
    // In production, construct from current origin
    return `https://${hostname}`;
  }

  // Fallback to production domain
  return "https://aport.io";
}

/**
 * Get the backend API base URL based on environment
 * This is used for API endpoints like callbacks
 */
export function getBackendBaseUrl(env: AuthEnv): string {
  // Check if we're in local development by looking at APP_BASE_URL
  if (env.APP_BASE_URL && env.APP_BASE_URL.includes("localhost")) {
    return "http://localhost:8787";
  }

  // For Cloudflare Workers/Pages, detect if we're in production
  if (typeof globalThis !== "undefined" && (globalThis as any).location) {
    const hostname = (globalThis as any).location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:8787";
    }
    // In production, construct from current origin
    return `https://${hostname}`;
  }

  // Fallback to production domain
  return "https://aport.io";
}

/**
 * Get email configuration from environment
 */
export function getEmailConfig(env: AuthEnv): EmailConfig {
  return {
    provider: (env.EMAIL_PROVIDER as EmailProvider) || "resend",
    apiKey: env.EMAIL_API_KEY || env.RESEND_API_KEY,
    from: env.EMAIL_FROM || (env as any).RESEND_FROM_EMAIL,
    appName: env.APP_NAME || "APort",
    region: env.AWS_REGION,
  };
}

/**
 * Generic email sending function
 */
export async function sendEmail(
  message: EmailMessage,
  env: AuthEnv
): Promise<boolean> {
  const config = getEmailConfig(env);
  const service = createEmailService(config);
  return await service.sendEmail(message);
}

/**
 * Send magic link email (backward compatibility)
 */
export async function sendMagicLinkEmail(
  data: MagicLinkEmailData,
  env: AuthEnv
): Promise<boolean> {
  const config = getEmailConfig(env);
  const service = createEmailService(config);

  return await service.sendMagicLink(data, env);
}

/**
 * Send a simple text email
 */
export async function sendTextEmail(
  to: string | string[],
  subject: string,
  text: string,
  env: AuthEnv,
  options?: {
    replyTo?: string;
    tags?: Record<string, string>;
  }
): Promise<boolean> {
  const message: EmailMessage = {
    to,
    subject,
    text,
    replyTo: options?.replyTo,
    tags: options?.tags,
  };

  return sendEmail(message, env);
}

/**
 * Send an HTML email
 */
export async function sendHtmlEmail(
  to: string | string[],
  subject: string,
  html: string,
  env: AuthEnv,
  options?: {
    text?: string;
    replyTo?: string;
    tags?: Record<string, string>;
  }
): Promise<boolean> {
  const message: EmailMessage = {
    to,
    subject,
    html,
    text: options?.text,
    replyTo: options?.replyTo,
    tags: options?.tags,
  };

  return sendEmail(message, env);
}

/**
 * Send a notification email
 */
export async function sendNotificationEmail(
  to: string | string[],
  title: string,
  message: string,
  env: AuthEnv,
  options?: {
    type?: "info" | "warning" | "error" | "success";
    actionUrl?: string;
    actionText?: string;
  }
): Promise<boolean> {
  const type = options?.type || "info";
  const typeColors = {
    info: "#007bff",
    warning: "#ffc107",
    error: "#dc3545",
    success: "#28a745",
  };

  const appName = "APort";
  const html = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${title}</title>
  
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  
  <style>
    /* Reset styles */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    
    /* Main styles */
    body {
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
    }
    
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    
    .email-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 32px 24px;
      text-align: center;
    }
    
    .email-header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      line-height: 1.2;
    }
    
    .email-content {
      padding: 32px 24px;
      background-color: #ffffff;
    }
    
    .email-footer {
      padding: 24px;
      background-color: #f8fafc;
      border-top: 1px solid #e5e7eb;
      text-align: center;
    }
    
    .email-footer p {
      margin: 0 0 8px 0;
      font-size: 14px;
      color: #6b7280;
      line-height: 1.4;
    }
    
    .email-footer p:last-child {
      margin-bottom: 0;
    }
    
    /* Button styles */
    .email-button {
      display: inline-block;
      background: ${typeColors[type]};
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      line-height: 1.25;
      text-align: center;
      transition: background-color 0.2s ease;
    }
    
    .email-button:hover {
      opacity: 0.9;
    }
    
    /* Responsive */
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .email-header,
      .email-content,
      .email-footer {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
      .email-header h1 {
        font-size: 20px !important;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="email-header">
      <h1>🔐 ${appName}</h1>
    </div>
    
    <!-- Content -->
    <div class="email-content">
      <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
        ${message}
      </p>
      
      ${
        options?.actionUrl && options?.actionText
          ? `
      <div style="text-align: center; margin: 32px 0;">
        <a href="${options.actionUrl}" class="email-button">${options.actionText}</a>
      </div>
      `
          : ""
      }
    </div>
    
    <!-- Footer -->
    <div class="email-footer">
      <p>This email was sent from ${appName}</p>
      <p>© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `
${title}

${message}

${
  options?.actionUrl && options?.actionText
    ? `
${options.actionText}: ${options.actionUrl}
`
    : ""
}

© ${new Date().getFullYear()} APort
`;

  return sendHtmlEmail(to, title, html, env, {
    text,
    tags: {
      type: "notification",
      notification_type: type,
    },
  });
}

/**
 * Generate magic link token
 */
export function generateMagicLinkToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  for (let i = 0; i < 32; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

/**
 * Create magic link token with expiration
 */
export function createMagicLinkToken(
  email: string,
  expiresIn: number = 900
): string {
  const token = generateMagicLinkToken();
  const expiresAt = Date.now() + expiresIn * 1000;

  // In a real implementation, you'd want to sign this token
  // For now, we'll use a simple base64 encoding
  const data = {
    token,
    email,
    expiresAt,
  };

  return btoa(JSON.stringify(data));
}

/**
 * Verify magic link token
 */
export function verifyMagicLinkToken(encodedToken: string): {
  valid: boolean;
  email?: string;
  error?: string;
} {
  try {
    const data = JSON.parse(atob(encodedToken));

    if (!data.token || !data.email || !data.expiresAt) {
      return { valid: false, error: "Invalid token format" };
    }

    if (Date.now() > data.expiresAt) {
      return { valid: false, error: "Token expired" };
    }

    return { valid: true, email: data.email };
  } catch (error) {
    return { valid: false, error: "Invalid token" };
  }
}

/**
 * Rate limiting for email sending
 */
export async function checkEmailRateLimit(
  kv: KVNamespace,
  email: string,
  maxAttempts: number = 5,
  windowMinutes: number = 15
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = `email_rate_limit:${email}`;
  const windowMs = windowMinutes * 60 * 1000;
  const now = Date.now();

  try {
    const data = (await kv.get(key, "json")) as {
      attempts: number;
      resetAt: number;
    } | null;

    if (!data || now > data.resetAt) {
      // No data or window expired, allow request
      await kv.put(
        key,
        JSON.stringify({
          attempts: 1,
          resetAt: now + windowMs,
        }),
        {
          expirationTtl: windowMinutes * 60,
        }
      );

      return {
        allowed: true,
        remaining: maxAttempts - 1,
        resetAt: now + windowMs,
      };
    }

    if (data.attempts >= maxAttempts) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: data.resetAt,
      };
    }

    // Increment attempts
    await kv.put(
      key,
      JSON.stringify({
        attempts: data.attempts + 1,
        resetAt: data.resetAt,
      }),
      {
        expirationTtl: Math.ceil((data.resetAt - now) / 1000),
      }
    );

    return {
      allowed: true,
      remaining: maxAttempts - data.attempts - 1,
      resetAt: data.resetAt,
    };
  } catch (error) {
    console.error("Email rate limit check error:", error);
    // On error, allow the request
    return {
      allowed: true,
      remaining: maxAttempts,
      resetAt: now + windowMs,
    };
  }
}
