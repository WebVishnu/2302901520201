"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import AppShell from "@/components/AppShell";
import NotificationList from "@/components/NotificationList";
import type { Notification } from "@/lib/types";
import { clientLog } from "@/lib/clientLog";
import { fetchNotificationsPage, PAGE_LIMIT } from "@/lib/api";

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      clientLog("info", "page", `loading all notifications page ${page}`);

      try {
        const list = await fetchNotificationsPage(page);
        if (!cancelled) {
          setItems(list);
          clientLog("info", "api", `loaded ${list.length} notifications`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load";
        if (!cancelled) {
          setError(msg);
          clientLog("error", "api", `notifications fetch failed: ${msg}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        All notifications
      </Typography>
      <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
        Tap a row to mark as viewed. Page {page}.
      </Typography>

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
        <NotificationList items={items} />
      )}

      <Stack direction="row" spacing={2} sx={{ mt: 3, justifyContent: "center", alignItems: "center" }}>
        <Button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <Typography>Page {page}</Typography>
        <Button disabled={loading || items.length < PAGE_LIMIT} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </Stack>
    </AppShell>
  );
}
