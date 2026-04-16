import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createStorageForWorkspace } from "../../../server/storage";
import { createRouter, workspaceProcedure } from "../init";
import {
  closeVfsShellSession,
  createVfsShellSession,
  executeVfsShellCommand,
  getVfsShellSessionSummary,
  VfsShellSessionAccessDeniedError,
  VfsShellSessionNotFoundError,
} from "../../vfs/vfs-shell-session";

function mapShellSessionError(error: unknown): never {
  if (error instanceof VfsShellSessionNotFoundError) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Shell session not found",
    });
  }

  if (error instanceof VfsShellSessionAccessDeniedError) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Shell session access denied",
    });
  }

  throw error;
}

export const vfsShellRouter = createRouter({
  createSession: workspaceProcedure
    .input(
      z.object({
        cwd: z.string().min(1).max(512).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createVfsShellSession({
        db: ctx.db,
        storage: (await createStorageForWorkspace(ctx.workspaceId)).storage,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        cwd: input.cwd,
      });
    }),

  exec: workspaceProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        command: z.string().trim().min(1).max(20_000),
        timeoutMs: z.number().int().positive().max(60_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await executeVfsShellCommand({
          sessionId: input.sessionId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          command: input.command,
          timeoutMs: input.timeoutMs,
        });
      } catch (error) {
        mapShellSessionError(error);
      }
    }),

  session: workspaceProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
      }),
    )
    .query(({ ctx, input }) => {
      try {
        return getVfsShellSessionSummary({
          sessionId: input.sessionId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        });
      } catch (error) {
        mapShellSessionError(error);
      }
    }),

  closeSession: workspaceProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
      }),
    )
    .mutation(({ ctx, input }) => {
      try {
        return closeVfsShellSession({
          sessionId: input.sessionId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        });
      } catch (error) {
        mapShellSessionError(error);
      }
    }),
});
