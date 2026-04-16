import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { eq, and } from 'drizzle-orm';
import { workspacePlugins } from '@selfbox/database';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      session: ctx.session,
    },
  });
});

export const workspaceProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.workspaceId || !ctx.workspaceRole) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Workspace not found or access denied',
      });
    }
    return next({
      ctx: {
        ...ctx,
        workspaceId: ctx.workspaceId,
        workspaceSlug: ctx.workspaceSlug!,
        workspaceRole: ctx.workspaceRole,
      },
    });
  },
);

/**
 * Creates a procedure gated on a specific extension (plugin) being installed
 * and active. Use this for any router whose functionality is provided by an extension.
 *
 * Usage: `const kbProcedure = createExtensionProcedure("knowledge-base");`
 */
export function createExtensionProcedure(pluginSlug: string) {
  return workspaceProcedure.use(async ({ ctx, next }) => {
    const [plugin] = await ctx.db
      .select({ status: workspacePlugins.status })
      .from(workspacePlugins)
      .where(
        and(
          eq(workspacePlugins.workspaceId, ctx.workspaceId),
          eq(workspacePlugins.pluginSlug, pluginSlug),
        ),
      )
      .limit(1);

    if (!plugin || plugin.status !== 'active') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'This extension is disabled',
      });
    }

    return next({ ctx });
  });
}

export const workspaceAdminProcedure = workspaceProcedure.use(
  async ({ ctx, next }) => {
    if (ctx.workspaceRole !== 'owner' && ctx.workspaceRole !== 'admin') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Admin access required',
      });
    }
    return next({ ctx });
  },
);
