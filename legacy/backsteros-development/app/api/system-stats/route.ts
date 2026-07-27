import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

type CpuSample = { idle: number; total: number };
type MemoryStats = { total: number; used: number; free: number };

let previousCpu: CpuSample | null = null;

function readCpuSample(): CpuSample {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }
  return { idle, total };
}

function cpuUsagePercent(): number | null {
  const sample = readCpuSample();
  const prev = previousCpu;
  previousCpu = sample;
  if (!prev) return null;
  const idleDelta = sample.idle - prev.idle;
  const totalDelta = sample.total - prev.total;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

/**
 * Node's `os.freemem()` on macOS is nearly empty because file cache is
 * counted as used. Match Activity Monitor "Memory Used":
 * app (pageable internal − purgeable) + wired + compressor.
 */
async function readDarwinMemory(): Promise<MemoryStats | null> {
  try {
    const [{ stdout: vmStat }, { stdout: pageableRaw }] = await Promise.all([
      execFileAsync("/usr/bin/vm_stat", [], { encoding: "utf8" }),
      execFileAsync("/usr/sbin/sysctl", ["-n", "vm.page_pageable_internal_count"], {
        encoding: "utf8",
      }),
    ]);

    const pageSizeMatch = vmStat.match(/page size of (\d+) bytes/i);
    const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 16_384;
    if (!Number.isFinite(pageSize) || pageSize <= 0) return null;

    const pages = (label: string): number => {
      const match = vmStat.match(new RegExp(`${label}:\\s+(\\d+)\\.`, "i"));
      return match ? Number(match[1]) : 0;
    };

    const wired = pages("Pages wired down");
    const purgeable = pages("Pages purgeable");
    const compressor = pages("Pages occupied by compressor");
    const pageableInternal = Number(pageableRaw.trim());
    if (!Number.isFinite(pageableInternal)) return null;

    const appMemory = Math.max(0, pageableInternal - purgeable) * pageSize;
    const total = os.totalmem();
    const used = Math.min(
      total,
      appMemory + wired * pageSize + compressor * pageSize,
    );
    const free = Math.max(0, total - used);
    return { total, used, free };
  } catch {
    return null;
  }
}

/** Prefer MemAvailable so reclaimable cache isn't counted as used. */
async function readLinuxMemory(): Promise<MemoryStats | null> {
  try {
    const raw = await fs.readFile("/proc/meminfo", "utf8");
    const kb = (key: string): number | null => {
      const match = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
      return match ? Number(match[1]) * 1024 : null;
    };
    const total = kb("MemTotal");
    const available = kb("MemAvailable");
    if (total == null || available == null) return null;
    const used = Math.max(0, total - available);
    return { total, used, free: Math.max(0, available) };
  } catch {
    return null;
  }
}

function readFallbackMemory(): MemoryStats {
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  return { total, used, free };
}

async function readMemory(): Promise<MemoryStats> {
  if (process.platform === "darwin") {
    return (await readDarwinMemory()) ?? readFallbackMemory();
  }
  if (process.platform === "linux") {
    return (await readLinuxMemory()) ?? readFallbackMemory();
  }
  return readFallbackMemory();
}

async function readDisk(path: string) {
  try {
    const stats = await fs.statfs(path);
    const blockSize = Number(stats.bsize);
    const total = Number(stats.blocks) * blockSize;
    const free = Number(stats.bavail) * blockSize;
    const used = Math.max(0, total - free);
    return { path, total, used, free };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const diskPath = url.searchParams.get("path")?.trim() || os.homedir();

  const [memory, disk] = await Promise.all([
    readMemory(),
    readDisk(diskPath),
  ]);
  const cpuPercent = cpuUsagePercent();

  return NextResponse.json({
    cpuPercent,
    loadAverage: os.loadavg()[0] ?? 0,
    memory,
    disk,
    sampledAt: Date.now(),
  });
}
