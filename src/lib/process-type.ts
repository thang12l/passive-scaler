export type ProcessType = "web" | "worker";

export const PROCESS_TYPES: ProcessType[] = ["web", "worker"];

export function resolveProcessType(value: string | undefined): ProcessType {
  return value === "worker" ? "worker" : "web";
}

export function isScalingEnabledForProcess(app: {
  scalingEnabled: boolean;
  workerScalingEnabled: boolean;
}, processType: ProcessType): boolean {
  return processType === "worker" ? app.workerScalingEnabled : app.scalingEnabled;
}
