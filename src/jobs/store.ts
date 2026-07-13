import { randomUUID } from "node:crypto";

export interface JobProgress {
  jobId: string;
  siteId: string;
  baseUrl: string;
  status: "discovering" | "extracting" | "done" | "error";
  total: number;
  completed: number;
  failed: { url: string; error: string }[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

// In-memory only — fine for a single-process internal tool; a restart loses in-flight job status
// (but the pages already written to data/<siteId>/pages/ survive, since those hit disk directly).
const jobs = new Map<string, JobProgress>();

export function createJob(siteId: string, baseUrl: string): JobProgress {
  const job: JobProgress = {
    jobId: randomUUID(),
    siteId,
    baseUrl,
    status: "discovering",
    total: 0,
    completed: 0,
    failed: [],
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.jobId, job);
  return job;
}

export function getJob(jobId: string): JobProgress | undefined {
  return jobs.get(jobId);
}

export function updateJob(jobId: string, patch: Partial<JobProgress>): void {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch);
}

/** Most recent job for a site, if any — lets the UI resume watching a job after a page refresh. */
export function findLatestJobForSite(siteId: string): JobProgress | undefined {
  let latest: JobProgress | undefined;
  for (const job of jobs.values()) {
    if (job.siteId !== siteId) continue;
    if (!latest || job.startedAt > latest.startedAt) latest = job;
  }
  return latest;
}
