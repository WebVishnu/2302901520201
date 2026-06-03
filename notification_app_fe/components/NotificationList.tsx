"use client";

import {
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import type { Notification } from "@/lib/types";
import { getViewedIds, markViewed } from "@/lib/viewed";
import { useMemo, useState } from "react";

const typeColor: Record<string, "primary" | "secondary" | "success"> = {
  Placement: "success",
  Result: "primary",
  Event: "secondary",
};

type Props = {
  items: Notification[];
  emptyText?: string;
};

export default function NotificationList({ items, emptyText = "No notifications" }: Props) {
  const [viewed, setViewed] = useState<Set<string>>(() => getViewedIds());

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(b.Timestamp.replace(" ", "T")).getTime() -
          new Date(a.Timestamp.replace(" ", "T")).getTime()
      ),
    [items]
  );

  if (sorted.length === 0) {
    return <Typography sx={{ color: "text.secondary" }}>{emptyText}</Typography>;
  }

  function onOpen(id: string) {
    markViewed(id);
    setViewed(new Set([...getViewedIds()]));
  }

  return (
    <List disablePadding>
      {sorted.map((n) => {
        const isNew = !viewed.has(n.ID);
        return (
          <ListItem key={n.ID} disablePadding sx={{ mb: 1 }}>
            <ListItemButton
              onClick={() => onOpen(n.ID)}
              sx={{
                border: 1,
                borderColor: isNew ? "primary.light" : "divider",
                borderRadius: 1,
                bgcolor: isNew ? "action.hover" : "background.paper",
              }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    {isNew && (
                      <Chip label="New" size="small" color="primary" sx={{ height: 20 }} />
                    )}
                    <Chip
                      label={n.Type}
                      size="small"
                      color={typeColor[n.Type] ?? "default"}
                      variant="outlined"
                    />
                    <Typography sx={{ fontWeight: isNew ? 600 : 400 }}>{n.Message}</Typography>
                  </Stack>
                }
                secondary={n.Timestamp}
              />
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  );
}
