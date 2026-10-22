"use client";

import { useState, useEffect } from "react";
import { CSRF_COOKIE, LEGACY_CSRF_COOKIE, browserHasCookie } from "@/lib/cookies";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOut, X } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { isNavActive, NAV } from "@/lib/nav";
import { NavItem } from "@/components/Nav/NavItem";
import { useAuth } from "@/components/Nav/useAuth";
import { usePrefetch } from "@/components/Nav/usePrefetch";
import NavbarStatus from "@/components/NavbarStatus";
import { useNewCount, NotificationDot } from "@/components/Nav/NotificationDot";
import { openCommandMenu } from "@/components/ui/command-menu";
import { MagnifyingGlass } from "@phosphor-icons/react";

export default function Navbar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  const [open, setOpen] = useState(false);
  const { logout } = useAuth();
  const prefetch = usePrefetch();
  const { count: newCount, markSeen } = useNewCount();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    if (pathname === "/recent" && newCount > 0) {
      const t = setTimeout(() => markSeen(), 1500);
      return () => clearTimeout(t);
    }
  }, [pathname, newCount, markSeen]);
  useEffect(() => {
    const hasCsrf = browserHasCookie(CSRF_COOKIE, LEGACY_CSRF_COOKIE);
    if (hasCsrf) { setIsLoggedIn(true); return; }
    fetch("/api/v1/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        setIsLoggedIn(!!j?.success && !!j?.data);
      })
      .catch(() => { setIsLoggedIn(false); });
  }, [pathname]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <nav inert={open ? (true as unknown as boolean) : undefined} className="sticky top-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10 safe-area-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-14 sm:h-16 gap-4 sm:gap-8">
            <Link
              href="/"
              className="flex items-center gap-2 shrink-0"
              onClick={() => setOpen(false)}
            >
              <span className="text-white font-bold text-lg tracking-tight">
                ManhwaScan
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-1 ml-4">
              {NAV.map(({ href, label, icon }) => {
                const isRecent = href === "/recent";
                return (
                  <span key={href} className="relative inline-flex">
                    <NavItem
                      href={href}
                      label={label}
                      icon={icon}
                      active={isNavActive(href, pathname)}
                      onPrefetch={prefetch}
                    />
                    {isRecent && <NotificationDot count={newCount} />}
                  </span>
                );
              })}
            </div>

            <div className="flex-1" />
            {/* Own group: the parent's gap-8 is meant for the nav links, and it
                left the Search / Live / Logout cluster floating apart from each
                other as well as from the links. */}
            <div className="hidden md:flex items-center gap-3">
            <button
              type="button"
              onClick={() => openCommandMenu()}
              className="hidden md:inline-flex h-8 w-fit shrink-0 items-center gap-2 px-3 rounded-lg bg-white/5 border border-white/10 text-xs font-medium leading-none text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
              aria-label="Open command menu"
            >
              <MagnifyingGlass size={14} />
              <span>Search</span>
              {/* h-6 not h-5: the kbd inherits text-xs and px-1.5, so a 5
                  would sit shorter than the Search text and read as clipped. */}
              <kbd className="inline-flex h-6 items-center rounded bg-white/10 px-1.5 font-mono text-[10px] leading-none">
                ⌘K
              </kbd>
            </button>
            <NavbarStatus />
            <div
              className="hidden md:block w-px h-8 shrink-0 bg-white/10"
              aria-hidden
            />
            {isLoggedIn ? (
              <button
                type="button"
                onClick={logout}
                title="Logout"
                aria-label="Logout"
                className="hidden md:inline-flex h-8 w-fit shrink-0 items-center gap-1.5 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-medium leading-none text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
              >
                <SignOut size={14} /> Logout
              </button>
            ) : (
              <Link
                href="/login"
                className="hidden md:inline-flex h-8 w-fit shrink-0 items-center gap-1.5 px-3.5 rounded-lg bg-white text-black text-xs font-medium leading-none hover:bg-white/90 transition-colors"
              >
                Login
              </Link>
            )}
            </div>

            <button
              onClick={() => setOpen(true)}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-drawer"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </nav>
      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60] md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              id="mobile-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="absolute right-0 top-0 h-full w-[82%] max-w-[320px] bg-zinc-950 border-l border-white/10 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between h-14 px-4 border-b border-white/10 shrink-0">
                <span className="font-bold text-white">Menu</span>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
                {NAV.map(({ href, label, icon }) => {
                  const isRecent = href === "/recent";
                  return (
                    <span key={href} className="relative block">
                      <NavItem
                        href={href}
                        label={label}
                        icon={icon}
                        active={isNavActive(href, pathname)}
                        variant="mobile"
                        onPrefetch={prefetch}
                        onClick={() => setOpen(false)}
                      />
                      {isRecent && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          <NotificationDot count={newCount} />
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>

              <div className="p-3 border-t border-white/10 space-y-3 bg-black/20">
                <NavbarStatus variant="mobile" />
                {isLoggedIn ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      logout();
                    }}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 font-medium transition-colors"
                  >
                    <SignOut size={18} /> Logout
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors"
                  >
                    Login
                  </Link>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
