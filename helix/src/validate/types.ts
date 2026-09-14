// Diagnostic and option shapes for mcdoc validation.

export interface McdocDiagnostic {
  /** Datapack-relative path of the offending file, e.g. `data/foo/dimension/x.json`. */
  file: string;
  /** 1-based line/column of the problem within that file. */
  line: number;
  column: number;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
}

export interface ValidateOptions {
  /**
   * Minecraft version to validate against. Defaults to `dp.version.id`; override for
   * snapshot aliases.
   */
  gameVersion?: string;
  /** Spyglass cache folder. Default `~/.cache/helix-mcdoc`; delete it to re-download. */
  cacheDir?: string;
  /**
   * Only validate `dp.registryFile(...)` resources. Default false, which also checks typed
   * builders' output.
   */
  registryFilesOnly?: boolean;
}
