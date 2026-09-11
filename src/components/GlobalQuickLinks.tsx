"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { UserPlus } from "lucide-react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

export default function GlobalQuickLinks() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => onAuthStateChanged(auth, (current) => {
    setUser(current);
    setReady(true);
  }), []);

  useEffect(() => {
    if (!ready) return;

    const selector = pathname === "/" && !user
      ? ".login-card form"
      : pathname === "/admin" && user
        ? ".users-card .admin-card-head"
        : "";

    if (!selector) {
      setTarget(null);
      return;
    }

    const findTarget = () => setTarget(document.querySelector(selector));
    findTarget();

    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, ready, user]);

  if (!ready || !target) return null;

  if (pathname === "/" && !user) {
    return createPortal(
      <div className="auth-quick-links" aria-label="Kontovalg">
        <Link href="/register">Opprett konto</Link>
        <Link href="/reset-password">Glemt passord?</Link>
      </div>,
      target,
    );
  }

  if (pathname === "/admin" && user) {
    return createPortal(
      <Link className="admin-user-quick-link" href="/admin/users/new"><UserPlus/> Ny bruker</Link>,
      target,
    );
  }

  return null;
}
