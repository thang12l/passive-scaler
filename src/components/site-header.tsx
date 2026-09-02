"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <strong>
        <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
          Passive Scaler
        </Link>
      </strong>
      <nav>
        <Link href="/apps" style={{ fontWeight: pathname.startsWith("/apps") ? 700 : 400 }}>
          Apps
        </Link>
      </nav>
    </header>
  );
}
