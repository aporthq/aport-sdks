/**
 * Route to Capability Mapping for Express Middleware
 *
 * This module defines the mapping between API routes and required capabilities
 * for the Express middleware to enforce capability-based authorization.
 */

import { CapabilityId } from "./types";

/**
 * Route pattern to capability mapping
 *
 * Each route pattern maps to one or more required capabilities.
 * The middleware will check if the agent has ALL required capabilities.
 */
export const ROUTE_CAPABILITY_MAP: Record<string, CapabilityId[]> = {
  // Payment routes
  "/api/payments/refund": ["finance.payment.refund"],
  "/api/payments/refund/*": ["finance.payment.refund"],
  "/api/payments/payout": ["payments.payout"],
  "/api/payments/payout/*": ["payments.payout"],
  "/api/payments/*": ["finance.payment.refund", "payments.payout"],

  // Returns routes
  "/api/returns": ["returns.process"],
  "/api/returns/*": ["returns.process"],
  "/api/returns/process": ["returns.process"],
  "/api/returns/approve": ["returns.process"],

  // Inventory routes
  "/api/inventory": ["inventory.adjust"],
  "/api/inventory/*": ["inventory.adjust"],
  "/api/inventory/adjust": ["inventory.adjust"],
  "/api/inventory/stock": ["inventory.adjust"],

  // Data export routes
  "/api/data/export": ["data.export"],
  "/api/data/export/*": ["data.export"],
  "/api/exports": ["data.export"],
  "/api/exports/*": ["data.export"],
  "/api/reports": ["data.export"],
  "/api/reports/*": ["data.export"],

  // Data deletion routes
  "/api/data/delete": ["data.delete"],
  "/api/data/delete/*": ["data.delete"],
  "/api/data/purge": ["data.delete"],
  "/api/data/purge/*": ["data.delete"],

  // Identity and role management
  "/api/identity/roles": ["identity.manage_roles"],
  "/api/identity/roles/*": ["identity.manage_roles"],
  "/api/users/roles": ["identity.manage_roles"],
  "/api/users/roles/*": ["identity.manage_roles"],
  "/api/permissions": ["identity.manage_roles"],
  "/api/permissions/*": ["identity.manage_roles"],

  // Messaging routes
  "/api/messages": ["messaging.send"],
  "/api/messages/*": ["messaging.send"],
  "/api/notifications": ["messaging.send"],
  "/api/notifications/*": ["messaging.send"],
  "/api/email": ["messaging.send"],
  "/api/email/*": ["messaging.send"],
  "/api/slack": ["messaging.send"],
  "/api/slack/*": ["messaging.send"],
  "/api/discord": ["messaging.send"],
  "/api/discord/*": ["messaging.send"],
  "/api/messaging": ["messaging.send"],
  "/api/messaging/*": ["messaging.send"],

  // CRM routes
  "/api/crm": ["crm.update"],
  "/api/crm/*": ["crm.update"],
  "/api/customers": ["crm.update"],
  "/api/customers/*": ["crm.update"],
  "/api/contacts": ["crm.update"],
  "/api/contacts/*": ["crm.update"],

  // Repository routes - PR creation
  "/api/repo/pr": ["repo.pr.create"],
  "/api/repo/pr/*": ["repo.pr.create"],
  "/api/repo/pull-request": ["repo.pr.create"],
  "/api/repo/pull-request/*": ["repo.pr.create"],
  "/api/pull-requests/create": ["repo.pr.create"],
  "/api/github/pr": ["repo.pr.create"],
  "/api/github/pr/*": ["repo.pr.create"],
  "/api/gitlab/mr": ["repo.pr.create"],
  "/api/gitlab/mr/*": ["repo.pr.create"],

  // Repository routes - Merging
  "/api/repo/merge": ["repo.merge"],
  "/api/repo/merge/*": ["repo.merge"],
  "/api/git/merge": ["repo.merge"],
  "/api/git/merge/*": ["repo.merge"],
  "/api/pull-requests/merge": ["repo.merge"],
  "/api/pull-requests/*/merge": ["repo.merge"],
  "/api/github/merge": ["repo.merge"],
  "/api/gitlab/merge": ["repo.merge"],

  // Infrastructure deployment routes
  "/api/deploy": ["infra.deploy"],
  "/api/deploy/*": ["infra.deploy"],
  "/api/infrastructure": ["infra.deploy"],
  "/api/infrastructure/*": ["infra.deploy"],
  "/api/environments": ["infra.deploy"],
  "/api/environments/*": ["infra.deploy"],
};

/**
 * Get required capabilities for a given route
 *
 * @param route - The route path to check
 * @returns Array of required capability IDs, or empty array if no mapping found
 */
export function getRequiredCapabilities(route: string): CapabilityId[] {
  // First try exact match
  if (ROUTE_CAPABILITY_MAP[route]) {
    return ROUTE_CAPABILITY_MAP[route];
  }

  // Then try pattern matching for wildcard routes
  for (const [pattern, capabilities] of Object.entries(ROUTE_CAPABILITY_MAP)) {
    if (pattern.includes("*")) {
      const regexPattern = pattern.replace(/\*/g, ".*");
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(route)) {
        return capabilities;
      }
    }
  }

  return [];
}

/**
 * Check if a route requires capabilities
 *
 * @param route - The route path to check
 * @returns true if the route has capability requirements
 */
export function requiresCapabilities(route: string): boolean {
  return getRequiredCapabilities(route).length > 0;
}

/**
 * Get all routes that require a specific capability
 *
 * @param capabilityId - The capability ID to search for
 * @returns Array of route patterns that require this capability
 */
export function getRoutesForCapability(capabilityId: CapabilityId): string[] {
  return Object.entries(ROUTE_CAPABILITY_MAP)
    .filter(([, capabilities]) => capabilities.includes(capabilityId))
    .map(([route]) => route);
}

/**
 * Capability enforcement configuration
 */
export interface CapabilityEnforcementConfig {
  /**
   * Whether to enforce capabilities on all routes (default: true)
   */
  enforceOnAllRoutes?: boolean;

  /**
   * Routes to skip capability enforcement
   */
  skipRoutes?: string[];

  /**
   * Whether to allow access if no capability mapping exists (default: false)
   */
  allowUnmappedRoutes?: boolean;

  /**
   * Custom route to capability mappings to merge with defaults
   */
  customMappings?: Record<string, CapabilityId[]>;
}

/**
 * Create a capability enforcer with custom configuration
 *
 * @param config - Configuration options
 * @returns Capability enforcer function
 */
export function createCapabilityEnforcer(
  config: CapabilityEnforcementConfig = {}
) {
  const {
    enforceOnAllRoutes = true,
    skipRoutes = [],
    allowUnmappedRoutes = false,
    customMappings = {},
  } = config;

  // Merge custom mappings with defaults
  const allMappings = { ...ROUTE_CAPABILITY_MAP, ...customMappings };

  return function enforceCapabilities(
    route: string,
    agentCapabilities: CapabilityId[]
  ): {
    allowed: boolean;
    required: CapabilityId[];
    missing: CapabilityId[];
  } {
    // Check if route should be skipped
    if (skipRoutes.some((skipRoute) => route.startsWith(skipRoute))) {
      return { allowed: true, required: [], missing: [] };
    }

    // Get required capabilities for this route
    const required = allMappings[route] || [];

    // If no mapping exists and we don't allow unmapped routes
    if (required.length === 0 && !allowUnmappedRoutes && enforceOnAllRoutes) {
      return { allowed: false, required: [], missing: [] };
    }

    // If no capabilities required, allow access
    if (required.length === 0) {
      return { allowed: true, required: [], missing: [] };
    }

    // Check if agent has all required capabilities
    const missing = required.filter((cap) => !agentCapabilities.includes(cap));
    const allowed = missing.length === 0;

    return { allowed, required, missing };
  };
}
