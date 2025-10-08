/**
 * Passport data types for the SDK
 * Simplified version for thin client usage
 */

export interface PassportData {
  agent_id: string;
  slug: string;
  name: string;
  owner: string;
  controller_type: string;
  claimed: boolean;
  role: string;
  description: string;
  permissions: string[];
  limits: Record<string, any>;
  regions: string[];
  status: string;
  verification_status: string;
  contact: string;
  source: string;
  created_at: string;
  updated_at: string;
  version: string;
  verification_method?: string;
  links?: Record<string, string>;
  framework?: string[];
  categories?: string[];
  logo_url?: string;
  model_info?: any;
}
