import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DesktopDeviceFlowError } from "./device-flow";

export class DesktopVersionConflictError extends Error {
  constructor(
    readonly entityId: string,
    readonly currentVersion: number,
  ) {
    super("Version conflict — entity was modified since your last read");
    this.name = "DesktopVersionConflictError";
  }
}

export class DesktopChecksumMismatchError extends Error {
  constructor(
    readonly fileId: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super("Checksum mismatch — uploaded data does not match claimed checksum");
    this.name = "DesktopChecksumMismatchError";
  }
}

export function jsonError(error: unknown) {
  if (error instanceof DesktopDeviceFlowError) {
    const status =
      error.code === "not_approved"
        ? 428
        : error.code === "invalid_code" || error.code === "invalid_token"
          ? 400
          : error.code === "revoked"
            ? 403
            : error.code === "expired"
              ? 410
              : 409;

    return NextResponse.json(
      { error: error.message, code: error.code },
      { status },
    );
  }

  if (error instanceof DesktopVersionConflictError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "version_conflict",
        entityId: error.entityId,
        currentVersion: error.currentVersion,
      },
      { status: 409 },
    );
  }

  if (error instanceof DesktopChecksumMismatchError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "checksum_mismatch",
        fileId: error.fileId,
        expected: error.expected,
        actual: error.actual,
      },
      { status: 422 },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid request",
        code: "invalid_request",
        issues: error.flatten(),
      },
      { status: 400 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { error: error.message, code: "internal_error" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: "Unknown error", code: "internal_error" },
    { status: 500 },
  );
}
