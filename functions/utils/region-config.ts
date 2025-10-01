/**
 * Region Configuration System
 *
 * Manages available regions, their bindings, and region-specific settings.
 * Provides centralized configuration for multi-region and multi-tenant support.
 */

export interface RegionConfig {
  code: string;
  name: string;
  displayName: string;
  country: string;
  timezone: string;
  status: "available" | "upcoming" | "private" | "deprecated";
  compliance: string[];
  features: string[];
  sla: {
    uptime: string;
    latency: string;
    support: string;
  };
  bindings: {
    d1: string;
    kv: string;
    r2: string;
  };
  limits: {
    maxTenants: number;
    maxPassports: number;
    maxRequestsPerMonth: number;
  };
  pricing: {
    tier: "standard" | "enterprise" | "private";
    costPerTenant: number;
    costPerRequest: number;
  };
}

export interface RegionStatus {
  available: RegionConfig[];
  upcoming: RegionConfig[];
  private: RegionConfig[];
  deprecated: RegionConfig[];
}

export interface RegionCapabilities {
  dataResidency: boolean;
  privateInstances: boolean;
  customDomains: boolean;
  customBranding: boolean;
  migrationSupport: boolean;
  crossRegionVerification: boolean;
  auditLogging: boolean;
  webhookSupport: boolean;
}

/**
 * Default region configurations
 */
export const REGION_CONFIGS: Record<string, RegionConfig> = {
  US: {
    code: "US",
    name: "us-east-1",
    displayName: "United States (East)",
    country: "United States",
    timezone: "America/New_York",
    status: "available",
    compliance: ["CCPA", "SOC2", "ISO27001"],
    features: ["standard", "enterprise", "audit", "webhooks"],
    sla: {
      uptime: "99.9%",
      latency: "<100ms",
      support: "24/7",
    },
    bindings: {
      d1: "D1_US",
      kv: "KV_US",
      r2: "R2_US",
    },
    limits: {
      maxTenants: 10000,
      maxPassports: 100000,
      maxRequestsPerMonth: 1000000,
    },
    pricing: {
      tier: "standard",
      costPerTenant: 0,
      costPerRequest: 0.001,
    },
  },
  EU: {
    code: "EU",
    name: "eu-west-1",
    displayName: "European Union (Ireland)",
    country: "Ireland",
    timezone: "Europe/Dublin",
    status: "available",
    compliance: ["GDPR", "SOC2", "ISO27001"],
    features: ["standard", "enterprise", "audit", "webhooks", "gdpr"],
    sla: {
      uptime: "99.9%",
      latency: "<150ms",
      support: "24/7",
    },
    bindings: {
      d1: "D1_EU",
      kv: "KV_EU",
      r2: "R2_EU",
    },
    limits: {
      maxTenants: 10000,
      maxPassports: 100000,
      maxRequestsPerMonth: 1000000,
    },
    pricing: {
      tier: "standard",
      costPerTenant: 0,
      costPerRequest: 0.001,
    },
  },
  CA: {
    code: "CA",
    name: "ca-central-1",
    displayName: "Canada (Central)",
    country: "Canada",
    timezone: "America/Toronto",
    status: "available",
    compliance: ["PIPEDA", "SOC2", "ISO27001"],
    features: ["standard", "enterprise", "audit", "webhooks"],
    sla: {
      uptime: "99.9%",
      latency: "<120ms",
      support: "24/7",
    },
    bindings: {
      d1: "D1_CA",
      kv: "KV_CA",
      r2: "R2_CA",
    },
    limits: {
      maxTenants: 10000,
      maxPassports: 100000,
      maxRequestsPerMonth: 1000000,
    },
    pricing: {
      tier: "standard",
      costPerTenant: 0,
      costPerRequest: 0.001,
    },
  },
  AP: {
    code: "AP",
    name: "ap-southeast-1",
    displayName: "Asia Pacific (Singapore)",
    country: "Singapore",
    timezone: "Asia/Singapore",
    status: "upcoming",
    compliance: ["PDPA", "SOC2", "ISO27001"],
    features: ["standard", "enterprise", "audit", "webhooks"],
    sla: {
      uptime: "99.9%",
      latency: "<200ms",
      support: "24/7",
    },
    bindings: {
      d1: "D1_AP",
      kv: "KV_AP",
      r2: "R2_AP",
    },
    limits: {
      maxTenants: 10000,
      maxPassports: 100000,
      maxRequestsPerMonth: 1000000,
    },
    pricing: {
      tier: "standard",
      costPerTenant: 0,
      costPerRequest: 0.001,
    },
  },
  AU: {
    code: "AU",
    name: "ap-southeast-2",
    displayName: "Australia (Sydney)",
    country: "Australia",
    timezone: "Australia/Sydney",
    status: "upcoming",
    compliance: ["Privacy Act", "SOC2", "ISO27001"],
    features: ["standard", "enterprise", "audit", "webhooks"],
    sla: {
      uptime: "99.9%",
      latency: "<180ms",
      support: "24/7",
    },
    bindings: {
      d1: "D1_AU",
      kv: "KV_AU",
      r2: "R2_AU",
    },
    limits: {
      maxTenants: 10000,
      maxPassports: 100000,
      maxRequestsPerMonth: 1000000,
    },
    pricing: {
      tier: "standard",
      costPerTenant: 0,
      costPerRequest: 0.001,
    },
  },
  BR: {
    code: "BR",
    name: "sa-east-1",
    displayName: "Brazil (São Paulo)",
    country: "Brazil",
    timezone: "America/Sao_Paulo",
    status: "upcoming",
    compliance: ["LGPD", "SOC2", "ISO27001"],
    features: ["standard", "enterprise", "audit", "webhooks"],
    sla: {
      uptime: "99.9%",
      latency: "<250ms",
      support: "24/7",
    },
    bindings: {
      d1: "D1_BR",
      kv: "KV_BR",
      r2: "R2_BR",
    },
    limits: {
      maxTenants: 10000,
      maxPassports: 100000,
      maxRequestsPerMonth: 1000000,
    },
    pricing: {
      tier: "standard",
      costPerTenant: 0,
      costPerRequest: 0.001,
    },
  },
};

/**
 * Platform capabilities
 */
export const PLATFORM_CAPABILITIES: RegionCapabilities = {
  dataResidency: true,
  privateInstances: true,
  customDomains: true,
  customBranding: true,
  migrationSupport: true,
  crossRegionVerification: true,
  auditLogging: true,
  webhookSupport: true,
};

/**
 * Get all regions by status
 */
export function getRegionsByStatus(): RegionStatus {
  const regions = Object.values(REGION_CONFIGS);

  return {
    available: regions.filter((r) => r.status === "available"),
    upcoming: regions.filter((r) => r.status === "upcoming"),
    private: regions.filter((r) => r.status === "private"),
    deprecated: regions.filter((r) => r.status === "deprecated"),
  };
}

/**
 * Get region configuration by code
 */
export function getRegionConfig(code: string): RegionConfig | null {
  return REGION_CONFIGS[code.toUpperCase()] || null;
}

/**
 * Get available regions (for tenant creation)
 */
export function getAvailableRegions(): RegionConfig[] {
  return Object.values(REGION_CONFIGS).filter((r) => r.status === "available");
}

/**
 * Get regions for UI display
 */
export function getRegionsForUI(): {
  available: RegionConfig[];
  upcoming: RegionConfig[];
  private: RegionConfig[];
} {
  const status = getRegionsByStatus();
  return {
    available: status.available,
    upcoming: status.upcoming,
    private: status.private,
  };
}

/**
 * Check if region is available for tenant creation
 */
export function isRegionAvailable(code: string): boolean {
  const region = getRegionConfig(code);
  return region?.status === "available" || false;
}

/**
 * Get region bindings for environment
 */
export function getRegionBindings(
  env: any,
  regionCode: string
): {
  d1?: any;
  kv?: any;
  r2?: any;
} {
  const region = getRegionConfig(regionCode);
  if (!region) {
    return {};
  }

  return {
    d1: env[region.bindings.d1],
    kv: env[region.bindings.kv],
    r2: env[region.bindings.r2],
  };
}

/**
 * Validate region configuration
 */
export function validateRegionConfig(
  env: any,
  regionCode: string
): {
  valid: boolean;
  missing: string[];
  available: string[];
} {
  const region = getRegionConfig(regionCode);
  if (!region) {
    return {
      valid: false,
      missing: [],
      available: [],
    };
  }

  const missing: string[] = [];
  const available: string[] = [];

  // Check D1 binding
  if (env[region.bindings.d1]) {
    available.push("d1");
  } else {
    missing.push(region.bindings.d1);
  }

  // Check KV binding
  if (env[region.bindings.kv]) {
    available.push("kv");
  } else {
    missing.push(region.bindings.kv);
  }

  // Check R2 binding
  if (env[region.bindings.r2]) {
    available.push("r2");
  } else {
    missing.push(region.bindings.r2);
  }

  return {
    valid: missing.length === 0,
    missing,
    available,
  };
}

/**
 * Get default region from environment
 */
export function getDefaultRegion(env: any): string {
  return env.DEFAULT_REGION || "US";
}

/**
 * Get all configured regions from environment
 */
export function getConfiguredRegions(env: any): string[] {
  const configured: string[] = [];

  for (const [code, region] of Object.entries(REGION_CONFIGS)) {
    const validation = validateRegionConfig(env, code);
    if (validation.valid) {
      configured.push(code);
    }
  }

  return configured;
}
