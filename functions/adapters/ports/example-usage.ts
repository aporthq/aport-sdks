/**
 * Example usage of database ports
 *
 * This file demonstrates how handlers should use the ports layer
 * instead of direct database access.
 */

import { PassportRepo, TxCtx, DbFactory, ConcurrencyError } from "./index";

// ============================================================================
// Example: Create Passport Handler
// ============================================================================

export async function createPassportExample(
  dbFactory: DbFactory,
  orgId: string,
  passportData: any
) {
  const { tx, repos } = await dbFactory.forTenant(orgId);

  return await tx.run(async (ctx) => {
    // Check if slug is unique
    const isSlugUnique = await ctx.passports.isSlugUnique(
      orgId,
      passportData.slug
    );
    if (!isSlugUnique) {
      throw new Error("Slug already exists");
    }

    // Create passport
    const passportRow = {
      ...passportData,
      owner_id: orgId,
      version_number: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await ctx.passports.create(passportRow);

    // Log decision event
    await ctx.decisions.append({
      decision_id: `dec_${Date.now()}`,
      org_id: orgId,
      agent_id: passportData.agent_id,
      policy_pack_id: "passport_creation",
      decision: "allow",
      reason: "Passport created successfully",
      context: JSON.stringify({ action: "create" }),
      created_at: new Date().toISOString(),
      record_hash: "computed_hash",
    });

    return passportRow;
  });
}

// ============================================================================
// Example: Update Passport Handler
// ============================================================================

export async function updatePassportExample(
  dbFactory: DbFactory,
  orgId: string,
  agentId: string,
  updates: any
) {
  const { tx, repos } = await dbFactory.forTenant(orgId);

  return await tx.run(async (ctx) => {
    // Get current passport
    const currentPassport = await ctx.passports.getById(orgId, agentId);
    if (!currentPassport) {
      throw new Error("Passport not found");
    }

    // Apply updates with optimistic concurrency
    const updatedPassport = {
      ...currentPassport,
      ...updates,
      updated_at: new Date().toISOString(),
      version_number: currentPassport.version_number + 1,
    };

    try {
      await ctx.passports.update(updatedPassport, {
        expectedVersion: currentPassport.version_number,
      });
    } catch (error) {
      if (error instanceof ConcurrencyError) {
        throw new Error(
          "Passport was modified by another request. Please retry."
        );
      }
      throw error;
    }

    return updatedPassport;
  });
}

// ============================================================================
// Example: Refund Operation with Idempotency
// ============================================================================

export async function processRefundExample(
  dbFactory: DbFactory,
  orgId: string,
  agentId: string,
  currency: string,
  amountMinor: number,
  idempotencyKey: string
) {
  const { tx, repos } = await dbFactory.forTenant(orgId);

  return await tx.run(async (ctx) => {
    // Check idempotency
    const idempotencyResult = await ctx.idempotency.checkAndStore(
      idempotencyKey,
      orgId,
      agentId,
      "refund",
      { amount: amountMinor, currency },
      3600 // 1 hour TTL
    );

    if (idempotencyResult.isIdempotent) {
      return idempotencyResult.cachedResult;
    }

    // Try to consume refund amount
    const refundResult = await ctx.refunds.tryConsume(
      orgId,
      agentId,
      currency,
      amountMinor
    );

    if (!refundResult.success) {
      throw new Error(
        `Refund limit exceeded. Remaining: ${refundResult.remaining}`
      );
    }

    // Log decision
    await ctx.decisions.append({
      decision_id: `dec_${Date.now()}`,
      org_id: orgId,
      agent_id: agentId,
      policy_pack_id: "refunds",
      decision: "allow",
      reason: `Refund processed: ${amountMinor} ${currency}`,
      context: JSON.stringify({
        amount: amountMinor,
        currency,
        remaining: refundResult.remaining,
      }),
      created_at: new Date().toISOString(),
      record_hash: "computed_hash",
    });

    return {
      success: true,
      amount: amountMinor,
      currency,
      remaining: refundResult.remaining,
    };
  });
}

// ============================================================================
// Example: List Passports with Pagination
// ============================================================================

export async function listPassportsExample(
  dbFactory: DbFactory,
  orgId: string,
  options: {
    kind?: "template" | "instance";
    limit?: number;
    offset?: number;
  } = {}
) {
  const { tx, repos } = await dbFactory.forTenant(orgId);

  return await tx.run(async (ctx) => {
    const passports = await ctx.passports.listByOrg(orgId, options.kind);

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 20;
    const paginatedPassports = passports.slice(offset, offset + limit);

    return {
      passports: paginatedPassports,
      total: passports.length,
      offset,
      limit,
    };
  });
}
