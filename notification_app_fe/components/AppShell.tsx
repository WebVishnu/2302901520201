"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppBar, Box, Button, Container, Toolbar, Typography } from "@mui/material";

const links = [
  { href: "/notifications", label: "All" },
  { href: "/priority", label: "Priority" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  return (
    <>
      <AppBar position="static" elevation={1}>
        <Toolbar sx={{ gap: 2, flexWrap: "wrap" }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Notifications
          </Typography>
          {links.map((l) => (
            <Button
              key={l.href}
              component={Link}
              href={l.href}
              color="inherit"
              variant={path === l.href ? "outlined" : "text"}
            >
              {l.label}
            </Button>
          ))}
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 3 }}>
        {children}
      </Container>
      <Box component="footer" sx={{ py: 2, textAlign: "center", color: "text.secondary" }}>
        <Typography variant="caption">localhost:3000</Typography>
      </Box>
    </>
  );
}
