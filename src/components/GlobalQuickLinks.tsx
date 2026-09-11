"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

export default function GlobalQuickLinks() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (current) => {
    setUser(current);
    setReady(true);
  }), []);

  if (!ready) return null;

  if (pathname === "/" && !user) {
    return <div className="auth-quick-links" aria-label="Kontovalg">
      <Link href="/register">Opprett konto</Link>
      <Link href="/reset-password">Glemt passord?</Link>
    </div>;
  }

  if (pathname === "/admin" && user) {
    return <Link className="admin-user-quick-link" href="/admin/users/new"><UserPlus/> Ny bruker</Link>;
  }

  return null;
}
