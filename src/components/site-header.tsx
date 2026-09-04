"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-medium">
          <img
            src="/logo-mark.png"
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-md dark:hidden"
          />
          <img
            src="/logo-mark-dark.png"
            alt=""
            width={32}
            height={32}
            className="hidden size-8 rounded-md dark:inline"
          />
          Push-based Scaler
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={
            !mounted ? "Toggle theme" : isDark ? "Switch to light mode" : "Switch to dark mode"
          }
          disabled={!mounted}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {mounted ? isDark ? <Sun /> : <Moon /> : null}
        </Button>
      </div>
    </header>
  );
}
