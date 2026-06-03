"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import AppShell from "@/components/AppShell";
import NotificationList from "@/components/NotificationList";
import type { Notification, NotificationType } from "@/lib/types";
import { rankTopN } from "@/lib/priority";
import { clientLog } from "@/lib/clientLog";
import { fetchNotificationsBatch } from "@/lib/api";

const TOP_OPTIONS = [10, 15, 20];
const TYPE_OPTIONS: (NotificationType | "All")[] = ["All", "Placement", "Result", "Event"];

export default function PriorityPage() {
  const [topN, setTopN] = useState(10);
  const [typeFilter, setTypeFilter] = useState<NotificationType | "All">("All");
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      clientLog("info", "page", `loading priority inbox top ${topN} filter ${typeFilter}`);

      try {
        const typeParam = typeFilter === "All" ? undefined : typeFilter;
        const list = await fetchNotificationsBatch(10, typeParam);
        const ranked = rankTopN(list, topN);
        if (!cancelled) {
          setItems(ranked);
          clientLog("info", "api", `priority inbox showing ${ranked.length} items`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load";
        if (!cancelled) {
          setError(msg);
          clientLog("error", "api", `priority fetch failed: ${msg}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [topN, typeFilter]);

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Priority inbox
      </Typography>
      <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
        Placement first, then Result, then Event. Newer wins within the same type.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Top</InputLabel>
          <Select label="Top" value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
            {TOP_OPTIONS.map((n) => (
              <MenuItem key={n} value={n}>
                {n}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Type</InputLabel>
          <Select
            label="Type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as NotificationType | "All")}
          >
            {TYPE_OPTIONS.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <NotificationList items={items} emptyText="No notifications for this filter" />
      )}
    </AppShell>
  );
}
