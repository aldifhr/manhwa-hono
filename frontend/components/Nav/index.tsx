"use client";
// Deep module Nav — presentational NavItem + adapters Auth & Prefetch di belakang seam.
// Saat ini Navbar.tsx masih jadi consumer; file ini adalah seam agar Header/Navbar tidak duplikat logic.
export { NavItem } from "./NavItem";
export { useAuth } from "./useAuth";
export { usePrefetch } from "./usePrefetch";
