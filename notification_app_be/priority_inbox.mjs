import { readFileSync, existsSync } from "fs";
import { join } from "path";

function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    const val = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const API_URL = "http://4.224.186.213/evaluation-service/notifications";
const TOP_N = 10;

const WEIGHT = { Placement: 3, Result: 2, Event: 1 };

function parseTime(ts) {
  const [date, time] = ts.split(" ");
  return new Date(`${date}T${time}`).getTime();
}

function score(notif) {
  const w = WEIGHT[notif.Type] ?? 0;
  const t = parseTime(notif.Timestamp);
  return [w, t];
}

function compareScore(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

class MinHeap {
  constructor() {
    this.data = [];
  }

  peek() {
    return this.data[0];
  }

  size() {
    return this.data.length;
  }

  push(entry) {
    const arr = this.data;
    arr.push(entry);
    let i = arr.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (compareScore(arr[i][0], arr[parent][0]) >= 0) break;
      [arr[i], arr[parent]] = [arr[parent], arr[i]];
      i = parent;
    }
  }

  replaceRoot(entry) {
    const arr = this.data;
    arr[0] = entry;
    let i = 0;
    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < arr.length && compareScore(arr[left][0], arr[smallest][0]) < 0) {
        smallest = left;
      }
      if (right < arr.length && compareScore(arr[right][0], arr[smallest][0]) < 0) {
        smallest = right;
      }
      if (smallest === i) break;
      [arr[i], arr[smallest]] = [arr[smallest], arr[i]];
      i = smallest;
    }
  }
}

class PriorityInbox {
  constructor(size = TOP_N) {
    this.size = size;
    this.heap = new MinHeap();
  }

  add(notif) {
    const entry = [score(notif), notif];
    if (this.heap.size() < this.size) {
      this.heap.push(entry);
      return;
    }
    const worst = this.heap.peek();
    if (compareScore(entry[0], worst[0]) > 0) {
      this.heap.replaceRoot(entry);
    }
  }

  top() {
    return [...this.heap.data]
      .sort((a, b) => compareScore(b[0], a[0]))
      .map((e) => e[1]);
  }
}

async function fetchNotifications() {
  const token = process.env.EVALUATION_SERVICE_TOKEN;
  if (!token) {
    console.error("Set EVALUATION_SERVICE_TOKEN in your environment");
    process.exit(1);
  }

  const res = await fetch(API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  return body.notifications ?? [];
}

async function main() {
  const list = await fetchNotifications();
  const inbox = new PriorityInbox(TOP_N);

  for (const n of list) {
    inbox.add(n);
  }

  const top = inbox.top();

  console.log(`Priority inbox (top ${TOP_N})\n`);
  top.forEach((n, i) => {
    console.log(`${i + 1}. [${n.Type}] ${n.Message}`);
    console.log(`   ${n.Timestamp}  (${n.ID})\n`);
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
